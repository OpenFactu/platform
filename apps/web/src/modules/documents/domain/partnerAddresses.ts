/**
 * Direcciones por defecto de un interlocutor, como texto para los campos de
 * facturación y envío de los pedidos: la marcada como predeterminada de cada
 * tipo ('B' facturación, 'S' envío) o, si no hay, la primera de ese tipo.
 */
export function defaultAddresses(partner: any): { bill: string; ship: string } | null {
  if (!partner?.addresses) return null;
  const pick = (type: string) =>
    partner.addresses.find((a: any) => a.type === type && a.isDefault) ||
    partner.addresses.find((a: any) => a.type === type) ||
    null;
  const format = (a: any) =>
    a
      ? `${a.street || ''}\n${a.zipCode || ''} ${a.city || ''}\n${a.state ? a.state + '\n' : ''}${a.country || ''}`.trim()
      : '';
  return { bill: format(pick('B')), ship: format(pick('S')) };
}
