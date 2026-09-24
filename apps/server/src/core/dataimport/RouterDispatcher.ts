/**
 * Puente para ejecutar un endpoint de la API **dentro del mismo proceso**, sin
 * pasar por HTTP.
 *
 * Por qué existe: en este repo la lógica de alta vive dentro de los handlers de
 * Express, acoplada a `req` (ver `partners.ts`, que genera el código por
 * prefijo de grupo, valida NIF/IBAN, escribe los campos `p_*` de plugins y
 * audita, todo en el handler). No hay capa de servicio que reutilizar. Cuando
 * el chat de IA necesitó dar de alta interlocutores acabó DUPLICANDO esa
 * lógica en `core/ai/tools/erpEntityTools.ts` — y su propia cabecera lo admite.
 * El importador no puede ser la tercera copia: sintetiza un `req`/`res` y
 * despacha contra el router real, de modo que una fila de un Excel recorre
 * exactamente el mismo código que si se hubiera tecleado en la pantalla
 * (validaciones, hooks de plugins, campos personalizados y auditoría
 * incluidos).
 *
 * Lo que sintetiza el `req` falso — la lista es exhaustiva a propósito, para
 * que se vea de un vistazo qué asume este puente sobre los handlers:
 *
 *   method, url, originalUrl, baseUrl, params, query, headers, body,
 *   get()/header()/is()/accepts(), y el contexto que normalmente inyecta
 *   `tenantContextMiddleware`: tenantClient, tenantId, tenantSchema, user
 *   (y apiToken, si la importación la lanzó una integración).
 *
 * El `res` falso captura `status()`, `json()`, `send()`, `end()` y las
 * cabeceras. La promesa se resuelve con la PRIMERA respuesta del handler; el
 * trabajo que algunos disparan después sin `await` (p.ej. `logAudit` en
 * `partners.ts`) sigue su curso en segundo plano, igual que en producción.
 *
 * LÍMITES — solo se despacha contra endpoints JSON de escritura
 * (POST/PATCH/PUT/DELETE). Nada de rutas con `multer`, streaming, SSE o
 * WebSocket: esas leen el `req` como un stream real y aquí no lo es.
 */

import type { Router } from 'express';

export interface DispatchContext {
  /** Cliente Drizzle del tenant, tal y como lo inyecta tenantContextMiddleware. */
  tenantClient: any;
  tenantId: string;
  tenantSchema?: string;
  user: {
    id: string;
    role?: string;
    email?: string;
    username?: string;
    tenantId?: string;
  };
  /** Solo si la importación se lanzó con un token de API — respeta los scopes. */
  apiToken?: { id: string; scopes: string[] };
}

export interface DispatchOptions {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'GET';
  /** Ruta RELATIVA al router, no a `/api`. Para POST /api/partners → '/'. */
  url: string;
  body?: any;
  query?: Record<string, any>;
  ctx: DispatchContext;
  /** Ruta completa, solo para logs y para `req.originalUrl`. */
  originalUrl?: string;
  /** Corta la espera si un handler nunca responde. Por defecto 60 s. */
  timeoutMs?: number;
}

export interface DispatchResult<T = any> {
  status: number;
  data: T;
  ok: boolean;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Los routers envuelven el error de pg en `Failed query: ...` y esconden la
 * causa real. Mismo criterio de extracción que usan ellos para responder algo
 * legible ("duplicate key", "null value violates not-null"…).
 */
export function extractErrorMessage(error: any): string {
  return (
    (error?.cause?.detail as string | undefined) ||
    (error?.cause?.message as string | undefined) ||
    (error?.message as string | undefined) ||
    'Error desconocido'
  );
}

function buildRequest(opts: DispatchOptions): any {
  const { ctx } = opts;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-tenant-id': ctx.tenantId,
    // Marca para que cualquier log o auditoría distinga una fila importada de
    // una petición real de un navegador.
    'x-internal-dispatch': 'data-import',
  };

  const req: any = {
    method: opts.method,
    url: opts.url,
    originalUrl: opts.originalUrl || opts.url,
    baseUrl: '',
    path: opts.url.split('?')[0],
    params: {},
    query: opts.query || {},
    headers,
    body: opts.body ?? {},
    // Contexto que normalmente pone tenantContextMiddleware.
    tenantClient: ctx.tenantClient,
    tenantId: ctx.tenantId,
    tenantSchema: ctx.tenantSchema,
    user: ctx.user,
  };

  if (ctx.apiToken) req.apiToken = ctx.apiToken;

  req.get = (name: string) => headers[String(name).toLowerCase()];
  req.header = req.get;
  req.is = (type: string) => (/json/i.test(type) ? 'json' : false);
  req.accepts = () => 'json';

  return req;
}

function buildResponse(settle: (status: number, data: any) => void): any {
  let statusCode = 200;
  const headers: Record<string, any> = {};

  const res: any = {
    locals: {},
    headersSent: false,
    get statusCode() {
      return statusCode;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
  };

  res.status = (code: number) => {
    statusCode = code;
    return res;
  };
  res.sendStatus = (code: number) => {
    statusCode = code;
    settle(code, null);
    return res;
  };
  res.json = (payload: any) => {
    res.headersSent = true;
    settle(statusCode, payload);
    return res;
  };
  res.send = (payload: any) => {
    res.headersSent = true;
    settle(statusCode, payload);
    return res;
  };
  res.end = (payload?: any) => {
    res.headersSent = true;
    settle(statusCode, payload ?? null);
    return res;
  };
  res.setHeader = (name: string, value: any) => {
    headers[String(name).toLowerCase()] = value;
    return res;
  };
  res.getHeader = (name: string) => headers[String(name).toLowerCase()];
  res.set = (name: any, value?: any) => {
    if (typeof name === 'object') Object.assign(headers, name);
    else headers[String(name).toLowerCase()] = value;
    return res;
  };
  res.header = res.set;
  res.type = (t: string) => {
    headers['content-type'] = t;
    return res;
  };
  res.vary = () => res;
  res.append = res.setHeader;

  return res;
}

/**
 * Ejecuta `method url` contra `router` en proceso y devuelve lo que el handler
 * habría respondido por HTTP. Nunca lanza por un error del handler: un fallo se
 * devuelve como `{ ok: false, status, data }` para que el importador lo anote
 * en la fila y siga con la siguiente.
 */
export function callRouter<T = any>(
  router: Router,
  opts: DispatchOptions,
): Promise<DispatchResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const finish = (status: number, data: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, data, ok: status < 400 });
    };

    const timer = setTimeout(() => {
      finish(504, {
        error: `El endpoint ${opts.method} ${opts.url} no respondió en ${timeoutMs} ms`,
      });
    }, timeoutMs);

    const req = buildRequest(opts);
    const res = buildResponse(finish);

    // Último eslabón de la cadena: el router llama aquí si ninguna ruta casó
    // (404) o si algún handler hizo `next(err)`.
    const done = (err?: any) => {
      if (err) {
        finish(err?.status || err?.statusCode || 500, { error: extractErrorMessage(err) });
        return;
      }
      finish(404, { error: `Sin ruta para ${opts.method} ${opts.url}` });
    };

    try {
      (router as any).handle(req, res, done);
    } catch (err: any) {
      finish(500, { error: extractErrorMessage(err) });
    }
  });
}
