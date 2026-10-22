# Verificación de fichajes multicanal

Comprobación realizada el 24 de septiembre de 2026 en la rama `feature/fichajes-rfcid`.

## Plataforma

- Suite de servidor: **145 pruebas correctas, 0 fallos, 0 omitidas**.
- Compilación del servidor y comprobación de tipos y compilación de web correctas. Vite conserva el aviso de paquetes grandes.
- Integración sobre PostgreSQL 15 desechable, con dos esquemas de empresa reales. No se han utilizado datos de producción.
- Revisión independiente del código y segunda revisión de las correcciones: sin hallazgos pendientes en las correcciones revisadas.
- ESLint correcto en componentes nuevos, ficha/listado de empleados, kiosco y hook de identificación. `Kiosks.tsx` y `Timeclock.tsx` conservan avisos de lint anteriores a este trabajo, contrastados con HEAD.

## Casos comprobados

| Comportamiento            | Evidencia                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PIN sin sesión ERP        | Petición HTTP con token de kiosco registra; listados protegidos siguen rechazando ese token.                                                                         |
| Empresas aisladas         | Tokens cruzados rechazados; empleado con el mismo ID en dos esquemas registra únicamente en su empresa.                                                              |
| Web, QR y tarjeta         | Entrada web, pausa por QR, vuelta web y salida RFID forman una sola jornada. Se conserva método, kiosco y lector.                                                    |
| Reintentos y concurrencia | Peticiones simultáneas insertan una vez; repetir UUID devuelve el mismo evento; cambiar UID o acción produce conflicto. Renombrar el lector no rompe el reintento.   |
| Identificación temporal   | Leer no ficha. Caducidad, revocación y kiosco distinto impiden confirmar. Desactivar y reactivar un lector no revive la identificación.                              |
| Continuidad de jornada    | Cruzar medianoche conserva el estado dentro de la ventana existente de 24 horas.                                                                                     |
| PIN duplicado             | Identificación ambigua rechazada y asignación administrativa duplicada revertida.                                                                                    |
| Consultas de kiosco       | Once kioscos consultan 60 veces cada uno desde la misma dirección sin agotarse mutuamente el límite.                                                                 |
| Simulador externo         | Ejecutado por HTTP: configuración 200, fichaje independiente 200, repetición con mismo evento y lectura vinculada 202.                                               |
| Interfaz                  | Ficha de empleado con estructura de artículo, QR compacto, tarjetas bajo demanda y alta en móvil. Dos fichajes consecutivos desde la interfaz personal sin recargar. |
| Cámara                    | Estados de apertura revisados visualmente; funcionamiento de la cámara confirmado por el usuario.                                                                    |

## Preparación y alcance

La migración de empresa es `072_timeclock_credentials_devices.sql`. La emisión de QR requiere `CONFIG_ENC_KEY`, usando el mecanismo de cifrado existente. Consulta [el protocolo y el simulador](timeclock-device-v1.md) para preparar un lector.

El firmware, cableado, elección física de acción y prueba con el ESP32/RC522 real corresponden al otro repositorio. El simulador no acredita esa integración física. No se han añadido políticas de autorización de teletrabajo.
