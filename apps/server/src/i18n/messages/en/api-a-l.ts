/**
 * Mensajes de las rutas api/a…l (salvo auth, logística e importador, que
 * tienen su propio fichero) y de los core/** que usan. Ver `../../index.ts`.
 */
export default {
  // ── Genéricos de este lote ───────────────────────────────────────────
  'tenant requerido': 'tenant is required',
  'Falta tenant.': 'Missing tenant.',
  'Tenant no encontrado.': 'Tenant not found.',
  'Tenant no encontrado': 'Tenant not found',
  'Tenant con ID {0} no encontrado': 'Tenant with ID {0} not found',
  'Requiere ADMIN o SUPERUSER.': 'Requires ADMIN or SUPERUSER.',
  'Requiere ADMIN o SUPERUSER': 'Requires ADMIN or SUPERUSER',
  'Requiere rol ADMIN o SUPERUSER': 'Requires ADMIN or SUPERUSER role',
  'No encontrado.': 'Not found.',
  'Error desconocido': 'Unknown error',

  // ── api/accountMappings.ts ───────────────────────────────────────────
  'kind y accountId son obligatorios': 'kind and accountId are required',

  // ── api/ai.ts ────────────────────────────────────────────────────────
  'Se requiere tenant': 'Tenant is required',
  'messages es obligatorio': 'messages is required',
  'Error del proveedor de IA': 'AI provider error',
  'Error en el chat de IA': 'AI chat error',
  'Falta el archivo (campo "file")': 'Missing file (field "file")',
  'No se pudo leer el archivo': 'Could not read the file',
  'Conversación no encontrada': 'Conversation not found',
  'Falta id o messages': 'Missing id or messages',
  'No es tu conversación': 'This is not your conversation',
  'Proyecto no encontrado': 'Project not found',
  'Nada que cambiar': 'Nothing to change',
  'Falta el nombre del proyecto': 'Missing project name',
  'Se requiere tenant para la configuración de IA': 'A tenant is required for the AI configuration',
  'Error al llamar al proveedor de IA': 'Error calling the AI provider',
  'Ollama respondió {0}: {1}': 'Ollama responded {0}: {1}',
  'Ollama respondió {0}': 'Ollama responded {0}',
  'Hugging Face respondió {0}': 'Hugging Face responded {0}',
  'Error al buscar en Hugging Face': 'Error searching Hugging Face',
  'Falta el nombre del modelo': 'Missing model name',
  'No se pudo conectar con Ollama': 'Could not connect to Ollama',
  'Falta el modelo base': 'Missing base model',
  'Ventana de contexto inválida (512-131072)': 'Invalid context window (512-131072)',
  'Ollama no confirmó la creación de {0}. Prueba de nuevo.':
    'Ollama did not confirm the creation of {0}. Try again.',
  'No se pudo crear el modelo con esa ventana de contexto':
    'Could not create the model with that context window',

  // ── core/ai ──────────────────────────────────────────────────────────
  'El asistente de IA está desactivado. Un administrador puede activarlo en Ajustes → Empresa → IA.':
    'The AI assistant is disabled. An administrator can enable it in Settings → Company → AI.',
  'Falta la base URL': 'Missing base URL',
  'Proveedor de IA desconocido: {0}': 'Unknown AI provider: {0}',
  'Falta la API key de {0}. Configúrala en Ajustes → Empresa → IA (o AI_API_KEY en el .env).':
    'Missing API key for {0}. Set it in Settings → Company → AI (or AI_API_KEY in .env).',
  'Falta la base URL de {0}. Configúrala en Ajustes → Empresa → IA.':
    'Missing base URL for {0}. Set it in Settings → Company → AI.',
  'Falta el modelo de {0}. Configúralo en Ajustes → Empresa → IA.':
    'Missing model for {0}. Set it in Settings → Company → AI.',
  'Guarda antes la API key de {0} para ver sus modelos.':
    'Save the API key for {0} first to see its models.',
  'Guarda antes la base URL de {0} para ver sus modelos.':
    'Save the base URL for {0} first to see its models.',
  '{0} no publica un listado de modelos.': '{0} does not publish a model list.',
  'No se pudo consultar el catálogo del proveedor': "Could not query the provider's catalog",
  'Formato no soportado: {0}. Admitidos: Excel (.xlsx/.xls), PDF, Word (.docx/.doc), CSV/TXT.':
    'Unsupported format: {0}. Accepted: Excel (.xlsx/.xls), PDF, Word (.docx/.doc), CSV/TXT.',
  'Error al ejecutar la consulta': 'Error running the query',
  'La consulta no devolvió filas': 'The query returned no rows',

  // ── api/attachments.ts ───────────────────────────────────────────────
  'Error al listar adjuntos recientes': 'Error listing recent attachments',
  'entityType y entityId son obligatorios': 'entityType and entityId are required',
  'Error al listar adjuntos': 'Error listing attachments',
  'falta el archivo (campo "file")': 'missing file (field "file")',
  'Error al subir adjunto': 'Error uploading attachment',
  'Error al descargar': 'Download failed',
  'Error al borrar': 'Delete failed',

  // ── api/automations.ts / core/automations ────────────────────────────
  'name requerido': 'name is required',
  'triggerType inválido': 'Invalid triggerType',
  'actionType inválido': 'Invalid actionType',
  'Automatización no encontrada': 'Automation not found',
  'Automatización de otro tenant': 'Automation belongs to another tenant',
  'actionType desconocido: {0}': 'Unknown actionType: {0}',
  'email action: falta `to`': 'email action: missing `to`',
  'webhook action: falta `url`': 'webhook action: missing `url`',
  'webhook respondió {0}: {1}': 'webhook responded {0}: {1}',
  'notification action: falta `title`': 'notification action: missing `title`',

  // ── api/backups.ts / core/backup / core/tenant/TenantBackup ──────────
  'Error al listar backups': 'Error listing backups',
  'Ya hay un backup en curso': 'A backup is already in progress',
  'Ya hay un backup en curso para esta empresa': 'A backup is already in progress for this company',
  'Error al lanzar backup': 'Error starting backup',
  'Backup no encontrado o incompleto': 'Backup not found or incomplete',
  'Error al descargar backup': 'Error downloading backup',
  'Backup no encontrado': 'Backup not found',
  'Error al borrar backup': 'Error deleting backup',
  'Restaurar requiere rol SUPERUSER': 'Restoring requires the SUPERUSER role',
  'newName requerido': 'newName is required',
  'Error al restaurar backup': 'Error restoring backup',
  'Ruta fuera de la carpeta de backups': 'Path outside the backups folder',
  '{0} no está conectado — conecta la cuenta en Ajustes → Almacenamiento o cambia el destino del backup':
    '{0} is not connected — connect the account in Settings → Storage or change the backup destination',
  'No se encontró el binario "{0}" ni en el PATH del servidor ni dentro de un container Docker de Postgres. Instala "postgresql-client" en el host o define OPENFACTU_PG_CONTAINER con el nombre del container que tenga "{1}".':
    'The "{0}" binary was not found in the server PATH or inside a Postgres Docker container. Install "postgresql-client" on the host or set OPENFACTU_PG_CONTAINER to the name of the container that has "{1}".',
  'DATABASE_URL no configurada': 'DATABASE_URL is not configured',
  'Export inválido: schema.sql no contiene ningún CREATE TABLE (tamaño={0}B). Probablemente pg_dump falló sin error.':
    'Invalid export: schema.sql contains no CREATE TABLE (size={0}B). pg_dump probably failed silently.',
  'Export incompleto: el schema "{0}" tiene {1} tablas pero el dump solo contiene {2} CREATE TABLE.':
    'Incomplete export: schema "{0}" has {1} tables but the dump only contains {2} CREATE TABLE.',
  'Export inválido: el schema tiene ~{0} filas pero data.sql no contiene ningún COPY ni INSERT (tamaño={1}B).':
    'Invalid export: the schema has ~{0} rows but data.sql contains no COPY or INSERT (size={1}B).',
  'Zip inválido: faltan meta.json/schema.sql/data.sql': 'Invalid zip: missing meta.json/schema.sql/data.sql',
  'Import abortado: {0} todavía referencia al schema original "{1}". Contexto: …{2}…':
    'Import aborted: {0} still references the original schema "{1}". Context: …{2}…',
  'Import inválido: esperábamos {0} tablas en "{1}" pero solo hay {2}. Revisa los logs del server (schema.sql).':
    'Invalid import: expected {0} tables in "{1}" but there are only {2}. Check the server logs (schema.sql).',
  'Import inválido: data.sql tenía ~{0} filas pero la empresa quedó vacía. Probablemente el reemplazo del schema placeholder no capturó todas las referencias — revisa los logs del server.':
    'Invalid import: data.sql had ~{0} rows but the company ended up empty. The schema placeholder replacement probably missed some references — check the server logs.',

  // ── api/chartOfAccounts.ts ───────────────────────────────────────────
  'Cuenta no encontrada': 'Account not found',
  'code, name y type son obligatorios': 'code, name and type are required',
  'type debe ser uno de: {0}': 'type must be one of: {0}',
  'type inválido': 'Invalid type',
  'rows vacío': 'rows is empty',

  // ── api/companySignature.ts ──────────────────────────────────────────
  'solo se admiten imágenes (PNG / JPG)': 'only images are accepted (PNG / JPG)',
  'Error al subir firma': 'Error uploading signature',
  'Sin firma': 'No signature',

  // ── api/config.ts / core/config ──────────────────────────────────────
  'Se requiere tenant para modificar configuración': 'A tenant is required to modify settings',
  'Error al leer config de storage': 'Error reading storage settings',
  'Error al guardar config de storage': 'Error saving storage settings',
  'Error al comprobar': 'Check failed',
  'Formato de secreto de configuración inválido': 'Invalid configuration secret format',

  // ── api/costCenters.ts ───────────────────────────────────────────────
  'name es obligatorio': 'name is required',
  'Centro de coste no encontrado': 'Cost center not found',

  // ── api/customFields.ts ──────────────────────────────────────────────
  'Tabla no permitida: {0}': 'Table not allowed: {0}',
  'Nombre inválido. Usa letras, dígitos y "_", 2–41 caracteres.':
    'Invalid name. Use letters, digits and "_", 2–41 characters.',
  'Tipo no permitido: {0}': 'Type not allowed: {0}',
  'Se requiere al menos una opción.': 'At least one option is required.',
  'refTable requerida y válida.': 'A valid refTable is required.',
  'targetTable requerido.': 'targetTable is required.',
  'Tabla destino no permitida.': 'Target table not allowed.',
  'Origen no encontrado.': 'Source not found.',
  'Nada que importar.': 'Nothing to import.',
  'Pack no encontrado.': 'Pack not found.',
  'Tabla no permitida.': 'Table not allowed.',

  // ── api/dashboardWidgets.ts ──────────────────────────────────────────
  'No se pudo resolver el tenant': 'Could not resolve the tenant',
  'Widget de código no encontrado.': 'Code widget not found.',
  'Widget no encontrado.': 'Widget not found.',
  'Falta "code".': 'Missing "code".',
  'El título es obligatorio.': 'Title is required.',
  'Métrica no válida: {0}': 'Invalid metric: {0}',
  'El código del componente es obligatorio.': 'Component code is required.',
  'El código no compila: {0}': 'The code does not compile: {0}',
  'Configuración de consulta inválida.': 'Invalid query configuration.',
  // validateQuery (core/documents/templateQueries) devuelto como `error`
  'La consulta está vacía': 'The query is empty',
  'La consulta está vacía (solo comentarios)': 'The query is empty (comments only)',
  'Solo se permite una sentencia por consulta': 'Only one statement per query is allowed',
  'Solo se permiten consultas SELECT o WITH': 'Only SELECT or WITH queries are allowed',
  'La palabra reservada "{0}" no está permitida en consultas de plantilla':
    'The reserved word "{0}" is not allowed in template queries',

  // ── api/email.ts / core/email ────────────────────────────────────────
  'Falta destinatario': 'Missing recipient',
  'Error al enviar': 'Send failed',
  'Faltan to/subject': 'Missing to/subject',
  'Error al encolar': 'Error queuing',
  'Faltan docType/docId': 'Missing docType/docId',
  'docType inválido ({0})': 'Invalid docType ({0})',
  'Sin plantilla default': 'No default template',
  'El interlocutor no tiene email registrado': 'The business partner has no email address on file',
  'Error al encolar envío': 'Error queuing the email',
  'items vacío': 'items is empty',
  'docType/docId inválido': 'Invalid docType/docId',
  'Sin email del interlocutor': 'No business partner email',
  'Error en envío masivo': 'Bulk send failed',
  'Job no encontrado': 'Job not found',
  'El envío de correo está deshabilitado en Ajustes → Correo.':
    'Email sending is disabled in Settings → Email.',
  'No hay SMTP configurado. Completa host/puerto/usuario en Ajustes → Correo.':
    'No SMTP is configured. Fill in host/port/user in Settings → Email.',
  'Falta host SMTP': 'Missing SMTP host',
  'Fallo al conectar': 'Connection failed',

  // ── api/forms.ts / core/forms ────────────────────────────────────────
  'Formulario no encontrado': 'Form not found',
  'El nombre es obligatorio': 'Name is required',
  'El enlace es demasiado corto': 'The link is too short',
  'Ese enlace ya lo usa otro formulario': 'That link is already used by another form',
  'Falta la imagen': 'Missing image',
  'Solo imágenes': 'Images only',
  'Respuesta no encontrada': 'Response not found',
  'Activa antes el formulario': 'Activate the form first',
  'Añade al menos un destinatario': 'Add at least one recipient',
  'El formulario necesita al menos una sección': 'The form needs at least one section',
  'Como mucho 50 secciones': 'At most 50 sections',
  'Hay secciones con el mismo id': 'There are sections with the same id',
  'Hay elementos con el mismo id': 'There are items with the same id',
  'Tipo de pregunta no válido: {0}': 'Invalid question type: {0}',
  '«{0}»: añade al menos una opción': '“{0}”: add at least one option',
  '«{0}»: la cuadrícula necesita filas y columnas': '“{0}”: the grid needs rows and columns',
  'Como mucho 300 elementos': 'At most 300 items',
  'Algún archivo no es válido o ha caducado; vuelve a subirlo':
    'A file is invalid or has expired; please upload it again',
  'Este formulario ya no acepta respuestas.': 'This form is no longer accepting responses.',
  // Validación por pregunta: va en el mapa `errors` (no lo traduce el
  // middleware hoy); se deja listo por si se traduce esa respuesta.
  'Al menos {0} caracteres': 'At least {0} characters',
  'Como mucho {0} caracteres': 'At most {0} characters',
  'Escribe una dirección web válida': 'Enter a valid web address',
  'El formato no es válido': 'The format is not valid',
  'Correo no válido': 'Invalid email',
  'Número no válido': 'Invalid number',
  'Mínimo {0}': 'Minimum {0}',
  'Máximo {0}': 'Maximum {0}',
  'Fecha no válida': 'Invalid date',
  'Hora no válida': 'Invalid time',
  'Elige un valor entre {0} y {1}': 'Choose a value between {0} and {1}',
  'Elige entre 1 y {0}': 'Choose between 1 and {0}',
  'Escribe tu respuesta en «Otro»': 'Write your answer in “Other”',
  'Opción no válida': 'Invalid option',
  'Elige al menos una opción': 'Choose at least one option',
  'Elige al menos {0}': 'Choose at least {0}',
  'Elige como mucho {0}': 'Choose at most {0}',
  'Respuesta no válida': 'Invalid answer',
  'Responde todas las filas': 'Answer all rows',
  'Como mucho {0} archivo(s)': 'At most {0} file(s)',
  'Sube un archivo': 'Upload a file',

  // ── api/geo.ts ───────────────────────────────────────────────────────
  'Error al sembrar geografía': 'Error seeding geography data',
  'País no encontrado': 'Country not found',
  'Municipio no encontrado': 'Municipality not found',

  // ── api/internalOrders.ts ────────────────────────────────────────────
  'status inválido': 'Invalid status',
  'Orden interna no encontrada': 'Internal order not found',

  // ── api/items.ts ─────────────────────────────────────────────────────
  'Artículo no encontrado': 'Item not found',
  'Faltan campos obligatorios: Nombre y Unidad de Medida son requeridos.':
    'Missing required fields: Name and Unit of measure are required.',
  'Se requiere Código o Categoría.': 'Code or Category is required.',
  'Categoría sin prefijo.': 'Category has no prefix.',
  'Gestión inválida.': 'Invalid tracking mode.',

  // ── api/journalEntries.ts / core/accounting/JournalEngine ────────────
  'Asiento no encontrado': 'Journal entry not found',
  'periodId obligatorio': 'periodId is required',
  'periodId es obligatorio': 'periodId is required',
  'Un asiento requiere al menos 2 líneas': 'A journal entry requires at least 2 lines',
  'Línea {0}: accountId obligatorio': 'Line {0}: accountId is required',
  'Línea {0}: debe/haber no pueden ser negativos': 'Line {0}: debit/credit cannot be negative',
  'Línea {0}: no puede tener debe y haber a la vez': 'Line {0}: cannot have both debit and credit',
  'Línea {0}: debe o haber tiene que ser > 0': 'Line {0}: debit or credit must be > 0',
  'Asiento descuadrado: debe={0} ≠ haber={1}': 'Unbalanced journal entry: debit={0} ≠ credit={1}',
  'Asiento {0} no existe': 'Journal entry {0} does not exist',
  'No se puede postear un asiento reversado': 'A reversed journal entry cannot be posted',
  'Asiento {0} descuadrado: debe={1} haber={2}': 'Journal entry {0} is unbalanced: debit={1} credit={2}',
  'Asiento {0} tiene menos de 2 líneas': 'Journal entry {0} has fewer than 2 lines',
  'Solo se puede reversar un asiento posted (estado actual: {0})':
    'Only a posted journal entry can be reversed (current status: {0})',
} as Record<string, string>;
