/**
 * Tools ERP adicionales del chat de IA: interlocutores, traslados de stock,
 * entrada de mercancía y empleados.
 *
 * Ninguna de estas 4 entidades es uno de los 6 DocType que gestiona
 * DocumentRegistry/DocumentEngine (SINV|PINV|SO|PO|SDN|PDN) — `partners.ts`,
 * `stockMovements.ts` y `hr/employees.ts` son rutas REST propias, sin
 * DocumentEngine/FactuApi de por medio (verificado: stockMovements.ts no
 * importa ninguno de los dos en ningún punto). Por eso estas acciones
 * REPLICAN la validación/defaults de su endpoint REST equivalente con
 * Drizzle directo sobre `ctx.tenantClient`, en vez de pasar por FactuApi —
 * a diferencia de `create_document` (actionTools.ts), que sí cubre los 6
 * tipos de documento y por eso usa `FactuApi.transaction`. Si en el futuro
 * se añade una entidad que SÍ sea uno de esos 6 tipos, debe ir por
 * `create_document`/FactuApi, no por aquí.
 */

import { tool } from 'ai';
import { z } from 'zod';
import crypto from 'crypto';
import { eq, like, desc } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { validateTaxId } from '@openfactu/common';
import { validateIban, normalizeIban } from '../../../utils/ibanValidation';
import { logAudit } from '../../../utils/audit';
import { ClientFactory } from '../../tenant/ClientFactory';
import type { ChatToolContext } from './util';

function genCode(prefix: string) {
  return `${prefix}-${Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, '0')}`;
}

/** Mismo criterio que partners.ts: si falta país o el país no tiene regex
 * seed, no valida (permisivo). */
async function checkTaxId(
  nif: string | null | undefined,
  countryCode: string | null | undefined,
): Promise<string | null> {
  if (!nif || !countryCode) return null;
  try {
    const publicDb = ClientFactory.getClient('public');
    const [country] = await publicDb
      .select()
      .from(schema.countries)
      .where(eq(schema.countries.code, countryCode.toUpperCase()));
    if (!country) return null;
    if (!validateTaxId(nif, country as any)) {
      return `El ${country.taxIdLabel || 'NIF'} no cumple el formato de ${country.name}. Ejemplo: ${country.taxIdExample}`;
    }
  } catch {
    /* ignorar errores de lookup */
  }
  return null;
}

/** Mismo algoritmo que hr/employees.ts (nextEmployeeCode). */
async function nextEmployeeCode(tenantClient: any): Promise<string> {
  const rows = await tenantClient
    .select({ code: schema.employees.code })
    .from(schema.employees)
    .where(like(schema.employees.code, 'EMP-%'))
    .orderBy(desc(schema.employees.code))
    .limit(1);
  let max = 0;
  const last = rows[0]?.code as string | undefined;
  if (last) {
    const n = parseInt(last.split('-')[1] || '0', 10);
    if (!Number.isNaN(n)) max = n;
  }
  return `EMP-${String(max + 1).padStart(5, '0')}`;
}

// ── Lectura (sin confirmación) ──

export function buildErpReadTools(ctx: ChatToolContext) {
  return {
    list_warehouses: tool({
      description:
        'Lista los almacenes del tenant — resuelve fromWarehouseId/toWarehouseId (create_stock_transfer) o warehouseId (create_goods_receipt) antes de llamar a esas acciones.',
      inputSchema: z.object({}),
      execute: async () =>
        ctx.tenantClient
          .select({
            id: schema.warehouses.id,
            name: schema.warehouses.name,
            location: schema.warehouses.location,
          })
          .from(schema.warehouses),
    }),

    list_departments: tool({
      description:
        'Lista los departamentos de RRHH del tenant — opcional para resolver departmentId en create_employee.',
      inputSchema: z.object({}),
      execute: async () =>
        ctx.tenantClient
          .select({
            id: schema.departments.id,
            code: schema.departments.code,
            name: schema.departments.name,
          })
          .from(schema.departments),
    }),
  };
}

// ── Acciones (con confirmación) ──

export function buildErpActionTools(ctx: ChatToolContext) {
  return {
    create_partner: tool({
      description:
        'Crea un interlocutor (cliente/proveedor) nuevo. El código se autogenera si no lo indicas (con el prefijo del grupo si das groupId, o un código genérico si no). Valida el NIF según el país si das ambos. Requiere confirmación.',
      inputSchema: z.object({
        name: z.string().describe('Nombre o razón social'),
        nif: z.string().optional(),
        countryCode: z
          .string()
          .optional()
          .describe('Código ISO de país (p.ej. "ES") — necesario para validar el NIF'),
        email: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
        groupId: z
          .string()
          .optional()
          .describe('Id de grupo de interlocutores, si el usuario lo indica'),
        code: z.string().optional().describe('Código manual — si se omite, se autogenera'),
        iban: z.string().optional(),
        bankName: z.string().optional(),
        bankSwift: z.string().optional(),
      }),
      needsApproval: true,
      execute: async (input: {
        name: string;
        nif?: string;
        countryCode?: string;
        email?: string;
        phone?: string;
        website?: string;
        groupId?: string;
        code?: string;
        iban?: string;
        bankName?: string;
        bankSwift?: string;
      }) => {
        const taxErr = await checkTaxId(input.nif, input.countryCode);
        if (taxErr) return { ok: false, error: taxErr };

        let iban = input.iban;
        if (iban) {
          const check = validateIban(iban);
          if (!check.ok) return { ok: false, error: `IBAN inválido: ${check.reason}` };
          iban = normalizeIban(iban);
        }

        let finalCode = input.code;
        if (input.groupId) {
          const [group] = await ctx.tenantClient
            .select()
            .from(schema.partnerGroups)
            .where(eq(schema.partnerGroups.id, input.groupId));
          if (group?.codePrefix) {
            const existing = await ctx.tenantClient
              .select({ code: schema.businessPartners.code })
              .from(schema.businessPartners)
              .where(like(schema.businessPartners.code, `${group.codePrefix}-%`));
            let maxSeq = 0;
            for (const p of existing) {
              const parts = p.code.split('-');
              const num = parseInt(parts[parts.length - 1], 10);
              if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
            finalCode = `${group.codePrefix}-${String(maxSeq + 1).padStart(5, '0')}`;
          }
        }
        // El endpoint REST exige que el código lo escriba la persona (no hay
        // fallback si no hay grupo con prefijo) — el chat no puede adivinar
        // la convención de códigos de la empresa, así que genera uno simple
        // en vez de fallar por la constraint NOT NULL/UNIQUE de la tabla.
        if (!finalCode) finalCode = genCode('CLI');

        const id = crypto.randomUUID();
        const [partner] = await ctx.tenantClient
          .insert(schema.businessPartners)
          .values({
            id,
            code: finalCode,
            name: input.name,
            nif: input.nif || null,
            email: input.email || null,
            phone: input.phone || null,
            website: input.website || null,
            countryCode: input.countryCode || null,
            groupId: input.groupId || null,
            iban: iban || null,
            bankName: input.bankName || null,
            bankSwift: input.bankSwift || null,
          })
          .returning();

        logAudit({
          tenantClient: ctx.tenantClient,
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          entityType: 'BusinessPartner',
          entityId: id,
          action: 'CREATE',
          newValue: partner,
        });

        return { ok: true, id, code: finalCode, name: input.name };
      },
    }),

    create_stock_transfer: tool({
      description:
        'Crea un traslado de stock ENTRE ALMACENES en BORRADOR. Resuelve los almacenes con list_warehouses y los artículos con search_items antes de llamar. No se envía ni recibe automáticamente — eso sigue siendo manual en Almacén → Traslados. Requiere confirmación.',
      inputSchema: z.object({
        fromWarehouseId: z.string(),
        toWarehouseId: z.string(),
        date: z.string().optional().describe('ISO yyyy-mm-dd — por defecto hoy'),
        notes: z.string().optional(),
        lines: z
          .array(z.object({ itemId: z.string(), quantity: z.number().positive() }))
          .min(1),
      }),
      needsApproval: true,
      execute: async (input: {
        fromWarehouseId: string;
        toWarehouseId: string;
        date?: string;
        notes?: string;
        lines: Array<{ itemId: string; quantity: number }>;
      }) => {
        if (input.fromWarehouseId === input.toWarehouseId) {
          return { ok: false, error: 'Origen y destino no pueden ser el mismo almacén' };
        }
        const [from] = await ctx.tenantClient
          .select({ id: schema.warehouses.id })
          .from(schema.warehouses)
          .where(eq(schema.warehouses.id, input.fromWarehouseId));
        const [to] = await ctx.tenantClient
          .select({ id: schema.warehouses.id })
          .from(schema.warehouses)
          .where(eq(schema.warehouses.id, input.toWarehouseId));
        if (!from || !to) return { ok: false, error: 'Alguno de los almacenes no existe' };

        for (const l of input.lines) {
          const [item] = await ctx.tenantClient
            .select({ id: schema.items.id })
            .from(schema.items)
            .where(eq(schema.items.id, l.itemId));
          if (!item) return { ok: false, error: `Artículo no encontrado: ${l.itemId}` };
        }

        const id = crypto.randomUUID();
        const code = genCode('TR');
        await ctx.tenantClient.insert(schema.transferNotes).values({
          id,
          code,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          date: input.date ? new Date(input.date) : new Date(),
          status: 'draft',
          notes: input.notes || null,
          createdByUserId: ctx.user.id,
        });
        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i];
          await ctx.tenantClient.insert(schema.transferNoteLines).values({
            id: crypto.randomUUID(),
            transferId: id,
            lineNum: i + 1,
            itemId: l.itemId,
            quantity: l.quantity,
          });
        }

        logAudit({
          tenantClient: ctx.tenantClient,
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          entityType: 'TransferNote',
          entityId: id,
          action: 'CREATE',
          newValue: { code },
        });

        return {
          ok: true,
          id,
          code,
          note: 'Traslado guardado en BORRADOR — envíalo y recíbelo desde Almacén → Traslados.',
        };
      },
    }),

    create_goods_receipt: tool({
      description:
        'Registra una entrada de mercancía MANUAL en un almacén (hallazgo, devolución o ajuste) — DISTINTA de un albarán de compra, que se crea con create_document(docType: "PDN"). Se guarda en BORRADOR: el "posteo" que aplica el efecto real de stock sigue siendo manual en Almacén → Entradas. Resuelve el almacén con list_warehouses y los artículos con search_items. Requiere confirmación.',
      inputSchema: z.object({
        warehouseId: z.string(),
        type: z
          .enum(['internal', 'return', 'adjustment'])
          .optional()
          .describe('Motivo de la entrada — por defecto "internal"'),
        date: z.string().optional().describe('ISO yyyy-mm-dd — por defecto hoy'),
        notes: z.string().optional(),
        lines: z
          .array(z.object({ itemId: z.string(), quantity: z.number().positive() }))
          .min(1),
      }),
      needsApproval: true,
      execute: async (input: {
        warehouseId: string;
        type?: 'internal' | 'return' | 'adjustment';
        date?: string;
        notes?: string;
        lines: Array<{ itemId: string; quantity: number }>;
      }) => {
        const [wh] = await ctx.tenantClient
          .select({ id: schema.warehouses.id })
          .from(schema.warehouses)
          .where(eq(schema.warehouses.id, input.warehouseId));
        if (!wh) return { ok: false, error: 'Almacén no encontrado' };

        for (const l of input.lines) {
          const [item] = await ctx.tenantClient
            .select({ id: schema.items.id })
            .from(schema.items)
            .where(eq(schema.items.id, l.itemId));
          if (!item) return { ok: false, error: `Artículo no encontrado: ${l.itemId}` };
        }

        const id = crypto.randomUUID();
        const code = genCode('ENT');
        await ctx.tenantClient.insert(schema.goodsReceipts).values({
          id,
          code,
          warehouseId: input.warehouseId,
          date: input.date ? new Date(input.date) : new Date(),
          type: input.type || 'internal',
          status: 'draft',
          notes: input.notes || null,
          createdByUserId: ctx.user.id,
        });
        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i];
          await ctx.tenantClient.insert(schema.goodsReceiptLines).values({
            id: crypto.randomUUID(),
            receiptId: id,
            lineNum: i + 1,
            itemId: l.itemId,
            quantity: l.quantity,
          });
        }

        logAudit({
          tenantClient: ctx.tenantClient,
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          entityType: 'GoodsReceipt',
          entityId: id,
          action: 'CREATE',
          newValue: { code },
        });

        return {
          ok: true,
          id,
          code,
          note: 'Entrada guardada en BORRADOR — confírmala desde Almacén → Entradas para aplicar el stock.',
        };
      },
    }),

    create_employee: tool({
      description:
        'Da de alta un empleado nuevo. El código se autogenera (EMP-NNNNN) si no lo indicas. Requiere confirmación.',
      inputSchema: z.object({
        firstName: z.string(),
        lastName: z.string(),
        code: z.string().optional().describe('Código manual — si se omite, se autogenera'),
        dni: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        birthDate: z.string().optional().describe('ISO yyyy-mm-dd'),
        hireDate: z.string().optional().describe('ISO yyyy-mm-dd'),
        iban: z.string().optional(),
        departmentId: z
          .string()
          .optional()
          .describe('Id de departamento, resuelto con list_departments si el usuario lo menciona'),
      }),
      needsApproval: true,
      execute: async (input: {
        firstName: string;
        lastName: string;
        code?: string;
        dni?: string;
        email?: string;
        phone?: string;
        birthDate?: string;
        hireDate?: string;
        iban?: string;
        departmentId?: string;
      }) => {
        let iban = input.iban;
        if (iban) {
          const check = validateIban(iban);
          if (!check.ok) return { ok: false, error: `IBAN inválido: ${check.reason}` };
          iban = normalizeIban(iban);
        }

        const code = input.code || (await nextEmployeeCode(ctx.tenantClient));
        const id = crypto.randomUUID();
        const [row] = await ctx.tenantClient
          .insert(schema.employees)
          .values({
            id,
            code,
            firstName: input.firstName,
            lastName: input.lastName,
            dni: input.dni || null,
            email: input.email || null,
            phone: input.phone || null,
            birthDate: input.birthDate || null,
            hireDate: input.hireDate || null,
            iban: iban || null,
            departmentId: input.departmentId || null,
            status: 'active',
          })
          .returning();

        logAudit({
          tenantClient: ctx.tenantClient,
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          entityType: 'Employee',
          entityId: id,
          action: 'CREATE',
          newValue: row,
        });

        return { ok: true, id, code, name: `${input.firstName} ${input.lastName}` };
      },
    }),
  };
}
