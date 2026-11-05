/** Mensajes de almacén: recuentos y reposición. Ver `../../index.ts`. */
export default {
  // ── Recuento ──
  'Elige un almacén.': 'Choose a warehouse.',
  'Ese almacén no existe.': 'That warehouse does not exist.',
  'Esa zona no es de este almacén.': 'That zone does not belong to this warehouse.',
  'Esa categoría no existe.': 'That category does not exist.',
  'El recuento {0} ya está contando esto: ciérralo o cancélalo antes.':
    'Count {0} is already counting this: close or cancel it first.',
  'Recuento no encontrado': 'Count not found',
  'Línea no encontrada': 'Line not found',
  'Este recuento ya no está abierto.': 'This count is no longer open.',
  'Este recuento no está en revisión.': 'This count is not under review.',
  'Este recuento ya está terminado.': 'This count is already finished.',
  'Elige un artículo.': 'Choose an item.',
  'Ese artículo no existe.': 'That item does not exist.',
  'Ese artículo no entra en este recuento.': 'That item is not part of this count.',
  'Indica el lote o la serie.': 'Enter the batch or serial number.',
  'La serie {0} está en otro almacén: haz un traspaso.':
    'Serial {0} is in another warehouse: make a transfer.',
  'No se ha leído ningún código.': 'No code was read.',
  'La cantidad no es válida.': 'The quantity is not valid.',
  'Ese código no se reconoce.': 'That code is not recognized.',
  'Esta línea ya sabe a dónde va su diferencia.':
    'This line already knows where its difference goes.',
  '{0}: di de qué lote es la diferencia.': '{0}: say which batch the difference belongs to.',
  '{0}: el lote {1} quedaría en negativo ({2}). Vuelve a contarlo.':
    '{0}: batch {1} would go negative ({2}). Count it again.',
  '{0}: la zona {1} quedaría en negativo ({2}). Vuelve a contarlo.':
    '{0}: zone {1} would go negative ({2}). Count it again.',
  '{0}: el almacén quedaría en negativo ({1}). Vuelve a contarlo.':
    '{0}: the warehouse would go negative ({1}). Count it again.',
  'La cantidad contada no es un número.': 'The counted quantity is not a number.',
  'La cantidad contada no puede ser negativa.': 'The counted quantity cannot be negative.',
  'Una serie está o no está: cuenta 0 o 1.': 'A serial is either there or not: count 0 or 1.',
  'Las series se cuentan enteras.': 'Serials are counted in whole numbers.',
  'Lo que sobre de un artículo con lote tiene que ir en su lote: añade una línea con él.':
    'Surplus of a batch-managed item has to go in its batch: add a line with it.',
  'Di de qué lote es la diferencia.': 'Say which batch the difference belongs to.',
  'Falta el lote en una de las filas.': 'One of the rows has no batch.',
  'Cada fila tiene que ir en el mismo sentido que la diferencia.':
    'Each row has to go in the same direction as the difference.',
  'Las series van de una en una.': 'Serials go one at a time.',
  'Los lotes tienen que sumar la diferencia.': 'The batches have to add up to the difference.',

  // ── Reposición ──
  'Elige qué pedir.': 'Choose what to order.',
  'Cada línea necesita un artículo y una cantidad mayor que cero.':
    'Each line needs an item and a quantity above zero.',
  'Las compras están desactivadas en esta empresa.': 'Purchasing is turned off for this company.',
  '{0}: elige a qué proveedor pedirlo.': '{0}: choose which supplier to order it from.',
  'Ese proveedor no existe.': 'That supplier does not exist.',

  // ── Pedido en borrador ──
  'Este pedido no está en borrador.': 'This order is not a draft.',
  'Este pedido está en borrador: confírmalo o cancélalo.':
    'This order is a draft: confirm or cancel it.',
  'Este pedido está en borrador: confírmalo antes de recibirlo.':
    'This order is a draft: confirm it before receiving it.',
};
