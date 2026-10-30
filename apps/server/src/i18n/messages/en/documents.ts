/**
 * Mensajes de documentos (ventas/compras), FactuAPI, cobros/pagos, series,
 * plantillas de documento, stock y contabilidad. Ver `../../index.ts`.
 */
export default {
  // ── Router unificado de documentos ──
  'Tipo de documento no válido: {0}': 'Invalid document type: {0}',
  'Este tipo de documento no se puede editar.': 'This document type cannot be edited.',
  'Ya se ha creado un documento a partir de este; no se puede editar.':
    'A document has already been created from this one; it cannot be edited.',
  'Este tipo de documento no soporta posteo.': 'This document type does not support posting.',
  'Solo se pueden asentar documentos en estado Borrador.': 'Only draft documents can be posted.',
  'Sólo se pueden asentar documentos en estado Borrador.': 'Only draft documents can be posted.',
  'Ya está cancelado': 'Already cancelled',
  'Ya está cancelada': 'Already cancelled',
  'No se puede cancelar: el documento ya está facturado.':
    'Cannot cancel: the document has already been invoiced.',
  'Este tipo de documento no admite cambio de estado manual.':
    'This document type does not allow manual status changes.',
  'Estado no válido: {0}': 'Invalid status: {0}',
  'Transición no permitida: {0} → {1}': 'Transition not allowed: {0} → {1}',

  // ── Albaranes / pedidos / facturas ──
  'La recepción ya está cerrada. No se puede cancelar el albarán de compra.':
    'The receipt is already closed. The goods receipt cannot be cancelled.',
  'Recepción en curso. Confirma con force=true para cancelar.':
    'Receipt in progress. Confirm with force=true to cancel.',
  'Albarán no encontrado': 'Delivery note not found',
  'El albarán ya está cancelado': 'The delivery note is already cancelled',
  'No se puede cancelar un albarán ya facturado':
    'An invoiced delivery note cannot be cancelled',
  'El envío ya ha sido entregado. Usa "Devolver" en el envío en lugar de cancelar el albarán.':
    'The shipment has already been delivered. Use "Return" on the shipment instead of cancelling the delivery note.',
  'El envío está en ruta. Confirma con force=true para cancelarlo — el conductor debe volver sin entregar.':
    'The shipment is out for delivery. Confirm with force=true to cancel it — the driver must return without delivering.',
  'No encontrada': 'Not found',
  'Solo se pueden asentar facturas en estado Borrador.': 'Only draft invoices can be posted.',
  'Pedido no encontrado': 'Order not found',
  'El pedido ya está cancelado': 'The order is already cancelled',
  'No se puede cancelar: existen albaranes vigentes vinculados. Cancela los albaranes primero.':
    'Cannot cancel: there are active linked delivery notes. Cancel the delivery notes first.',
  'Factura no encontrada': 'Invoice not found',
  'Indica el número de factura del proveedor (referencia del proveedor).':
    "Enter the supplier's invoice number (supplier reference).",
  'Ya hay una factura de este proveedor con la referencia «{0}».':
    'There is already an invoice from this supplier with reference «{0}».',
  'Factura lockada. No se pueden modificar: {0}. Crea una rectificativa.':
    'Invoice locked. The following cannot be modified: {0}. Create a corrective invoice.',

  // ── FactuAPI ──
  'Se requiere un token de API (Authorization: Bearer tk_...).':
    'An API token is required (Authorization: Bearer tk_...).',
  'Falta el scope {0}': 'Missing scope {0}',
  'Tipo de documento inválido: {0}. Válidos: {1}': 'Invalid document type: {0}. Valid: {1}',
  'Tipo inválido: {0}': 'Invalid type: {0}',
  'El tipo {0} no soporta asentamiento (sólo facturas).':
    'Type {0} does not support posting (invoices only).',
  'Documento no encontrado': 'Document not found',
  'Tipo de documento no soportado en FactuAPI: {0}': 'Document type not supported in FactuAPI: {0}',
  'reference es obligatorio': 'reference is required',
  'amount debe ser > 0': 'amount must be > 0',
  'Nómina no existe': 'Payslip does not exist',
  'Empleado no existe': 'Employee does not exist',
  'No hay período abierto': 'There is no open period',
  'Usuario no encontrado': 'User not found',
  'Contraseña incorrecta': 'Incorrect password',
  'El usuario no tiene acceso a ningún tenant': 'The user does not have access to any tenant',
  'Tenant "{0}" no accesible. Disponibles: {1}': 'Tenant "{0}" not accessible. Available: {1}',

  // ── Motor de documentos ──
  'Tipo de documento no registrado para tabla {0}': 'No document type registered for table {0}',
  'Este tipo de documento no se puede editar una vez creado.':
    'This document type cannot be edited once created.',
  'El documento no tiene líneas.': 'The document has no lines.',
  'Solo se puede editar el documento mientras está abierto.':
    'The document can only be edited while it is open.',
  'El documento ya está cancelado': 'The document is already cancelled',
  'Serie no encontrada': 'Series not found',
  'Debes indicar un número de documento válido (entero positivo) para una serie manual.':
    'You must enter a valid document number (positive integer) for a manual series.',
  'Ya existe un documento con el número {0} en esta serie.':
    'A document with number {0} already exists in this series.',
  'Artículo {0} no encontrado': 'Item {0} not found',
  'Artículo {0} requiere trazabilidad. Pendiente: {1}':
    'Item {0} requires traceability. Pending: {1}',
  'Stock insuficiente en el lote {0} para el artículo {1}. Disponible: {2}':
    'Insufficient stock in batch {0} for item {1}. Available: {2}',
  'Tipo de documento no registrado: {0}. Regístralo con DocumentRegistry.register()':
    'Document type not registered: {0}. Register it with DocumentRegistry.register()',
  'Stock insuficiente para el artículo {0}. Disponible: {1}, Requerido: {2}':
    'Insufficient stock for item {0}. Available: {1}, Required: {2}',
  'El artículo {0} requiere selección de lote/serie.':
    'Item {0} requires a batch/serial number selection.',
  'Stock de lotes insuficiente para el artículo {0}. Faltan {1} unidades.':
    'Insufficient batch stock for item {0}. {1} units short.',
  'La configuración del almacén exige indicar una Ubicación (Zona) para el artículo {0}.':
    'The warehouse configuration requires a Location (Zone) for item {0}.',
  'La serie {0} ya existe en stock para el artículo {1}':
    'Serial number {0} already exists in stock for item {1}',
  'Un artículo gestionado por Serie solo puede tener cantidad 1 por serie. Serie: {0}':
    'A serial-managed item can only have quantity 1 per serial number. Serial: {0}',
  'Documento {0} no encontrado': 'Document {0} not found',
  'No hay plantilla default para {0}': 'There is no default template for {0}',
  'Schema inválido: {0}': 'Invalid schema: {0}',

  // ── Cobros / pagos ──
  'salesInvoiceId o purchaseInvoiceId requerido': 'salesInvoiceId or purchaseInvoiceId required',
  'date y amount son obligatorios': 'date and amount are required',
  'El nº de referencia es obligatorio': 'The reference number is required',
  'salesInvoiceId o purchaseInvoiceId obligatorio': 'salesInvoiceId or purchaseInvoiceId required',
  'Solo uno de salesInvoiceId o purchaseInvoiceId':
    'Only one of salesInvoiceId or purchaseInvoiceId',
  'date obligatorio': 'date is required',
  'Nada que actualizar': 'Nothing to update',

  // ── Vínculos y series ──
  'id obligatorio': 'id is required',
  'El número de inicio no puede ser mayor al límite final (firstNumber > lastNumber).':
    'The start number cannot be greater than the end limit (firstNumber > lastNumber).',
  'El siguiente número asignado está fuera de rango.': 'The next assigned number is out of range.',
  'Rango incoherente: inicio mayor que fin.': 'Inconsistent range: start is greater than end.',

  // ── Plantillas de documento ──
  'Solo disponible para administradores': 'Only available to administrators',
  'docType inválido': 'Invalid docType',
  'name y html son obligatorios': 'name and html are required',
  'Solo admin/superuser': 'Admin/superuser only',
  'Tenant schema no resuelto': 'Tenant schema not resolved',
  'html es obligatorio': 'html is required',
  'Error al renderizar el preview': 'Error rendering the preview',
  'Plantilla no encontrada': 'Template not found',
  'Sólo plantillas de tipo FREE o LABEL pueden renderizarse con render-free':
    'Only FREE or LABEL templates can be rendered with render-free',
  'La plantilla no tiene html': 'The template has no HTML',
  'Error al renderizar': 'Rendering error',
  'sql es obligatorio': 'sql is required',
  'Error desconocido': 'Unknown error',
  'description es obligatoria': 'description is required',
  'El asistente de IA está desactivado. Actívalo en Ajustes → Empresa → IA.':
    'The AI assistant is disabled. Enable it in Settings → Company → AI.',
  'Error al generar la plantilla con IA': 'Error generating the template with AI',
  'param es obligatorio': 'param is required',
  'La consulta está vacía': 'The query is empty',
  'La consulta está vacía (solo comentarios)': 'The query is empty (comments only)',
  'Solo se permite una sentencia por consulta': 'Only one statement per query is allowed',
  'Solo se permiten consultas SELECT o WITH': 'Only SELECT or WITH queries are allowed',
  'La palabra reservada "{0}" no está permitida en consultas de plantilla':
    'The reserved word "{0}" is not allowed in template queries',
  'Nombre de schema inválido: {0}': 'Invalid schema name: {0}',
  'La consulta no tiene nombre': 'The query has no name',

  // ── Campos de plugins ──
  'El campo "{0}" es obligatorio.': 'The field "{0}" is required.',
  'Valor inválido para "{0}" (tipo {1}).': 'Invalid value for "{0}" (type {1}).',
  '"{0}" debe ser ≥ {1}.': '"{0}" must be ≥ {1}.',
  '"{0}" debe ser ≤ {1}.': '"{0}" must be ≤ {1}.',
  '"{0}" debe tener al menos {1} caracteres.': '"{0}" must be at least {1} characters long.',
  '"{0}" debe tener máximo {1} caracteres.': '"{0}" must be at most {1} characters long.',
  '"{0}" no respeta el patrón requerido.': '"{0}" does not match the required pattern.',
  '"{0}" ya existe. Debe ser único.': '"{0}" already exists. It must be unique.',

  // ── Stock ──
  'Traspaso no encontrado': 'Transfer not found',
  'Entrada no encontrada': 'Goods receipt not found',
  'Salida no encontrada': 'Goods issue not found',

  // ── Contabilidad ──
  'periodId es obligatorio': 'periodId is required',
  'Un asiento requiere al menos 2 líneas': 'A journal entry requires at least 2 lines',
  'Línea {0}: accountId obligatorio': 'Line {0}: accountId is required',
  'Línea {0}: debe/haber no pueden ser negativos': 'Line {0}: debit/credit cannot be negative',
  'Línea {0}: no puede tener debe y haber a la vez':
    'Line {0}: cannot have both debit and credit',
  'Línea {0}: debe o haber tiene que ser > 0': 'Line {0}: debit or credit must be > 0',
  'Asiento descuadrado: debe={0} ≠ haber={1}': 'Unbalanced journal entry: debit={0} ≠ credit={1}',
  'Asiento {0} no existe': 'Journal entry {0} does not exist',
  'No se puede postear un asiento reversado': 'A reversed journal entry cannot be posted',
  'Asiento {0} descuadrado: debe={1} haber={2}':
    'Journal entry {0} is unbalanced: debit={1} credit={2}',
  'Asiento {0} tiene menos de 2 líneas': 'Journal entry {0} has fewer than 2 lines',
  'Solo se puede reversar un asiento posted (estado actual: {0})':
    'Only a posted journal entry can be reversed (current status: {0})',
  'Período no existe': 'Period does not exist',
  'Período ya está en estado {0}': 'Period is already in status {0}',
  'Hay {0} asiento(s) en borrador dentro del período':
    'Draft journal entries within the period: {0}',
  'No hay cuenta configurada para "result" (regularización). Configura AccountMapping kind=result.':
    'No account is configured for "result" (closing). Configure AccountMapping kind=result.',
  'No se puede cerrar: {0}': 'Cannot close: {0}',
} as Record<string, string>;
