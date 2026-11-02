# Seguridad de los datos en producción

Qué protege cada capa, qué hay que hacer al desplegar y qué no está cubierto.

## Resumen

| Capa | Protege de | Cómo se activa |
| --- | --- | --- |
| HTTPS (Caddy) | Espiar el tráfico | `docker compose --profile https up -d` |
| Puertos cerrados | Conexiones directas a Postgres, ERP y monitoreo | Por defecto (`BIND_ADDR=127.0.0.1`) |
| Mensajes cifrados | Filtración de la base de datos | `MESSAGING_DATA_KEY` |
| Copias cifradas | Robo de una copia | `BACKUP_ENC_KEY` |
| Disco cifrado | Robo del disco o del servidor apagado | En el sistema operativo (ver abajo) |

**No es cifrado de extremo a extremo.** El servidor tiene las claves: quien administre
el servidor con él en marcha puede leer los mensajes. En Telegram, además, los mensajes
pasan por los servidores de Telegram. Lo correcto es decir "cifrado en tránsito y en
reposo".

Las videollamadas van cifradas en tránsito (DTLS/SRTP) y no se guardan, pero tampoco son
de extremo a extremo: el servidor de vídeo reenvía el medio y técnicamente podría verlo.

Sigue legible en la base de datos: quién habla con quién y cuándo, títulos de grupo,
nombres de contactos y las reacciones. Los adjuntos dependen del almacenamiento de cada
empresa (disco local, Google Drive, OneDrive).

## Claves

Genera cada una por separado:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable | Para qué | Si se pierde |
| --- | --- | --- |
| `MESSAGING_DATA_KEY` | Abre la clave de cada empresa | **Se pierden todos los mensajes** |
| `BACKUP_ENC_KEY` | Cifra las copias | **Las copias no se pueden restaurar** |
| `MESSAGING_TICKET_SECRET` | Firma tickets y protege tokens de bots | Se vuelven a pegar los tokens de bot |

Guárdalas **fuera del servidor y fuera de las copias**, en un gestor de contraseñas de la
empresa y con al menos dos personas con acceso. Una clave guardada junto a lo que protege
no protege nada.

- Sin `MESSAGING_DATA_KEY`, en producción el servicio no arranca. En desarrollo usa una
  clave fija del código.
- Si la clave no es la que cifró los datos, el servicio no arranca, y no escribe nada.
- **Pasar de la clave de desarrollo a una propia deja ilegibles los datos ya cifrados:**
  defínela antes del primer arranque con esta versión. No hay rotación de clave todavía.
- Sin `BACKUP_ENC_KEY`, las copias salen sin cifrar y en producción se avisa a la empresa.

## HTTPS

1. Apunta el DNS del dominio al servidor y abre los puertos 80 y 443.
2. En el `.env`: `KEIROST_DOMAIN=erp.tuempresa.com` y `WEB_BIND=127.0.0.1`.
3. `docker compose --profile https up -d`.

Caddy obtiene y renueva el certificado solo. Pon también
`OAUTH_REDIRECT_BASE_URL=https://erp.tuempresa.com`, y actualiza los `redirect_uri` en
Google y Microsoft si cambian.

La web ya no se construye apuntando a `http://localhost:3000`: si tenías un
`VITE_API_URL` propio en el `.env`, revísalo y reconstruye la imagen de `web`.

## Puertos

Postgres, el ERP, Ollama, pgAdmin, Grafana, Prometheus y Portainer solo aceptan
conexiones desde la propia máquina. Para administrarlos desde fuera usa un túnel SSH:

```sh
ssh -L 3001:localhost:3001 usuario@servidor
```

`BIND_ADDR=0.0.0.0` los vuelve a abrir. No lo uses en un servidor expuesto. Cambia además
la contraseña por defecto de Postgres (`POSTGRES_PASSWORD`).

## Copias de seguridad

Cada copia incluye los datos de la empresa y sus mensajes, y se guarda como `.zip.enc`.
Las copias `.zip` antiguas se siguen pudiendo restaurar, pero **no llevan mensajes**.

- Si la mensajería está caída durante una copia, la copia se hace sin mensajes y se avisa.
- Al restaurar se crea una empresa nueva. Los bots de Telegram no viajan en la copia: hay
  que volver a conectarlos en Mensajes → Canales.
- **Prueba a restaurar una copia de vez en cuando.** Una copia sin probar no es una copia.

## Disco

No se hace desde Keirost, sino en el sistema operativo y antes de instalar:

- **Linux:** LUKS (la opción de cifrar el disco del instalador de Ubuntu o Debian). En la
  nube, activa el cifrado de volumen del proveedor.
- **Windows:** BitLocker.

Con LUKS hay que introducir la clave al arrancar, o usar desbloqueo automático por TPM o
red. Guarda la clave de recuperación junto con las demás.
