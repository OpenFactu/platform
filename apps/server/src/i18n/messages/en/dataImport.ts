/** Mensajes del importador de datos (api/dataImport.ts y core/dataimport). Ver `../../index.ts`. */
export default {
  // ── api/dataImport.ts ────────────────────────────────────────────────
  'No hay empresa activa en la petición.': 'There is no active company in the request.',
  'No se pudo leer el catálogo': 'Could not read the catalog',
  'Objeto no disponible': 'Object not available',
  'No se pudo generar la plantilla': 'Could not generate the template',
  'No se recibió ningún fichero.': 'No file was received.',
  'El fichero no tiene ninguna fila de cabeceras.': 'The file has no header row.',
  'No se pudo leer el fichero': 'Could not read the file',
  '{0} solo admite alta, no actualización.': '{0} only supports inserts, not updates.',
  'Hay que indicar por qué campo se busca el registro existente.':
    'You must specify which field is used to find the existing record.',
  'No hay ninguna columna mapeada.': 'No columns are mapped.',
  'El fichero subido ya no está disponible. Vuelve a subirlo.':
    'The uploaded file is no longer available. Please upload it again.',
  'No se pudo crear el trabajo': 'Could not create the job',
  'Trabajo no encontrado': 'Job not found',
  'Ese trabajo ya no está en curso.': 'That job is no longer running.',
  'Una simulación no crea nada.': 'A dry run does not create anything.',
  'El trabajo sigue en curso: cancélalo primero.': 'The job is still running: cancel it first.',
  'Ya estaba deshecho.': 'It was already undone.',
  '{0} no admite deshacer.': '{0} does not support undo.',
  'Faltan objeto, nombre o mapeo.': 'Missing object, name or mapping.',

  // Etiquetas de los objetos importables (rellenan el `{0}` de arriba).
  'Plan contable': 'Chart of accounts',
  'Centros de coste': 'Cost centers',
  'Centros de beneficio': 'Profit centers',
  Contactos: 'Contacts',
  Oportunidades: 'Opportunities',
  Departamentos: 'Departments',
  Empleados: 'Employees',
  'Grupos de interlocutores': 'Business partner groups',
  'Categorías de artículos': 'Item categories',
  'Unidades de medida': 'Units of measure',
  'Tipos de impuesto': 'Tax types',
  Artículos: 'Items',
  Interlocutores: 'Business partners',
  Almacenes: 'Warehouses',
  'Listas de precios': 'Price lists',
  'Precios por tarifa': 'Prices by price list',
  'Existencias (entradas)': 'Stock (receipts)',
  'Existencias (salidas)': 'Stock (issues)',

  // ── core/dataimport: errores del trabajo (job.error) ─────────────────
  'Este objeto no se puede deshacer: no admite borrado.':
    'This object cannot be undone: it does not support deletion.',
  'Objeto de importación desconocido: {0}': 'Unknown import object: {0}',
  'El fichero no tiene ninguna hoja con datos.': 'The file has no sheet with data.',
  'Error desconocido': 'Unknown error',
  'Formato no soportado: {0}. Admitidos: Excel (.xlsx/.xls/.xlsm) y texto delimitado (.csv/.tsv/.txt).':
    'Unsupported format: {0}. Accepted: Excel (.xlsx/.xls/.xlsm) and delimited text (.csv/.tsv/.txt).',
  'Identificador de {0} inválido: {1}': 'Invalid {0} identifier: {1}',
  'Schema inválido: {0}': 'Invalid schema: {0}',

  // ── core/dataimport: mensajes por fila ───────────────────────────────
  // Van en `message` de cada fila de un array (no los traduce el middleware
  // hoy); se dejan listos por si se traduce esa respuesta.
  'No se pudo deshacer: {0}': 'Could not undo: {0}',
  'Clave de búsqueda no válida: {0}': 'Invalid lookup key: {0}',
  'Falta {0}, que es la clave de búsqueda': '{0} is missing, and it is the lookup key',
  'No existe ningún registro con {0} = "{1}"': 'No record exists with {0} = "{1}"',
  '{0} "{1}" está repetido en el fichero': '{0} "{1}" is duplicated in the file',
  'Ya existe un registro con {0} = "{1}"': 'A record already exists with {0} = "{1}"',
  'Faltan campos obligatorios: {0}': 'Missing required fields: {0}',
  'No se encontró el {0} "{1}" (campo {2})': '{0} "{1}" not found (field {2})',
  'El documento no tiene ninguna línea en el fichero de líneas':
    'The document has no lines in the lines file',
  'Línea {0} · {1}: {2}': 'Line {0} · {1}: {2}',
  'Línea {0}: no se encontró el {1} "{2}"': 'Line {0}: {1} "{2}" not found',
  'Línea {0}: faltan {1}': 'Line {0}: missing {1}',
  '"{0}" no es un número': '"{0}" is not a number',
  '"{0}" no es un sí/no reconocible': '"{0}" is not a recognizable yes/no value',
  '"{0}" no es una fecha (usa dd/mm/aaaa o aaaa-mm-dd)':
    '"{0}" is not a date (use dd/mm/yyyy or yyyy-mm-dd)',
  '"{0}" no es un valor válido. Admitidos: {1}': '"{0}" is not a valid value. Accepted: {1}',
  'El endpoint {0} {1} no respondió en {2} ms': 'Endpoint {0} {1} did not respond within {2} ms',
  'Sin ruta para {0} {1}': 'No route for {0} {1}',
} as Record<string, string>;
