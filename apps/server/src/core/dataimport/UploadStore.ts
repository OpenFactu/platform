/**
 * Guarda temporalmente el fichero que se sube al importador, entre el momento
 * en que se previsualiza y el momento en que se lanza el trabajo.
 *
 * No pasa por `StorageResolver`: eso es para documentos del tenant, que pueden
 * acabar en Google Drive. Esto es un fichero de trabajo que vive minutos y del
 * que, una vez procesado, lo único que interesa conservar son las filas
 * (`DataImportJobRow.raw`). Se guarda en el temporal del sistema, separado por
 * schema de tenant.
 *
 * El fichero se borra al terminar el trabajo. Los que quedan huérfanos —el
 * usuario subió algo, vio la previsualización y cerró la pestaña— los limpia
 * `sweepExpired`, que corre al arrancar el servidor y una vez por hora.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

/** Un fichero sin procesar se considera abandonado pasado este tiempo. */
const TTL_MS = 6 * 60 * 60 * 1000;

const SAFE_SCHEMA = /^[A-Za-z0-9_]+$/;

function rootDir(): string {
  return path.join(os.tmpdir(), 'keirost-data-import');
}

function tenantDir(tenantSchema: string): string {
  if (!SAFE_SCHEMA.test(tenantSchema)) throw new Error(`Schema inválido: ${tenantSchema}`);
  return path.join(rootDir(), tenantSchema);
}

export interface StoredUpload {
  uploadId: string;
  filePath: string;
  fileName: string;
}

export const UploadStore = {
  /** Mueve el fichero que dejó multer a su sitio definitivo temporal. */
  save(tenantSchema: string, tempPath: string, originalName: string): StoredUpload {
    const dir = tenantDir(tenantSchema);
    fs.mkdirSync(dir, { recursive: true });

    const uploadId = crypto.randomUUID();
    // Solo se conserva la extensión del nombre original: el nombre completo lo
    // eligió el usuario y no tiene por qué ser un nombre de fichero seguro.
    const ext = (path.extname(originalName) || '.dat').toLowerCase().slice(0, 10);
    const filePath = path.join(dir, `${uploadId}${ext}`);

    fs.copyFileSync(tempPath, filePath);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* multer lo borrará por su cuenta si no se puede ahora */
    }

    return { uploadId, filePath, fileName: originalName };
  },

  /** Ruta del fichero de una subida, o null si ya no está. */
  resolve(tenantSchema: string, uploadId: string): string | null {
    if (!/^[A-Za-z0-9-]+$/.test(uploadId)) return null;
    const dir = tenantDir(tenantSchema);
    if (!fs.existsSync(dir)) return null;
    const match = fs.readdirSync(dir).find((f) => f.startsWith(uploadId));
    return match ? path.join(dir, match) : null;
  },

  remove(tenantSchema: string, uploadId: string): void {
    const filePath = this.resolve(tenantSchema, uploadId);
    if (!filePath) return;
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ya no estaba */
    }
  },

  /** Borra los ficheros que nadie llegó a procesar. */
  sweepExpired(): number {
    const root = rootDir();
    if (!fs.existsSync(root)) return 0;

    let removed = 0;
    const cutoff = Date.now() - TTL_MS;

    for (const schemaDir of fs.readdirSync(root)) {
      const dir = path.join(root, schemaDir);
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry);
        try {
          if (fs.statSync(full).mtimeMs < cutoff) {
            fs.unlinkSync(full);
            removed++;
          }
        } catch {
          /* carrera con otro borrado, da igual */
        }
      }
    }

    return removed;
  },
};
