/**
 * Sistema de correo saliente por tenant.
 *
 * La configuración SMTP vive en `systemConfigs` (tabla por-tenant) bajo el
 * prefijo `email_*`. Por ahora todos los emails se envían con las creden-
 * ciales del tenant activo — si algún proceso cross-tenant necesita mandar
 * mail, tendrá que resolver el tenant antes de llamar aquí.
 *
 * El transporter se cachea por (tenantId + hash de config) para no volver a
 * conectar a SMTP en cada mensaje.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import crypto from 'crypto';
import { getConfigSection, setConfigSection } from '../config/systemConfigSection';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean; // true para 465 (SSL), false para 587 (STARTTLS)
  user: string;
  password: string;
  fromAddress: string; // "Keirost <noreply@empresa.com>"
  fromName: string; // usado si fromAddress no lleva display name
  enabled: boolean; // flag maestro — si false, las llamadas fallan con error claro
}

export const EMAIL_DEFAULTS: EmailConfig = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  password: '',
  fromAddress: '',
  fromName: 'Keirost',
  enabled: false,
};

const cache = new Map<string, { hash: string; transporter: Transporter }>();

function hashConfig(c: EmailConfig): string {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify({ h: c.host, p: c.port, s: c.secure, u: c.user, pw: c.password }))
    .digest('hex');
}

function buildTransporter(c: EmailConfig): Transporter {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user || c.password ? { user: c.user, pass: c.password } : undefined,
  });
}

export async function readConfig(tenantDb: any): Promise<EmailConfig> {
  return getConfigSection<EmailConfig>(tenantDb, 'email', EMAIL_DEFAULTS);
}

export async function writeConfig(
  tenantDb: any,
  patch: Partial<EmailConfig>,
): Promise<EmailConfig> {
  const next = await setConfigSection<EmailConfig>(tenantDb, 'email', EMAIL_DEFAULTS, patch);
  // Invalida cache del tenant (no sabemos el tenantId aquí, así que limpiamos
  // todo — hay poca contención: admin toca la config pocas veces).
  cache.clear();
  return next;
}

export async function getTransporter(tenantId: string, tenantDb: any): Promise<Transporter> {
  const cfg = await readConfig(tenantDb);
  if (!cfg.enabled) {
    throw new Error('El envío de correo está deshabilitado en Ajustes → Correo.');
  }
  if (!cfg.host) {
    throw new Error('No hay SMTP configurado. Completa host/puerto/usuario en Ajustes → Correo.');
  }
  const h = hashConfig(cfg);
  const cached = cache.get(tenantId);
  if (cached && cached.hash === h) return cached.transporter;
  const t = buildTransporter(cfg);
  cache.set(tenantId, { hash: h, transporter: t });
  return t;
}

export interface SendMailInput {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
    /** Content-ID para embebidos inline vía `<img src="cid:..."/>`. */
    cid?: string;
  }>;
}

export async function sendMail(
  tenantId: string,
  tenantDb: any,
  input: SendMailInput,
): Promise<{ messageId: string; accepted: string[]; rejected: string[] }> {
  const cfg = await readConfig(tenantDb);
  const transporter = await getTransporter(tenantId, tenantDb);
  const from =
    cfg.fromAddress || (cfg.user ? `${cfg.fromName} <${cfg.user}>` : cfg.fromName || 'Keirost');
  const info = await transporter.sendMail({
    from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });
  return {
    messageId: info.messageId,
    accepted: (info.accepted as string[]) || [],
    rejected: (info.rejected as string[]) || [],
  };
}

/**
 * Verifica la conexión contra el SMTP sin mandar ningún correo. Útil para el
 * botón "Probar conexión" en Ajustes.
 */
/**
 * Verifica el SMTP. Si se pasa `override` lo usa tal cual (útil para probar
 * desde el formulario antes de guardar). Si no, lee la config guardada.
 */
export async function verifyConnection(
  tenantDb: any,
  override?: Partial<EmailConfig>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const base = await readConfig(tenantDb);
    const cfg: EmailConfig = { ...base, ...(override || {}) };
    if (!cfg.host) return { ok: false, error: 'Falta host SMTP' };
    const t = buildTransporter(cfg);
    await t.verify();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Fallo al conectar' };
  }
}
