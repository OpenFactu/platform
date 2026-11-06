/**
 * Cierra un acceso ya autenticado: resuelve empresa, rol y permisos, abre la sesión y
 * responde `{ token, user }`. Lo usan el login con contraseña, el segundo factor y
 * el resto de formas de entrar.
 */
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
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

/**
 * Empresa, rol y permisos con los que entra. Con empresa elegida, esa (o `null`: sin acceso).
 *
 * Sin elegirla (Google, passkey o código desde la lista de cuentas no preguntan), la de la
 * última sesión, luego la heredada, luego la primera membresía; un SUPERUSER, además, la
 * primera empresa que exista. Antes un SUPERUSER entraba en «ninguna» y la app se quedaba sin
 * empresa. Cada candidata se comprueba igual que una elegida: una empresa de la que le quitaron
 * el acceso no vale aunque fuera la última.
 */
export async function resolveLoginTarget(
  user: any,
  selectedTenantId: string | null | undefined,
): Promise<LoginTarget | null> {
  if (selectedTenantId) return resolveForTenant(user, selectedTenantId);
  for (const candidate of await defaultTenantCandidates(user)) {
    const target = await resolveForTenant(user, candidate);
    if (target) return target;
  }
  // Sin ninguna: como antes, la heredada (que puede ser nula).
  return user.role === 'SUPERUSER'
    ? { role: user.role, tenantId: null, permissions: null }
    : { role: user.role, tenantId: user.tenantId ?? null, permissions: user.permissions ?? null };
}

/** Empresas en las que probar a entrar cuando no se eligió ninguna, de más a menos probable. */
async function defaultTenantCandidates(user: any): Promise<string[]> {
  const db = ClientFactory.getClient('public');
  const recent = await db
    .select({ tenantId: schema.userSessions.tenantId })
    .from(schema.userSessions)
    .where(and(eq(schema.userSessions.userId, user.id), isNotNull(schema.userSessions.tenantId)))
    .orderBy(desc(schema.userSessions.createdAt))
    .limit(10);
  const memberships = await db
    .select({ tenantId: schema.userTenantMemberships.tenantId })
    .from(schema.userTenantMemberships)
    .where(eq(schema.userTenantMemberships.userId, user.id))
    .orderBy(asc(schema.userTenantMemberships.createdAt));
  const firstTenant =
    user.role === 'SUPERUSER'
      ? await db
          .select({ tenantId: schema.tenants.id })
          .from(schema.tenants)
          .orderBy(asc(schema.tenants.createdAt))
          .limit(1)
      : [];
  const ids = [
    ...recent.map((r: any) => r.tenantId),
    user.tenantId,
    ...memberships.map((m: any) => m.tenantId),
    ...firstTenant.map((t: any) => t.tenantId),
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

/** La resolución para una empresa concreta: membresía, empresa heredada, o `null` (sin acceso). */
async function resolveForTenant(user: any, selectedTenantId: string): Promise<LoginTarget | null> {
  const db = ClientFactory.getClient('public');
  // SUPERUSER bypassa memberships: accede a cualquier tenant, si existe.
  if (user.role === 'SUPERUSER') {
    const [tenant] = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, selectedTenantId));
    return tenant ? { role: user.role, tenantId: tenant.id, permissions: null } : null;
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
