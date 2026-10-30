/**
 * Mensajes de las rutas m–z (miembros, interlocutores, periodos, plugins,
 * formularios públicos, web, informes, stock, almacenamiento, usuarios…) y
 * del core que esas rutas devuelven. Ver `../../index.ts`.
 */
export default {
  // ── Genéricos de estas rutas ──────────────────────────────────────────
  'No autenticado': 'Not authenticated',
  'No encontrado.': 'Not found.',
  'Error desconocido': 'Unknown error',
  'Error interno': 'Internal error',
  'Tenant requerido': 'Tenant required',
  'tenant requerido': 'Tenant required',
  'tenantId requerido': 'tenantId is required',
  'Tenant no encontrado': 'Tenant not found',
  'Tenant no encontrado.': 'Tenant not found.',
  'Falta tenant.': 'Missing tenant.',
  'Usuario no encontrado': 'User not found',
  'Requiere ADMIN o SUPERUSER.': 'Requires ADMIN or SUPERUSER.',
  'Se requiere rol ADMIN o SUPERUSER': 'ADMIN or SUPERUSER role required',
  'Solo SUPERUSER': 'SUPERUSER only',
  'Token inválido': 'Invalid token',
  'falta el archivo (campo "file")': 'Missing file ("file" field)',

  // ── mcp.ts ────────────────────────────────────────────────────────────
  'El servidor MCP requiere un token de API (Authorization: Bearer tk_...).':
    'The MCP server requires an API token (Authorization: Bearer tk_...).',
  'No se pudo resolver el tenant del token.': 'Could not resolve the tenant for this token.',
  'El token no tiene el scope "mcp:read". Añádelo en Ajustes → Tokens de API.':
    'The token lacks the "mcp:read" scope. Add it in Settings → API tokens.',
  'Error en el servidor MCP': 'MCP server error',

  // ── memberships.ts ────────────────────────────────────────────────────
  'userId requerido': 'userId is required',
  'userId y tenantId son obligatorios': 'userId and tenantId are required',
  'SUPERUSER no puede asignarse como rol de membership':
    'SUPERUSER cannot be assigned as a membership role',
  'Este usuario ya tiene acceso a esta empresa': 'This user already has access to this company',
  'Membership no encontrada': 'Membership not found',

  // ── partners.ts (+ utils/ibanValidation) ──────────────────────────────
  'Interlocutor no encontrado': 'Business partner not found',
  'El {0} no cumple el formato de {1}. Ejemplo: {2}':
    'The {0} does not match the format for {1}. Example: {2}',
  'IBAN inválido: {0}': 'Invalid IBAN: {0}',
  'vacío': 'empty',
  'caracteres no válidos': 'invalid characters',
  'país {0} desconocido': 'unknown country {0}',
  '{0} esperaba {1} chars, recibidos {2}': '{0} expected {1} chars, got {2}',
  'checksum inválido': 'invalid checksum',

  // ── Campos personalizados (core/plugins/PluginFieldManager) ───────────
  'El campo "{0}" es obligatorio.': 'Field "{0}" is required.',
  'Valor inválido para "{0}" (tipo {1}).': 'Invalid value for "{0}" (type {1}).',
  '"{0}" debe ser ≥ {1}.': '"{0}" must be ≥ {1}.',
  '"{0}" debe ser ≤ {1}.': '"{0}" must be ≤ {1}.',
  '"{0}" debe tener al menos {1} caracteres.': '"{0}" must be at least {1} characters long.',
  '"{0}" debe tener máximo {1} caracteres.': '"{0}" must be at most {1} characters long.',
  '"{0}" no respeta el patrón requerido.': '"{0}" does not match the required pattern.',
  '"{0}" ya existe. Debe ser único.': '"{0}" already exists. It must be unique.',

  // ── periods.ts (core/accounting/PeriodCloseEngine) ────────────────────
  'Período no existe': 'Period does not exist',
  'Período ya está en estado {0}': 'Period is already in status {0}',
  'Hay {0} asiento(s) en borrador dentro del período':
    'There are {0} draft journal entr(ies) in the period',
  'No hay cuenta configurada para "result" (regularización). Configura AccountMapping kind=result.':
    'No account configured for "result" (year-end closing). Configure AccountMapping kind=result.',
  'No se puede cerrar: {0}': 'Cannot close: {0}',
  'No se puede cerrar: {0}; {1}': 'Cannot close: {0}; {1}',
  'No se puede cerrar: {0}; {1}; {2}': 'Cannot close: {0}; {1}; {2}',

  // ── plugins.ts + plugins/loader + plugins/transpiler ──────────────────
  'Campo {0} registrado y aplicado.': 'Field {0} registered and applied.',
  'Plugin "{0}" no está instalado': 'Plugin "{0}" is not installed',
  'Plugin "{0}" no esta instalado': 'Plugin "{0}" is not installed',
  'No se recibio ningun archivo': 'No file received',
  'El archivo ZIP esta vacio': 'The ZIP file is empty',
  'No se pudo determinar el nombre del plugin': 'Could not determine the plugin name',
  'Plugin actualizado y recargado': 'Plugin updated and reloaded',
  'Plugin instalado pero no cargado: {0}': 'Plugin installed but not loaded: {0}',
  'su index no exporta init()': 'its index does not export init()',
  'Se requiere un array de files': 'An array of files is required',
  'Ruta no permitida: {0}': 'Path not allowed: {0}',
  'Acceso no autorizado fuera del directorio de plugins':
    'Unauthorized access outside the plugins directory',
  'Archivo de plugin no encontrado': 'Plugin file not found',
  'Plugin {0} no encontrado': 'Plugin {0} not found',
  '[Plugins] No se puede construir el contexto: la app Express aún no está lista':
    '[Plugins] Cannot build the context: the Express app is not ready yet',
  '[Plugin {0}] documents.register: docType es obligatorio':
    '[Plugin {0}] documents.register: docType is required',
  "[Plugin {0}] documents.register: el tipo '{1}' ya está registrado":
    "[Plugin {0}] documents.register: type '{1}' is already registered",
  '[Plugin {0}] documents.register: schemaTable y lineSchemaTable son obligatorios (créalas con migration.createTable + pgTable de drizzle-orm)':
    '[Plugin {0}] documents.register: schemaTable and lineSchemaTable are required (create them with migration.createTable + drizzle-orm pgTable)',
  'Esbuild no produjo salida': 'Esbuild produced no output',

  // ── profitCenters.ts ──────────────────────────────────────────────────
  'name es obligatorio': 'name is required',
  'Centro de beneficio no encontrado': 'Profit center not found',

  // ── publicForms.ts (+ core/forms) ─────────────────────────────────────
  'Este formulario no existe o ya no está disponible.':
    'This form does not exist or is no longer available.',
  'No se pudo cargar el formulario': 'Could not load the form',
  'Demasiados envíos seguidos. Prueba en unos minutos.':
    'Too many submissions in a row. Try again in a few minutes.',
  'Este formulario ya no acepta respuestas.': 'This form is no longer accepting responses.',
  'Ya respondiste. ¡Gracias!': 'You have already responded. Thank you!',
  'Correo no válido': 'Invalid email',
  'Indica tu correo': 'Enter your email',
  'Ya has respondido a este formulario.': 'You have already responded to this form.',
  'Revisa el formulario': 'Please review the form',
  'No se pudo enviar. Inténtalo de nuevo.': 'Could not submit. Please try again.',
  'Algún archivo no es válido o ha caducado; vuelve a subirlo':
    'A file is invalid or has expired; please upload it again',
  'Demasiados cambios seguidos. Prueba en unos minutos.':
    'Too many changes in a row. Try again in a few minutes.',
  'Este formulario no permite cambiar las respuestas.':
    'This form does not allow editing responses.',
  'El formulario ya está cerrado.': 'The form is already closed.',
  'No encontramos tu respuesta.': 'We could not find your response.',
  'No se pudo guardar. Inténtalo de nuevo.': 'Could not save. Please try again.',
  'Demasiadas subidas seguidas. Prueba en unos minutos.':
    'Too many uploads in a row. Try again in a few minutes.',
  'Falta el archivo': 'Missing file',
  'Pregunta no válida': 'Invalid question',
  'El formulario está cerrado': 'The form is closed',
  'El archivo supera {0} MB': 'The file exceeds {0} MB',
  'Tipo de archivo no permitido': 'File type not allowed',
  'No se pudo subir el archivo': 'Could not upload the file',
  'No se pudo cargar la imagen': 'Could not load the image',

  // ── publicSite.ts + core/website/shop ─────────────────────────────────
  'No se pudo registrar el pedido.': 'Could not place the order.',
  'Demasiados pedidos seguidos. Espera un momento.': 'Too many orders in a row. Please wait a moment.',
  'Nombre y email válidos son obligatorios.': 'A valid name and email are required.',
  'El carrito está vacío.': 'The cart is empty.',
  'Los productos del carrito ya no están disponibles.':
    'The products in the cart are no longer available.',
  'La tienda no está configurada (falta la serie de pedidos).':
    'The shop is not configured (order series missing).',
  'La tienda no está disponible ahora mismo.': 'The shop is not available right now.',

  // ── reports.ts ────────────────────────────────────────────────────────
  'accountId obligatorio': 'accountId is required',
  'Cuenta no existe': 'Account does not exist',
  'periodId obligatorio': 'periodId is required',
  'Nómina no encontrada': 'Payslip not found',
  'from y to obligatorios': 'from and to are required',

  // ── setup.ts ──────────────────────────────────────────────────────────
  'Error al comprobar el estado del sistema': 'Error checking system status',
  'Faltan credenciales de base de datos': 'Missing database credentials',
  'Conexión exitosa. Base de datos con configuración existente detectada.':
    'Connection successful. Database with existing configuration detected.',
  'Conexión exitosa. Base de datos encontrada (schema vacío).':
    'Connection successful. Database found (empty schema).',
  'Conexión exitosa. Base de datos encontrada pero sin schema public.':
    'Connection successful. Database found but without a public schema.',
  'Conexión exitosa. La base de datos se creará automáticamente.':
    'Connection successful. The database will be created automatically.',
  'No se pudo conectar a la base de datos.': 'Could not connect to the database.',
  'Contraseña incorrecta.': 'Incorrect password.',
  'El usuario no existe.': 'The user does not exist.',
  'No se pudo conectar al servidor. Verifica host y puerto.':
    'Could not connect to the server. Check host and port.',
  'El servidor rechazó la conexión. Verifica que PostgreSQL está corriendo.':
    'The server refused the connection. Check that PostgreSQL is running.',
  'Modo debug no habilitado': 'Debug mode not enabled',
  'Setup reseteado. Recarga el front para volver a ver el wizard.':
    'Setup reset. Reload the frontend to see the wizard again.',
  'Error al resetear setup': 'Error resetting setup',
  'Sistema inicializado correctamente': 'System initialized successfully',
  'Fallo en la inicialización del sistema: {0}': 'System initialization failed: {0}',

  // ── stockMovements.ts (+ core/stock/StockPoster) ──────────────────────
  'El artículo {0} se gestiona por lotes — rellena el nº de lote.':
    'Item {0} is batch-managed — enter the batch number.',
  'El artículo {0} se gestiona por número de serie — rellena la serie.':
    'Item {0} is serial-managed — enter the serial number.',
  'El artículo {0} es por serie: cada línea debe tener cantidad 1 (una línea por serial).':
    'Item {0} is serial-managed: each line must have quantity 1 (one line per serial number).',
  'La serie "{0}" ya existe — no puedes darla de alta otra vez ({1}).':
    'Serial number "{0}" already exists — you cannot register it again ({1}).',
  'La serie "{0}" no existe en el sistema — sólo puedes mover/sacar series registradas ({1}).':
    'Serial number "{0}" does not exist — you can only move/issue registered serial numbers ({1}).',
  'La serie "{0}" pertenece a otro artículo, no a {1}.':
    'Serial number "{0}" belongs to another item, not to {1}.',
  'warehouseId requerido': 'warehouseId is required',
  'Código vacío': 'Empty code',
  'Almacén origen y destino son obligatorios': 'Source and destination warehouses are required',
  'Origen y destino no pueden ser el mismo almacén':
    'Source and destination cannot be the same warehouse',
  'Añade al menos una línea': 'Add at least one line',
  'No se puede enviar desde "{0}"': 'Cannot ship from status "{0}"',
  'No se puede recibir desde "{0}"': 'Cannot receive from status "{0}"',
  'Almacén es obligatorio': 'Warehouse is required',
  'Motivo inválido: {0}': 'Invalid reason: {0}',
  'Ya posteado (status: {0})': 'Already posted (status: {0})',
  'Traspaso no encontrado': 'Transfer not found',
  'Entrada no encontrada': 'Goods receipt not found',
  'Salida no encontrada': 'Goods issue not found',

  // ── storageOAuth.ts + core/storage ────────────────────────────────────
  'Error al leer estado OAuth': 'Error reading OAuth status',
  'Proveedor inválido': 'Invalid provider',
  'No hay credenciales OAuth disponibles: configura las globales en el servidor o unas propias en esta pantalla':
    'No OAuth credentials available: configure the global ones on the server or your own on this screen',
  'Error generando URL de autorización': 'Error generating authorization URL',
  'Error al desconectar': 'Error disconnecting',
  '{0} no está conectado para este tenant': '{0} is not connected for this tenant',
  'La conexión con {0} fue revocada — vuelve a conectar en Ajustes':
    'The connection to {0} was revoked — reconnect in Settings',
  'No hay credenciales OAuth ({0}) para {1}': 'No OAuth credentials ({0}) for {1}',
  'La conexión con {0} fue revocada o caducó — vuelve a conectar en Ajustes':
    'The connection to {0} was revoked or expired — reconnect in Settings',
  'Error refrescando token de {0}: {1}': 'Error refreshing {0} token: {1}',
  'La autorización de {0} fue revocada o caducó. Vuelve a conectar la cuenta en Ajustes → Almacenamiento.':
    'The {0} authorization was revoked or expired. Reconnect the account in Settings → Storage.',
  'Google Drive no conectado — usa "Conectar" en Ajustes':
    'Google Drive not connected — use "Connect" in Settings',
  'Error al contactar con Google Drive': 'Error contacting Google Drive',
  'Conectado como {0}': 'Connected as {0}',
  '(cuenta desconocida)': '(unknown account)',
  'OneDrive no conectado — usa "Conectar" en Ajustes':
    'OneDrive not connected — use "Connect" in Settings',
  'Error al contactar con OneDrive': 'Error contacting OneDrive',
  'No escribible': 'Not writable',
  'Ruta fuera del basePath del adapter local': 'Path outside the local adapter basePath',
  'Google Drive: no se pudo abrir sesión de subida ({0}): {1}':
    'Google Drive: could not open upload session ({0}): {1}',
  'Google Drive: no se pudo abrir sesión de subida ({0}): ':
    'Google Drive: could not open upload session ({0})',
  'Google Drive: sesión resumable sin URL de subida':
    'Google Drive: resumable session without upload URL',
  'Google Drive: fallo subiendo chunk ({0}): {1}': 'Google Drive: chunk upload failed ({0}): {1}',
  'Google Drive: fallo subiendo chunk ({0}): ': 'Google Drive: chunk upload failed ({0})',
  'Google Drive: la subida resumable terminó sin respuesta final':
    'Google Drive: resumable upload ended without a final response',
  'Google Drive: no se pudo descargar el archivo ({0})':
    'Google Drive: could not download the file ({0})',
  'Google Drive: no se pudo borrar el archivo ({0}): {1}':
    'Google Drive: could not delete the file ({0}): {1}',
  'Google Drive: no se pudo borrar el archivo ({0}): ':
    'Google Drive: could not delete the file ({0})',
  'OneDrive: error resolviendo carpeta "{0}" ({1}): {2}':
    'OneDrive: error resolving folder "{0}" ({1}): {2}',
  'OneDrive: error resolviendo carpeta "{0}" ({1}): ': 'OneDrive: error resolving folder "{0}" ({1})',
  'OneDrive: no se pudo resolver la carpeta "{0}"': 'OneDrive: could not resolve folder "{0}"',
  'OneDrive: ruta de carpetas vacía': 'OneDrive: empty folder path',
  'OneDrive: sesión de subida sin uploadUrl': 'OneDrive: upload session without uploadUrl',
  'OneDrive: fallo subiendo chunk ({0}): {1}': 'OneDrive: chunk upload failed ({0}): {1}',
  'OneDrive: fallo subiendo chunk ({0}): ': 'OneDrive: chunk upload failed ({0})',
  'OneDrive: la sesión de subida terminó sin respuesta final':
    'OneDrive: upload session ended without a final response',
  'OneDrive: no se pudo descargar el archivo ({0})': 'OneDrive: could not download the file ({0})',
  'OneDrive: no se pudo borrar el archivo ({0}): {1}':
    'OneDrive: could not delete the file ({0}): {1}',
  'OneDrive: no se pudo borrar el archivo ({0}): ': 'OneDrive: could not delete the file ({0})',

  // ── system.ts ─────────────────────────────────────────────────────────
  'Error al recolectar métricas': 'Error collecting metrics',
  'Error al recolectar servicios': 'Error collecting services',

  // ── taxes.ts / tenants.ts ─────────────────────────────────────────────
  'Grupo de impuestos no encontrado': 'Tax group not found',
  'El nombre es obligatorio': 'Name is required',
  'Nombre inválido': 'Invalid name',
  'Ya existe una empresa con ese nombre': 'A company with that name already exists',

  // ── twofa.ts ──────────────────────────────────────────────────────────
  'Falta el código': 'Missing code',
  'No hay una configuración de 2FA pendiente': 'There is no pending 2FA setup',
  'Configuración de 2FA inválida, reinténtalo': 'Invalid 2FA setup, please try again',
  'Código incorrecto': 'Incorrect code',
  'El 2FA no está activo': '2FA is not enabled',

  // ── uom.ts / userModules.ts ───────────────────────────────────────────
  'Faltan campos obligatorios: Código (ej: KG) y Nombre son requeridos.':
    'Missing required fields: Code (e.g. KG) and Name are required.',
  'label requerido': 'label is required',

  // ── userProfile.ts ────────────────────────────────────────────────────
  'Nada que actualizar': 'Nothing to update',
  'solo se admiten imágenes': 'Only images are allowed',
  'Error al subir firma': 'Error uploading signature',
  'Sin firma': 'No signature',
  'Error al subir la foto': 'Error uploading photo',
  'Sin foto de perfil': 'No profile photo',

  // ── userTables.ts ─────────────────────────────────────────────────────
  'Nombre inválido. Letras/dígitos/"_", 2–41 chars.':
    'Invalid name. Letters/digits/"_", 2–41 chars.',
  'Kind debe ser master o document.': 'Kind must be master or document.',
  'La tabla "{0}" ya existe.': 'Table "{0}" already exists.',
  'Metadatos de tabla ya registrados.': 'Table metadata already registered.',

  // ── users.ts ──────────────────────────────────────────────────────────
  'Ya existe un usuario con ese email': 'A user with that email already exists',
  'Ya existe un usuario con ese nombre de usuario': 'A user with that username already exists',
  'Ya existe un registro con ese valor único': 'A record with that unique value already exists',

  // ── warehouses.ts ─────────────────────────────────────────────────────
  'Almacén no encontrado en el contexto empresarial actual.':
    'Warehouse not found in the current company.',
  '{0} ubicaciones procesadas correctamente.': '{0} bins processed successfully.',
  '{0} ubicaciones generadas correctamente.': '{0} bins generated successfully.',

  // ── webhooks.ts ───────────────────────────────────────────────────────
  'Nombre y URL son obligatorios': 'Name and URL are required',
  'URL inválida': 'Invalid URL',
  'Encolado. Mira el servicio receptor.': 'Queued. Check the receiving service.',

  // ── website.ts ────────────────────────────────────────────────────────
  'Error al obtener el site': 'Error loading the site',
  'Tarifa no encontrada': 'Price list not found',
  'Slug inválido: usa a-z, 0-9 y guiones (3-40)': 'Invalid slug: use a-z, 0-9 and hyphens (3-40)',
  'Ese slug ya está en uso': 'That slug is already in use',
  'Error al guardar el site': 'Error saving the site',
  'Error al listar hosts': 'Error listing hosts',
  "kind debe ser 'subdomain' o 'domain'": "kind must be 'subdomain' or 'domain'",
  'Hostname inválido': 'Invalid hostname',
  'Ese host ya está en uso': 'That host is already in use',
  'Error al añadir host': 'Error adding host',
  'El slug se cambia desde los ajustes del site': 'The slug is changed from the site settings',
  'Error al borrar host': 'Error deleting host',
  'Error al listar páginas': 'Error listing pages',
  'title es obligatorio': 'title is required',
  "path inválido: '/mi-pagina' (a-z, 0-9, guiones)": "Invalid path: '/my-page' (a-z, 0-9, hyphens)",
  'Ya existe una página con ese path': 'A page with that path already exists',
  'Error al crear página': 'Error creating page',
  'Página no encontrada': 'Page not found',
  'Error al obtener página': 'Error loading page',
  'La home siempre es /': 'The home page is always /',
  'path inválido': 'Invalid path',
  'Error al guardar página': 'Error saving page',
  'La página de inicio no se puede borrar': 'The home page cannot be deleted',
  'Error al borrar página': 'Error deleting page',
  'Error al publicar': 'Error publishing',
  'Error al generar preview': 'Error generating preview',
  'Solo se admiten imágenes o vídeos': 'Only images or videos are allowed',
  'Error al subir imagen': 'Error uploading image',
  'Error al listar assets': 'Error listing assets',
  'Error al actualizar el asset': 'Error updating asset',
  'Error al borrar asset': 'Error deleting asset',
  'Error al listar mensajes': 'Error listing messages',
  'Error al marcar leído': 'Error marking as read',
} as Record<string, string>;
