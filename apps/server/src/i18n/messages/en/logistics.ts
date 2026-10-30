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

  // ── api/carriers.ts / core/carriers ──────────────────────────────────
  'Nombre obligatorio': 'Name is required',
  'Cuenta no encontrada': 'Account not found',
  'Carrier no encontrado': 'Carrier not found',
  'Este carrier es manual — no hay adapter para probar.':
    'This carrier is manual — there is no adapter to test.',
} as Record<string, string>;
