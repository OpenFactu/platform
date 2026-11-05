import type { Request, Response } from 'express';
import { hasScope } from '../middleware/apiToken';
import { LogisticsError } from '../../core/logistics/shipmentLifecycle';
import type { LogisticsContext } from '../../core/logistics/shipmentTransitions';
import { publicBaseUrl } from '../../utils/publicBaseUrl';

export function nowIso() {
  return new Date();
}

export async function contextOf(req: any): Promise<LogisticsContext> {
  return {
    db: req.tenantClient,
    tenantId: req.tenantId,
    userId: req.user?.id || null,
    baseUrl: await publicBaseUrl(req),
  };
}

/** PDF para ver antes de imprimir o guardar. */
export function sendPdf(res: Response, pdf: Buffer, filename: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(pdf);
}

/** Texto obligatorio del cuerpo: motivo de una incidencia, por ejemplo. */
export function requiredText(value: unknown, message: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new LogisticsError(message, 400);
  return text;
}

export function optionalText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

/**
 * Ruta que llama a una acción y traduce el resultado: lo que devuelve va con
 * `ok: true` y un `LogisticsError` llega con su código y su mensaje.
 */
export function action(fn: (req: any, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json({ ok: true, ...((result as object) || {}) });
    } catch (e: any) {
      if (e instanceof LogisticsError) {
        return res.status(e.status).json({ error: e.message, ...(e.details || {}) });
      }
      console.error(`[logistics] ${req.method} ${req.originalUrl}:`, e?.cause?.message || e?.message);
      res.status(500).json({ error: e?.message || 'Error de logística' });
    }
  };
}

/**
 * Los tokens de API se rigen por sus scopes, no por el permiso de módulo: leer
 * pide `read:logistics` y el resto `write:logistics`. Una sesión de usuario pasa.
 */
export function requireLogisticsScope(req: any, res: Response, next: () => void) {
  const scope =
    req.method === 'GET' || req.method === 'HEAD' ? 'read:logistics' : 'write:logistics';
  if (!hasScope(req, scope)) return res.status(403).json({ error: `Falta el scope ${scope}` });
  next();
}
