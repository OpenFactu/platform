/**
 * Política de acceso por empresa: 2FA obligatorio, duración de la sesión, formas de entrar
 * permitidas y reglas opcionales de contraseña. Vive en `SystemConfig` (clave `auth.policy`).
 *
 * La lista de contraseñas comunes (`commonPasswords.txt`) sale de SecLists, fichero
 * `Passwords/Common-Credentials/xato-net-10-million-passwords-10000.txt` (antes
 * `10-million-password-list-top-10000.txt`), de Daniel Miessler y colaboradores, licencia MIT:
 * https://github.com/danielmiessler/SecLists. Pasada a minúsculas y sin duplicados.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ClientFactory } from '../tenant/ClientFactory';
import * as schema from '../../db/schema';

export type AuthMethod = 'password' | 'passkey' | 'email_code' | 'sso';

export interface AuthPolicy {
  mfa: 'off' | 'admins' | 'all';
  sessionMaxDays: number;
  idleHours: number;
  allowedMethods: AuthMethod[];
  ssoRequired: boolean;
  passwordRules: { enabled: boolean; minLength: number; blockCommon: boolean };
}

export const POLICY_KEY = 'auth.policy';

export const DEFAULT_POLICY: AuthPolicy = {
  mfa: 'off',
  sessionMaxDays: 30,
  idleHours: 12,
  allowedMethods: ['password', 'passkey', 'email_code', 'sso'],
  ssoRequired: false,
  passwordRules: { enabled: false, minLength: 10, blockCommon: true },
};

const policySchema = z.object({
  mfa: z.enum(['off', 'admins', 'all']).default(DEFAULT_POLICY.mfa),
  sessionMaxDays: z.number().int().min(1).max(365).default(DEFAULT_POLICY.sessionMaxDays),
  idleHours: z.number().int().min(1).max(720).default(DEFAULT_POLICY.idleHours),
  allowedMethods: z
    .array(z.enum(['password', 'passkey', 'email_code', 'sso']))
    .min(1)
    .default(DEFAULT_POLICY.allowedMethods),
  ssoRequired: z.boolean().default(DEFAULT_POLICY.ssoRequired),
  passwordRules: z
    .object({
      enabled: z.boolean().default(false),
      minLength: z.number().int().min(6).max(128).default(10),
      blockCommon: z.boolean().default(true),
    })
    .default(DEFAULT_POLICY.passwordRules),
});

/** Valida estrictamente (para guardar): lanza un ZodError si algo no vale. */
export function parsePolicy(raw: unknown): AuthPolicy {
  const p = policySchema.parse(raw ?? {});
  return { ...p, allowedMethods: [...new Set(p.allowedMethods)] };
}

/** Tolerante (para leer): lo que no es válido vuelve a la política por defecto. */
export function normalizePolicy(raw: unknown): AuthPolicy {
  try {
    return parsePolicy(raw);
  } catch {
    if (raw !== undefined && raw !== null && Object.keys(raw as object).length > 0) {
      console.warn('[auth] La política de acceso guardada no es válida: se usa la de fábrica.');
    }
    return structuredClone(DEFAULT_POLICY);
  }
}

export async function readPolicy(tenantId: string): Promise<AuthPolicy> {
  try {
    const db = await ClientFactory.getTenantClient(tenantId);
    const [row] = await db
      .select()
      .from(schema.systemConfigs)
      .where(eq(schema.systemConfigs.key, POLICY_KEY));
    if (!row?.value) return structuredClone(DEFAULT_POLICY);
    return normalizePolicy(JSON.parse(row.value));
  } catch (e: any) {
    console.error('[auth] No se pudo leer la política de acceso:', e?.message);
    return structuredClone(DEFAULT_POLICY);
  }
}

export async function writePolicy(db: any, policy: AuthPolicy): Promise<void> {
  const value = JSON.stringify(policy);
  const existing = await db
    .select({ id: schema.systemConfigs.id })
    .from(schema.systemConfigs)
    .where(eq(schema.systemConfigs.key, POLICY_KEY));
  if (existing.length > 0) {
    await db
      .update(schema.systemConfigs)
      .set({ value, updatedAt: new Date() })
      .where(eq(schema.systemConfigs.key, POLICY_KEY));
  } else {
    await db.insert(schema.systemConfigs).values({
      id: crypto.randomUUID(),
      key: POLICY_KEY,
      value,
      description: 'Política de acceso',
      updatedAt: new Date(),
    });
  }
}

export interface PolicyGate {
  allowed: boolean;
  code?: 'METHOD_NOT_ALLOWED' | 'SSO_REQUIRED';
  restricted: 'mfa_setup' | null;
}

/**
 * El método con el que se abrió la sesión (`sso:google`, `handoff:email_code`, `factuapi`...)
 * como uno de los cuatro de la política. Lo desconocido cuenta como contraseña.
 */
export function toPolicyMethod(method: string): AuthMethod {
  const m = String(method ?? '');
  if (m.startsWith('handoff:')) return toPolicyMethod(m.slice('handoff:'.length));
  if (m === 'sso' || m.startsWith('sso:')) return 'sso';
  if (m === 'passkey') return 'passkey';
  if (m === 'email_code') return 'email_code';
  return 'password';
}

/** ¿Puede entrar así, y con qué restricción? Un SUPERUSER nunca se bloquea ni se restringe. */
export function policyGate(
  policy: AuthPolicy,
  user: { role: string; hasMfa: boolean },
  method: string,
): PolicyGate {
  if (user.role === 'SUPERUSER') return { allowed: true, restricted: null };
  const m = toPolicyMethod(method);
  if (!policy.allowedMethods.includes(m)) {
    return { allowed: false, code: 'METHOD_NOT_ALLOWED', restricted: null };
  }
  // Con SSO obligatorio solo se entra por SSO o por passkey.
  if (policy.ssoRequired && m !== 'sso' && m !== 'passkey') {
    return { allowed: false, code: 'SSO_REQUIRED', restricted: null };
  }
  const needsMfa = policy.mfa === 'all' || (policy.mfa === 'admins' && user.role === 'ADMIN');
  return { allowed: true, restricted: needsMfa && !user.hasMfa ? 'mfa_setup' : null };
}

/** Duración de la sesión: lo más corto entre el entorno y la política de la empresa. */
export function sessionLimits(policy: AuthPolicy): { slidingHours: number; maxDays: number } {
  const env = (name: string, fallback: number) => {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    slidingHours: Math.min(env('AUTH_SESSION_HOURS', 12), policy.idleHours),
    maxDays: Math.min(env('AUTH_SESSION_MAX_DAYS', 30), policy.sessionMaxDays),
  };
}

/** ¿Tiene el usuario un segundo factor propio (TOTP o passkey)? */
export async function userHasMfa(user: { id: string; totpEnabled?: boolean | null }) {
  if (user.totpEnabled) return true;
  const db = ClientFactory.getClient('public');
  const [row] = await db
    .select({ id: schema.userPasskeys.id })
    .from(schema.userPasskeys)
    .where(eq(schema.userPasskeys.userId, user.id))
    .limit(1);
  return !!row;
}

let common: Set<string> | null = null;
function commonPasswords(): Set<string> {
  if (!common) {
    const file = path.join(__dirname, 'commonPasswords.txt');
    common = new Set(
      fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    );
  }
  return common;
}

export function passwordProblem(
  pw: string,
  rules: AuthPolicy['passwordRules'],
): null | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_COMMON' {
  if (!rules.enabled) return null;
  const value = String(pw ?? '');
  if (value.length < rules.minLength) return 'PASSWORD_TOO_SHORT';
  if (rules.blockCommon && commonPasswords().has(value.toLowerCase())) return 'PASSWORD_TOO_COMMON';
  return null;
}

export const PASSWORD_MESSAGES: Record<'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_COMMON', string> = {
  PASSWORD_TOO_SHORT: 'La contraseña es demasiado corta para la política de la empresa',
  PASSWORD_TOO_COMMON: 'Esa contraseña es demasiado común: elige otra',
};

/**
 * ¿Hay algún proveedor SSO activo? Sin ninguno, exigir SSO dejaría a todos fuera. Sin
 * `WEB_ORIGIN` tampoco: no hay a dónde volver del proveedor y la web no lo ofrece.
 */
export async function hasEnabledSsoProvider(): Promise<boolean> {
  if (!(process.env.WEB_ORIGIN || '').trim()) return false;
  const db = ClientFactory.getClient('public');
  const [row] = await db
    .select({ id: schema.authProviders.id })
    .from(schema.authProviders)
    .where(eq(schema.authProviders.enabled, true))
    .limit(1);
  return !!row;
}

/**
 * ¿Exige la política de alguna empresa del usuario que tenga segundo factor? Un SUPERUSER no.
 * Quien llama decide qué factores le quedan (passkeys, TOTP) antes de dejarle quitar uno.
 */
export async function mfaRequiredSomewhere(userId: string): Promise<boolean> {
  const db = ClientFactory.getClient('public');
  const [u] = await db
    .select({ role: schema.globalUsers.role, tenantId: schema.globalUsers.tenantId })
    .from(schema.globalUsers)
    .where(eq(schema.globalUsers.id, userId));
  if (!u || u.role === 'SUPERUSER') return false;
  const roles = new Map<string, string>();
  if (u.tenantId) roles.set(u.tenantId, u.role);
  const memberships = await db
    .select({
      tenantId: schema.userTenantMemberships.tenantId,
      role: schema.userTenantMemberships.role,
    })
    .from(schema.userTenantMemberships)
    .where(eq(schema.userTenantMemberships.userId, userId));
  for (const m of memberships) roles.set(m.tenantId, m.role);
  for (const [tenantId, role] of roles) {
    const { mfa } = await readPolicy(tenantId);
    if (mfa === 'all' || (mfa === 'admins' && role === 'ADMIN')) return true;
  }
  return false;
}

/** Las reglas más estrictas entre las empresas del usuario que las tienen activas. */
export async function strictestPasswordRules(userId: string): Promise<AuthPolicy['passwordRules']> {
  const db = ClientFactory.getClient('public');
  const ids = new Set<string>();
  const memberships = await db
    .select({ tenantId: schema.userTenantMemberships.tenantId })
    .from(schema.userTenantMemberships)
    .where(eq(schema.userTenantMemberships.userId, userId));
  for (const m of memberships) ids.add(m.tenantId);
  const [u] = await db
    .select({ tenantId: schema.globalUsers.tenantId })
    .from(schema.globalUsers)
    .where(eq(schema.globalUsers.id, userId));
  if (u?.tenantId) ids.add(u.tenantId);

  let result: AuthPolicy['passwordRules'] = { enabled: false, minLength: 10, blockCommon: true };
  let any = false;
  for (const id of ids) {
    const rules = (await readPolicy(id)).passwordRules;
    if (!rules.enabled) continue;
    if (!any) {
      result = { enabled: true, minLength: rules.minLength, blockCommon: rules.blockCommon };
      any = true;
    } else {
      result.minLength = Math.max(result.minLength, rules.minLength);
      result.blockCommon = result.blockCommon || rules.blockCommon;
    }
  }
  return result;
}
