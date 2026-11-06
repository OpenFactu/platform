/**
 * Cálculo de impuestos por línea, sin conocer ningún país.
 *
 * Sin plugins cada línea lleva un único impuesto: el tipo explícito de la línea
 * o el de su grupo. Un plugin puede registrar un resolver que devuelva varios
 * componentes (impuestos compuestos, inversión del sujeto pasivo, retenciones,
 * reglas según destino...). El resultado se guarda en `DocumentLineTax`.
 */
import crypto from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { TenantScopedRegistry } from '../plugins/TenantScopedRegistry';

export type DocSide = 'sales' | 'purchase';

export interface TaxComponent {
  code: string;
  /** Categoría libre del impuesto ('tax' por defecto). */
  category?: string;
  label?: string;
  /** Porcentaje. Con `base`/`amount` explícitos es solo informativo. */
  rate: number;
  /** Base imponible. Por defecto, el neto de la línea. */
  base?: number;
  /** Cuota. Por defecto, `base * rate / 100`. */
  amount?: number;
  /** Se resta del total en vez de sumarse. */
  isWithholding?: boolean;
  /** Mapeo contable al que va la cuota. Por defecto, el genérico según el lado. */
  accountKind?: string;
  packId?: string;
  packVersion?: string;
}

export interface TaxResolverContext {
  tenantId: string;
  db: any;
  side: DocSide;
  docTable: string;
  date: Date | string;
  /** Interlocutor del documento, con su país. */
  partner: any;
  /** Artículo de la línea. */
  item: any;
  line: any;
  lineIndex: number;
  /** Grupo de impuesto elegido en la línea, si existe. */
  taxGroup: any | null;
  request: any;
}

/** Devuelve los componentes de la línea, o null para dejar el cálculo estándar. */
export type TaxResolver = (
  ctx: TaxResolverContext,
) => TaxComponent[] | null | undefined | Promise<TaxComponent[] | null | undefined>;

const resolvers = new TenantScopedRegistry<TaxResolver>();

export function defaultAccountKind(side: DocSide, isWithholding: boolean): string {
  if (isWithholding) return side === 'sales' ? 'withholding_receivable' : 'withholding_payable';
  return side === 'sales' ? 'tax_output' : 'tax_input';
}

export function componentAmount(c: TaxComponent, neto: number): number {
  if (c.amount != null) return Number(c.amount);
  return ((c.base != null ? Number(c.base) : neto) * Number(c.rate)) / 100;
}

/**
 * Impuesto de una línea nueva: el del interlocutor manda sobre el del artículo.
 * Lo eligen quienes crean líneas (la web, la IA, el CRM); el motor calcula con
 * lo que le llegue y no rellena nada por su cuenta.
 */
export function defaultLineTaxGroupId(
  partner: { defaultTaxGroupId?: string | null } | null | undefined,
  item: { taxGroupId?: string | null } | null | undefined,
): string | null {
  return partner?.defaultTaxGroupId || item?.taxGroupId || null;
}

export const TaxEngine = {
  registerResolver(pluginId: string, resolver: TaxResolver): void {
    resolvers.add(pluginId, resolver);
  },

  /** Solo para los tests. */
  clearResolvers(): void {
    resolvers.clear();
  },

  hasResolverFor(tenantId: string): boolean {
    return resolvers.activeFor(tenantId).length > 0;
  },

  /**
   * Componentes por línea que deciden los plugins activos. Devuelve `null` si
   * ninguno interviene, para no cargar interlocutor ni artículos cuando no
   * hacen falta. Una posición `null` del array es una línea con cálculo estándar.
   */
  async resolveDocument(
    tx: any,
    tenantId: string,
    side: DocSide,
    docTable: string,
    request: any,
  ): Promise<Array<TaxComponent[] | null> | null> {
    const active = resolvers.activeFor(tenantId);
    if (active.length === 0) return null;

    const [partner] = request.partnerId
      ? await tx
          .select()
          .from(schema.businessPartners)
          .where(eq(schema.businessPartners.id, request.partnerId))
      : [null];
    const itemIds = request.lines.map((l: any) => l.itemId).filter(Boolean);
    const items = itemIds.length
      ? await tx.select().from(schema.items).where(inArray(schema.items.id, itemIds))
      : [];
    const itemsById = new Map<string, any>(items.map((i: any) => [i.id, i]));
    const taxGroups = await tx.select().from(schema.taxGroups);
    const groupsById = new Map<string, any>(taxGroups.map((g: any) => [g.id, g]));

    const result: Array<TaxComponent[] | null> = [];
    for (let lineIndex = 0; lineIndex < request.lines.length; lineIndex++) {
      const line = request.lines[lineIndex];
      const ctx: TaxResolverContext = {
        tenantId,
        db: tx,
        side,
        docTable,
        date: request.date,
        partner: partner ?? null,
        item: itemsById.get(line.itemId) ?? null,
        line,
        lineIndex,
        taxGroup: groupsById.get(line.taxGroupId) ?? null,
        request,
      };
      let components: TaxComponent[] | null = null;
      for (const resolver of active) {
        const answer = await resolver(ctx);
        if (answer) {
          components = answer;
          break;
        }
      }
      result.push(components);
    }
    return result;
  },

  /** El componente único del cálculo estándar, para dejarlo registrado igual que los demás. */
  standardComponent(
    side: DocSide,
    rate: number,
    taxAmount: number,
    neto: number,
    group: any | null,
  ): TaxComponent {
    return {
      code: group?.code ?? `RATE_${rate}`,
      category: group?.category ?? 'tax',
      rate,
      base: neto,
      amount: taxAmount,
      accountKind: defaultAccountKind(side, false),
      packId: group?.packId ?? undefined,
    };
  },

  async saveLineTaxes(
    tx: any,
    docTable: string,
    documentId: string,
    lineId: string,
    side: DocSide,
    neto: number,
    components: TaxComponent[],
  ): Promise<void> {
    if (components.length === 0) return;
    await tx.insert(schema.documentLineTaxes).values(
      components.map((c) => {
        const isWithholding = !!c.isWithholding;
        return {
          id: crypto.randomUUID(),
          docTable,
          documentId,
          lineId,
          code: c.code,
          category: c.category ?? 'tax',
          label: c.label ?? null,
          base: String((c.base != null ? Number(c.base) : neto).toFixed(4)),
          rate: String(Number(c.rate).toFixed(4)),
          amount: String(componentAmount(c, neto).toFixed(4)),
          accountKind: c.accountKind ?? defaultAccountKind(side, isWithholding),
          isWithholding,
          packId: c.packId ?? null,
          packVersion: c.packVersion ?? null,
        };
      }),
    );
  },

  async deleteDocumentTaxes(tx: any, docTable: string, documentId: string): Promise<void> {
    await tx
      .delete(schema.documentLineTaxes)
      .where(
        and(
          eq(schema.documentLineTaxes.docTable, docTable),
          eq(schema.documentLineTaxes.documentId, documentId),
        ),
      );
  },

  async loadDocumentTaxes(db: any, docTable: string, documentId: string): Promise<any[]> {
    return db
      .select()
      .from(schema.documentLineTaxes)
      .where(
        and(
          eq(schema.documentLineTaxes.docTable, docTable),
          eq(schema.documentLineTaxes.documentId, documentId),
        ),
      );
  },
};

/** Suma las cuotas por cuenta contable, separando impuestos y retenciones. */
export function summarizeTaxesByAccount(
  rows: any[],
): Array<{ accountKind: string; isWithholding: boolean; amount: number }> {
  const byKey = new Map<string, { accountKind: string; isWithholding: boolean; amount: number }>();
  for (const r of rows) {
    const key = `${r.accountKind}|${r.isWithholding}`;
    const entry = byKey.get(key) ?? {
      accountKind: r.accountKind,
      isWithholding: !!r.isWithholding,
      amount: 0,
    };
    entry.amount += Number(r.amount);
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}
