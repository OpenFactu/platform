/** Mensajes de logística (envíos, rutas, preparación, seguimiento) y transportistas. Ver `../../index.ts`. */
export default {
  // ── api/logistics.ts ─────────────────────────────────────────────────
  'No encontrado': 'Not found',
  'no encontrado': 'not found',
  'Revisa los logs del server y el cockpit de MailQueue.':
    'Check the server logs and the MailQueue cockpit.',
  'Envío no encontrado': 'Shipment not found',
  'Envío ya entregado — usa devolución': 'Shipment already delivered — use a return',
  'Se creó un GoodsReceipt draft. Revísalo y posteálo para que suba stock.':
    'A draft goods receipt was created. Review and post it to increase stock.',
  'Sin almacén origen detectado — crea la entrada de devolución a mano.':
    'No source warehouse detected — create the return receipt manually.',
  'Este envío ya es una recogida': 'This shipment is already a pickup',
  'Ya existe una recogida en curso para este albarán ({0}).':
    'A pickup is already in progress for this delivery note ({0}).',
  'Indica el almacén de retorno (warehouseId) — no se pudo inferir.':
    'Specify the return warehouse (warehouseId) — it could not be inferred.',
  'Añade la recogida a una ruta desde el planificador — el conductor verá "Recoger de" en su app.':
    'Add the pickup to a route from the planner — the driver will see "Pick up from" in their app.',
  'La matrícula es obligatoria.': 'License plate is required.',
  'Ruta no encontrada': 'Route not found',
  'No puedes operar esta ruta': 'You cannot operate this route',
  'La ruta ya está completada': 'The route is already completed',
  'El nombre es obligatorio.': 'Name is required.',
  'itemId es obligatorio.': 'itemId is required.',
  'Acopio no encontrado': 'Staging area not found',
  'Falta el scope {0}': 'Missing scope {0}',
  'Albarán no encontrado.': 'Delivery note not found.',
  'Tarea no encontrada.': 'Task not found.',
  'Stock insuficiente en el lote {0}. Disponible: {1}, necesario: {2}.':
    'Insufficient stock in batch {0}. Available: {1}, required: {2}.',
  'No se pudo sustituir el lote.': 'Could not replace the batch.',
  'Shipment no encontrado.': 'Shipment not found.',
  'El envío no tiene albarán origen.': 'The shipment has no source delivery note.',
  'El envío no tiene paquetes ni tareas completadas para materializar.':
    'The shipment has no packages or completed tasks to materialize.',
  'Este envío está en estado "{0}" y no se puede volver a despachar. Crea un envío nuevo desde el albarán para reintentar.':
    'This shipment is in status "{0}" and cannot be dispatched again. Create a new shipment from the delivery note to retry.',
  'token desconocido': 'unknown token',
  'El chat no está disponible para este envío': 'Chat is not available for this shipment',
  'El asistente de IA no está activado para esta empresa':
    'The AI assistant is not enabled for this company',
  'Demasiados mensajes — inténtalo de nuevo en unos minutos':
    'Too many messages — try again in a few minutes',
  'messages es obligatorio': 'messages is required',
  'Conversación demasiado larga': 'Conversation too long',
  'Mensaje demasiado largo': 'Message too long',
  'Error del asistente': 'Assistant error',
  'Error en el chat de seguimiento': 'Tracking chat error',
  'lat/lng requeridos': 'lat/lng are required',
  'tenant no encontrado': 'tenant not found',
  // deliveryNoteHint (campo no traducido por el middleware; listo por si se añade)
  'El albarán origen ya no existe.': 'The source delivery note no longer exists.',
  'El albarán ya estaba cancelado.': 'The delivery note was already cancelled.',
  'El albarán ya está facturado — no se anula. Emite una factura rectificativa para revertir la operación.':
    'The delivery note is already invoiced — it will not be cancelled. Issue a corrective invoice to reverse the operation.',
  'No se pudo anular el albarán: {0}': 'Could not cancel the delivery note: {0}',

  // ── core/logistics ──
  'Este envío está en marcha. Cancélalo antes.': 'This shipment is under way. Cancel it first.',
  'La ruta está en marcha. Finalízala antes.': 'The route is under way. Finish it first.',
  'Esta parada ya se ha visitado y no se puede quitar.':
    'This stop has already been visited and cannot be removed.',
  'Esta parada ya está cerrada.': 'This stop is already closed.',
  'Parada no encontrada en esta ruta': 'Stop not found on this route',
  'Paquete no encontrado': 'Package not found',
  'Este envío aún no tiene paquetes.': 'This shipment has no packages yet.',
  'Esa ruta ya ha terminado: elige otra.': 'That route has finished: choose another.',
  'Este envío ya ha salido. Aplázalo antes de pasarlo a otra ruta.':
    'This shipment has already left. Postpone it before moving it to another route.',
  'Este envío ya está cerrado.': 'This shipment is already closed.',
  'Este envío no tiene ninguna incidencia abierta.': 'This shipment has no open incident.',
  'El envío no está en esa etapa.': 'The shipment is not at that stage.',
  'El estado de un envío no se edita: usa la acción que corresponda (despachar, entregar, aplazar…).':
    'A shipment status is not edited: use the matching action (dispatch, deliver, postpone…).',
  'El estado de una parada no se edita: usa su acción.':
    'A stop status is not edited: use its action.',
  'Un envío en estado "{0}" no puede pasar a "{1}".':
    'A shipment in status "{0}" cannot change to "{1}".',
  'Indica qué ha pasado.': 'Say what happened.',
  'La franja horaria tiene que ser HH:mm.': 'The time window has to be HH:mm.',
  'Un cambio de estado no se apunta a mano.': 'A status change is not recorded by hand.',
  'Esta falta ya corrigió el albarán y no se puede cambiar.':
    'This shortage has already corrected the delivery note and cannot be changed.',
  'Indica el almacén de retorno: no se pudo deducir del albarán.':
    'Specify the return warehouse: it could not be worked out from the delivery note.',
  'El vehículo {0} no está disponible.': 'Vehicle {0} is not available.',
  'Bulto {n} de {total}': 'Package {n} of {total}',
  Destinatario: 'Recipient',
  Envío: 'Shipment',
  Bultos: 'Packages',
  Dirección: 'Address',
  'Packing list': 'Packing list',
  'Hoja de ruta': 'Route sheet',
  Código: 'Code',
  Artículo: 'Item',
  Cantidad: 'Quantity',
  Fecha: 'Date',
  Paradas: 'Stops',
  Conductor: 'Driver',
  Vehículo: 'Vehicle',
  Tipo: 'Type',
  Recogida: 'Pickup',
  Entrega: 'Delivery',
  'Firma y observaciones': 'Signature and remarks',

  // ── api/carriers.ts / core/carriers ──────────────────────────────────
  'Nombre obligatorio': 'Name is required',
  'Cuenta no encontrada': 'Account not found',
  'Carrier no encontrado': 'Carrier not found',
  'Este carrier es manual — no hay adapter para probar.':
    'This carrier is manual — there is no adapter to test.',
  'Este transportista no permite probar la conexión desde aquí.':
    'This carrier does not allow testing the connection from here.',
  'Tu empresa no permite dejar los pedidos así.': 'Your company does not allow leaving orders this way.',
  'Falta la foto de la entrega.': 'The delivery photo is missing.',
  'Falta la firma o el documento de quien lo recibe.':
    'The signature or ID of the recipient is missing.',
  'Falta la firma de quien lo recibe.': 'The signature of the recipient is missing.',
  'Bultos por cargar: {0}.': 'Packages left to load: {0}.',
  'Este bulto no va en esta ruta.': 'This package is not on this route.',
  'Tu empresa no permite dejar bultos en un acopio.':
    'Your company does not allow leaving packages at a staging area.',
  'Elige qué bultos dejas.': 'Choose which packages you are leaving.',
  'Ese envío no va en esta ruta.': 'That shipment is not on this route.',
  'Un envío ya entregado no se puede dejar en un acopio.':
    'A delivered shipment cannot be left at a staging area.',
  'Cuéntanos qué ha pasado.': 'Tell us what happened.',
  'Reporte no encontrado': 'Report not found',
  'Nuevo reporte de la aplicación': 'New report about the application',
  'Elige una cuenta de transportista.': 'Choose a carrier account.',
  'Este transportista no está integrado: escribe su número.':
    'This carrier is not integrated: enter its tracking number.',
  'El transportista ha dado un error: {0}': 'The carrier returned an error: {0}',
  'Este envío no tiene etiqueta del transportista.': 'This shipment has no carrier label.',
  'Este envío no va con un transportista.': 'This shipment is not going with a carrier.',
} as Record<string, string>;
