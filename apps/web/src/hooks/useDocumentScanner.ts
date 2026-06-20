import React from 'react';
import { useToast } from '@openfactu/ui';
import { useBarcodeScanner } from './useBarcodeScanner';

/**
 * Conecta un escáner (HID o cámara) al editor de líneas de un documento
 * gestionado por `useDocument` de `@openfactu/common`.
 *
 * Al leer un código:
 *  1. Busca un artículo que coincida con `barcode` o `code`.
 *  2. Si existe, añade una línea nueva rellenando itemId / precio / tax / UoM
 *     a partir de los maestros (el efecto real que hace el editor cuando el
 *     usuario elige el ítem en el dropdown).
 *  3. Si no existe, muestra un toast de error con el código no reconocido.
 *
 * @param doc  El objeto devuelto por `useDocument(...)`
 * @param enabled  Se ignora si el editor no está en modo creación/edición
 */
export function useDocumentScanner(doc: any, enabled = true): void {
  const toast = useToast();

  const handler = React.useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;

      const items = doc?.masters?.items || [];
      // Busca por barcode primero (exact), luego por código interno
      const item =
        items.find((i: any) => (i.barcode || '') === trimmed) ||
        items.find((i: any) => (i.code || '') === trimmed);

      if (!item) {
        toast.error(`Artículo no encontrado: ${trimmed}`);
        return;
      }

      const currentLines = doc?.state?.lines || [];
      const prices = doc?.state?.mappedPrices || {};

      // Si ya hay una línea con este artículo, incrementa su cantidad en 1.
      // El código de barras del artículo no transporta info de almacén ni de
      // lote, por eso nos quedamos con el primer match por itemId — si el
      // usuario quiere separar por almacén/lote/serie, lo hace manualmente.
      const existingIdx = currentLines.findIndex((l: any) => l.itemId === item.id);

      if (existingIdx >= 0) {
        const updated = [...currentLines];
        const prev = updated[existingIdx];
        const nextQty = Number(prev.quantity || 0) + 1;
        updated[existingIdx] = { ...prev, quantity: nextQty };
        doc.setState.setLines(updated);
        toast.success(`${item.name} · ×${nextQty}`);
        return;
      }

      const newLine = {
        itemId: item.id,
        quantity: 1,
        price: Number(prices[item.id] ?? item.basePrice) || 0,
        taxGroupId: item.taxGroupId || '',
        uomId: item.uomId || '',
        uomFactor: 1,
        warehouseId: doc?.state?.warehouseId || '',
        lineNum: currentLines.length + 1,
      };
      doc.setState.setLines([...currentLines, newLine]);
      toast.success(`+ ${item.name}`);
    },
    [doc, toast],
  );

  useBarcodeScanner(handler, { enabled });
}
