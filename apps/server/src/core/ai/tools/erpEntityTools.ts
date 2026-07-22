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
import { hasModuleAccess, type ChatToolContext } from './util';

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

/**
 * Resuelve/genera el código de un interlocutor nuevo — mismo criterio que
 * partners.ts: prefijo del grupo + siguiente secuencia si hay groupId con
 * codePrefix, si no un código simple con genCode('CLI'). Compartido por
 * create_partner y create_partners_bulk para no duplicar la lógica.
 */
async function resolvePartnerCode(
  tenantClient: any,
  groupId: string | undefined,
  explicitCode: string | undefined,
): Promise<string> {
  if (explicitCode) return explicitCode;
  if (groupId) {
    const [group] = await tenantClient
      .select()
      .from(schema.partnerGroups)
      .where(eq(schema.partnerGroups.id, groupId));
    if (group?.codePrefix) {
      const existing = await tenantClient
        .select({ code: schema.businessPartners.code })
        .from(schema.businessPartners)
        .where(like(schema.businessPartners.code, `${group.codePrefix}-%`));
      let maxSeq = 0;
      for (const p of existing) {
        const parts = p.code.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
      return `${group.codePrefix}-${String(maxSeq + 1).padStart(5, '0')}`;
    }
  }
  // El endpoint REST exige que el código lo escriba la persona (no hay
  // fallback si no hay grupo con prefijo) — el chat no puede adivinar la
  // convención de códigos de la empresa, así que genera uno simple en vez
  // de fallar por la constraint NOT NULL/UNIQUE de la tabla.
  return genCode('CLI');
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
  const tools: Record<string, any> = {};

  if (hasModuleAccess(ctx, '/warehouses')) {
    tools.list_warehouses = tool({
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
    });
  }

  if (hasModuleAccess(ctx, '/hr/departments')) {
    tools.list_departments = tool({
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
    });
  }

  return tools;
}

// ── Acciones (con confirmación) ──

export function buildErpActionTools(ctx: ChatToolContext) {
  const tools: Record<string, any> = {};

  if (hasModuleAccess(ctx, '/partners', 'write')) {
    tools.create_partner = tool({
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

        const finalCode = await resolvePartnerCode(ctx.tenantClient, input.groupId, input.code);

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
    });
  }

  if (hasModuleAccess(ctx, '/partners', 'write')) {
    const partnerAddressSchema = z.object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional(),
      countryCode: z.string().optional(),
    });
    const partnerRowSchema = z.object({
      name: z.string().describe('Nombre o razón social'),
      code: z.string().optional().describe('Código manual — si se omite, se autogenera'),
      nif: z.string().optional(),
      countryCode: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      groupId: z.string().optional(),
      iban: z.string().optional(),
      bankName: z.string().optional(),
      bankSwift: z.string().optional(),
      address: partnerAddressSchema
        .optional()
        .describe('Dirección principal, si el usuario la ha dado (calle, ciudad, provincia, CP)'),
    });

    tools.create_partners_bulk = tool({
      description:
        'Crea VARIOS interlocutores (clientes/proveedores) de golpe — úsala cuando el usuario pegue o adjunte una lista/Excel/CSV con muchos interlocutores, en vez de llamar a create_partner fila por fila (eso pediría una confirmación por cada uno). Cada fila puede llevar su propia dirección. Mismas reglas que create_partner (código autogenerado, validación de NIF/IBAN), pero en un único paso de confirmación para todo el lote. Si una fila falla (NIF inválido, código duplicado…) las demás se crean igualmente — revisa el resultado por fila que devuelve. Máximo 300 interlocutores por llamada; si hay más, divide en varias llamadas.',
      inputSchema: z.object({
        partners: z
          .array(partnerRowSchema)
          .min(1)
          .max(300)
          .describe('Una entrada por interlocutor a crear'),
      }),
      needsApproval: true,
      execute: async (input: { partners: Array<z.infer<typeof partnerRowSchema>> }) => {
        const results: Array<{
          row: number;
          ok: boolean;
          id?: string;
          code?: string;
          name: string;
          error?: string;
        }> = [];

        // Secuencial (no Promise.all): la generación de código por prefijo de
        // grupo lee el máximo existente en BD antes de insertar — en
        // paralelo, dos filas del mismo grupo podrían calcular el mismo
        // siguiente número y chocar contra el UNIQUE de `code`.
        for (let i = 0; i < input.partners.length; i++) {
          const row = input.partners[i];
          try {
            const taxErr = await checkTaxId(row.nif, row.countryCode);
            if (taxErr) throw new Error(taxErr);

            let iban = row.iban;
            if (iban) {
              const check = validateIban(iban);
              if (!check.ok) throw new Error(`IBAN inválido: ${check.reason}`);
              iban = normalizeIban(iban);
            }

            const finalCode = await resolvePartnerCode(ctx.tenantClient, row.groupId, row.code);

            const id = crypto.randomUUID();
            const [partner] = await ctx.tenantClient
              .insert(schema.businessPartners)
              .values({
                id,
                code: finalCode,
                name: row.name,
                nif: row.nif || null,
                email: row.email || null,
                phone: row.phone || null,
                website: row.website || null,
                countryCode: row.countryCode || null,
                groupId: row.groupId || null,
                iban: iban || null,
                bankName: row.bankName || null,
                bankSwift: row.bankSwift || null,
              })
              .returning();

            if (row.address && (row.address.street || row.address.city || row.address.zipCode)) {
              await ctx.tenantClient.insert(schema.partnerAddresses).values({
                id: crypto.randomUUID(),
                partnerId: id,
                name: 'Principal',
                street: row.address.street || null,
                city: row.address.city || null,
                state: row.address.state || null,
                zipCode: row.address.zipCode || null,
                country: row.address.country || null,
                countryCode: row.address.countryCode || row.countryCode || null,
                isDefault: true,
              });
            }

            logAudit({
              tenantClient: ctx.tenantClient,
              tenantId: ctx.tenantId,
              userId: ctx.user.id,
              entityType: 'BusinessPartner',
              entityId: id,
              action: 'CREATE',
              newValue: partner,
            });

            results.push({ row: i + 1, ok: true, id, code: finalCode, name: row.name });
          } catch (e: any) {
            const detail =
              e?.cause?.detail || e?.cause?.message || e?.message || 'Error desconocido';
            results.push({ row: i + 1, ok: false, name: row.name, error: detail });
          }
        }

        const created = results.filter((r) => r.ok).length;
        return {
          ok: created > 0,
          created,
          failed: results.length - created,
          total: results.length,
          results,
        };
      },
    });
  }

  if (hasModuleAccess(ctx, '/logistics/stock-movements', 'write')) {
    tools.create_stock_transfer = tool({
      description:
        'Crea un traslado de stock ENTRE ALMACENES en BORRADOR. Resuelve los almacenes con list_warehouses y los artículos con search_items antes de llamar. No se envía ni recibe automáticamente — eso sigue siendo manual en Almacén → Traslados. Requiere confirmación.',
      inputSchema: z.object({
        fromWarehouseId: z.string(),
        toWarehouseId: z.string(),
        date: z.string().optional().describe('ISO yyyy-mm-dd — por defecto hoy'),
        notes: z.string().optional(),
        lines: z.array(z.object({ itemId: z.string(), quantity: z.number().positive() })).min(1),
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
    });

    tools.create_goods_receipt = tool({
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
        lines: z.array(z.object({ itemId: z.string(), quantity: z.number().positive() })).min(1),
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
    });
  }

  if (hasModuleAccess(ctx, '/hr/employees', 'write')) {
    tools.create_employee = tool({
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
    });
  }

  return tools;
}
