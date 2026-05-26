import { useCallback } from 'react';
import { useToast } from '@openfactu/ui';

/**
 * Portapapeles estructurado para clonar documentos entre vistas (detalle → lista)
 * o entre sesiones/navegadores. El payload se serializa con una firma mágica
 * para evitar que al pegar algo genérico (un CSV, texto) explote el parser.
 *
 * Uso básico:
 *
 *   const clone = useDocumentClone('SINV');
 *
 *   // En el detalle:
 *   <button onClick={() => clone.copy(invoice)}>Copiar</button>
 *
 *   // En el listado:
 *   <button onClick={async () => {
 *     const data = await clone.read();
 *     if (data) {
 *       const res = await fetch(endpoint, { method: 'POST', body: JSON.stringify(data) });
 *       ...
 *     }
 *   }}>Pegar</button>
 */

export type CloneDocType = 'SINV' | 'PINV' | 'SO' | 'PO' | 'SDN' | 'PDN';

const MAGIC = 'keirost:clone:v1';

/** Campos de cabecera que NO se copian (los pone el backend o son de sistema). */
const SKIP_HEADER = new Set([
  'id',
  'docNum',
  'seriesPrefix',
  'periodCode',
  'status',
  'isLocked',
  'lockedAt',
  'paymentStatus',
  'paymentDueLines',
  'amountPaid',
  'dueDate',
  'createdAt',
  'updatedAt',
  'postedAt',
  'postedBy',
  'fiscalHash',
  'fiscalHashPrev',
  'fiscalStatus',
  'fiscalSentAt',
  'fiscalRef',
  'journalEntryId',
  // Evitar re-vincular al documento padre — un duplicado debe ser independiente.
  'orderId',
  'deliveryNoteId',
  'invoiceId',
  // Campos derivados/calculados que salen del join en el detalle, no columnas.
  'taxBreakdown',
  'subtotal',
  'taxTotal',
  'total',
  'orderDocNum',
  'orderPrefix',
  'deliveryDocNum',
  'deliveryPrefix',
  'invoiceDocNum',
  'invoicePrefix',
  'withholdingAmount',
]);

/** Campos de línea que NO se copian. */
const SKIP_LINE = new Set([
  'id',
  'invoiceId',
  'orderId',
  'deliveryNoteId',
  'deliveryId', // FK real en SalesDeliveryNoteLine / PurchaseDeliveryNoteLine
  'lineNum',
  'lineNumber',
  'lineTotal',
  'receivedQty',
  'baseLine', // número de línea del doc origen
  'baseId', // ref a línea padre
  'taxAmount', // calculado a partir de base × taxRate
  'discountAmount', // calculado si hay discountRate
  'withholdingAmount',
]);

function stripHeader(doc: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(doc || {})) {
    if (SKIP_HEADER.has(k)) continue;
    if (k === 'lines') continue;
    out[k] = v;
  }
  return out;
}

function stripLines(lines: any[]): any[] {
  return (lines || []).map((l) => {
    const out: any = {};
    for (const [k, v] of Object.entries(l || {})) {
      if (SKIP_LINE.has(k)) continue;
      out[k] = v;
    }
    // Normaliza campos numéricos (la BD devuelve decimal como string).
    const toNumOrUndef = (v: any) =>
      v === null || v === undefined || v === '' ? undefined : Number(v);
    if (out.quantity !== undefined) out.quantity = toNumOrUndef(out.quantity) ?? 0;
    if (out.price !== undefined) out.price = toNumOrUndef(out.price) ?? 0;
    if (out.uomFactor !== undefined) out.uomFactor = toNumOrUndef(out.uomFactor) ?? 1;
    if (out.discountRate !== undefined) out.discountRate = toNumOrUndef(out.discountRate);
    if (out.discountAmount !== undefined) out.discountAmount = toNumOrUndef(out.discountAmount);
    if (out.taxRate !== undefined) out.taxRate = toNumOrUndef(out.taxRate);
    if (out.withholdingRate !== undefined) out.withholdingRate = toNumOrUndef(out.withholdingRate);
    return out;
  });
}

export function useDocumentClone(docType: CloneDocType) {
  const toast = useToast();

  const copy = useCallback(
    async (doc: any) => {
      if (!doc) return;
      const payload = {
        magic: MAGIC,
        docType,
        copiedAt: new Date().toISOString(),
        header: stripHeader(doc),
        lines: stripLines(doc.lines || []),
      };
      try {
        await navigator.clipboard.writeText(JSON.stringify(payload));
        toast.success(
          `Documento copiado (${payload.lines.length} línea${payload.lines.length === 1 ? '' : 's'}) — ve al listado y pega`,
        );
      } catch {
        toast.error('El navegador no permitió acceder al portapapeles');
      }
    },
    [docType, toast],
  );

  const read = useCallback(async (): Promise<{ header: any; lines: any[] } | null> => {
    try {
      const raw = await navigator.clipboard.readText();
      if (!raw) {
        toast.error('Portapapeles vacío');
        return null;
      }
      const parsed = JSON.parse(raw);
      if (parsed?.magic !== MAGIC) {
        toast.error('El portapapeles no contiene un documento copiado desde Keirost');
        return null;
      }
      if (parsed.docType !== docType) {
        toast.error(
          `El documento copiado es de tipo ${parsed.docType} — esta vista espera ${docType}`,
        );
        return null;
      }
      return { header: parsed.header, lines: parsed.lines };
    } catch {
      toast.error('No se pudo leer del portapapeles (permisos del navegador o formato inválido)');
      return null;
    }
  }, [docType, toast]);

  return { copy, read };
}
