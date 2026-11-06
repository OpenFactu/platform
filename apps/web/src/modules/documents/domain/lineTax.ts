/**
 * Impuesto de una línea nueva: el del interlocutor manda sobre el del artículo.
 * Es la misma regla que `defaultLineTaxGroupId` en el servidor. Sin ninguno de
 * los dos, la línea entra sin impuesto.
 */
export function lineTaxGroupId(
  partner: { defaultTaxGroupId?: string | null } | null | undefined,
  item: { taxGroupId?: string | null } | null | undefined,
): string {
  return partner?.defaultTaxGroupId || item?.taxGroupId || '';
}
