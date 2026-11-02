# Videollamadas: desplegarlas

Las videollamadas las sirve el propio servicio de mensajería (`apps/messaging`), sin
depender de Meet ni Teams. Hay que dar el permiso **Videollamadas** (`/messaging/calls`) a
quien vaya a usarlas; los administradores ya lo tienen.

## Lo imprescindible: HTTPS

El navegador solo da la cámara y el micro en **HTTPS** o en `localhost`. Por
`http://192.168.1.10:8080` no funcionan. Ver `docs/seguridad-datos.md`, sección HTTPS.

En una red local sin dominio, Caddy usa su propia autoridad de certificación: hay que
instalarla en cada equipo o aceptar el aviso del navegador.

## Según dónde esté instalado

Todo el audio y vídeo va por un solo puerto UDP (`MESSAGING_RTC_PORT`, 3478 por defecto).

| Instalación | Qué hacer |
| --- | --- |
| **Servidor en internet** | `MESSAGING_RTC_PUBLIC_IP=<ip pública>` y abrir el puerto UDP en el cortafuegos |
| **Red de la empresa, sin Docker** | Nada: se anuncia la IP local detectada. Solo funciona dentro de la oficina |
| **Red de la empresa, con Docker** | `MESSAGING_RTC_PUBLIC_IP=<ip del servidor en la red>`: dentro del contenedor no se puede detectar |
| **Red de la empresa, con gente de fuera** | IP pública en `MESSAGING_RTC_PUBLIC_IP` y redirigir el puerto UDP en el router |

Solo se anuncia una dirección. Con la IP pública, los de dentro de la oficina también
pasan por ella, y eso exige que el router admita volver a entrar por su propia IP
(*hairpin NAT*). Si no lo admite, hace falta TURN o elegir una de las dos redes.

Para comprobarlo: **Mensajes → Canales → Videollamadas** muestra qué dirección se anuncia y
si hay TURN.

## Si alguien no puede conectar: TURN

Algunas redes de empresa bloquean UDP. Entonces la llamada avisa de que no pudo conectar.
TURN hace de intermediario, a costa de más tráfico por el servidor:

1. En el `.env`:
   ```sh
   MESSAGING_TURN_URL=turn:erp.tuempresa.com:3479?transport=udp
   MESSAGING_TURN_SECRET=<un valor largo y aleatorio>
   ```
2. `docker compose --profile turn up -d`
3. Abre `3479` (UDP y TCP) y `49160-49200` (UDP).

Las credenciales son temporales: el servicio las firma para cada persona, y duran una hora.

## Cuánta capacidad hace falta

El servidor reenvía sin decodificar, así que lo que limita es la **subida**, no la CPU.
Cada persona recibe a todas las demás. Orientativo, sin medir aún en producción:

| Personas | Subida del servidor |
| --- | --- |
| 2 | 1-3 Mbit/s |
| 5 | 10-20 Mbit/s |
| 15 | 50-150 Mbit/s |

A quien le falte ancho de banda se le envía una capa de menos calidad. El límite por
llamada es `MESSAGING_RTC_MAX_PEERS` (15).

## Invitar a gente de fuera

Quien está en una llamada (o quien organiza una reunión de Keirost) crea un enlace
`/join/<token>`. Quien lo abre pone su nombre, prueba cámara y micro, y espera a que alguien
del equipo dentro de la llamada le deje pasar.

- Ve solo la llamada y su chat: ni conversaciones, ni el ERP, ni la lista de la empresa.
- El enlace de una llamada muere con ella; el de una reunión vale hasta que termine (mínimo
  24 h). Se pueden revocar. Del token solo se guarda el hash.
- Si sale todo el equipo, la llamada termina también para los invitados.
- Para gente de fuera de la oficina, el vídeo tiene que ser alcanzable desde internet: IP
  pública y puerto UDP abierto, además de HTTPS. Una instalación solo de oficina no sirve.
- `/rt/guest/ws` es la única ruta del servicio sin ticket. Si Keirost está en internet,
  queda expuesta: tiene límite de personas esperando por conversación y de mensajes, pero
  no por IP. Si hace falta frenar por IP, se hace en el proxy.

## El chat de la llamada

Es propio de la llamada, no el de la conversación: lo ven los que están dentro, invitados
incluidos, y **no se guarda**: se borra al terminar.

## Qué no hace

- Sin grabación: nada de vídeo o audio se guarda.
- Las conversaciones con clientes de Telegram no admiten llamada.
- Una sola réplica del servicio: todas las llamadas viven en ese proceso. Al reiniciarlo se
  cortan, y las llamadas que quedaron abiertas se cierran solas.
