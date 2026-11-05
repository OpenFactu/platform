/**
 * El coste de los artículos solo lo ve quien tiene su permiso. Va en la respuesta y
 * no en cada ruta porque viaja dentro de muchas: la ficha, las líneas de cada
 * documento, los movimientos de almacén. Una ruta nueva que devuelva esas columnas
 * queda cubierta sin acordarse de nada.
 */
import type { NextFunction, Response } from 'express';
import { grantsRead, permissionsForRequest } from './requirePermission';

const COST_FIELDS = new Set(['unitCost', 'averageCost', 'lastPurchaseCost']);

function isPlainObject(value: any): boolean {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function stripCostFields(value: any): any {
  if (Array.isArray(value)) return value.map(stripCostFields);
  if (!isPlainObject(value)) return value;
  const out: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!COST_FIELDS.has(key)) out[key] = stripCostFields(item);
  }
  return out;
}

/** Sin saber quién pregunta, o si falla la comprobación, no se enseña. */
export async function canSeeItemCosts(req: any): Promise<boolean> {
  if (!req.apiToken && (!req.user?.id || !req.tenantId)) return false;
  try {
    return grantsRead(await permissionsForRequest(req), '/item-costs');
  } catch (e: any) {
    console.error('[Permisos] Error comprobando el permiso de costes:', e?.message);
    return false;
  }
}

export async function hideItemCosts(req: any, res: Response, next: NextFunction) {
  if (!(await canSeeItemCosts(req))) {
    const json = res.json.bind(res);
    res.json = (body: any) => json(stripCostFields(body));
  }
  next();
}
