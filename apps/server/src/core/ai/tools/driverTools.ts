/**
 * Tools de lectura para el CONDUCTOR (rol DRIVER, o cualquier usuario
 * vinculado como driver de rutas vía su Employee).
 *
 * No se gatean por permisos de módulo (`hasModuleAccess`) a propósito: un
 * conductor no tiene concedido ningún módulo del ERP (deny-by-default) y sin
 * esto el chat le quedaba sin NINGUNA tool — no podía ni consultar sus
 * propias rutas. Son seguras para cualquier rol porque el alcance se resuelve
 * SIEMPRE server-side desde `ctx.user.id` → Employee → rutas con
 * `driverEmployeeId` propio: nunca devuelven rutas de otros conductores ni
 * aceptan un employeeId de entrada.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import type { ChatToolContext } from './util';

/** Employee vinculado al usuario del chat, o null si no es conductor.
 *  El ctx del servidor MCP puede llegar sin user.id — ahí no hay "mis rutas". */
async function resolveMyEmployee(ctx: ChatToolContext) {
  if (!ctx.user?.id) return null;
  const [emp] = await ctx.tenantClient
    .select()
    .from(schema.employees)
    .where(eq(schema.employees.userId, ctx.user.id));
  return emp || null;
}

function pruneRoute(r: any) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    plannedDate: r.plannedDate,
    status: r.status,
    vehiclePlate: r.vehiclePlate,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
  };
}

export function buildDriverTools(ctx: ChatToolContext) {
  return {
    list_my_routes: tool({
      description:
        'Lista las rutas de reparto asignadas AL USUARIO ACTUAL como conductor (sus propias rutas, no las de otros). Filtros opcionales por fecha planificada y estado. Si el usuario no está vinculado a ningún empleado conductor, devuelve lista vacía con una pista.',
      inputSchema: z.object({
        date: z
          .string()
          .optional()
          .describe('Fecha planificada exacta (yyyy-mm-dd) — p.ej. hoy para "mis rutas de hoy"'),
        status: z.enum(['planned', 'active', 'completed']).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (input: { date?: string; status?: string; limit?: number }) => {
        const emp = await resolveMyEmployee(ctx);
        if (!emp) {
          return {
            routes: [],
            hint: 'Este usuario no está vinculado a ningún empleado conductor — no tiene rutas propias.',
          };
        }
        const conds = [eq(schema.routes.driverEmployeeId, emp.id)];
        if (input.status) conds.push(eq(schema.routes.status, input.status));
        let rows = await ctx.tenantClient
          .select()
          .from(schema.routes)
          .where(and(...conds))
          .orderBy(desc(schema.routes.plannedDate))
          .limit(input.limit ?? 20);
        if (input.date) {
          rows = rows.filter((r: any) => String(r.plannedDate || '').slice(0, 10) === input.date);
        }
        return { routes: rows.map(pruneRoute) };
      },
    }),

    get_my_route: tool({
      description:
        'Detalle de UNA ruta propia del conductor (por id o por código, p.ej. "RT-950988"): paradas en orden con su estado y dirección, y el estado de cada envío. Solo funciona con rutas asignadas al usuario actual.',
      inputSchema: z.object({
        routeId: z.string().describe('Id o código (code) de la ruta'),
      }),
      execute: async ({ routeId }: { routeId: string }) => {
        const emp = await resolveMyEmployee(ctx);
        if (!emp) {
          return { error: 'Este usuario no está vinculado a ningún empleado conductor.' };
        }
        const [route] = await ctx.tenantClient
          .select()
          .from(schema.routes)
          .where(
            and(
              or(eq(schema.routes.id, routeId), eq(schema.routes.code, routeId)),
              eq(schema.routes.driverEmployeeId, emp.id),
            ),
          );
        if (!route) {
          return { error: 'Ruta no encontrada entre las asignadas a este conductor.' };
        }
        const stops = await ctx.tenantClient
          .select()
          .from(schema.routeStops)
          .where(eq(schema.routeStops.routeId, route.id))
          .orderBy(asc(schema.routeStops.sequence));
        const shipmentIds = stops
          .map((s: any) => s.shipmentId)
          .filter((x: string | null): x is string => !!x);
        const shipments = shipmentIds.length
          ? await ctx.tenantClient
              .select()
              .from(schema.shipments)
              .where(inArray(schema.shipments.id, shipmentIds))
          : [];
        const shipById = new Map<string, any>(shipments.map((s: any) => [s.id, s]));
        return {
          route: pruneRoute(route),
          stops: stops.map((s: any) => {
            const ship = s.shipmentId ? shipById.get(s.shipmentId) : null;
            return {
              sequence: s.sequence,
              status: s.status,
              address: s.address || ship?.destinationAddress || null,
              arrivedAt: s.arrivedAt,
              shipment: ship
                ? {
                    trackingNumber: ship.trackingNumber,
                    status: ship.status,
                    preparationStatus: ship.preparationStatus,
                    recipientName: ship.recipientName,
                    kind: ship.kind,
                  }
                : null,
            };
          }),
        };
      },
    }),
  };
}
