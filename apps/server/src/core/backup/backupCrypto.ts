import crypto from 'crypto';

/**
 * Cifrado de las copias de seguridad: AES-256-GCM con `BACKUP_ENC_KEY`.
 *
 * La clave es aparte de todas las demás y tiene que guardarse FUERA del servidor
 * y de las copias: si se pierde, las copias no se pueden restaurar; si se guarda
 * junto a ellas, cifrarlas no protege de nada.
 *
 * Formato: `KRSTBK01` ‖ iv (12) ‖ tag (16) ‖ cifrado.
 */
const MAGIC = Buffer.from('KRSTBK01');
const IV_LEN = 12;
const TAG_LEN = 16;

export const ENCRYPTED_EXTENSION = '.zip.enc';

export function backupKey(): Buffer | null {
  const raw = process.env.BACKUP_ENC_KEY?.trim();
  if (!raw) return null;
  if (!/^[a-f\d]{64}$/i.test(raw)) {
    throw new Error('BACKUP_ENC_KEY tiene que ser de 32 bytes en hexadecimal (64 caracteres)');
  }
  return Buffer.from(raw, 'hex');
}

export function isEncryptedBackup(data: Buffer): boolean {
  return data.length > MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
}

/** Sirve para listar y borrar: los dos formatos conviven en un destino. */
export function isBackupFileName(name: string): boolean {
  return name.endsWith('.zip') || name.endsWith(ENCRYPTED_EXTENSION);
}

export function sealBackup(zip: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const sealed = Buffer.concat([cipher.update(zip), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), sealed]);
}

/** Un zip sin cifrar (copias anteriores) se devuelve tal cual. */
export function openBackup(data: Buffer, key: Buffer | null = backupKey()): Buffer {
  if (!isEncryptedBackup(data)) return data;
  if (!key) throw new Error('Esta copia está cifrada: falta BACKUP_ENC_KEY en el servidor');
  const ivEnd = MAGIC.length + IV_LEN;
  const tagEnd = ivEnd + TAG_LEN;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(MAGIC.length, ivEnd));
  decipher.setAuthTag(data.subarray(ivEnd, tagEnd));
  try {
    return Buffer.concat([decipher.update(data.subarray(tagEnd)), decipher.final()]);
  } catch {
    throw new Error(
      'No se pudo descifrar la copia: BACKUP_ENC_KEY no es la clave con la que se hizo',
    );
  }
}
