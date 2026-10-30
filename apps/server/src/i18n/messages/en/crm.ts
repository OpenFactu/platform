/** Mensajes del CRM (oportunidades, etapas, contactos, actividades). Ver `../../index.ts`. */
export default {
  'Tipo de actividad no válido': 'Invalid activity type',
  'El asunto es obligatorio': 'The subject is required',
  'La actividad tiene que ir ligada a un interlocutor, contacto u oportunidad':
    'The activity must be linked to a business partner, contact or opportunity',
  'Actividad no encontrada': 'Activity not found',
  'El interlocutor es obligatorio': 'The business partner is required',
  'El nombre es obligatorio': 'The name is required',
  'Contacto no encontrado': 'Contact not found',
  'Oportunidad no encontrada': 'Opportunity not found',
  'El título es obligatorio': 'The title is required',
  'Indica el cliente o, si aún no lo es, el nombre o la empresa del prospecto':
    "Enter the customer or, if they aren't one yet, the prospect's name or company",
  'No hay ninguna etapa abierta': 'There is no open stage',
  'Etapa no encontrada': 'Stage not found',
  'Indica el motivo de pérdida': 'Enter the loss reason',
  'Indica el origen de la oportunidad': 'Enter the opportunity source',
  'La oportunidad está cerrada: sus productos ya no se pueden cambiar':
    'The opportunity is closed: its products can no longer be changed',
  'Se esperaba una lista de líneas': 'A list of lines was expected',
  'Informe no encontrado': 'Report not found',
  'Error desconocido': 'Unknown error',
  'Tipo de etapa no válido': 'Invalid stage type',
  'Tipo de seguimiento no válido': 'Invalid follow-up type',
  'Los días de seguimiento van de 0 a 365': 'Follow-up days must be between 0 and 365',
  'La probabilidad tiene que estar entre 0 y 100': 'Probability must be between 0 and 100',
  'Se esperaba una lista de ids': 'A list of ids was expected',
  'La etapa tiene {0} oportunidad(es). Muévelas a otra etapa antes de borrarla.':
    'The stage has {0} opportunities. Move them to another stage before deleting it.',
  'No hay ningún periodo contable abierto': 'There is no open accounting period',
  'No hay ninguna serie de presupuestos configurada': 'No quote series is configured',
  'Convierte antes el prospecto en cliente para poder presupuestarle':
    'Convert the prospect into a customer first to be able to quote them',
  'Añade al menos un producto con artículo a la oportunidad':
    'Add at least one product with an item to the opportunity',
  'Periodo no válido': 'Invalid period',
} as Record<string, string>;
