/**
 * Cliente mínimo de la API de Google Drive (v3) sobre `fetch` nativo.
 *
 * Sin SDK: solo necesitamos búsqueda/creación de carpetas, subida (multipart
 * para archivos pequeños, resumable por chunks para grandes), descarga en
 * stream, borrado y listado. El access token lo provee el TokenManager vía
 * el callback `getToken`; ante un 401 se invalida y se reintenta una vez.
 */

import { Readable } from 'stream';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

/** Umbral para pasar de subida multipart a resumable. */
const SIMPLE_UPLOAD_LIMIT = 5 * 1024 * 1024;
/** Tamaño de chunk resumable: 8 MiB (múltiplo de 256 KiB exigido por Google). */
const CHUNK_SIZE = 8 * 1024 * 1024;

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface GoogleDriveClientOpts {
  getToken: () => Promise<string>;
  /** Invalida el token cacheado (se llama antes del reintento tras un 401). */
  invalidateToken: () => void;
}

export interface CloudFileInfo {
  id: string;
  name: string;
  size: number;
  createdTime?: string;
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveClient {
  private folderCache = new Map<string, string>(); // path → folderId

  constructor(private opts: GoogleDriveClientOpts) {}

  private async request(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const token = await this.opts.getToken();
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers as any), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && retry) {
      this.opts.invalidateToken();
      return this.request(url, init, false);
    }
    return res;
  }

  private async requestJson(url: string, init: RequestInit = {}): Promise<any> {
    const res = await this.request(url, init);
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Google Drive API ${res.status}: ${data?.error?.message || res.statusText}`);
    }
    return data;
  }

  /**
   * Busca (o crea) la ruta de carpetas `segments` (por NOMBRE, no por ID)
   * bajo "Mi unidad" y devuelve el id de la última. Cachea por path completo.
   */
  async ensureFolderPath(segments: string[]): Promise<string> {
    let parentId = 'root';
    let pathKey = `@${parentId}`;
    for (const segment of segments) {
      pathKey += `/${segment}`;
      const cached = this.folderCache.get(pathKey);
      if (cached) {
        parentId = cached;
        continue;
      }
      const q = `name='${escapeQuery(segment)}' and '${escapeQuery(parentId)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
      const found = await this.requestJson(
        `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
      );
      let folderId: string | undefined = found?.files?.[0]?.id;
      if (!folderId) {
        const created = await this.requestJson(`${API}/files?fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: segment, mimeType: FOLDER_MIME, parents: [parentId] }),
        });
        folderId = created.id;
      }
      this.folderCache.set(pathKey, folderId!);
      parentId = folderId!;
    }
    return parentId;
  }

  async upload(
    name: string,
    mime: string,
    data: Buffer,
    parentId: string,
  ): Promise<{ id: string; size: number }> {
    if (data.length < SIMPLE_UPLOAD_LIMIT) {
      return this.uploadMultipart(name, mime, data, parentId);
    }
    return this.uploadResumable(name, mime, data, parentId);
  }

  private async uploadMultipart(
    name: string,
    mime: string,
    data: Buffer,
    parentId: string,
  ): Promise<{ id: string; size: number }> {
    const boundary = `openfactu_${Date.now().toString(36)}`;
    const metadata = JSON.stringify({ name, parents: [parentId] });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const result = await this.requestJson(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,size`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    return { id: result.id, size: Number(result.size) || data.length };
  }

  private async uploadResumable(
    name: string,
    mime: string,
    data: Buffer,
    parentId: string,
  ): Promise<{ id: string; size: number }> {
    // 1) Abrir sesión resumable → header Location con la URL de subida
    const sessionRes = await this.request(
      `${UPLOAD_API}/files?uploadType=resumable&fields=id,size`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mime || 'application/octet-stream',
          'X-Upload-Content-Length': String(data.length),
        },
        body: JSON.stringify({ name, parents: [parentId] }),
      },
    );
    if (!sessionRes.ok) {
      const err: any = await sessionRes.json().catch(() => ({}));
      throw new Error(
        `Google Drive: no se pudo abrir sesión de subida (${sessionRes.status}): ${err?.error?.message || ''}`,
      );
    }
    const uploadUrl = sessionRes.headers.get('location');
    if (!uploadUrl) throw new Error('Google Drive: sesión resumable sin URL de subida');

    // 2) Subir por chunks. 308 = chunk aceptado, seguir; 200/201 = completado.
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.subarray(offset, Math.min(offset + CHUNK_SIZE, data.length));
      const end = offset + chunk.length - 1;
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${offset}-${end}/${data.length}`,
        },
        body: chunk,
      });
      if (res.status === 308) continue;
      if (res.ok) {
        const result: any = await res.json().catch(() => ({}));
        return { id: result.id, size: Number(result.size) || data.length };
      }
      const err: any = await res.json().catch(() => ({}));
      throw new Error(
        `Google Drive: fallo subiendo chunk (${res.status}): ${err?.error?.message || ''}`,
      );
    }
    throw new Error('Google Drive: la subida resumable terminó sin respuesta final');
  }

  async downloadStream(
    fileId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; size: number; name: string; mime: string }> {
    const meta = await this.requestJson(
      `${API}/files/${encodeURIComponent(fileId)}?fields=name,size,mimeType`,
    );
    const res = await this.request(`${API}/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!res.ok || !res.body) {
      throw new Error(`Google Drive: no se pudo descargar el archivo (${res.status})`);
    }
    return {
      stream: Readable.fromWeb(res.body as any),
      size: Number(meta.size) || 0,
      name: meta.name || fileId,
      mime: meta.mimeType || 'application/octet-stream',
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    const res = await this.request(`${API}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(
        `Google Drive: no se pudo borrar el archivo (${res.status}): ${err?.error?.message || ''}`,
      );
    }
  }

  async listChildren(folderId: string): Promise<CloudFileInfo[]> {
    const out: CloudFileInfo[] = [];
    let pageToken = '';
    do {
      const q = `'${escapeQuery(folderId)}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`;
      const data = await this.requestJson(
        `${API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,size,createdTime)&pageSize=200` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''),
      );
      for (const f of data.files || []) {
        out.push({ id: f.id, name: f.name, size: Number(f.size) || 0, createdTime: f.createdTime });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return out;
  }

  /** Cuenta conectada — para healthcheck y para mostrar el email en la UI. */
  async about(): Promise<{ email: string }> {
    const data = await this.requestJson(`${API}/about?fields=user`);
    return { email: data?.user?.emailAddress || '' };
  }
}
