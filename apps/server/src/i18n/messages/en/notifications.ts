/**
 * Notificaciones guardadas en BD: se escriben en español y se traducen al
 * listarlas (GET /api/notifications). Ver `../../index.ts`.
 */
export default {
  'Nuevo mensaje desde tu web': 'New message from your website',
  '{0} ha enviado el formulario de contacto.': '{0} submitted the contact form.',
  'Alguien ha enviado el formulario de contacto.': 'Someone submitted the contact form.',
  'Incidencia reportada por un cliente': 'Issue reported by a customer',
  'Backup automático fallido': 'Scheduled backup failed',
  'Backup manual fallido': 'Manual backup failed',
  'El presupuesto {0} ha caducado': 'Quote {0} has expired',
  'Sigue abierto y ha pasado su validez («{0}»).': 'It is still open and past its validity date ("{0}").',
  'Pendiente: {0}': 'Due: {0}',
  'Actividad comercial con fecha de hoy o anterior.': 'Sales activity due today or earlier.',
  'Nuevo mensaje de un prospecto': 'New message from a prospect',
  'Nuevo lead desde la web': 'New lead from the website',
  '{0} ha escrito desde la web.': '{0} wrote from the website.',
  'Nueva respuesta en «{0}»': 'New response to "{0}"',
  '{0} desconectado': '{0} disconnected',
  'La autorización de {0} fue revocada o caducó. Vuelve a conectar la cuenta en Ajustes → Almacenamiento.':
    'The {0} authorization was revoked or expired. Reconnect the account in Settings → Storage.',
  'Nuevo pedido desde tu web': 'New order from your website',
  '{0} ha hecho un pedido ({1}) con {2} línea(s).': '{0} placed an order ({1}) with {2} line(s).',
  'Nueva factura de venta nº {0}': 'New sales invoice no. {0}',
  'Nueva factura de compra nº {0}': 'New purchase invoice no. {0}',
  'Nuevo pedido de venta nº {0}': 'New sales order no. {0}',
  'Nuevo pedido de compra nº {0}': 'New purchase order no. {0}',
  'Nuevo albarán de venta nº {0}': 'New delivery note no. {0}',
  'Nuevo albarán de compra nº {0}': 'New goods receipt no. {0}',
  'Importe {0} €': 'Amount €{0}',
  'Período {0} pendiente de cierre': 'Period {0} pending close',
  'El período {0} finalizó el {1}. Revisa y confirma el cierre.':
    'Period {0} ended on {1}. Review and confirm the close.',
} as Record<string, string>;
