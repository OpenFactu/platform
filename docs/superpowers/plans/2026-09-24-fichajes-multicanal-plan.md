# Fichajes multicanal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ejecutar en la rama existente; este documento no ordena comenzar la implementación.

**Goal:** Permitir fichar desde móvil/web y kiosco con PIN, QR o tarjeta RFID, integrando lectores ESP32 cuyo firmware reside en otro repositorio.

**Architecture:** Una lógica transaccional de fichaje compartida, credenciales de empleado revocables y autenticación específica de terminales. El lector vinculado entrega identificaciones a un kiosco; el independiente envía acciones explícitas. La web reutiliza las páginas de RRHH y la infraestructura QR existente.

**Tech Stack:** Express, TypeScript, Drizzle, PostgreSQL, React 19, componentes `@openfactu/ui`, `qrcode`, `@zxing/browser` y pruebas existentes `node:test`.

**Spec:** [Diseño y alcance](../specs/2026-09-24-fichajes-multicanal-design.md).

## Global Constraints

- Rama existente: `feature/fichajes-rfcid`; no crear otra rama ni worktree para redactar o ejecutar este plan salvo petición posterior.
- El firmware del ESP32 vive en **otro repositorio**. Este repositorio implementa únicamente plataforma, interfaz web, API de dispositivos, simulador de integración y documentación del protocolo. No incluye firmware, cableado, PlatformIO ni aprovisionamiento del Wi-Fi.
- Las condiciones para permitir teletrabajo o fichaje remoto pertenecen a otro módulo.
- Primera versión conectada: solo se muestra éxito tras confirmación del servidor.
- No se implementa alternancia automática. Sin acción, el servidor responde `ACTION_REQUIRED` y no escribe un fichaje.
- Todas las tablas nuevas son por empresa. Conservar PIN, eventos históricos y las respuestas existentes mediante ampliaciones compatibles.
- Reutilizar dependencias existentes; no crear `packages/` locales, añadir un servidor de mensajes ni incorporar un framework de pruebas web para esta entrega.
- Conservar la ventana actual de estado de 24 horas y el antirrebote de cinco segundos. La nueva idempotencia se evalúa antes del antirrebote.
- Diseño y plan contienen propuestas técnicas, no una afirmación de implementación ni una elección del hardware de interacción.

## Review Focus

1. Dos canales fichan a la vez o se pierde la respuesta: exactamente un evento por petición y ninguna transición duplicada (tareas 2 y 9).
2. Tenant inexistente o token de otro terminal: rechazo sin caer en `public` ni revelar empleados (tareas 3 y 9).
3. Caduca/revoca una identificación mientras la persona confirma: rechazo, limpieza de pantalla y ningún fichaje (tareas 4 y 7).
4. Cámara denegada, QR ajeno al sistema o escaneo continuo: mensaje comprensible y PIN disponible; liberar cámara al salir (tareas 7 y 9).
5. PIN histórico duplicado, fichajes anteriores a la migración o cruce de medianoche: no atribuir un fichaje a otra persona ni reiniciar una jornada por cambio de fecha (tareas 1, 2 y 5).

## Orden y entregables

`1 Datos → 2 Motor → 3 Acceso/contrato → 4 Identificación → 5 Gestión → 6 Móvil → 7 Kiosco → 8 Integración externa → 9 Verificación`.

Entregas verificables: motor compatible (1–2), API utilizable por simulador (3–4), plataforma completa (5–7), contrato externo y validación integral (8–9). Los cambios de firmware no son requisito para verificar las rutas con el simulador; la aceptación física sí requiere coordinar el otro repositorio.

## Mapa de archivos

Las rutas siguientes son relativas a la raíz del repositorio. Archivos nuevos y sus responsabilidades:

| Archivo/directorio nuevo                                                       | Responsabilidad                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `apps/server/src/core/tenant/migrations/072_timeclock_credentials_devices.sql` | Cambios aditivos por empresa                            |
| `apps/server/src/core/hr/timeclockTypes.ts`                                    | Tipos y contratos del dominio                           |
| `apps/server/src/core/hr/timeclockState.ts`                                    | Estado y acciones válidas, sin HTTP                     |
| `apps/server/src/core/hr/timeclockService.ts`                                  | Transacción y creación idempotente de fichajes          |
| `apps/server/src/core/hr/timeclockCredentials.ts`                              | Normalización, emisión, resolución y revocación         |
| `apps/server/src/core/hr/timeclockTerminals.ts`                                | Autenticación y configuración de terminales             |
| `apps/server/src/core/hr/timeclockIdentifications.ts`                          | Identificación temporal y confirmación en kiosco        |
| `apps/server/src/api/hr/timeclockTerminal.ts`                                  | Router autenticado con token de kiosco/dispositivo      |
| `apps/server/src/api/hr/timeclockCredentials.ts`                               | Gestión administrativa de credenciales                  |
| `apps/server/src/api/hr/timeclockDevices.ts`                                   | Gestión administrativa de lectores                      |
| `apps/server/src/core/hr/__tests__/`                                           | Pruebas de estado, credenciales, acceso y contratos     |
| `apps/server/src/scripts/check-timeclock.ts`                                   | Integración transaccional en tenants de prueba          |
| `apps/server/src/scripts/simulate-timeclock-device.ts`                         | Cliente HTTP externo sin acceso a base de datos         |
| `apps/web/src/modules/hr/api/timeclockTerminalApi.ts`                          | API del kiosco sin sesión de usuario                    |
| `apps/web/src/modules/hr/components/TimeclockActions.tsx`                      | Acciones accesibles compartidas                         |
| `apps/web/src/modules/hr/components/EmployeeCredentials.tsx`                   | Tarjetas y QR de un empleado                            |
| `apps/web/src/modules/hr/components/TimeclockDevices.tsx`                      | Gestión de lectores y vínculos                          |
| `apps/web/src/modules/hr/components/KioskQrScanner.tsx`                        | Lectura QR de kiosco sin dependencia de ScannerProvider |
| `apps/web/src/modules/hr/hooks/useKioskIdentification.ts`                      | Ciclo de identificación, consulta y limpieza            |
| `docs/integrations/timeclock-device-v1.md`                                     | Contrato versionado para el repositorio del firmware    |

Modificar los archivos existentes citados en cada tarea. No extraer ni reorganizar módulos ajenos a fichajes.

## Contratos comunes del plan

Añadir en `timeclockTypes.ts` y reflejar en `apps/web/src/modules/hr/domain/timeclock.ts`:

```ts
export type PunchKind = 'in' | 'out' | 'break_start' | 'break_end';
export type WorkState = 'closed' | 'working' | 'on_break';
export type PunchMethod = 'account' | 'pin' | 'qr' | 'rfid';
export type DeviceMode = 'paired' | 'standalone';
export type IdentificationInput =
  | { method: 'pin'; value: string }
  | { method: 'qr'; value: string }
  | { method: 'rfid'; value: string };
export interface PunchResult {
  entry: { id: string; employeeId: string; kind: PunchKind; at: string };
  state: WorkState;
  allowedActions: PunchKind[];
  replayed: boolean;
}
export interface IdentificationView {
  identificationId: string;
  employeeName: string;
  state: WorkState;
  allowedActions: PunchKind[];
  expiresAt: string;
}
```

En las rutas antiguas de `/punch` y `/kiosk/punch`, mantener los campos del evento al nivel superior y añadir `state`, `allowedActions` y `replayed`; no sustituir la respuesta antigua por el nuevo envoltorio `entry`. La API de terminal nueva utiliza `PunchResult`.

## Tarea 1: Persistencia compatible

**Archivos:** crear migración y `timeclockTypes.ts`; modificar `apps/server/src/db/schema.ts`; crear `apps/server/src/scripts/check-timeclock.ts`.

**Interfaces:** produce las cinco tablas/extensiones del diseño. No cambia `Employee.kioskPin` ni `TimeclockEntry.source`.

- [ ] Inspeccionar la última migración y reservar el siguiente número si `072` ya existe. Leer el diseño, ambos `package.json` y `AGENTS.md` antes de ejecutar.
- [ ] Crear un script de integración que solo trabaje sobre dos tenants temporales con prefijo `timeclock_test_` y una base indicada explícitamente por `TIMECLOCK_TEST_DATABASE_URL`. Debe rehusar ejecutarse si falta esa variable; no llamar a sincronización global. Registrar los identificadores creados y limpiarlos en `finally` mediante las APIs de tenant existentes.
- [ ] Antes de añadir la migración, comprobar en esos tenants la ausencia de las tablas nuevas y preparar aserciones de columnas, índices y conservación de un fichaje y PIN preexistentes.
- [ ] Escribir SQL aditivo con `{{schema}}`, FKs e índices. Patrón para credenciales activas:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "TimeclockCredential_active_value"
ON "{{schema}}"."TimeclockCredential" ("kind", "secretHash")
WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "TimeclockCredential_active_qr"
ON "{{schema}}"."TimeclockCredential" ("employeeId")
WHERE "revokedAt" IS NULL AND "kind" = 'qr';
```

- [ ] Reflejar columnas y restricciones en Drizzle. Agregar índice `(employeeId, at)` al historial e índices `(kioskId, expiresAt)` a identificaciones y `(actorKey, requestId)` único a recibos. La exclusión de identificaciones simultáneas se resuelve bloqueando la fila del kiosco, no mediante un índice dependiente de la hora actual.
- [ ] Ejecutar migración dos veces y comprobar que PIN/fichajes históricos sobreviven, que duplicar credencial activa falla y que otro tenant sí puede tener el mismo UID.
- [ ] Documentar reversión: desplegar código anterior dejando columnas y tablas aditivas; no eliminar fichajes ni secretos como parte de un rollback automático. Commit sugerido: `feat(hr): add timeclock credentials and devices schema`.

## Tarea 2: Motor único y transaccional

**Archivos:** crear `timeclockState.ts`, `timeclockService.ts` y `__tests__/timeclockState.test.ts`; modificar `apps/server/src/api/hr/timeclock.ts` y el script de integración.

**Interfaces:** `getWorkState(client, employeeId, now): Promise<WorkState>`, `allowedActions(state): PunchKind[]`, `createPunch(client, input): Promise<PunchResult>`. `input` lleva empleado resuelto por servidor, actor autenticado, método, acción, `requestId`, datos opcionales existentes y referencias de terminal/identificación.

- [ ] Extraer el algoritmo existente sin cambiar su ventana de 24 horas y preparar prueba roja:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedActions, reduceWorkState } from '../timeclockState';
test('pausa solo admite volver', () => {
  assert.deepEqual(allowedActions('on_break'), ['break_end']);
  assert.equal(reduceWorkState(['in', 'break_start', 'break_end']), 'working');
});
test('eventos históricos inválidos no bloquean al empleado', () => {
  assert.equal(reduceWorkState(['out', 'in', 'in']), 'working');
});
```

- [ ] Ejecutar desde `apps/server`: `node --require ts-node/register/transpile-only --test src/core/hr/__tests__/timeclockState.test.ts`. Debe fallar por el módulo aún ausente, después pasar con la extracción.
- [ ] Implementar `createPunch` con transacción, bloqueo por `(actorKey, requestId)` y después bloqueo de empleado. Consultar recibo, validar contenido y repetir respuesta original antes de estado/antirrebote. Usar `pg_advisory_xact_lock` con claves que incluyan tenant/actor; nunca un candado solo en memoria.
- [ ] Ordenar historial por `at` e `id`; validar empleado activo dentro de la transacción. Insertar evento y recibo en el mismo commit. `requestId` UUID en API nueva; rutas antiguas lo admiten opcionalmente para compatibilidad, generándolo si falta.
- [ ] Añadir pruebas de base real: dos entradas concurrentes con IDs distintos dejan una fila; mismo ID y cuerpo devuelve el mismo `entry.id`; mismo ID y cuerpo distinto da `409`; salida a menos de cinco segundos se rechaza; entrada antes de medianoche permite salida después dentro de 24 horas.
- [ ] Sustituir la lógica duplicada de rutas existentes por este servicio, manteniendo sus respuestas. No reescribir informes, resumen ni escritura de plugins en esta tarea. Commit sugerido: `feat(hr): make timeclock punches atomic and idempotent`.

## Tarea 3: Acceso de terminales y contrato HTTP

**Archivos:** crear `timeclockTerminals.ts`, `api/hr/timeclockTerminal.ts`, `__tests__/timeclockTerminalAuth.test.ts` y `docs/integrations/timeclock-device-v1.md`; modificar `apps/server/src/server.ts` y el montaje de la ruta kiosco antigua.

**Interfaces:** prefijo nuevo `/api/hr/timeclock/terminal/v1`. Autenticación con `x-tenant-id` y exactamente una credencial `x-kiosk-token` o `x-device-token`. Rechazar mezcla ambigua. Resolver tenant explícitamente; no confiar en `req.tenantClient` si el middleware general recurrió a `public`.

- [ ] Preparar una app Express de prueba con los mismos montajes y una base temporal. Reproducir que el kiosco antiguo sin JWT recibe `401` antes de llegar a su autenticación propia.
- [ ] Montar router de terminal con `mountPublic` y middleware propio **antes** del montaje genérico de fichajes. Separar un adaptador de la ruta antigua `/api/hr/timeclock/kiosk/punch` con el mismo tratamiento. `mountPublic` significa aquí acceso sin sesión ERP, no ausencia de autenticación de terminal.
- [ ] Hacer que rutas no reconocidas del router de terminal terminen en `404` dentro de ese router. No dejar que un prefijo autorizado permita caer a otras rutas. Conservar `mountApi` en el resto de fichajes y gestión.
- [ ] Probar tabla de acceso: sin token `401`; tenant desconocido `401`; token de A usado en B `401`; dispositivo desactivado `401`; token de kiosco en ruta solo de dispositivo `403`; terminal intentando leer `/entries` `401/403`. Ninguna respuesta incluye datos personales.
- [ ] Introducir los siguientes contratos documentados. No cambiar `/terminal/v1` cuando se publique el firmware sin una nueva versión:

| Método/ruta relativa               | Actor                  | Entrada/salida                                                                         |
| ---------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `GET /device/config`               | dispositivo            | `deviceId`, `mode`, `kioskId`, `protocolVersion: 1`; actualiza `lastSeenAt`            |
| `POST /device/readings`            | dispositivo paired     | `{ requestId, uid }` → `202 { readingId, status: 'awaiting_confirmation', expiresAt }` |
| `POST /device/punch`               | dispositivo standalone | `{ requestId, uid, kind }` → `200 PunchResult`                                         |
| `POST /kiosk/identify`             | kiosco                 | `{ requestId, method: 'pin'                                                            | 'qr', value }`→`IdentificationView` |
| `GET /kiosk/identification`        | kiosco                 | identificación activa o `204`                                                          |
| `DELETE /kiosk/identification/:id` | kiosco propietario     | cancela y responde `204`                                                               |
| `POST /kiosk/punch`                | kiosco propietario     | `{ requestId, identificationId, kind }` → `200 PunchResult`                            |

- [ ] Uniformar error `{ code, error, retryable }`: `400 INVALID_INPUT/ACTION_REQUIRED`, `401 TERMINAL_UNAUTHORIZED`, `403 WRONG_TERMINAL_MODE`, `404 CREDENTIAL_NOT_RECOGNIZED`, `409 INVALID_TRANSITION/REQUEST_CONFLICT/KIOSK_BUSY`, `410 IDENTIFICATION_EXPIRED`, `429 TOO_SOON/RATE_LIMITED`, `503 TEMPORARILY_UNAVAILABLE`. Credencial revocada y desconocida comparten error genérico.
- [ ] Documentar HTTPS, hora oficial del servidor, límites y reintentos: mismo UUID y cuerpo tras fallo de red/5xx; respetar `Retry-After`; no generar ID nuevo al reintentar; no reenviar automáticamente una operación tras 24 horas. Commit sugerido: `feat(hr): authenticate timeclock terminal routes`.

## Tarea 4: Credenciales e identificaciones temporales

**Archivos:** crear `timeclockCredentials.ts`, `timeclockIdentifications.ts`, `__tests__/timeclockCredentials.test.ts`; completar router de terminal, servicio y pruebas de integración.

**Interfaces:** `normalizeRfidUid(value): string`; `resolveCredential(client, input)` devuelve empleado activo y referencia de credencial, sin secretos; `identifyForKiosk(...)` devuelve `IdentificationView`; `confirmIdentification(...)` consume la identificación dentro del fichaje atómico.

- [ ] Escribir y ejecutar prueba roja de normalización:

```ts
test('normaliza UID y rechaza texto arbitrario', () => {
  assert.equal(normalizeRfidUid('04:a1:b2:c3'), '04A1B2C3');
  assert.throws(() => normalizeRfidUid('texto-04A1B2C3'));
  assert.throws(() => normalizeRfidUid('04A1'));
});
```

- [ ] Admitir UID hexadecimal de 4, 7 o 10 bytes, continuo o pares separados consistentemente por espacio o `:`. Rechazar el resto antes de consultar. Limitar entrada QR a 256 caracteres y formato `ofc:timeclock:v1:<token-base64url>` con token de 32 bytes.
- [ ] Generar QR con `crypto.randomBytes(32)` y la dependencia `qrcode` local; guardar hash y copia cifrada, nunca QR mediante un servicio externo. Comprobar clave de cifrado válida antes de emitir. Normalización, tokens y errores no deben aparecer en auditoría ni logs.
- [ ] Resolver PIN con consulta que detecte múltiples empleados activos. Cero o varios resultados no identifican a nadie. Revalidar estado activo en todos los métodos.
- [ ] Al crear identificación, bloquear kiosco; expirar pendientes vencidos; si ya existe uno vigente, devolver `KIOSK_BUSY`. Idempotencia de lecturas devuelve la misma identificación y no reinicia sus 30 segundos.
- [ ] Al confirmar, bloquear en el orden del servicio y verificar propiedad, caducidad, revocación y vínculo actual. Fichaje, consumo y recibo comparten transacción. Una nueva petición con identificación consumida da conflicto; el reintento original devuelve el resultado guardado.
- [ ] Probar revocación entre lectura y confirmación, cambio de kiosco del lector, doble lectura, cancelación y PIN duplicado. Implementar expiración lógica en cada operación y purga acotada de identificaciones vencidas/recibos mayores de 24 horas, sin borrar eventos.
- [ ] Implementar límites por terminal/origen y respuestas `no-store`. Commit sugerido: `feat(hr): resolve timeclock credentials and kiosk sessions`.

## Tarea 5: Gestión de tarjetas, QR y lectores

**Archivos:** crear routers administrativos `timeclockCredentials.ts` y `timeclockDevices.ts`; modificar `server.ts`, `api/hr/employees.ts`, `api/hr/kiosks.ts`, `pages/Employees.tsx`, `pages/Kiosks.tsx`, `domain/employee.ts`, `domain/kiosk.ts` y sus clientes API; crear `EmployeeCredentials.tsx`, `TimeclockDevices.tsx` y pruebas de credenciales.

**Interfaces:** `/api/hr/timeclock-credentials` con permiso `/hr/employees`; `/api/hr/timeclock-devices` con permiso `/hr/kiosks`. Operaciones POST que revelan QR exigen lectura explícita mediante `requirePermission(path, 'read')`, no escritura inferida accidentalmente por el verbo.

- [ ] Definir operaciones: listar metadatos por empleado; asignar tarjeta `{employeeId, uid, label}`; emitir/regenerar QR; revelar QR vigente solo a administrador autorizado o propietario mediante su ruta personal; revocar por ID. Listados nunca devuelven `secretHash/secretEncrypted` ni el QR.
- [ ] Probar asignación de una tarjeta activa a dos empleados (`409`), revocación seguida de reasignación y regeneración que invalida inmediatamente el QR anterior. Regenerar y revocar dentro de transacción, serializando por empleado.
- [ ] Implementar CRUD de lectores con `name`, `location`, `mode`, `kioskId`, `isActive`; creación/rotación devuelve token una vez. La edición normal nunca devuelve el token. Registrar `lastSeenAt` sin afirmar conexión permanente.
- [ ] Revalidar vínculo de kiosco en servidor y bloquear eliminación incompatible. Añadir validación de PIN único para altas/cambios de empleados; serializar por PIN para cerrar la carrera entre dos asignaciones. La resolución sigue detectando ambigüedad de datos históricos.
- [ ] Añadir panel de credenciales en empleado con etiqueta de tarjeta, alta por UID obtenido por el lector externo, revocación, visualización/descarga del QR y regeneración. No añadir un asistente de enrolamiento inalámbrico en esta versión.
- [ ] Añadir sección Lectores en Kioscos: crear, copiar configuración, elegir modo, vincular, desactivar y rotar token. Patrón visual: componentes publicados `@openfactu/ui` y estilos de las páginas existentes.
- [ ] Verificar manualmente con usuario sin permisos que no puede gestionar dispositivos ni credenciales, incluso llamando a API. Commit sugerido: `feat(hr): manage employee credentials and RFID readers`.

## Tarea 6: Fichaje personal desde móvil/web

**Archivos:** modificar `api/hr/timeclock.ts`, `pages/Timeclock.tsx`, `api/timeclockApi.ts`, `domain/timeclock.ts`; crear `components/TimeclockActions.tsx`.

**Interfaces:** `/me` añade `state`, `allowedActions` y un empleado reducido a datos necesarios; `/me/qr` devuelve el QR activo al propietario autenticado, sin emitirlo o regenerarlo implícitamente. Mantener las rutas actuales y sus permisos.

- [ ] Añadir comprobaciones de API: un usuario no puede fichar como otro enviando `employeeId`; sin empleado activo obtiene `403`; QR inexistente devuelve `404` con mensaje para solicitarlo al responsable.
- [ ] Crear acciones compartidas con contrato concreto:

```tsx
type Props = {
  allowedActions: Array<'in' | 'out' | 'break_start' | 'break_end'>;
  busy: boolean;
  onPunch: (kind: Props['allowedActions'][number]) => void;
};
```

- [ ] Enviar UUID generado una vez por intención de fichaje; mantenerlo si hay fallo de red y la persona reintenta la misma acción. Deshabilitar durante envío y refrescar estado tras éxito o conflicto. Evitar peticiones superpuestas al cambiar usuario/empresa.
- [ ] Mostrar estado actual, acciones disponibles, últimos fichajes y botón «Mi QR». Solicitar el QR únicamente al abrirlo; borrarlo de memoria al cerrar/cambiar sesión. No guardarlo en cachés persistentes.
- [ ] Mantener el comportamiento de geolocalización opcional existente sin convertirlo en requisito ni indicador de autorización. No incorporar reglas de teletrabajo.
- [ ] Verificar a 360 px y escritorio: controles accesibles, sin desplazamiento horizontal y sin que el historial o la vista administrativa oculten el fichaje personal. Commit sugerido: `feat(hr): improve personal timeclock and employee QR`.

## Tarea 7: Kiosco con PIN, QR y tarjeta

**Archivos:** modificar `pages/KioskMode.tsx`; crear `api/timeclockTerminalApi.ts`, `components/KioskQrScanner.tsx`, `hooks/useKioskIdentification.ts`; reutilizar `TimeclockActions.tsx`.

**Interfaces:** el hook expone estado `idle | identifying | identified | submitting | success | error`, identificación vigente, `identify`, `confirm`, `cancel`. Todas las llamadas utilizan `auth:false` y cabeceras del kiosco, nunca el JWT de un usuario que pudiera estar abierto en ese navegador.

- [ ] Implementar lectura de configuración desde enlace actual, guardarla solo para la sesión y retirar token de la URL con `history.replaceState`. Falta de configuración muestra un mensaje orientado al encargado; no imprime el secreto.
- [ ] Presentar pantalla inicial con «Acerca tu tarjeta», «Mostrar QR» y «Usar PIN». PIN/QR llaman a identify; tarjeta llega por consulta autenticada del kiosco cada segundo, con una única petición en vuelo. Cancelar petición/timer al desmontar y pausar cuando la pestaña no está visible.
- [ ] Implementar cámara reutilizando la importación perezosa de `@zxing/browser` ya instalada. Tomar como referencia `BarcodeCameraModal`, pero no importarlo directamente: `/kiosk` no tiene `ScannerProvider`. Usar callback local y liberar controles y pistas de vídeo incluso si la inicialización termina después de cerrar.
- [ ] Rechazar QR de otro formato antes de enviarlo. Congelar nuevas lecturas durante identificación/confirmación. Ofrecer PIN cuando no hay cámara o permiso; no abrir enlaces contenidos en QR.
- [ ] Mostrar nombre, estado y acciones válidas tras identificación. Respetar `expiresAt` del servidor, cancelar al pulsar volver y limpiar identidad tras 30 segundos o respuesta `410`. Después de éxito, mostrar confirmación durante tres segundos y volver al inicio sin datos personales.
- [ ] Probar manualmente: dos personas seguidas, mantener tarjeta/QR, PIN equivocado, cancelar, expiración mientras se pulsa, respuesta tardía tras cancelar, cámara denegada y fallo de red. Descartar respuestas de una identificación anterior mediante contador de generación o cancelación.
- [ ] Verificar teclado, foco visible y anuncio de resultado con `aria-live`; no depender solo del color. Commit sugerido: `feat(hr): support PIN QR and RFID in kiosk`.

## Tarea 8: Contrato para el repositorio ESP32 y simulador

**Archivos:** completar `docs/integrations/timeclock-device-v1.md`; crear `apps/server/src/scripts/simulate-timeclock-device.ts`; pruebas HTTP dentro de `check-timeclock.ts`.

**Interfaces:** el simulador consume solo HTTP con `TIMECLOCK_BASE_URL`, `TIMECLOCK_TENANT_ID`, `TIMECLOCK_DEVICE_TOKEN`, `TIMECLOCK_TEST_UID`. No importa servicios internos, no usa credenciales de administrador y no modifica el otro repositorio.

- [ ] Documentar configuración, modos, cabeceras, cuerpos, límites, códigos de error, política de reintentos y comprobación de certificado HTTPS. Incluir ejemplos de éxito, identificación pendiente, rechazo y repetición idempotente con secretos ficticios claramente marcados.
- [ ] Fijar ejemplo independiente, sin seleccionar acción automáticamente:

```json
{
  "requestId": "19ab38e5-2a83-40dc-882d-2c72e29c158c",
  "uid": "04A1B2C3",
  "kind": "in"
}
```

- [ ] Implementar comandos del simulador `config`, `read`, `punch in`, `punch out`, `punch break_start`, `punch break_end`; opción `--request-id` para repetir exactamente una solicitud. Mostrar resultado y código, nunca token ni cabeceras completas.
- [ ] Probar lector paired: `read` devuelve pendiente y no crea fichaje; kiosco correcto muestra identificación; otro kiosco no la ve; confirmar crea un único evento. El `202` no debe interpretarse en firmware como fichaje registrado.
- [ ] Probar standalone: acción explícita registra; falta de acción devuelve `ACTION_REQUIRED`; petición de lectura propia de paired devuelve `WRONG_TERMINAL_MODE`. Mismo requestId repetido devuelve mismo evento.
- [ ] Añadir sección «Responsabilidades del otro repositorio»: lectura RC522, selección física de acción, retirada de tarjeta/antirrebote local, UUID por intención, conexión, protección del token y señal de éxito solo tras respuesta confirmada. No proporcionar pines o compilación para una placa ESP32 cuyo modelo no se ha concretado.
- [ ] Documentar que la integración física requiere ejecutar los mismos casos con el firmware externo; el simulador no acredita funcionamiento del hardware. Commit sugerido: `docs(hr): define timeclock device protocol and simulator`.

## Tarea 9: Verificación integral, exportación y entrega

**Archivos:** completar `check-timeclock.ts` y pruebas de `core/hr/__tests__`; modificar exportación en `api/hr/timeclock.ts`, `pages/Timeclock.tsx` y tipos asociados; actualizar documentación de integración.

- [ ] Añadir campos de método, kiosco y lector a JSON/CSV/XLSX como columnas adicionales, conservando nombres y orden relativo de columnas anteriores. Históricos con método nulo muestran «No registrado», sin inventar dispositivo ni método.
- [ ] Ejecutar casos del diseño en dos tenants temporales: flujo móvil→tarjeta→pausa→web, QR válido/revocado, empleado desactivado, tokens cruzados, PIN duplicado, caducidad, concurrencia, pérdida de respuesta y cambio de vínculo del lector. Salida no cero ante cualquier aserción fallida.
- [ ] Asegurar que fixture de fichajes separados en el tiempo usa reloj inyectable o tiempos de fixture controlados; no añadir esperas de cinco segundos a cada prueba. Las pruebas de bloqueo y recibos deben ir contra PostgreSQL real, no solo mocks.
- [ ] Ejecutar desde raíz:

```powershell
npm test --workspace=@openfactu/server
npm run build --workspace=@openfactu/server
npm run typecheck --workspace=@openfactu/web
npm run build --workspace=@openfactu/web
```

- [ ] Ejecutar integración desde `apps/server` con variable de base de pruebas ya configurada: `npx ts-node --transpile-only src/scripts/check-timeclock.ts`. Si falta esa base, informar expresamente que no se verificaron transacciones reales; no usar producción como sustituto.
- [ ] Ejecutar ESLint sobre archivos web modificados y Prettier sobre archivos cambiados compatibles. Comparar fallos existentes con la base de la rama antes de atribuirlos a esta entrega; no arreglar módulos ajenos.
- [ ] Verificar UI en móvil y kiosco con servidor de desarrollo HTTPS existente (`npm run dev:https --workspace=@openfactu/web`), especialmente permiso/cierre de cámara y borrado de identidad.
- [ ] Registrar resultado de cada criterio de aceptación y límites de la prueba física. Revisar diff para confirmar ausencia de firmware, secretos, políticas de teletrabajo y cambios ajenos. Commit sugerido: `test(hr): verify multichannel timeclock integration`.

## Condición de finalización

El trabajo de plataforma termina cuando los siete criterios del diseño están cubiertos por pruebas y comprobación visual, el simulador funciona usando únicamente el contrato publicado y los controles existentes conservan su comportamiento. La prueba con el ESP32 real se registra por separado como verificación coordinada con el repositorio del firmware; no se declara realizada por tener el simulador en verde.

## Revisión del plan

- Alcance solicitado cubierto: móvil, kiosco, PIN, QR, RC522 conectado al ESP32, modo independiente y vinculado.
- Firmware separado y autorizaciones de teletrabajo excluidas explícitamente.
- Decisión física del modo independiente no inventada: contrato exige acción, hardware la elige en el otro proyecto.
- Reutilización comprobada de páginas, dependencias QR, permisos, migraciones y pruebas existentes.
- Integridad, aislamiento por empresa, caducidad y compatibilidad tienen tareas y verificaciones asignadas.
- Implementación de plataforma realizada el 24/09/2026. Resultado y alcance de verificación en [timeclock-verification.md](../../integrations/timeclock-verification.md).

## Estado de ejecución

Las tareas de plataforma 1–9 están implementadas: migración, motor transaccional, autenticación de terminales, credenciales, administración, fichaje personal, kiosco, protocolo/simulador y exportación. Las listas anteriores conservan los pasos del plan original; la evidencia final se registra en el informe de verificación enlazado.

Durante la ejecución el usuario pidió sustituir la edición de personal por el patrón de artículos: listado separado, alta guiada y ficha propia por empleado. También se reorganizó el QR y las tarjetas y se mejoraron los estados de cámara, guía de encuadre y alternativa por PIN. El usuario confirmó que la cámara funciona.

La prueba física del ESP32 sigue correspondiendo al repositorio externo. Los cambios se mantienen en la rama existente, sin publicar ni fusionar.
