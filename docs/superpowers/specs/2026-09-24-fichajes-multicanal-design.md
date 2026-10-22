# Fichajes con móvil, kiosco, QR y lector RFID

Fecha: 2026-09-24. Rama existente: `feature/fichajes-rfcid`.
Documento de diseño que acompaña al plan solicitado; no supone que la implementación esté realizada.

## Objetivo y alcance acordado

Un empleado registra entrada, salida, inicio de pausa y vuelta de pausa desde móvil/web o kiosco. En el kiosco se identifica con PIN, QR personal o tarjeta leída por un ESP32 con RC522. El ESP32 también puede funcionar de forma independiente.

El firmware del ESP32 vive en **otro repositorio**. Este repositorio implementa únicamente plataforma, interfaz web, API de dispositivos, simulador de integración y documentación del protocolo. No incluye firmware, cableado, PlatformIO ni aprovisionamiento del Wi-Fi.

Las condiciones para permitir teletrabajo o fichaje remoto pertenecen a otro módulo. Esta entrega conserva la autenticación y los permisos existentes, sin añadir políticas de ubicación, geocercas, comprobación de Wi-Fi ni permisos nuevos de teletrabajo. No debe afirmarse que una ubicación aportada por el navegador verifica presencia física.

## Decisiones propuestas para ejecutar el plan

Estas decisiones completan los detalles técnicos que no se concretaron en conversación:

1. Móvil/web reutiliza `Timeclock.tsx`; no se crea una aplicación nativa ni un portal de empleado separado.
2. En kiosco, identificar y confirmar son pasos distintos. Leer tarjeta/QR no registra automáticamente una entrada o salida.
3. El dispositivo tiene modo `paired` (identifica en un kiosco concreto) o `standalone` (solicita un fichaje con una acción explícita). No se implementa alternancia automática. La forma física de elegir la acción en el dispositivo corresponde al otro repositorio. Sin acción, el servidor responde `ACTION_REQUIRED` y no escribe un fichaje.
4. QR personal persistente y revocable, utilizable en pantalla o impreso. No es un enlace de inicio de sesión ni contiene DNI, nombre, PIN o identificador de empleado. El QR es una credencial transferible; esta versión no promete impedir que se comparta o fotografíe.
5. La identificación RFID se basa en el UID normalizado. No se presenta como prueba criptográfica de identidad ni como mecanismo anticlonación.
6. Primera versión conectada: solo se muestra éxito tras confirmación del servidor. Se admiten reintentos de una misma petición, pero no fichajes diferidos de horas anteriores ni sincronización de una cola offline.
7. Las lecturas de un lector vinculado se entregan al kiosco mediante consulta periódica autenticada cada segundo mientras está visible. No se utiliza el WebSocket general de empresa para transmitir identidades o credenciales.

## Situación real del repositorio

- `apps/server/src/api/hr/timeclock.ts` reúne fichaje web y kiosco, estado y exportación. La comprobación del estado y la inserción no están protegidas por una transacción común. El antirrebote actual es de cinco segundos.
- El cálculo actual reconstruye una ventana móvil de 24 horas. Se conserva esa semántica en esta entrega y se prueba que cruzar medianoche no reinicia el estado. Cambiar la política de jornadas superiores a 24 horas requiere otro alcance.
- `TimeclockKiosk` guarda token, nombre y ubicación; `Employee.kioskPin` es la identificación existente. No hay tarjetas ni dispositivos RFID.
- `server.ts` monta toda la API de fichajes con `mountApi`, cuyo middleware exige usuario. Esto contradice el acceso del kiosco mediante token: se debe separar el montaje de rutas de terminal sin abrir las rutas de administración.
- Ya existen `qrcode` en servidor y `@zxing/browser` en web. `BarcodeCameraModal` depende de `ScannerProvider`, que no envuelve la ruta pública `/kiosk`.
- Hay pruebas con `node:test` y script `npm test` en servidor, aunque AGENTS.md indique que no existe infraestructura. El web tiene `typecheck` separado de `build`.

## Modelo de datos

Todas las tablas nuevas son **por empresa**, mediante migración de tenant `072_timeclock_credentials_devices.sql` (verificar que el número sigue libre al implementar).

| Tabla                         | Contenido y restricciones                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TimeclockCredential`         | `id`, `employeeId`, `kind` (`rfid`/`qr`), `secretHash`, `secretEncrypted` solo para QR, `label`, `createdAt`, `revokedAt`. Índice único parcial `(kind, secretHash)` donde `revokedAt IS NULL`; un solo QR activo por empleado. UID validado, sin eliminar caracteres arbitrarios para convertir entradas inválidas en válidas. |
| `TimeclockDevice`             | `id`, `name`, `location`, `tokenHash`, `mode`, `kioskId` nullable, `isActive`, `lastSeenAt`, `createdAt`. `paired` exige un kiosco existente y activo de la misma empresa; `standalone` exige `kioskId = NULL`. Token aleatorio mostrado solo al crear/rotar.                                                                   |
| `TimeclockIdentification`     | `id` aleatorio opaco, `kioskId`, `deviceId` nullable, `employeeId`, `credentialId` nullable para PIN, `method`, `expiresAt`, `consumedAt`, `cancelledAt`. Validez de 30 segundos. Un kiosco no acepta otra identificación mientras tenga una vigente. Consumir, cancelar y expirar liberan el kiosco.                           |
| `TimeclockRequest`            | `id`, `actorKey`, `requestId`, `payloadHash`, `responseJson`, `createdAt`, `expiresAt`. Único `(actorKey, requestId)`. Recibo persistente para lecturas y fichajes confirmados, ligado a su respuesta. Retención mínima de 24 horas.                                                                                            |
| `TimeclockEntry` (ampliación) | `method` nullable (`account`/`pin`/`qr`/`rfid`), `kioskId` nullable, `deviceId` nullable. Mantener `source: web/kiosk/admin` y `device` como descripción histórica para compatibilidad. RFID independiente utiliza `source=kiosk`, `method=rfid`, `deviceId` y `kioskId=null`.                                                  |

Tokens/QR aleatorios de 32 bytes. Hash SHA-256 para búsqueda; QR cifrado para poder volver a mostrarlo al propietario usando el cifrado existente con clave configurada. Exigir `CONFIG_ENC_KEY` válido al activar la emisión de QR; no utilizar el fallback fijo de desarrollo para nuevas credenciales. La clave debe conservarse en el despliegue y las copias de seguridad. El hash de un UID no lo convierte en secreto fuerte.

Desactivar dispositivos/credenciales, sin borrar registros históricos. Cambiar la vinculación, revocar una credencial o desactivar el kiosco invalida identificaciones pendientes. Eliminar kioscos mediante la operación existente se rechaza con `409` si hay lectores vinculados activos; los identificadores históricos se conservan mediante referencias anulables y la descripción `device`.

## Contratos y separación de acceso

- Sesión de usuario: fichar solo para el empleado vinculado a `req.user.id`, activo y perteneciente a la empresa. No aceptar `employeeId` del cuerpo como autoridad.
- Administración: gestión de credenciales bajo `/hr/employees` y dispositivos bajo `/hr/kiosks`, con permisos de escritura/lectura según operación. Listados de credenciales nunca devuelven PIN, UID completo, QR ni secretos del dispositivo.
- Terminal: rutas explícitas con autenticación propia, separadas de la API de usuario. Exigir `x-tenant-id` válido; nunca aceptar el fallback a `public` que utiliza el middleware general. Resolver empresa en base de datos y autenticar el token dentro de esa empresa.
- Kiosco: conservar `x-kiosk-token` y el enlace de configuración actual. No otorgar acceso a listados de empleados ni al historial completo.
- ESP32: `x-device-token` propio, distinto del token del kiosco. No necesita usuario ERP ni token de administrador. Rotación/desactivación efectivas en cada llamada.
- Identificaciones: solo nombre visible, estado y acciones permitidas. Un identificador opaco no sirve sin el token del kiosco correspondiente. Revalidar empleado, credencial y dispositivo al confirmar.
- Respuestas sensibles con `Cache-Control: no-store`. No incluir credenciales en URL, logs, auditoría o mensajes de error. El enlace heredado de configuración del kiosco sigue siendo compatible; retirar sus parámetros sensibles del navegador después de guardarlos para la sesión.
- Intentos inválidos de identificación: límite por terminal y empresa, y límite previo por origen para tokens inválidos; `429` con `Retry-After`. Definir en la implementación contadores acotados con expiración, sin introducir Redis en esta entrega.

## Integridad y experiencia

Una sola función de fichaje valida estado, antirrebote, idempotencia y escritura dentro de una transacción. Bloquear primero el recibo de petición; cuando corresponda, kiosco, dispositivo, empleado, credencial e identificación, en ese orden compartido con administración. Dos dispositivos no pueden producir dos entradas concurrentes para una persona. Una repetición de la misma petición devuelve el registro original antes de evaluar el antirrebote; reutilizar el identificador con otro contenido devuelve `409`.

En móvil y kiosco se muestran las acciones válidas recibidas del servidor. Si el estado cambió desde otra pantalla, `409` refresca el estado. Cerrar, cancelar, expirar o confirmar borra la identidad visible del kiosco. Una lectura nueva nunca sustituye silenciosamente a la persona que está confirmando.

PIN sigue disponible: si varios empleados activos comparten PIN, rechazar identificación ambigua y pedir corrección administrativa; no escoger el primero. Impedir nuevos PIN duplicados en las operaciones de empleados y comprobar la ambigüedad siempre al identificar, para cubrir datos antiguos y otras vías de escritura.

## Fuera de alcance

Firmware y flasheo; diseño eléctrico y botones; turnos, nóminas y cálculo laboral; geolocalización obligatoria; reconocimiento facial; fichajes offline; nueva app móvil; nuevos permisos de trabajo remoto; rotación automática temporal del QR; cambios generales del WebSocket o del sistema de permisos.

## Aceptación

1. Un empleado ficha desde móvil, se identifica por tarjeta en kiosco e inicia una pausa, y vuelve desde web; todos los eventos pertenecen a la misma persona y estado.
2. QR impreso o en móvil identifica sin sesión ERP en el kiosco y exige confirmación de acción.
3. Un simulador externo usando solo el contrato documentado puede identificar en un kiosco vinculado y registrar una acción explícita en modo independiente.
4. Peticiones repetidas, escaneos mantenidos y concurrencia móvil/lector no duplican eventos.
5. Tokens de otra empresa, dispositivos desactivados, QR revocado, empleados inactivos y sesiones caducadas no permiten fichar.
6. PIN, fichaje web y exportaciones existentes siguen funcionando; registros históricos muestran método desconocido cuando no consta.
7. No hay cambios de firmware ni políticas de teletrabajo en esta rama.
