# Integración de lectores de fichaje · protocolo v1

El firmware ESP32/RC522 se desarrolla en otro repositorio. Este contrato describe únicamente su comunicación con la plataforma. No requiere usuario ERP ni acceso a la base de datos.

## Preparación

1. En **Empleados**, abrir la ficha de una persona y asignar el UID de su tarjeta en «Identificación para fichar».
2. En **Kioscos → Lectores de tarjetas**, crear un lector. Elegir modo independiente o vincularlo a un kiosco activo.
3. Guardar el token que se muestra una sola vez y configurar URL de servidor, empresa y token en el firmware. Rotarlo si se pierde. Desactivar un lector impide inmediatamente nuevas peticiones.

Todas las llamadas utilizan HTTPS con validación del certificado, salvo simulaciones locales en localhost. La fecha oficial es la del servidor. No enviar registros offline ni fechas anteriores. El UID identifica una tarjeta; no proporciona protección anticlonación.

Cabeceras (los valores siguientes son ficticios):

```http
x-tenant-id: empresa-de-prueba
x-device-token: TOKEN_DEL_LECTOR_NO_DEL_KIOSCO
Content-Type: application/json
```

El prefijo de las rutas es `/api/hr/timeclock/terminal/v1`. No enviar simultáneamente token de kiosco y de dispositivo. El cuerpo no puede superar 2048 caracteres.

## Configuración y último contacto

`GET /device/config`

```json
{
  "protocolVersion": 1,
  "deviceId": "lector-1",
  "mode": "paired",
  "kioskId": "kiosco-1"
}
```

Consultar al iniciar y cada 60 segundos para recibir cambios de modo/vínculo y actualizar el último contacto. `standalone` devuelve `kioskId: null`. Un `401` exige corregir la configuración o consultar al administrador.

## Lector vinculado a pantalla

`POST /device/readings`

```json
{
  "requestId": "19ab38e5-2a83-40dc-882d-2c72e29c158c",
  "uid": "04A1B2C3"
}
```

```json
{
  "readingId": "identificacion-opaca",
  "status": "awaiting_confirmation",
  "expiresAt": "2026-09-24T10:00:30.000Z",
  "replayed": false
}
```

HTTP **202 significa identificación pendiente**, no fichaje realizado. El empleado elige la acción en la pantalla. La identificación dura 30 segundos y no se renueva al repetir la petición. Si el kiosco atiende a otra persona se recibe `409 KIOSK_BUSY`.

## Lector independiente

`POST /device/punch`

```json
{
  "requestId": "3292d1a0-e415-4e75-af8f-13e572438dc7",
  "uid": "04A1B2C3",
  "kind": "in"
}
```

Acciones: `in` entrada, `out` salida, `break_start` iniciar pausa, `break_end` volver. El firmware debe ofrecer una selección explícita. No deducir entrada/salida alternando cada lectura. Sin acción, `400 ACTION_REQUIRED`.

HTTP 200 devuelve `entry` (registro con `id`, `employeeId`, `kind`, `at` y trazabilidad), `state`, `allowedActions`, `replayed`. Encender la señal de fichaje realizado **solo después de esta respuesta**. `state` es `closed`, `working` u `on_break`.

## Identificadores y reintentos

- Crear UUID nuevo para cada intención física del empleado. Mantener el mismo UUID y cuerpo exacto si se pierde la respuesta o se recibe un error temporal.
- Repetir una petición confirmada devuelve el mismo registro con `replayed: true`, incluso si pasaron menos de cinco segundos. Cambiar el contenido con el mismo UUID devuelve `409 REQUEST_CONFLICT`.
- Conservar la petición pendiente ante un corte de conexión durante un reintento inmediato. No convertirla en una cola de fichajes offline ni reenviarla automáticamente después de 24 horas.
- Aplicar antirrebote local y exigir retirar la tarjeta antes de crear otra intención. El servidor también rechaza fichajes de una persona separados por menos de cinco segundos.
- La plataforma aplica límite de operaciones por terminal. Respetar `Retry-After` cuando se recibe `429`. Para errores de red/503, reintentar con espera creciente acotada; nunca anunciar éxito por un timeout.
- No registrar ni transmitir token/UID/QR a servicios externos. No incorporar secretos en URL, firmware publicado o mensajes de diagnóstico.

## Errores

Formato: `{ "code": "...", "error": "Mensaje para la persona", "retryable": false }`.

| HTTP | Código                             | Acción del cliente                                       |
| ---- | ---------------------------------- | -------------------------------------------------------- |
| 400  | `INVALID_INPUT`, `ACTION_REQUIRED` | Corregir entrada o solicitar acción                      |
| 401  | `TERMINAL_UNAUTHORIZED`            | Revisar empresa, token y activación                      |
| 403  | `WRONG_TERMINAL_MODE`              | Consultar configuración; usar la ruta correspondiente    |
| 403  | `EMPLOYEE_INACTIVE`                | Consultar al responsable                                 |
| 404  | `CREDENTIAL_NOT_RECOGNIZED`        | Tarjeta no reconocida, revocada o empleado no disponible |
| 409  | `INVALID_TRANSITION`               | La acción no corresponde al estado actual                |
| 409  | `REQUEST_CONFLICT`                 | No reutilizar UUID con un contenido distinto             |
| 409  | `KIOSK_BUSY`                       | Esperar a que la pantalla quede libre                    |
| 410  | `IDENTIFICATION_EXPIRED`           | Identificarse de nuevo en el kiosco                      |
| 429  | `TOO_SOON`, `RATE_LIMITED`         | Respetar `Retry-After`                                   |
| 503  | `TEMPORARILY_UNAVAILABLE`          | Reintentar la misma solicitud                            |

## API del kiosco web

Utiliza `x-kiosk-token` en lugar de `x-device-token`, con la misma cabecera de empresa. No permite listar empleados o fichajes.

| Ruta                               | Función                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /kiosk/identify`             | `{requestId, method: 'pin' o 'qr', value}` → identidad temporal, nombre, estado, acciones y caducidad |
| `GET /kiosk/identification`        | Identidad activa propia o HTTP 204; consultar cada segundo mientras esté visible                      |
| `POST /kiosk/punch`                | `{requestId, identificationId, kind}` → fichaje confirmado                                            |
| `DELETE /kiosk/identification/:id` | Cancelar la identificación propia                                                                     |

El QR usa `ofc:timeclock:v1:<token-aleatorio>` y puede mostrarse desde «Mis fichajes → Mi QR» o imprimirse. Para emitir QR, el servidor necesita `CONFIG_ENC_KEY` de 32 bytes en hexadecimal, conservada de forma segura con las copias. Cambiarla sin migrar los secretos impide mostrar QR ya emitidos. La plataforma reutiliza el cifrado de configuración existente.

## Simulador y prueba física

Desde `apps/server`, configurar `TIMECLOCK_BASE_URL`, `TIMECLOCK_TENANT_ID`, `TIMECLOCK_DEVICE_TOKEN` y `TIMECLOCK_TEST_UID` en el entorno. Ejecutar:

```powershell
npx ts-node --transpile-only src/scripts/simulate-timeclock-device.ts config
npx ts-node --transpile-only src/scripts/simulate-timeclock-device.ts read
npx ts-node --transpile-only src/scripts/simulate-timeclock-device.ts punch in --request-id 3292d1a0-e415-4e75-af8f-13e572438dc7
```

Repetir el último comando debe devolver el mismo evento. Probar ambos modos, tarjeta desconocida, desactivación, doble lectura y pérdida de respuesta. En modo vinculado, confirmar que otra pantalla no recibe la identidad.

El repositorio del firmware se encarga del RC522, configuración de pines, Wi-Fi, certificado, protección del token, selección de acción y señalización. No se prescribe cableado sin conocer el modelo concreto de placa. Una prueba del simulador no sustituye la prueba física con ESP32.

## Verificación de plataforma

`npm test --workspace=@openfactu/server` ejecuta pruebas unitarias; la integración PostgreSQL se activa al definir `TIMECLOCK_TEST_DATABASE_URL` con una base desechable cuyo nombre contenga `timeclock_test`. También puede ejecutarse `npx ts-node --transpile-only src/scripts/check-timeclock.ts` desde `apps/server`. Cada ejecución crea y elimina únicamente su esquema de pruebas.

La migración `072_timeclock_credentials_devices` es aditiva y la aplica `MigrationManager` a las empresas. Para volver al código anterior, conservar las tablas/columnas nuevas; no eliminar fichajes durante la reversión.
