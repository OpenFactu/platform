import crypto from 'crypto';

/**
 * Cifrado en reposo de los secretos TOTP (2FA).
 *
 * El secreto base32 de cada usuario se guarda cifrado en `GlobalUser.totpSecret`
 * con AES-256-GCM. La clave viene de `process.env.TOTP_ENC_KEY` (32 bytes en
 * hex → 64 caracteres). Si no está definida, se usa una derivada del JWT_SECRET
 * como último recurso para no romper el arranque en dev — pero en producción
 * DEBE configurarse una clave propia.
 *
 * Formato de salida: `iv:authTag:ciphertext`, todo en hex.
 */

function getKey(): Buffer {
  const raw = process.env.TOTP_ENC_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Fallback determinista para dev: deriva 32 bytes del JWT_SECRET.
  const fallback = process.env.JWT_SECRET || 'super-secret-key';
  return crypto.createHash('sha256').update(`totp:${fallback}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Formato de secreto TOTP inválido');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Genera N códigos de respaldo legibles (formato XXXX-XXXX). */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

/** Hash SHA-256 (hex) de un código de respaldo o token, para guardar sin plaintext. */
export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
