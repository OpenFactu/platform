/**
 * Token de un archivo subido desde la página pública, antes de enviar la
 * respuesta. Firmado con HMAC: quien responde no puede inventarse el de un
 * adjunto ajeno ni reutilizarlo en otro formulario, y caduca.
 */
import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'super-secret-key';
const TTL_MS = 24 * 60 * 60 * 1000;

function sign(payload: string): string {
  return crypto.createHmac('sha256', `forms-upload:${SECRET}`).update(payload).digest('base64url');
}

export function createUploadToken(attachmentId: string, formId: string, now = Date.now()): string {
  const payload = `${attachmentId}.${formId}.${now + TTL_MS}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

/** Id del adjunto si el token es válido para ese formulario; null si no. */
export function readUploadToken(token: string, formId: string, now = Date.now()): string | null {
  const [b64, sig] = String(token).split('.');
  if (!b64 || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(b64, 'base64url').toString();
  } catch {
    return null;
  }
  const expected = sign(payload);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  const [attachmentId, tokenForm, exp] = payload.split('.');
  if (tokenForm !== formId || !attachmentId || Number(exp) < now) return null;
  return attachmentId;
}
