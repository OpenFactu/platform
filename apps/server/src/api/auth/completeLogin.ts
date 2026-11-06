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

/**
 * La política de la empresa a la que va a entrar, antes de pedirle el segundo factor.
 * `null` si puede seguir (o si no se puede resolver la empresa: `completeLogin` lo dirá).
 */
export async function loginPolicyBlock(
  user: any,
  tenantId: string | null | undefined,
  method: string,
): Promise<'METHOD_NOT_ALLOWED' | 'SSO_REQUIRED' | null> {
  let role = user.role;
  let target: string | null = null;
  if (user.role !== 'SUPERUSER') {
    const db = ClientFactory.getClient('public');
    if (tenantId) {
      const [m] = await db
        .select()
        .from(schema.userTenantMemberships)
        .where(
          and(
            eq(schema.userTenantMemberships.userId, user.id),
            eq(schema.userTenantMemberships.tenantId, tenantId),
          ),
        );
      if (m) {
        role = m.role;
        target = tenantId;
      } else if (user.tenantId === tenantId) target = tenantId;
      else return null;
    } else target = user.tenantId ?? null;
  } else target = tenantId ?? null;
  if (!target) return null;
  const gate = policyGate(await readPolicy(target), { role, hasMfa: true }, method);
  return gate.allowed ? null : gate.code!;
}

export async function completeLogin(
  req: any,
  res: any,
  user: any,
  opts: CompleteLoginOpts,
): Promise<void> {
  const db = ClientFactory.getClient('public');
  const selectedTenantId = opts.tenantId;

  // Resolución de tenant/rol/permisos en 3 niveles
  let finalRole = user.role;
  let finalTenantId: string | null = null;
  let finalPermissions: string | null = null;

  if (user.role === 'SUPERUSER') {
    // SUPERUSER bypassa memberships: accede a cualquier tenant
    finalTenantId = selectedTenantId || null;
  } else {
    // Nivel 1: buscar membership exacta para el tenant seleccionado
    if (selectedTenantId) {
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
        finalTenantId = membership.tenantId;
        finalRole = membership.role;
        finalPermissions = membership.permissions;
      } else if (user.tenantId === selectedTenantId) {
        // Nivel 2: fallback legacy — el usuario tiene ese tenant asignado directamente
        finalTenantId = user.tenantId;
        finalPermissions = user.permissions;
      } else {
        res.status(403).json({ error: 'No tienes acceso a esta empresa' });
        return;
      }
    } else {
      // Sin selectedTenantId: usar tenantId legacy
      finalTenantId = user.tenantId;
      finalPermissions = user.permissions;
    }
  }

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
