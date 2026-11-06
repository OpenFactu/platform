/**
 * Mensajes de documentos (ventas/compras), FactuAPI, cobros/pagos, series,
 * plantillas de documento, stock y contabilidad. Ver `../../index.ts`.
 */
export default {
  // ── Devoluciones ──
  'Este albarán ya está facturado: la mercancía vuelve con el abono de su factura.':
    'This delivery note is already invoiced: the goods come back with the credit note of its invoice.',
  'Este albarán tiene un envío en marcha: resuélvelo antes desde logística.':
    'This delivery note has a shipment under way: resolve it first from logistics.',
  'Esa línea no es de este albarán.': 'That line is not on this delivery note.',
  'La cantidad a devolver tiene que ser mayor que cero.':
    'The quantity to return must be greater than zero.',
  'De «{0}» hay que decir de qué lote vuelve.': 'Say which batch of «{0}» comes back.',
  'El lote {0} no salió con este albarán.': 'Batch {0} did not leave with this delivery note.',
  '«{0}» va por número de serie: vuelve entero.':
    '«{0}» is tracked by serial number: it comes back whole.',
  'De «{0}» solo queda {1} por volver.': 'Only {1} of «{0}» can still come back.',
  'Esa ubicación no es de ese almacén.': 'That location is not in that warehouse.',
  'Este almacén exige indicar la ubicación donde entra la mercancía.':
    'This warehouse requires the location where the goods come in.',
  'Indica el motivo de la devolución.': 'Enter the reason for the return.',
  'Elige el almacén al que vuelve.': 'Choose the warehouse it returns to.',
  'Ese almacén no existe.': 'That warehouse does not exist.',
  'Parte de este albarán ya ha vuelto y está en el almacén: para anularlo, devuelve también el resto.':
    'Part of this delivery note already came back and is in the warehouse: to cancel it, return the rest too.',
  'Esta mercancía ha vuelto con su entrada: para enviarla otra vez, haz un albarán nuevo.':
    'These goods came back with their receipt: to ship them again, make a new delivery note.',
  'De «{0}» ya han vuelto {1} por logística: abónalo sin devolver al stock.':
    '{1} of «{0}» already came back through logistics: credit it without returning it to stock.',
  'De «{0}» solo quedan {1} por devolver.': 'Only {1} of «{0}» can still be returned.',
  'La mercancía de la línea {0} del albarán ha vuelto: no se puede facturar.':
    'The goods on line {0} of the delivery note came back: it cannot be invoiced.',
  'De la línea {0} del albarán ha vuelto parte: solo se pueden facturar {1}.':
    'Part of line {0} of the delivery note came back: only {1} can be invoiced.',
  'Parte de este albarán ya ha vuelto con una entrada de mercancía: bórrala antes de cancelarlo.':
    'Part of this delivery note already came back with a goods receipt: delete it before cancelling.',
  'Su albarán ya está anulado: esta entrada es la que devuelve la mercancía.':
    'Its delivery note is already cancelled: this receipt is what brings the goods back.',
  'Esta mercancía ya había vuelto con un abono: no se crea otra entrada.':
    'These goods already came back with a credit note: no other receipt is created.',
  'Una compra devuelta no crea entrada: su mercancía entró con el albarán.':
    'A returned purchase creates no receipt: its goods came in with the goods receipt note.',

  // ── Reglas de los documentos ──
  'El total del documento no puede ser negativo. Para devolver dinero, usa un abono.':
    'The document total cannot be negative. To give money back, use a credit note.',
  'El periodo {0} está cerrado y este documento movió stock: no se puede cancelar. Corrígelo con un documento nuevo en un periodo abierto.':
    'Period {0} is closed and this document moved stock: it cannot be cancelled. Correct it with a new document in an open period.',
  'El total no puede ser negativo.': 'The total cannot be negative.',
  'El precio no es válido.': 'The price is not valid.',
  'No se ha podido completar la operación.': 'The operation could not be completed.',
  'Elige el interlocutor del documento.': 'Choose the business partner for the document.',
  'Elige la serie de numeración.': 'Choose the numbering series.',
  'Elige el periodo contable.': 'Choose the accounting period.',
  'La fecha del documento no es válida.': 'The document date is not valid.',
  'La retención del documento tiene que estar entre 0 y 100.':
    'The document withholding has to be between 0 and 100.',
  'La línea {0} no tiene artículo.': 'Line {0} has no item.',
  'La cantidad de la línea {0} no es válida.': 'The quantity on line {0} is not valid.',
  'El precio de la línea {0} no es válido.': 'The price on line {0} is not valid.',
  'El descuento de la línea {0} tiene que estar entre 0 y 100.':
    'The discount on line {0} has to be between 0 and 100.',
  'El descuento de la línea {0} supera su importe.':
    'The discount on line {0} is more than its amount.',
  'La retención de la línea {0} tiene que estar entre 0 y 100.':
    'The withholding on line {0} has to be between 0 and 100.',
  'La unidad de la línea {0} no es válida.': 'The unit on line {0} is not valid.',
  'El impuesto de la línea {0} no existe.': 'The tax on line {0} does not exist.',
  'Ese interlocutor no existe.': 'That business partner does not exist.',
  'Ese periodo contable no existe.': 'That accounting period does not exist.',
  'Esa serie de numeración no existe.': 'That numbering series does not exist.',
  'El periodo {0} está cerrado: no admite documentos.':
    'Period {0} is closed: it does not accept documents.',
  'El periodo {0} está cerrado: no admite asientos.':
    'Period {0} is closed: it does not accept journal entries.',
  'El periodo {0} está cerrado: elige otra fecha.': 'Period {0} is closed: choose another date.',
  'La fecha {0} no cae en el periodo {1}.': 'The date {0} is not in period {1}.',
  'No hay un periodo contable abierto para el {0}.': 'There is no open accounting period for {0}.',
  'No hay un periodo abierto para revertir el asiento {0}.':
    'There is no open period to reverse journal entry {0}.',
  'La serie {0} no es de este tipo de documento.': 'Series {0} is not for this type of document.',
  'La serie {0} no es de ese periodo.': 'Series {0} is not for that period.',
  'La serie {0} ha llegado a su último número ({1}).':
    'Series {0} has reached its last number ({1}).',
  'El siguiente número no puede ser {0}: la serie ya ha llegado al {1}.':
    'The next number cannot be {0}: the series has already reached {1}.',

  // ── Límite de crédito ──
  'Este cliente supera su límite de crédito de {0}: con este documento debería {1}.':
    'This customer is over their credit limit of {0}: with this document they would owe {1}.',
  'El límite de crédito tiene que ser un importe positivo.':
    'The credit limit has to be a positive amount.',
  'No tienes permiso para cambiar el límite de crédito.':
    'You do not have permission to change the credit limit.',
  'Modo de crédito no válido.': 'Invalid credit mode.',

  // ── Campos enlazados ──
  Interlocutor: 'Business partner',
  Artículo: 'Item',
  Almacén: 'Warehouse',
  Empleado: 'Employee',
  'Cuenta contable': 'Ledger account',
  'Centro de coste': 'Cost centre',
  Proyecto: 'Project',
  'Objeto no encontrado.': 'Object not found.',
  'No tienes permiso para ver esto.': 'You do not have permission to see this.',
  'Elige a qué objeto se enlaza.': 'Choose which object it links to.',

  // ── Abonos ──
  'Una factura emitida no se puede cancelar. Corrígela con un abono.':
    'An issued invoice cannot be cancelled. Correct it with a credit note.',
  'Rectifica la factura {ref}. Motivo: {reason}': 'Corrects invoice {ref}. Reason: {reason}',
  'Factura no encontrada.': 'Invoice not found.',
  'Esta factura está cancelada.': 'This invoice is cancelled.',
  'Solo se abonan facturas emitidas.': 'Only issued invoices can be credited.',
  'Un abono no se puede abonar.': 'A credit note cannot be credited.',
  'Indica el motivo del abono.': 'Enter the reason for the credit note.',
  'Elige al menos una línea.': 'Choose at least one line.',
  'Esa línea no es de esta factura.': 'That line does not belong to this invoice.',
  'La cantidad a abonar tiene que ser mayor que cero.':
    'The quantity to credit must be greater than zero.',
  'De «{0}» solo quedan {1} por abonar.': 'Only {1} of "{0}" left to credit.',
  'Ese tipo de documento no es rectificativo.': 'That document type is not a corrective one.',
  'No hay ningún tipo de documento rectificativo. Crea uno en los ajustes fiscales.':
    'There is no corrective document type. Create one in the tax settings.',
  'De «{0}» no consta de qué lotes salió: no se puede devolver con este abono.':
    'It is not recorded which batches "{0}" left from: it cannot be returned with this credit note.',
  'El pedido de este albarán ya no existe.': 'The order for this delivery note no longer exists.',
  'Este pedido está cancelado.': 'This order is cancelled.',
  'Este pedido ya está cerrado: no queda nada por recibir.':
    'This order is already closed: there is nothing left to receive.',
  'Este pedido ya está cerrado: no queda nada por entregar.':
    'This order is already closed: there is nothing left to deliver.',
  'Este pedido ya está cerrado.': 'This order is already closed.',
  'Este albarán está cancelado.': 'This delivery note is cancelled.',
  'Este albarán ya está facturado.': 'This delivery note has already been invoiced.',
  'La línea {0} no está en el pedido.': 'Line {0} is not on the order.',
  'De la línea {0} del pedido quedan {1} por recibir, no {2}.':
    'Line {0} of the order has {1} left to receive, not {2}.',
  'De la línea {0} del pedido quedan {1} por entregar, no {2}.':
    'Line {0} of the order has {1} left to deliver, not {2}.',
  'Fecha no válida.': 'Invalid date.',
  'No hay ningún periodo abierto para esa fecha.': 'There is no open period for that date.',
  'Esa serie no vale para este documento y periodo.':
    'That series is not valid for this document and period.',
  'No hay ninguna serie para el periodo de esta fecha.':
    'There is no series for the period of this date.',
  'El importe tiene que ser mayor que cero.': 'The amount must be greater than zero.',
  'Un abono no se aplica a sí mismo.': 'A credit note cannot be applied to itself.',
  'Abono no encontrado.': 'Credit note not found.',
  'Solo se aplican abonos emitidos.': 'Only issued credit notes can be applied.',
  'Es más de lo que queda en este abono.': 'That is more than what is left on this credit note.',
  'Factura de destino no encontrada.': 'Target invoice not found.',
  'La factura de destino es de otro interlocutor.':
    'The target invoice belongs to another business partner.',
  'Solo se aplica a facturas emitidas.': 'It can only be applied to issued invoices.',
  'Es más de lo que debe esa factura.': 'That is more than what that invoice owes.',
  'Un importe negativo solo vale para devolver el saldo de un abono.':
    'A negative amount is only valid to refund the balance of a credit note.',
  'Un abono se devuelve con un importe negativo.':
    'A credit note is refunded with a negative amount.',
  'Solo quedan {0} por devolver en este abono.': 'Only {0} left to refund on this credit note.',
  'El importe no puede ser cero.': 'The amount cannot be zero.',
  'Solo se registran cobros y pagos en facturas emitidas.':
    'Payments can only be registered on issued invoices.',
  'Esta factura ya está saldada.': 'This invoice is already settled.',
  'Solo quedan {0} pendientes en esta factura.': 'Only {0} left to settle on this invoice.',
  'Esto es la aplicación de un abono, no un cobro.':
    'This is a credit note being applied, not a payment.',

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
  'No se puede cancelar un albarán ya facturado': 'An invoiced delivery note cannot be cancelled',
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
  'Esta tabla no es de tipo documento.': 'This table is not a document table.',
  'Tabla no encontrada.': 'Table not found.',
  '{0} (editada)': '{0} (edited)',
  'Tipo de documento {0} no encontrado': 'Document type {0} not found',
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
  'Línea {0}: no puede tener debe y haber a la vez': 'Line {0}: cannot have both debit and credit',
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
