/**
 * Cliente mínimo de OneDrive (Microsoft Graph v1.0) sobre `fetch` nativo.
 *
 * Misma forma que `GoogleDriveClient`: carpetas, subida (PUT simple para
 * archivos pequeños, upload session por chunks para grandes), descarga en
 * stream, borrado y listado. El access token lo provee el TokenManager vía
 * `getToken`; ante un 401 se invalida y se reintenta una vez.
 */

import { Readable } from 'stream';
import type { CloudFileInfo } from './GoogleDriveClient';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const DRIVE = `${GRAPH}/me/drive`;

/** Umbral para pasar de PUT simple a upload session (límite Graph: 4 MiB). */
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
/** Chunk de sesión: 10 485 760 bytes = 32 × 320 KiB (múltiplo exigido por Graph). */
const CHUNK_SIZE = 10_485_760;

export interface OneDriveClientOpts {
  getToken: () => Promise<string>;
  invalidateToken: () => void;
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

/** URL de un hijo por nombre bajo un item (o el root si parentId es vacío). */
function childByPathUrl(parentId: string | undefined, name: string): string {
  return parentId
    ? `${DRIVE}/items/${encodeURIComponent(parentId)}:/${encodePathSegment(name)}`
    : `${DRIVE}/root:/${encodePathSegment(name)}`;
}

function childrenUrl(parentId: string | undefined): string {
  return parentId
    ? `${DRIVE}/items/${encodeURIComponent(parentId)}/children`
    : `${DRIVE}/root/children`;
}

export class OneDriveClient {
  private folderCache = new Map<string, string>(); // path → itemId

  constructor(private opts: OneDriveClientOpts) {}

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
      throw new Error(`OneDrive API ${res.status}: ${data?.error?.message || res.statusText}`);
    }
    return data;
  }

  /**
   * Busca (o crea) la ruta de carpetas `segments` (por NOMBRE, no por ID)
   * bajo la raíz del drive y devuelve el id de la última. Cachea por path.
   */
  async ensureFolderPath(segments: string[]): Promise<string> {
    let parentId: string | undefined = undefined;
    let pathKey = '@root';
    for (const segment of segments) {
      pathKey += `/${segment}`;
      const cached = this.folderCache.get(pathKey);
      if (cached) {
        parentId = cached;
        continue;
      }
      // Direccionamiento por ruta: si existe devuelve el item, si no 404
      const lookup = await this.request(childByPathUrl(parentId, segment));
      let folderId: string | undefined;
      if (lookup.ok) {
        const item: any = await lookup.json().catch(() => ({}));
        folderId = item?.id;
      } else if (lookup.status === 404) {
        const created = await this.requestJson(childrenUrl(parentId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: segment,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'replace',
          }),
        });
        folderId = created.id;
      } else {
        const err: any = await lookup.json().catch(() => ({}));
        throw new Error(
          `OneDrive: error resolviendo carpeta "${segment}" (${lookup.status}): ${err?.error?.message || ''}`,
        );
      }
      if (!folderId) throw new Error(`OneDrive: no se pudo resolver la carpeta "${segment}"`);
      this.folderCache.set(pathKey, folderId);
      parentId = folderId;
    }
    if (!parentId) throw new Error('OneDrive: ruta de carpetas vacía');
    return parentId;
  }

  async upload(
    name: string,
    mime: string,
    data: Buffer,
    parentId: string,
  ): Promise<{ id: string; size: number }> {
    if (data.length < SIMPLE_UPLOAD_LIMIT) {
      const item = await this.requestJson(`${childByPathUrl(parentId, name)}:/content`, {
        method: 'PUT',
        headers: { 'Content-Type': mime || 'application/octet-stream' },
        body: data,
      });
      return { id: item.id, size: Number(item.size) || data.length };
    }
    return this.uploadSession(name, data, parentId);
  }

  private async uploadSession(
    name: string,
    data: Buffer,
    parentId: string,
  ): Promise<{ id: string; size: number }> {
    const session = await this.requestJson(
      `${childByPathUrl(parentId, name)}:/createUploadSession`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: { '@microsoft.graph.conflictBehavior': 'replace', name },
        }),
      },
    );
    const uploadUrl: string = session.uploadUrl;
    if (!uploadUrl) throw new Error('OneDrive: sesión de subida sin uploadUrl');

    // La uploadUrl ya va pre-autorizada — no lleva header Authorization.
    // 202 = chunk aceptado; 200/201 = subida completada con el driveItem.
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
      if (res.status === 202) continue;
      if (res.ok) {
        const item: any = await res.json().catch(() => ({}));
        return { id: item.id, size: Number(item.size) || data.length };
      }
      const err: any = await res.json().catch(() => ({}));
      throw new Error(
        `OneDrive: fallo subiendo chunk (${res.status}): ${err?.error?.message || ''}`,
      );
    }
    throw new Error('OneDrive: la sesión de subida terminó sin respuesta final');
  }

  async downloadStream(
    itemId: string,
  ): Promise<{ stream: NodeJS.ReadableStream; size: number; name: string; mime: string }> {
    const meta = await this.requestJson(
      `${DRIVE}/items/${encodeURIComponent(itemId)}?$select=id,name,size,file`,
    );
    // GET /content responde 302 hacia una URL de descarga; fetch sigue el redirect.
    const res = await this.request(`${DRIVE}/items/${encodeURIComponent(itemId)}/content`);
    if (!res.ok || !res.body) {
      throw new Error(`OneDrive: no se pudo descargar el archivo (${res.status})`);
    }
    return {
      stream: Readable.fromWeb(res.body as any),
      size: Number(meta.size) || 0,
      name: meta.name || itemId,
      mime: meta?.file?.mimeType || 'application/octet-stream',
    };
  }

  async deleteFile(itemId: string): Promise<void> {
    const res = await this.request(`${DRIVE}/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(
        `OneDrive: no se pudo borrar el archivo (${res.status}): ${err?.error?.message || ''}`,
      );
    }
  }

  async listChildren(folderId: string): Promise<CloudFileInfo[]> {
    const out: CloudFileInfo[] = [];
    let url =
      `${DRIVE}/items/${encodeURIComponent(folderId)}/children` +
      `?$select=id,name,size,createdDateTime,folder&$top=200`;
    while (url) {
      const data = await this.requestJson(url);
      for (const item of data.value || []) {
        if (item.folder) continue;
        out.push({
          id: item.id,
          name: item.name,
          size: Number(item.size) || 0,
          createdTime: item.createdDateTime,
        });
      }
      url = data['@odata.nextLink'] || '';
    }
    return out;
  }

  /** Cuenta conectada — para healthcheck y para mostrar el email en la UI. */
  async me(): Promise<{ email: string }> {
    const data = await this.requestJson(`${GRAPH}/me?$select=mail,userPrincipalName`);
    return { email: data?.mail || data?.userPrincipalName || '' };
  }
}
