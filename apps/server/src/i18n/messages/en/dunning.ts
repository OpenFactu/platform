/** Reclamación de impagos: la carta de fábrica y los mensajes de la API. Ver `../../index.ts`. */
export default {
  // ── La carta ──
  'Facturas pendientes de {company}': 'Unpaid invoices from {company}',
  'Hola, {partner}:': 'Hello {partner},',
  'Según nuestras cuentas, las facturas de abajo están vencidas y sin pagar, por un total de {total}. Te las adjuntamos.':
    'According to our records, the invoices below are overdue and unpaid, for a total of {total}. They are attached.',
  'Si ya las has pagado, no hagas caso de este mensaje y disculpa la molestia. Si hay algún problema con ellas, cuéntanoslo.':
    'If you have already paid them, please disregard this message and accept our apologies. If there is any problem with them, let us know.',
  'Segundo aviso: facturas vencidas de {company}': 'Second notice: overdue invoices from {company}',
  'Ya te avisamos de estas facturas y siguen sin pagar. El total pendiente es de {total}.':
    'We already told you about these invoices and they are still unpaid. The total outstanding is {total}.',
  'Te pedimos que las pagues cuanto antes o que nos digas cuándo podrás hacerlo.':
    'Please pay them as soon as possible or let us know when you will be able to.',
  'Último aviso: facturas vencidas de {company}': 'Final notice: overdue invoices from {company}',
  'A pesar de los avisos anteriores, estas facturas siguen sin pagar, por un total de {total}.':
    'Despite our previous notices, these invoices are still unpaid, for a total of {total}.',
  'Necesitamos que las pagues o que te pongas en contacto con nosotros ya. Si no, tendremos que tomar otras medidas.':
    'We need you to pay them or get in touch with us now. Otherwise we will have to take further steps.',
  Factura: 'Invoice',
  Vencimiento: 'Due date',
  Días: 'Days',
  Pendiente: 'Outstanding',

  // ── Recurrentes ──
  'Ponle un nombre.': 'Give it a name.',
  'Este tipo de documento no se puede repetir.': 'This type of document cannot be repeated.',
  'Elige un cliente.': 'Choose a customer.',
  'Ese cliente no existe.': 'That customer does not exist.',
  'Elige cada cuánto se repite.': 'Choose how often it repeats.',
  'La fecha de inicio no es válida.': 'The start date is not valid.',
  'La fecha de fin no es válida.': 'The end date is not valid.',
  'La fecha de fin no puede ser anterior a la de inicio.':
    'The end date cannot be before the start date.',
  'Añade al menos una línea.': 'Add at least one line.',
  'Hay una línea sin artículo.': 'There is a line with no item.',
  'La cantidad tiene que ser mayor que cero.': 'The quantity has to be greater than zero.',
  'El precio no puede ser negativo.': 'The price cannot be negative.',
  'Para enviarla sola también hay que emitirla.':
    'To send it automatically it also has to be issued automatically.',
  'Con esas fechas no llegaría a generar ninguna.': 'With those dates it would never generate any.',
  'Recurrente no encontrada.': 'Recurring invoice not found.',
  'Solo se pausa una recurrente activa.': 'Only an active recurring invoice can be paused.',
  'Solo se reanuda una recurrente en pausa.': 'Only a paused recurring invoice can be resumed.',
  'Ya ha generado facturas: termínala en vez de borrarla.':
    'It has already generated invoices: end it instead of deleting it.',
  'No hay un periodo contable abierto para el {0}.': 'There is no open accounting period for {0}.',
  'No hay una serie de numeración para el periodo {0}.':
    'There is no numbering series for period {0}.',

  // ── API ──
  'Este cliente no tiene nada vencido.': 'This customer has nothing overdue.',
  'Aún no toca reclamarle nada a este cliente.':
    'It is not time to chase this customer for anything yet.',
  'Este cliente está excluido de las reclamaciones.': 'This customer is excluded from reminders.',
  'Este cliente no tiene correo: indica uno.': 'This customer has no email: enter one.',
  'La dirección de correo no es válida.': 'The email address is not valid.',
  'No hay plantilla para el PDF de {0}.': 'There is no PDF template for {0}.',
  'Ya se está enviando una reclamación a este cliente.':
    'A reminder is already being sent to this customer.',
  'No se pudo enviar la reclamación: {0}': 'The reminder could not be sent: {0}',
  'El servidor de correo no aceptó la dirección.': 'The mail server did not accept the address.',
  'Reclamación no encontrada.': 'Reminder not found.',
  'Hacen falta entre 1 y {0} niveles.': 'Between 1 and {0} levels are needed.',
  'Los días de cada nivel tienen que ser un número entero.':
    'The days for each level have to be a whole number.',
  'Cada nivel tiene que empezar más tarde que el anterior.':
    'Each level has to start later than the one before it.',
  'Los días entre reclamaciones van de 1 a 365.':
    'The days between reminders have to be between 1 and 365.',
  'No se pudo enviar alguna reclamación de impago': 'A payment reminder could not be sent',
};
