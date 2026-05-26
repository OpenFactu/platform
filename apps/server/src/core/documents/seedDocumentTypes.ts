import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';

interface DocTypeSeed {
  code: string;
  name: string;
  description?: string;
  docCategory: 'invoice' | 'credit_note' | 'debit_note' | 'ticket';
  isRectify?: boolean;
  sortOrder?: number;
}

/**
 * Tipos de documento fiscales por país. Pensados como punto de partida para
 * el usuario — pueden añadir, editar y desactivar desde la UI. Cuando haya
 * un plugin fiscal del país, éste puede añadir/reemplazar los suyos.
 */
const TYPES_BY_COUNTRY: Record<string, DocTypeSeed[]> = {
  ES: [
    { code: 'F1', name: 'Factura normal', docCategory: 'invoice', sortOrder: 10 },
    { code: 'F2', name: 'Factura simplificada', docCategory: 'ticket', sortOrder: 20 },
    {
      code: 'F3',
      name: 'Factura emitida en sustitución de facturas simplificadas',
      docCategory: 'invoice',
      sortOrder: 30,
    },
    {
      code: 'R1',
      name: 'Factura rectificativa (art. 80.1 y 80.2)',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 40,
    },
    {
      code: 'R2',
      name: 'Factura rectificativa (art. 80.3)',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 50,
    },
    {
      code: 'R3',
      name: 'Factura rectificativa (art. 80.4)',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 60,
    },
    {
      code: 'R4',
      name: 'Factura rectificativa (resto de causas)',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 70,
    },
    {
      code: 'R5',
      name: 'Factura rectificativa en facturas simplificadas',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 80,
    },
  ],
  MX: [
    { code: 'I', name: 'Ingreso', docCategory: 'invoice', sortOrder: 10 },
    {
      code: 'E',
      name: 'Egreso (nota de crédito)',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 20,
    },
    { code: 'T', name: 'Traslado', docCategory: 'invoice', sortOrder: 30 },
    { code: 'P', name: 'Pago', docCategory: 'invoice', sortOrder: 40 },
    { code: 'N', name: 'Nómina', docCategory: 'invoice', sortOrder: 50 },
  ],
  CL: [
    { code: '33', name: 'Factura electrónica', docCategory: 'invoice', sortOrder: 10 },
    { code: '34', name: 'Factura exenta electrónica', docCategory: 'invoice', sortOrder: 20 },
    { code: '39', name: 'Boleta electrónica', docCategory: 'ticket', sortOrder: 30 },
    {
      code: '61',
      name: 'Nota de crédito electrónica',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 40,
    },
    { code: '56', name: 'Nota de débito electrónica', docCategory: 'debit_note', sortOrder: 50 },
  ],
  CO: [
    { code: '01', name: 'Factura de venta', docCategory: 'invoice', sortOrder: 10 },
    { code: '02', name: 'Factura de exportación', docCategory: 'invoice', sortOrder: 20 },
    {
      code: '91',
      name: 'Nota crédito',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 30,
    },
    { code: '92', name: 'Nota débito', docCategory: 'debit_note', sortOrder: 40 },
  ],
  PE: [
    { code: '01', name: 'Factura', docCategory: 'invoice', sortOrder: 10 },
    { code: '03', name: 'Boleta de venta', docCategory: 'ticket', sortOrder: 20 },
    {
      code: '07',
      name: 'Nota de crédito',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 30,
    },
    { code: '08', name: 'Nota de débito', docCategory: 'debit_note', sortOrder: 40 },
  ],
  AR: [
    { code: 'A', name: 'Factura A', docCategory: 'invoice', sortOrder: 10 },
    { code: 'B', name: 'Factura B', docCategory: 'invoice', sortOrder: 20 },
    { code: 'C', name: 'Factura C', docCategory: 'invoice', sortOrder: 30 },
    {
      code: 'NC',
      name: 'Nota de crédito',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 40,
    },
    { code: 'ND', name: 'Nota de débito', docCategory: 'debit_note', sortOrder: 50 },
  ],
  // Genéricos (fallback cualquier país no cubierto arriba)
  DEFAULT: [
    { code: 'INV', name: 'Factura', docCategory: 'invoice', sortOrder: 10 },
    {
      code: 'CN',
      name: 'Nota de crédito',
      docCategory: 'credit_note',
      isRectify: true,
      sortOrder: 20,
    },
    { code: 'DN', name: 'Nota de débito', docCategory: 'debit_note', sortOrder: 30 },
    { code: 'TKT', name: 'Ticket', docCategory: 'ticket', sortOrder: 40 },
  ],
};

/**
 * Siembra los tipos de documento del país indicado. Es idempotente —
 * comprueba que no exista ya cada `(code, pluginId=null)` antes de insertar.
 */
export async function seedDocumentTypesForCountry(db: any, countryCode: string): Promise<number> {
  const types = TYPES_BY_COUNTRY[countryCode] || TYPES_BY_COUNTRY.DEFAULT;
  let inserted = 0;
  for (const t of types) {
    try {
      const existing = await db
        .select({ id: schema.documentTypes.id })
        .from(schema.documentTypes)
        .where(
          and(
            eq(schema.documentTypes.code, t.code),
            // pluginId es NULL para los que inserta el core
          ),
        );
      if (existing.length > 0) continue;
      await db.insert(schema.documentTypes).values({
        id: crypto.randomUUID(),
        code: t.code,
        name: t.name,
        description: t.description || null,
        pluginId: null,
        docCategory: t.docCategory,
        isRectify: !!t.isRectify,
        isActive: true,
        sortOrder: t.sortOrder || 0,
      });
      inserted++;
    } catch (err: any) {
      console.warn(`[seedDocumentTypes] Error con ${t.code}: ${err.message}`);
    }
  }
  return inserted;
}
