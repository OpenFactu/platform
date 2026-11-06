import { useDocument as useBaseDocument } from '@openfactu/common';
import { lineTaxGroupId } from '../domain/lineTax';
import { coversDate, isOpenPeriod, openPeriodFor, seriesForPeriod } from '../domain/periods';

/**
 * `useDocument` de `@openfactu/common` con el impuesto por defecto del
 * interlocutor, que manda sobre el del artículo:
 *
 *  - Al elegir un artículo, la línea lleva el del interlocutor si tiene.
 *  - `selectPartner`, lo que hace el usuario al elegir interlocutor, pasa las
 *    líneas a lo que les toque con él, igual que el paquete rehace los demás
 *    datos fiscales al cambiarlo.
 *
 * `setPartnerId` sigue sin tocar las líneas: lo usa la carga de un documento
 * guardado o de su origen, cuyos impuestos no hay que cambiar.
 *
 * `selectDate` es elegir la fecha: si cae en otro periodo abierto, el documento pasa a
 * ese periodo y a su serie. `setDate` solo la escribe, para cargar uno ya guardado.
 */
export function useDocument(args: Parameters<typeof useBaseDocument>[0]) {
  const doc = useBaseDocument(args);
  const { state, setState, masters, actions } = doc;

  const partnerById = (id: string) => masters.partners.find((p) => p.id === id);

  const updateLine: typeof actions.updateLine = (index, field, value) => {
    actions.updateLine(index, field, value);
    if (field !== 'itemId' || !value) return;
    const taxGroupId = partnerById(state.partnerId)?.defaultTaxGroupId;
    if (!taxGroupId) return;
    // Corre después del `setLines` del paquete, que deja el impuesto del artículo.
    setState.setLines((lines) =>
      lines.map((line, i) => (i === index ? { ...line, taxGroupId } : line)),
    );
  };

  const selectPartner = (id: string) => {
    setState.setPartnerId(id);
    const partner = partnerById(id);
    setState.setLines((lines) =>
      lines.map((line) => {
        // Lo que viene de otro documento conserva su impuesto: esa línea está bloqueada.
        if (line.baseId) return line;
        const item = masters.items.find((i) => i.id === line.itemId);
        return item ? { ...line, taxGroupId: lineTaxGroupId(partner, item) } : line;
      }),
    );
  };

  const selectDate = (value: string) => {
    setState.setDate(value);
    if (!value) return;
    const current = masters.periods.find((p: any) => p.id === state.periodId);
    if (isOpenPeriod(current) && coversDate(current, value)) return;
    const next = openPeriodFor(masters.periods as any[], value);
    if (!next) return;
    setState.setPeriodId(next.id);
    setState.setSeriesId(
      seriesForPeriod(masters.series as any[], next.id, state.seriesId)?.id ?? '',
    );
  };

  return { ...doc, actions: { ...actions, updateLine, selectPartner, selectDate } };
}
