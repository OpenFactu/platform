/**
 * Cierra un acceso ya autenticado: resuelve empresa, rol y permisos, abre la sesión y
 * responde `{ token, user }`. Lo usan el login con contraseña, el segundo factor y
 * el resto de formas de entrar.
 */
import { and, eq } from 'drizzle-orm';
import { ClientFactory } from '../../core/tenant/ClientFactory';
import * as schema from '../../db/schema';
import { createSession, issueToken } from '../../core/auth/sessions';
import { clientInfo } from '../../core/auth/clientInfo';
import { hasPreviousLogin, isKnownDevice, recordAuthEvent } from '../../core/auth/authEvents';
import { maybeNotifyNewDevice } from '../../core/auth/newDeviceNotice';
import {
  DEFAULT_POLICY,
  policyGate,
  readPolicy,
  sessionLimits,
  userHasMfa,
} from '../../core/auth/policy';

export interface CompleteLoginOpts {
  method: string;
  mfa: string | null;
  tenantId?: string | null;
}

/** Responde 403 por la política y lo apunta (sin esperar: no debe notarse en el tiempo). */
export function rejectByPolicy(
  req: any,
  res: any,
  user: any,
  method: string,
  code: 'METHOD_NOT_ALLOWED' | 'SSO_REQUIRED',
): void {
  void recordAuthEvent({
    userId: user.id,
    kind: 'policy_block',
    ok: false,
    method,
    client: clientInfo(req),
    detail: { code },
  });
  const error =
    code === 'SSO_REQUIRED'
      ? 'Tu empresa exige entrar con el acceso único (SSO) o con una passkey'
      : 'Tu empresa no permite entrar de esta forma';
  res.status(403).json({ error, code });
}

/** Empresa, rol y permisos con los que entra un usuario. */
export interface LoginTarget {
  role: string;
  tenantId: string | null;
  permissions: string | null;
}

/** Resolución en 3 niveles: membership exacta, empresa heredada del usuario, o ninguna (`null`: sin acceso). */
export async function resolveLoginTarget(
  user: any,
  selectedTenantId: string | null | undefined,
): Promise<LoginTarget | null> {
  const db = ClientFactory.getClient('public');
  // SUPERUSER bypassa memberships: accede a cualquier tenant
  if (user.role === 'SUPERUSER') {
    return {
      role: user.role,
      tenantId: selectedTenantId || null,
      permissions: null,
    };
  }
  if (!selectedTenantId) {
    // Sin empresa elegida: la heredada (legacy)
    return {
      role: user.role,
      tenantId: user.tenantId ?? null,
      permissions: user.permissions ?? null,
    };
  }
  // Nivel 1: membership exacta para la empresa seleccionada
  const [membership] = await db
    .select()
    .from(schema.userTenantMemberships)
    .where(
      and(
        eq(schema.userTenantMemberships.userId, user.id),
        eq(schema.userTenantMemberships.tenantId, selectedTenantId),
      ),
    );
  if (membership) {
    return {
      role: membership.role,
      tenantId: membership.tenantId,
      permissions: membership.permissions,
    };
  }
  // Nivel 2: fallback legacy — el usuario tiene ese tenant asignado directamente
  if (user.tenantId === selectedTenantId) {
    return {
      role: user.role,
      tenantId: user.tenantId,
      permissions: user.permissions ?? null,
    };
  }
  return null;
}

/**
 * La política de la empresa a la que va a entrar, antes de pedirle el segundo factor.
 * `null` si puede seguir (o si no se puede resolver la empresa: `completeLogin` lo dirá).
 */
export async function loginPolicyBlock(
  user: any,
  tenantId: string | null | undefined,
  method: string,
): Promise<'METHOD_NOT_ALLOWED' | 'SSO_REQUIRED' | null> {
  const target = await resolveLoginTarget(user, tenantId);
  if (!target?.tenantId) return null;
  const gate = policyGate(
    await readPolicy(target.tenantId),
    { role: target.role, hasMfa: true },
    method,
  );
  return gate.allowed ? null : gate.code!;
}

export async function completeLogin(
  req: any,
  res: any,
  user: any,
  opts: CompleteLoginOpts,
): Promise<void> {
  const db = ClientFactory.getClient('public');

  const target = await resolveLoginTarget(user, opts.tenantId);
  if (!target) {
    res.status(403).json({ error: 'No tienes acceso a esta empresa' });
    return;
  }
  const finalRole = target.role;
  const finalTenantId = target.tenantId;
  const finalPermissions = target.permissions;

  let tenantName = null;
  if (finalTenantId) {
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, finalTenantId));
    tenantName = t?.name;
  }

  // ADMIN y SUPERUSER ignoran siempre permissions granulares — tienen acceso
  // total, y eso es lo que significa `null`.
  //
  // Un usuario normal SIN permisos configurados recibe `{}`, no `null`: son
  // dos cosas distintas y confundirlas es peligroso. Antes ambos casos
  // devolvían `null`, y bastaba con que alguien escribiera
  // `if (permissions === null) → acceso total` para regalarle la empresa
  // entera a un usuario recién creado.
  const effectivePermissions =
    finalRole === 'SUPERUSER' || finalRole === 'ADMIN'
      ? null
      : finalPermissions
        ? JSON.parse(finalPermissions)
        : {};

  // La política de la empresa en la que se entra (sin empresa, la de fábrica).
  const policy = finalTenantId ? await readPolicy(finalTenantId) : DEFAULT_POLICY;
  const gate = policyGate(policy, { role: finalRole, hasMfa: await userHasMfa(user) }, opts.method);
  if (!gate.allowed) {
    rejectByPolicy(req, res, user, opts.method, gate.code!);
    return;
  }
  const limits = sessionLimits(policy);

  const client = clientInfo(req);
  // Antes de apuntar este login: lo que cuenta es lo que había hasta ahora.
  let newDevice = false;
  try {
    newDevice = !(await isKnownDevice(user.id, client)) && (await hasPreviousLogin(user.id));
  } catch (e: any) {
    console.error('[auth] No se pudo comprobar el dispositivo:', e?.message);
  }
  const session = await createSession({
    userId: user.id,
    tenantId: finalTenantId,
    method: opts.method,
    mfa: opts.mfa,
    restricted: gate.restricted,
    client,
    slidingHours: limits.slidingHours,
    maxDays: limits.maxDays,
  });
  await recordAuthEvent({
    userId: user.id,
    kind: 'login',
    ok: true,
    method: opts.method,
    client,
    detail: { mfa: opts.mfa, sessionId: session.id },
  });
  if (newDevice) await maybeNotifyNewDevice(user, client, finalTenantId);
  const token = issueToken(session, {
    id: user.id,
    email: user.email,
    username: user.username,
    role: finalRole,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: finalRole,
      tenantId: finalTenantId,
      tenantName,
      permissions: effectivePermissions,
      avatarImageUrl: user.avatarImageUrl,
      locale: user.locale ?? null,
      themePreset: user.themePreset ?? null,
      themeMode: user.themeMode ?? null,
      restricted: session.restricted ?? null,
    },
  });
}
