import { ApiError, extractErrorMessage } from './ApiError';
import { buildQuery, type QueryParams } from './queryString';

const TOKEN_KEY = 'openfactu_token';

/** Decodifica el payload de un JWT sin verificarlo (solo para leer tenantId localmente). */
function decodeTenantId(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.tenantId || null;
  } catch {
    return null;
  }
}

export interface RequestOptions {
  query?: QueryParams;
  signal?: AbortSignal;
  /**
   * Si es false, no se adjuntan headers de auth y un 401 NO dispara el
   * handler global (un login fallido es un 401 normal). Default: true.
   */
  auth?: boolean;
  /** Headers extra puntuales (casos raros; los de auth los pone el cliente). */
  headers?: Record<string, string>;
}

export interface BlobResult {
  blob: Blob;
  /** Nombre de archivo sugerido por el servidor vía Content-Disposition, si lo hay. */
  filename: string | null;
  /** Cabeceras de la respuesta (algunos endpoints devuelven metadatos, p.ej. X-Render-Free-Errors). */
  headers: Headers;
}

/**
 * Cliente HTTP central de la aplicación. ÚNICO lugar donde se llama a fetch():
 * el resto de la app usa los adaptadores api/ de cada módulo, que delegan aquí.
 *
 * - Adjunta Authorization + x-tenant-id en cada petición autenticada.
 * - Normaliza errores: toda respuesta non-ok lanza ApiError(status, body, msg).
 * - 401 global: dispara el handler registrado por AuthContext (logout).
 *
 * El estado de auth lo empuja AuthContext vía setAuth(); el constructor hace
 * bootstrap desde localStorage para las llamadas anteriores al montaje de React.
 */
export class ApiClient {
  private token: string | null;
  private tenantId: string | null;
  private onUnauthorized: (() => void) | null = null;

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
    this.tenantId = this.token ? decodeTenantId(this.token) : null;
  }

  /** Llamado por AuthContext en login/logout/switchTenant y al resolver /api/auth/me. */
  setAuth(token: string | null, tenantId: string | null): void {
    this.token = token;
    this.tenantId = tenantId ?? (token ? decodeTenantId(token) : null);
  }

  /** AuthContext registra aquí el logout para el manejo global de 401. */
  setOnUnauthorized(handler: (() => void) | null): void {
    this.onUnauthorized = handler;
  }

  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, opts);
  }

  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, opts);
  }

  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body, opts);
  }

  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, opts);
  }

  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, opts);
  }

  /** Envío de FormData (uploads). No fija Content-Type: lo pone el navegador con el boundary. */
  postForm<T>(path: string, form: FormData, opts?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, form, opts);
  }

  /**
   * POST en streaming (NDJSON/SSE): devuelve la Response cruda para que el
   * llamador consuma res.body con un reader. Lanza ApiError si !ok.
   */
  async postStream(path: string, body?: unknown, opts?: RequestOptions): Promise<Response> {
    const res = await this.rawFetch('POST', path, body, opts);
    await this.throwIfNotOk(res, opts);
    return res;
  }

  /** GET en streaming (descargas con progreso por chunk). Lanza ApiError si !ok. */
  async getStream(path: string, opts?: RequestOptions): Promise<Response> {
    const res = await this.rawFetch('GET', path, undefined, opts);
    await this.throwIfNotOk(res, opts);
    return res;
  }

  /** POST que devuelve binario (p.ej. previews de PDF renderizadas al vuelo). */
  async postBlob(path: string, body?: unknown, opts?: RequestOptions): Promise<BlobResult> {
    const res = await this.rawFetch('POST', path, body, opts);
    await this.throwIfNotOk(res, opts);
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return {
      blob: await res.blob(),
      filename: match ? decodeURIComponent(match[1]) : null,
      headers: res.headers,
    };
  }

  /** Descarga binaria (PDF, zip, xlsx...). El click del anchor lo hace el llamador. */
  async getBlob(path: string, opts?: RequestOptions): Promise<BlobResult> {
    const res = await this.rawFetch('GET', path, undefined, opts);
    await this.throwIfNotOk(res, opts);
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return {
      blob: await res.blob(),
      filename: match ? decodeURIComponent(match[1]) : null,
      headers: res.headers,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    const res = await this.rawFetch(method, path, body, opts);
    await this.throwIfNotOk(res, opts);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private rawFetch(
    method: string,
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<Response> {
    const useAuth = opts?.auth !== false;
    const isForm = body instanceof FormData;
    const headers: Record<string, string> = { ...opts?.headers };
    if (useAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
      if (this.tenantId) headers['x-tenant-id'] = this.tenantId;
    }
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

    return fetch(path + buildQuery(opts?.query), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: opts?.signal,
    }).catch(() => {
      throw new ApiError(0, null, 'Error de red');
    });
  }

  private async throwIfNotOk(res: Response, opts?: RequestOptions): Promise<void> {
    if (res.ok) return;
    if (res.status === 401 && opts?.auth !== false) this.onUnauthorized?.();
    let parsed: unknown = null;
    const text = await res.text().catch(() => '');
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    throw new ApiError(res.status, parsed, extractErrorMessage(res.status, parsed));
  }
}

/** Singleton de la app. AuthContext le empuja el token; el resto solo lo consume. */
export const apiClient = new ApiClient();
