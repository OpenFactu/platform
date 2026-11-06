/**
 * Passkeys (WebAuthn): origen y RP ID aceptados, alta y comprobación de credenciales.
 * Los retos (el *challenge* de WebAuthn) viven en `AuthChallenge` con tipo `webauthn`, de un
 * solo uso: se gastan antes de comprobar la respuesta, así que un reto no se prueba dos veces.
 */
import crypto from 'crypto';
import { and, eq, gt, ne, sql } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { ClientFactory } from '../tenant/ClientFactory';
import * as schema from '../../db/schema';
import { authChallenges } from '../../db/schema';
import { consumeChallenge, createChallenge, findChallenge, parseData } from './challenges';

export type PasskeyRow = typeof schema.userPasskeys.$inferSelect;

export interface RelyingParty {
  rpId: string;
  origin: string;
}

const RP_NAME = 'Keirost';
const CHALLENGE_TTL_MS = 5 * 60_000;
/** Los puertos de Vite en desarrollo. */
const DEV_PORTS = new Set(['5173', '5180']);

export class PasskeyError extends Error {
  constructor(
    public code: 'PASSKEY_INVALID' | 'PASSKEY_EXISTS',
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const invalid = (message = 'Passkey no válida') => new PasskeyError('PASSKEY_INVALID', message);

/**
 * Qué RP ID corresponde al `Origin` de la petición, o `null` si ese origen no se acepta.
 * `WEB_ORIGIN` se lee en cada llamada (las pruebas lo cambian).
 */
export function rpFor(origin: string | undefined | null): RelyingParty | null {
  if (!origin) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  // El `Origin` es solo esquema, host y puerto: con ruta o credenciales no es un origen.
  if (url.origin === 'null' || url.origin !== origin) return null;

  const web = process.env.WEB_ORIGIN;
  if (web) {
    try {
      const w = new URL(web);
      if (w.origin === url.origin) return { rpId: w.hostname, origin: url.origin };
    } catch {
      /* WEB_ORIGIN mal escrito: no se ofrece */
    }
  }

  if (url.protocol === 'http:' && url.hostname === 'localhost' && url.port) {
    const dev = process.env.NODE_ENV === 'development' && DEV_PORTS.has(url.port);
    if (dev || process.env.WEBAUTHN_ALLOW_DESKTOP !== 'false') {
      return { rpId: 'localhost', origin: url.origin };
    }
  }
  return null;
}

const db = () => ClientFactory.getClient('public');

const parseTransports = (raw: string | null): any[] | undefined => {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
};

/** Las passkeys del usuario para un RP. */
export async function passkeysFor(userId: string, rpId: string): Promise<PasskeyRow[]> {
  return db()
    .select()
    .from(schema.userPasskeys)
    .where(and(eq(schema.userPasskeys.userId, userId), eq(schema.userPasskeys.rpId, rpId)));
}

export async function registrationOptions(
  user: { id: string; email: string; username?: string | null },
  rp: RelyingParty,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await passkeysFor(user.id, rp.rpId);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpId,
    userName: user.email,
    userDisplayName: user.username || user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: parseTransports(p.transports),
    })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  await createChallenge('webauthn', {
    userId: user.id,
    ttlMs: CHALLENGE_TTL_MS,
    data: { challenge: options.challenge, rpId: rp.rpId, purpose: 'register' },
  });
  return options;
}

/** El *challenge* que el navegador firmó, sacado de `clientDataJSON`. */
function challengeOf(response: any): string | null {
  try {
    const json = Buffer.from(String(response?.response?.clientDataJSON), 'base64url').toString();
    const c = JSON.parse(json)?.challenge;
    return typeof c === 'string' ? c : null;
  } catch {
    return null;
  }
}

export async function verifyRegistration(
  user: { id: string },
  rp: RelyingParty,
  response: RegistrationResponseJSON,
  name?: string | null,
): Promise<PasskeyRow> {
  const challenge = challengeOf(response);
  if (!challenge) throw invalid();
  const [row] = await db()
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.kind, 'webauthn'),
        eq(authChallenges.userId, user.id),
        ne(authChallenges.status, 'consumed'),
        gt(authChallenges.expiresAt, new Date()),
        sql`${authChallenges.data}::jsonb->>'purpose' = 'register'`,
        sql`${authChallenges.data}::jsonb->>'challenge' = ${challenge}`,
      ),
    )
    .limit(1);
  const data = row ? parseData(row) : null;
  if (!row || data?.rpId !== rp.rpId) throw invalid();
  // Un reto vale una vez, pase lo que pase con la respuesta.
  if (!(await consumeChallenge(row.id))) throw invalid();

  let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verified = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: false,
    });
  } catch {
    throw invalid();
  }
  if (!verified.verified || !verified.registrationInfo) throw invalid();
  const { credential } = verified.registrationInfo;

  const [dup] = await db()
    .select({ id: schema.userPasskeys.id })
    .from(schema.userPasskeys)
    .where(eq(schema.userPasskeys.credentialId, credential.id));
  if (dup) throw new PasskeyError('PASSKEY_EXISTS', 'Esa passkey ya está registrada', 409);

  // Dos altas a la vez de la misma credencial: gana una y la otra cae en el índice único.
  const [created] = await db()
    .insert(schema.userPasskeys)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: JSON.stringify(credential.transports ?? response.response?.transports ?? []),
      rpId: rp.rpId,
      name: (name ?? '').trim().slice(0, 80) || 'Passkey',
    })
    .returning()
    .catch((e: any) => {
      if ((e?.code ?? e?.cause?.code) === '23505') {
        throw new PasskeyError('PASSKEY_EXISTS', 'Esa passkey ya está registrada', 409);
      }
      throw e;
    });
  return created;
}

/**
 * Opciones para entrar. Sin `userId`, passkeys descubribles (entrar sin contraseña y sin
 * decir quién eres); con él, solo las del usuario (segundo factor).
 */
export async function authenticationOptions(
  rp: RelyingParty,
  userId?: string,
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challengeSecret: string }> {
  const allow = userId ? await passkeysFor(userId, rp.rpId) : [];
  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    // Sin contraseña la passkey es todo el acceso: tiene que verificar al usuario.
    userVerification: userId ? 'preferred' : 'required',
    allowCredentials: userId
      ? allow.map((p) => ({ id: p.credentialId, transports: parseTransports(p.transports) }))
      : undefined,
  });
  const { secret } = await createChallenge('webauthn', {
    userId,
    ttlMs: CHALLENGE_TTL_MS,
    // El *challenge* de WebAuthn no es un secreto: el cliente lo recibe, y solo vale con la
    // respuesta firmada por la passkey. Lo que protege es el propósito: 'mfa' (atado a un
    // usuario, segundo factor) y 'authenticate' (sin usuario, entrar sin contraseña) no se
    // intercambian.
    data: {
      challenge: options.challenge,
      rpId: rp.rpId,
      purpose: userId ? 'mfa' : 'authenticate',
    },
  });
  return { options, challengeSecret: secret };
}

export async function verifyAuthentication(
  rp: RelyingParty,
  challengeSecret: string,
  response: AuthenticationResponseJSON,
  purpose: 'authenticate' | 'mfa',
): Promise<{ userId: string; passkeyId: string }> {
  const row =
    typeof challengeSecret === 'string' ? await findChallenge('webauthn', challengeSecret) : null;
  const data = row ? parseData(row) : null;
  if (!row || data?.purpose !== purpose || data?.rpId !== rp.rpId) throw invalid();
  // 'authenticate' no tiene usuario; 'mfa' siempre lo tiene.
  if (purpose === 'authenticate' ? !!row.userId : !row.userId) throw invalid();
  // Se gasta antes de mirar la respuesta: un reto no se prueba dos veces.
  if (!(await consumeChallenge(row.id))) throw invalid();

  const [passkey] = await db()
    .select()
    .from(schema.userPasskeys)
    .where(
      and(
        eq(schema.userPasskeys.credentialId, String(response?.id)),
        eq(schema.userPasskeys.rpId, rp.rpId),
      ),
    );
  if (!passkey) throw invalid();
  // Con el reto atado a un usuario (segundo factor), la passkey tiene que ser suya.
  if (row.userId && row.userId !== passkey.userId) throw invalid();

  let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: data.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: !row.userId,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        transports: parseTransports(passkey.transports),
      },
    });
  } catch {
    throw invalid();
  }
  if (!verified.verified) throw invalid();

  await db()
    .update(schema.userPasskeys)
    .set({ counter: verified.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(schema.userPasskeys.id, passkey.id));
  return { userId: passkey.userId, passkeyId: passkey.id };
}
