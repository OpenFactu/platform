import crypto from 'crypto';

/**
 * Cifrado en reposo de secretos de configuración (`systemConfigs`).
 *
 * Se usa para hojas sensibles como `storage.*.clientSecret` y
 * `storage.*.refreshToken`. La clave viene de `process.env.CONFIG_ENC_KEY`
 * (32 bytes en hex → 64 caracteres). Si no está definida, se deriva del
 * JWT_SECRET como último recurso para no romper el arranque en dev — pero en
 * producción DEBE configurarse una clave propia.
 *
 * Formato de salida: `enc:v1:<iv>:<authTag>:<ciphertext>`, todo en hex.
 * El prefijo `enc:v1:` permite distinguir valores cifrados de valores
 * heredados en texto plano (que se leen tal cual y se re-cifran en la
 * siguiente escritura) y versionar el esquema en el futuro.
 */

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env.CONFIG_ENC_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Fallback determinista para dev: deriva 32 bytes del JWT_SECRET.
  const fallback = process.env.JWT_SECRET || 'super-secret-key';
  return crypto.createHash('sha256').update(`storage:${fallback}`).digest();
}

export function isEncryptedSecret(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptConfigSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descifra un valor cifrado con `encryptConfigSecret`. Los valores sin el
 * prefijo `enc:v1:` se devuelven tal cual (compatibilidad con valores
 * guardados en plano antes del cifrado).
 */
export function decryptConfigSecret(value: string): string {
  if (!isEncryptedSecret(value)) return value;
  const [ivHex, tagHex, dataHex] = value.slice(PREFIX.length).split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Formato de secreto de configuración inválido');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}
