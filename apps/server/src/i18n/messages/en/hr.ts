/** Mensajes de RR. HH. (empleados, nóminas, turnos, fichajes, kioscos). Ver `../../index.ts`. */
export default {
  // ── Maestros ──
  'Convenio no encontrado': 'Collective agreement not found',
  'code y name son obligatorios': 'code and name are required',
  'code y name obligatorios': 'code and name are required',
  'name obligatorio': 'name is required',
  'name es obligatorio': 'name is required',
  'from y to obligatorios': 'from and to are required',
  'Contrato no encontrado': 'Contract not found',
  'employeeId y startDate son obligatorios': 'employeeId and startDate are required',
  'Empleado no encontrado': 'Employee not found',
  'Empleado no encontrado.': 'Employee not found.',
  'firstName y lastName son obligatorios': 'firstName and lastName are required',
  'status inválido': 'Invalid status',
  'IBAN inválido: {0}': 'Invalid IBAN: {0}',
  'No encontrada': 'Not found',

  // ── Evaluaciones ──
  'name, startDate y endDate son obligatorios': 'name, startDate and endDate are required',
  'Ciclo no encontrado': 'Cycle not found',
  'Evaluación no encontrada': 'Evaluation not found',
  'cycleId y employeeId son obligatorios': 'cycleId and employeeId are required',
  'scores debe ser array': 'scores must be an array',
  'No hay puntuaciones': 'There are no scores',
  'employeeId y title obligatorios': 'employeeId and title are required',

  // ── Incidencias ──
  'employeeId, incidentTypeId y startAt son obligatorios':
    'employeeId, incidentTypeId and startAt are required',
  'Incidencia no encontrada': 'Incident not found',
  'Empleado original no encontrado': 'Original employee not found',
  'substituteEmployeeId obligatorio': 'substituteEmployeeId is required',

  // ── Nóminas ──
  'Nómina no encontrada': 'Payslip not found',
  'Concepto no encontrado': 'Concept not found',
  'code, name y kind son obligatorios': 'code, name and kind are required',
  'kind inválido: {0}': 'Invalid kind: {0}',
  'calculation inválido: {0}': 'Invalid calculation: {0}',
  'employeeId, periodYear y periodMonth son obligatorios':
    'employeeId, periodYear and periodMonth are required',
  'Ya existe una nómina para este empleado en {0}/{1}.':
    'A payslip already exists for this employee in {0}/{1}.',
  'Ya existe una nómina para este empleado en ese periodo.':
    'A payslip already exists for this employee in that period.',
  'Solo se pueden editar nóminas en borrador': 'Only draft payslips can be edited',
  'type inválido ({0})': 'Invalid type ({0})',
  'type inválido': 'Invalid type',
  'concept o conceptId obligatorio': 'concept or conceptId is required',
  'Línea no encontrada': 'Line not found',
  'Solo se pueden aprobar nóminas en borrador': 'Only draft payslips can be approved',
  'No hay período contable abierto para asentar la nómina':
    'There is no open accounting period to post the payslip',
  'No se pudo generar asiento: {0}': 'Could not generate journal entry: {0}',
  'Solo se pueden eliminar nóminas en borrador': 'Only draft payslips can be deleted',

  // ── Turnos y tareas ──
  'employeeId, date, startAt y endAt son obligatorios':
    'employeeId, date, startAt and endAt are required',
  'employeeId y validFrom obligatorios': 'employeeId and validFrom are required',
  'Patrón no encontrado': 'Pattern not found',
  'code, name, startTime y endTime son obligatorios':
    'code, name, startTime and endTime are required',
  'Tarea no encontrada': 'Task not found',
  'title obligatorio': 'title is required',
  'predecessorId obligatorio': 'predecessorId is required',
  'body obligatorio': 'body is required',

  // ── Kioscos ──
  'Kiosco no encontrado.': 'Kiosk not found.',
  'No se pudo cargar el aspecto del kiosco.': 'Could not load the kiosk appearance.',
  'Aspecto inválido.': 'Invalid appearance.',
  'No se pudo guardar el aspecto del kiosco.': 'Could not save the kiosk appearance.',
  'Este kiosco tiene lectores vinculados o fichajes. Desactívalo para conservar su historial.':
    'This kiosk has linked readers or time entries. Deactivate it to keep its history.',
  'Selecciona un color de fondo válido.': 'Select a valid background color.',
  'La bienvenida debe tener entre 1 y 120 caracteres.':
    'The welcome message must be between 1 and 120 characters.',
  'La opción de sonido no es válida.': 'The sound option is not valid.',
  'La imagen es demasiado grande. Vuelve a seleccionarla.':
    'The image is too large. Please select it again.',
  'Usa una imagen PNG, JPG o WebP.': 'Use a PNG, JPG or WebP image.',
  'El archivo no contiene una imagen válida.': 'The file does not contain a valid image.',
  'Tarjeta no reconocida. Consulta al responsable.': 'Card not recognized. Ask your manager.',
  'El empleado no está activo. Consulta al responsable.':
    'The employee is not active. Ask your manager.',
  'La pantalla está ocupada. Espera a que termine la otra persona.':
    'The screen is busy. Wait for the other person to finish.',
  'No se ha podido leer la tarjeta. Vuelve a intentarlo.': 'Could not read the card. Try again.',
  'Demasiadas lecturas. Espera unos segundos.': 'Too many reads. Wait a few seconds.',

  // ── Fichaje ──
  'Acción inválida.': 'Invalid action.',
  'No hay un empleado activo vinculado a tu usuario.':
    'There is no active employee linked to your user.',
  'No hay un empleado activo vinculado.': 'There is no active employee linked.',
  'No hay empleado vinculado a tu usuario': 'There is no employee linked to your user',
  'employeeId, from y to obligatorios': 'employeeId, from and to are required',
  'Empleado obligatorio.': 'Employee is required.',
  'Empleado y etiqueta válidos requeridos.': 'A valid employee and label are required.',
  'Credencial no encontrada.': 'Credential not found.',
  'Lector no encontrado.': 'Reader not found.',
  'Activa el lector antes de actualizarlo.': 'Activate the reader before updating it.',
  'Nombre obligatorio, máximo 100 caracteres.': 'Name is required, maximum 100 characters.',
  'Selecciona el modo del lector.': 'Select the reader mode.',
  'Ubicación inválida.': 'Invalid location.',
  'Estado inválido.': 'Invalid status.',
  'Selecciona un kiosco activo de esta empresa.': 'Select an active kiosk of this company.',
  'Selecciona una acción de fichaje.': 'Select a time entry action.',
  'Petición de terminal inválida.': 'Invalid terminal request.',
  'Este terminal no puede realizar esta operación.': 'This terminal cannot perform this operation.',
  'Esta actualización no está pendiente para este lector.':
    'This update is not pending for this reader.',
  'El lector no está vinculado a un kiosco.': 'The reader is not linked to a kiosk.',
  'Confirma la acción en el kiosco vinculado.': 'Confirm the action on the linked kiosk.',
  'La tarjeta ha cambiado.': 'The card has changed.',
  'Método inválido.': 'Invalid method.',
  'El PIN ha cambiado.': 'The PIN has changed.',
  'Ruta de terminal no encontrada.': 'Terminal route not found.',
  'Versión de firmware incompatible.': 'Incompatible firmware version.',
  'Archivo de firmware inválido.': 'Invalid firmware file.',
  'La descarga del firmware no supera la comprobación de integridad.':
    'The firmware download failed the integrity check.',
  'No se puede descargar la versión publicada en GitHub.':
    'The version published on GitHub cannot be downloaded.',
  'Descarga demasiado grande.': 'Download too large.',
  'Versión inválida.': 'Invalid version.',
  'La versión descargada no coincide.': 'The downloaded version does not match.',
  'Archivo de firmware no encontrado.': 'Firmware file not found.',
  'Hay una versión nueva. Vuelve a consultar las actualizaciones.':
    'A new version is available. Check for updates again.',
  'Primero actualiza este lector por USB para habilitar Wi-Fi.':
    'First update this reader via USB to enable Wi-Fi.',
  'El lector ya tiene esta versión o una posterior.':
    'The reader already has this version or a later one.',
  'El lector ya tiene una actualización pendiente.': 'The reader already has a pending update.',
  'UID de tarjeta inválido.': 'Invalid card UID.',
  'Este QR no es una credencial de fichaje.': 'This QR code is not a time clock credential.',
  'QR inválido.': 'Invalid QR code.',
  'Introduce un PIN de 4 a 8 dígitos.': 'Enter a 4 to 8 digit PIN.',
  'No se reconoce la credencial. Consulta con tu responsable.':
    'Credential not recognized. Ask your manager.',
  'No se reconoce la credencial.': 'Credential not recognized.',
  'El PIN debe tener entre 4 y 8 dígitos.': 'The PIN must be between 4 and 8 digits.',
  'Este PIN ya está asignado a otro empleado activo.':
    'This PIN is already assigned to another active employee.',
  'Tipo de credencial inválido.': 'Invalid credential type.',
  'Configura CONFIG_ENC_KEY en el servidor para emitir códigos QR.':
    'Configure CONFIG_ENC_KEY on the server to issue QR codes.',
  'Todavía no tienes un QR asignado. Solicítalo a tu responsable.':
    'You do not have a QR code assigned yet. Ask your manager for one.',
  'Kiosco no autorizado.': 'Kiosk not authorized.',
  'El kiosco está atendiendo a otra persona.': 'The kiosk is serving another person.',
  'La credencial ha cambiado.': 'The credential has changed.',
  'Identificación no encontrada.': 'Identification not found.',
  'El lector ya no está vinculado a este kiosco.': 'The reader is no longer linked to this kiosk.',
  'Identificación caducada. Identifícate de nuevo.':
    'Identification expired. Identify yourself again.',
  'Esta petición ya se utilizó con otros datos.': 'This request was already used with other data.',
  'El empleado no está activo.': 'The employee is not active.',
  'El estado ha cambiado o esta acción no está disponible. Actualiza e inténtalo de nuevo.':
    'The status has changed or this action is not available. Refresh and try again.',
  'Acabas de fichar. Espera cinco segundos.': 'You just clocked. Wait five seconds.',
  'Coordenadas inválidas.': 'Invalid coordinates.',
  'Demasiadas solicitudes. Espera un minuto.': 'Too many requests. Wait a minute.',
  'Terminal no autorizado.': 'Terminal not authorized.',
  'La configuración del lector ha cambiado.': 'The reader configuration has changed.',
  'Esta credencial ya está asignada.': 'This credential is already assigned.',
  'No se pudo completar la operación. Inténtalo de nuevo.':
    'The operation could not be completed. Try again.',
  'Identificador de petición inválido.': 'Invalid request identifier.',
} as Record<string, string>;
