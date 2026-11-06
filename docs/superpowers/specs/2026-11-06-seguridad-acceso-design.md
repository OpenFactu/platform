# Seguridad del acceso y formas de entrar

Fecha: 2026-11-06 · Rama: `feature/seguridad-acceso`

## Por qué

Hoy se entra a Keirost con usuario o email y contraseña, más un TOTP opcional. El servidor
devuelve un JWT de 24 h que la web guarda en `localStorage`. Esto tiene varios huecos:

- **Un token no se puede cortar.** Cerrar sesión solo lo borra del navegador. Cambiar la
  contraseña no echa a quien ya estaba dentro, y no hay forma de ver desde dónde se ha entrado.
- **El login no tiene freno.** No hay límite de intentos ni en la contraseña, ni en el 2FA, ni
  en la recuperación. Encima, el 2FA se verifica reenviando la contraseña cada vez, así que
  se puede probar el código de 6 cifras sin límite.
- **Un código TOTP vale dos veces** dentro de su ventana de 30 s.
- **Solo hay una manera de entrar.** No hay passkeys, ni código por correo, ni Google o
  Microsoft.

El objetivo es cerrar esos huecos y abrir puertas nuevas que funcionen igual en la web y en la
app de escritorio.

## Los dos clientes

- **Web:** el navegador sobre el dominio del servidor (`WEB_ORIGIN`).
- **Escritorio** (`D:\dev\destokp-program-and-setup\apps\desktop`, Tauri 2 sobre WebView2):
  sirve la misma web desde un proxy local (`proxy.rs`) en `http://127.0.0.1:<puerto aleatorio>`,
  que reenvía `/api` y `/ws` al servidor. Para la web es un origen normal. Las ventanas que se
  abren con `window.open` las abre WebView2 (`emergentes.rs`).

Eso condiciona tres cosas:

1. **Passkeys.** WebAuthn no acepta una IP como RP ID, así que en `127.0.0.1` no funcionan. Una
   passkey creada en `erp.empresa.com` tampoco sirve en otro origen.
2. **Google y similares.** Google bloquea el inicio de sesión dentro de webviews embebidas
   (`disallowed_useragent`). Microsoft lo tolera, pero es frágil. El SSO del escritorio tiene
   que pasar por el navegador del sistema.
3. **Enlace por correo.** Al pulsarlo se abre el navegador del sistema, no la app. El enlace
   tiene que poder aprobar un login que se empezó en otro sitio.

La pieza común es la **entrega de login entre dispositivos** (punto 7): el cliente pide una
entrega, el usuario se identifica en otro sitio (navegador del sistema, correo) y el cliente
recoge su sesión. La usan el SSO del escritorio y el enlace por correo en cualquier cliente.

## Objetivos

1. Sesiones en el servidor que se pueden revocar, listar y caducar.
2. Freno contra fuerza bruta en todo lo que acepta un secreto sin sesión.
3. Login en dos pasos con un reto de corta duración, sin reenviar la contraseña.
4. Historial de accesos y aviso por correo cuando se entra desde un dispositivo nuevo.
5. Política de acceso por empresa.
6. Formas nuevas de entrar: passkeys, código o enlace por correo, Google, Microsoft y OIDC
   genérico.
7. Todo lo anterior funcionando en la web y en el escritorio.

## Fuera de alcance

- **Cookies httpOnly en lugar de `localStorage`.** Merece su propio cambio: toca la mensajería
  (tickets), los websockets, los `import()` de plugins, el visor de PDF y el proxy del
  escritorio. Para el cliente Tauri, el token de portador sigue siendo lo más sencillo.
- **Guardar el token del escritorio en el llavero del sistema.** Se puede hacer más adelante
  con un plugin de Tauri.
- **SAML.**
- **Alta de usuarios desde el SSO.** El SSO solo enlaza con cuentas que ya existen.
- **Autenticación por SMS.**
- **Comprobar contraseñas filtradas contra un servicio externo** (HIBP).

## Lo que no puede pasar (anti-objetivos)

- Que una regla nueva deje a alguien sin poder entrar y sin salida. Siempre tiene que haber
  códigos de respaldo y la vía del administrador. Un SUPERUSER nunca queda fuera por la
  política de una empresa.
- Que un mensaje de error permita saber si un usuario o un email existe.
- Que los tokens de las APIs (`tk_…`) dejen de funcionar: no tienen sesión y siguen igual.
- Guardar en claro un secreto que permita entrar. Todo token de un solo uso se guarda como
  hash SHA-256.

---

## 1. Sesiones en el servidor

Nueva tabla `public.UserSession`:

| Columna | Qué guarda |
|---|---|
| `id` | id aleatorio (el `sid` del JWT) |
| `userId` | dueño |
| `createdAt`, `lastSeenAt`, `expiresAt` | vida de la sesión |
| `revokedAt`, `revokedReason` | `logout`, `user`, `admin`, `password_change`, `policy` |
| `method` | `password`, `passkey`, `email_code`, `sso:<proveedor>`, `handoff` |
| `mfa` | cómo se pasó el segundo factor: `totp`, `backup`, `passkey` o nada |
| `clientKind` | `web` o `desktop` (cabecera `x-keirost-client`) |
| `deviceId` | id estable del dispositivo (ver punto 4) |
| `userAgent`, `ip` | lo que se vio al crearla |
| `tenantId` | empresa activa |

- El JWT lleva `sid`. `AuthService.verifyToken` pasa a ser asíncrono y comprueba que la sesión
  existe, no está revocada y no ha caducado. Se centraliza en `core/auth/sessions.ts`
  (`resolveSession(token)`), y lo usan **todos** los sitios que hoy llaman a `verifyToken`:
  `tenantContext`, `adminAuth`, `auth.ts` (`/me`, `/switch-tenant`), `tenants.ts` y
  `/ws/events`.
- **Caché:** para no consultar la base en cada petición, el resultado se guarda en memoria
  durante 15 s. Una revocación se avisa a las demás instancias con `LISTEN/NOTIFY` (canal
  `keirost_sessions`), igual que `pluginChanges.ts`. Sin ese aviso, una instancia tarda como
  mucho 15 s en enterarse.
- `lastSeenAt` se escribe como mucho una vez por minuto y sesión.
- `switch-tenant` mantiene la misma sesión y solo cambia `tenantId`, emitiendo un JWT nuevo con
  el mismo `sid`.
- **Duración:** 12 h por defecto, que se renuevan con el uso (deslizante). Nunca más del máximo
  absoluto de la política (punto 5; por defecto 30 días). El JWT dura 12 h y la web lo renueva
  con `POST /api/auth/refresh` cuando le queda menos de la mitad.
- **Revocar:**
  - `POST /api/auth/logout` revoca la sesión actual.
  - `GET /api/auth/sessions` lista las del usuario (marcando la actual).
  - `DELETE /api/auth/sessions/:id` cierra una; `DELETE /api/auth/sessions?others=1` cierra
    todas menos la actual.
  - Cambiar o recuperar la contraseña, desactivar el 2FA o quitar una passkey revoca todas las
    demás sesiones.
  - Un administrador puede cerrar todas las sesiones de un usuario de su empresa (`/api/users`).
- **Tokens antiguos sin `sid`:** dejan de valer al desplegar y hay que volver a entrar. No hay
  usuarios reales todavía.

## 2. Freno contra fuerza bruta

Nueva tabla `public.AuthThrottle (key, failures, windowStart, lockedUntil)`. Las claves son
`acct:<userId|email normalizado>` e `ip:<ip>`, por cada acción (`login`, `mfa`, `forgot`,
`email_code`, `handoff`).

- **Por cuenta:** 5 fallos en 15 min bloquean 1 min. Cada bloqueo siguiente dobla el tiempo,
  hasta 1 h. Un acierto pone el contador a cero.
- **Por IP:** 50 fallos en 15 min bloquean esa IP 15 min, para todas las cuentas.
- Un bloqueo responde 429 `TOO_MANY_ATTEMPTS` con `retryAfter`, sin decir si la cuenta existe.
  Un email que no existe cuenta igual que uno que sí.
- Para comparar contraseñas de usuarios que no existen se hace un `bcrypt.compare` falso, y así
  el tiempo de respuesta no delata nada.
- La IP sale de `req.ip`, con `trust proxy` configurable (`TRUST_PROXY`, por defecto el valor
  actual). Se documenta en `.env.example`.
- El bloqueo de la cuenta no impide entrar con passkey: la passkey no se puede adivinar.

## 3. Login en dos pasos con reto

- `POST /api/auth/login` con una contraseña correcta y 2FA activo ya no pide reenviar la
  contraseña. Devuelve `{ mfaRequired: true, challenge, methods: ['totp','backup','passkey'] }`.
- `challenge` es un token aleatorio guardado como hash en `public.AuthChallenge (id, userId,
  kind, expiresAt, attempts, data)`. Dura 5 min y admite 5 intentos.
- `POST /api/auth/mfa` con `{ challenge, code }` o `{ challenge, passkey: <respuesta> }` crea
  la sesión.
- **Contra la reutilización del TOTP:** se guarda el último paso de tiempo aceptado
  (`GlobalUser.totpLastStep`) y no se acepta uno igual o anterior.
- Se mantiene la compatibilidad con `totpCode` en `/login` mientras la web no esté migrada, y se
  quita en la misma rama al terminar.

## 4. Historial de accesos y aviso de dispositivo nuevo

- Nueva tabla `public.AuthEvent (id, userId, at, kind, ok, method, ip, userAgent, clientKind,
  deviceId, detail)`. Los `kind` son `login`, `mfa`, `logout`, `revoke`, `password_change`,
  `mfa_change`, `passkey_add`, `passkey_remove`, `sso_link`, `lockout` y `policy_block`. Se
  guarda 1 año, con limpieza en el cron existente o uno nuevo diario.
- **`deviceId`:** un id aleatorio que la web guarda en `localStorage` (`keirost_device`) y envía
  en `x-keirost-device`. En el escritorio, el `localStorage` puede cambiar con el puerto; si es
  así, Tauri lo pasa con un `initialization_script` (ver punto 9). No es un secreto: solo sirve
  para reconocer el dispositivo.
- **Aviso:** al entrar con éxito desde un `deviceId` que ese usuario no ha usado nunca, se envía
  un correo (`enqueueMail`, con el SMTP de su empresa como hoy en `forgot-password`). El correo
  dice cuándo, desde qué dispositivo y desde qué IP, e incluye un enlace a
  `WEB_ORIGIN/account/security`. Sin SMTP o sin `WEB_ORIGIN`, solo se registra en el log.
- **Pantallas:** la pantalla de seguridad del usuario muestra sus últimos 50 eventos. El
  administrador de la empresa ve los de sus miembros en la ficha del usuario. El permiso es el
  mismo que para editar usuarios.

## 5. Política de acceso por empresa

Se guarda en el `SystemConfig` del tenant, clave `auth.policy` (JSON), y se edita en
Configuración → Seguridad (permiso `/settings/security`, nuevo en el catálogo).

```json
{
  "mfa": "off" | "admins" | "all",
  "sessionMaxDays": 30,
  "idleHours": 12,
  "allowedMethods": ["password", "passkey", "email_code", "sso"],
  "ssoRequired": false,
  "passwordRules": { "enabled": false, "minLength": 10, "blockCommon": true }
}
```

- **Cuándo se aplica:** al entrar en una empresa y al cambiar a ella con `switch-tenant`. Si el
  usuario pertenece a varias, cuenta la de la empresa en la que entra.
- **`mfa` exigido y sin 2FA configurado:** se crea una sesión **limitada**
  (`UserSession.restricted = 'mfa_setup'`). Esa sesión solo puede llamar a `/api/2fa/*`, a
  `/api/auth/passkeys/*`, a `/me` y a `/logout`. La web lleva directamente a configurarlo y, al
  terminar, la sesión pasa a normal.
- **`ssoRequired`:** solo se puede entrar en esa empresa por SSO o por passkey. La contraseña
  sigue sirviendo para un SUPERUSER.
- **Reglas de contraseña (opcional, apagado por defecto):** un mínimo de caracteres y el rechazo
  de las 10.000 más comunes, con una lista local en `core/auth/commonPasswords.txt`. Se
  comprueban al poner o cambiar la contraseña (`/api/users`, `reset-password`, perfil, asistente
  de instalación). Si el usuario pertenece a varias empresas, se aplica la más estricta de las
  que la tengan activa. No obliga a cambiar contraseñas que ya existen.
- Un SUPERUSER no queda sujeto a `mfa` ni a `allowedMethods`, para que siempre pueda entrar a
  arreglarlo.

## 6. Passkeys (WebAuthn)

- **Librería:** `@simplewebauthn/server` y `@simplewebauthn/browser`.
- Nueva tabla `public.UserPasskey (id, userId, credentialId, publicKey, counter, transports,
  rpId, name, createdAt, lastUsedAt)`.
- **RP ID:**
  - En la web, el host de `WEB_ORIGIN`.
  - En el escritorio, `localhost`. Para eso el proxy de Tauri tiene que escuchar y cargarse en
    `http://localhost:<puerto>` en vez de `127.0.0.1` (punto 9). WebAuthn trata `localhost` como
    contexto seguro y lo acepta como RP ID.
  - Una passkey de la web no sirve en el escritorio ni al revés. La pantalla lo dice con «Esta
    llave es de este equipo / de la web», y cada cliente da de alta la suya.
- **Orígenes aceptados:** `WEB_ORIGIN`, más `http://localhost:*` si `WEBAUTHN_ALLOW_DESKTOP` no
  vale `false` (por defecto vale `true`). En desarrollo, también el de Vite. El servidor elige el
  RP ID según el `Origin` de la petición y rechaza cualquier origen que no esté en la lista.
- **Rutas:**
  - `POST /api/auth/passkeys/register/options` y `/register/verify`: dar de alta una passkey, con
    sesión.
  - `GET /api/auth/passkeys` y `DELETE /api/auth/passkeys/:id`: listar y quitar.
  - `PATCH /api/auth/passkeys/:id`: cambiarle el nombre.
  - `POST /api/auth/passkey/options` y `/passkey/verify`: entrar sin contraseña, con credenciales
    descubribles (*resident keys*). No hace falta escribir el usuario.
- **Como segundo factor:** si el reto MFA incluye `passkey`, vale cualquier passkey del usuario.
  Entrar con passkey ya cuenta como MFA (`mfa = 'passkey'`).
- Quitar la última forma de segundo factor cuando la política lo exige da 409
  `MFA_REQUIRED_BY_POLICY`.

## 7. Entrega de login entre dispositivos (handoff)

Es la pieza que permite que el SSO y el enlace por correo funcionen en cualquier cliente.

- `POST /api/auth/handoff` crea `{ handoffId, pollSecret }` y devuelve los dos. La fila se guarda
  en `AuthChallenge` (`kind = 'handoff'`, 10 min), con `pollSecret` en forma de hash.
- El cliente abre la URL que corresponda (`/api/auth/sso/<proveedor>/start?handoff=<id>`) o pide
  un código por correo indicando su `handoffId`.
- Cuando el usuario se identifica en el otro sitio, el servidor marca el handoff como `approved`
  con el `userId` y el método. La página del navegador dice «Ya puedes volver a Keirost».
- El cliente pregunta cada 2 s, con `POST /api/auth/handoff/poll { handoffId, pollSecret }`, y al
  aprobarse recibe la sesión una sola vez. Si hace falta, recibe el reto MFA (punto 3): el
  segundo factor se pide en el cliente que entra, no en el navegador.
- **Mitigación del phishing con enlaces de handoff:** la página de aprobación muestra el
  dispositivo que pide entrar (cliente, sistema y aproximación de IP) y un código de 2 letras y 2
  cifras que también aparece en el cliente. El usuario tiene que confirmar con un botón; no se
  aprueba solo por abrir el enlace.

## 8. Código o enlace por correo

- `POST /api/auth/email-code { email, handoffId? }` responde siempre lo mismo. Si la cuenta
  existe, tiene email y su empresa tiene SMTP, envía:
  - un código de 6 cifras (10 min, 5 intentos, guardado como hash);
  - un enlace a `WEB_ORIGIN/login/email?token=…`. Con `handoffId`, el enlace aprueba ese handoff
    con la confirmación del punto 7. Sin él, inicia sesión en el navegador que lo abre.
- `POST /api/auth/email-code/verify { email, code }` crea la sesión, o devuelve un reto MFA si el
  usuario tiene 2FA. El correo **no** sustituye al segundo factor.
- Se puede desactivar por empresa (`allowedMethods`). Sin SMTP, la web no ofrece esta opción
  (`GET /api/auth/methods` dice qué hay disponible).

## 9. Google, Microsoft y OIDC genérico

- **Librería:** `openid-client` (OIDC estándar, con PKCE y `state`/`nonce`).
- **Configuración de instancia**, nueva tabla `public.AuthProvider (id, kind, name, issuer,
  clientId, clientSecretEnc, scopes, enabled, allowedDomains)`. `kind` puede ser `google`,
  `microsoft` u `oidc`. El secreto va cifrado con la misma clave que el TOTP (`totpCrypto.ts`).
  Lo edita un SUPERUSER en Administración → Inicio de sesión.
- **Enlace con la cuenta:**
  - Nueva tabla `public.UserIdentity (userId, providerId, subject, email, linkedAt)`.
  - La primera vez, si el email del proveedor está verificado (`email_verified`, o Microsoft con
    `tid` de una organización en `allowedDomains`) y coincide con exactamente un `GlobalUser`, se
    enlaza y se avisa por correo.
  - Después se entra por `subject`, aunque cambie el email.
  - Desde la pantalla de seguridad se puede enlazar a mano con la sesión abierta, y desenlazar.
  - Sin coincidencia, se responde «No hay ninguna cuenta para ese correo»; nunca se crea una.
- **Rutas:**
  - `GET /api/auth/sso/:id/start?handoff=&return=` redirige al proveedor.
  - `GET /api/auth/sso/:id/callback` termina el flujo.
  - En la web, sin handoff, el callback lleva a `/login/sso?ticket=…`, un ticket de un solo uso
    de 60 s que la web cambia por la sesión. Así el JWT nunca va en la URL.
  - Con handoff, aprueba el handoff y muestra «Vuelve a Keirost».
- **Escritorio:** abre el `start` en el navegador del sistema con handoff. No usa `window.open`,
  porque WebView2 lo abriría dentro de la app.
- Si el usuario tiene 2FA, el SSO cuenta como primer factor y se pide el segundo, salvo que el
  proveedor diga que ya hizo MFA (`amr` contiene `mfa`). Que el SSO valga por los dos factores lo
  decide una opción del proveedor, `trustProviderMfa`, apagada por defecto.

## 10. Cambios en el escritorio (otro repositorio)

En `D:\dev\destokp-program-and-setup\apps\desktop`:

1. **Proxy en `localhost`:** escuchar en `127.0.0.1` pero cargar la ventana con
   `http://localhost:<puerto>`, para que WebAuthn acepte el RP ID `localhost`.
2. **Puerto estable por instalación:** si el puerto cambia en cada arranque, el `localStorage`
   (token, `deviceId`) es de un origen distinto cada vez. Se guarda el puerto elegido en la
   configuración y se reintenta el mismo; solo si está ocupado se elige otro.
3. **Abrir en el navegador del sistema:** un comando Tauri `abrir_en_navegador(url)`, con
   `tauri-plugin-opener` y solo para URLs `http(s)` del servidor configurado. La web lo usa
   cuando detecta el escritorio (`window.__TAURI_INTERNALS__` o la cabecera que pone el proxy).
4. **Cabeceras:** el proxy añade `x-keirost-client: desktop/<versión>` a las peticiones que
   reenvía.

Si estos cambios no se hacen, el escritorio sigue funcionando con contraseña, TOTP y código por
correo, sin passkeys ni SSO, y la web no le ofrece esos dos métodos.

## Pantallas en la web

Todo con componentes de `@openfactu/ui`, sin texto con términos de un país, en español y en
inglés.

- **Login** (`pages/Login.tsx`, separando la lógica en hooks según
  `separar-logica-de-tsx`):
  - el usuario o email arriba;
  - «Entrar con passkey»;
  - botones de los proveedores activos (`GET /api/auth/methods`);
  - «Recibir un código por correo».
  - Esperando un handoff: «Termina en tu navegador» con el código de confirmación.
- **Formulario del código (segundo paso y código por correo)**: deja de ser un `Input` con
  `tracking-widest` y pasa a `OtpInput` de `@openfactu/ui` (0.7.0), en su propia vista
  (`LoginMfaStep`):
  - **TOTP:** 6 casillas numéricas en dos grupos de 3 (`groupSize={3}`), con foco nada más
    entrar. Al llenar la última se envía solo (`onComplete`), sin pulsar «Verificar». También se
    puede pegar el código entero y el móvil lo autocompleta (`one-time-code`).
  - **Error:** el código erróneo se marca en las casillas (`error`, que sacude el grupo una vez)
    y se vacían para volver a escribir; ya no hace falta un `Alert` arriba. Tras un 429 se
    deshabilita con la cuenta atrás de `retryAfter`.
  - **Debajo, las otras formas, como enlaces** (solo las que el usuario tiene):
    - «Usar un código de respaldo»: cambia a 8 casillas alfanuméricas en dos grupos de 4, con el
      formato de `generateBackupCodes` (`ABCD-1234`). El guion se ignora al pegar.
    - «Usar una passkey»: lanza WebAuthn directamente.
  - Cabecera con la cuenta que está entrando (avatar y nombre, como el selector de cuentas
    recordadas) y «No eres tú» para volver. Desaparece el botón «Volver» suelto.
  - Si el reto caduca (5 min), un aviso y vuelta al primer paso, con el usuario ya escrito.
  - **Código por correo:** la misma vista con 6 casillas, el email al que se envió, «Reenviar» con
    espera de 60 s y «Abrir el enlace del correo también sirve».
  - La lógica (estado del reto, método elegido, envío, cuenta atrás) va en `useMfaStep`, y el
    TSX solo compone.
- **Mi cuenta → Seguridad** (`/account/security`): contraseña, 2FA (lo que ya existe), passkeys,
  cuentas enlazadas, sesiones abiertas e historial.
- **Configurar 2FA obligatorio:** una pantalla a pantalla completa, sin el menú del ERP, para la
  sesión limitada.
- **Configuración → Seguridad** de la empresa: la política del punto 5.
- **Administración → Inicio de sesión** (SUPERUSER): los proveedores del punto 9.
- **Ficha del usuario** (administrador): historial y «Cerrar todas sus sesiones».

## Variables nuevas (`.env.example`)

- `TRUST_PROXY`
- `WEBAUTHN_ALLOW_DESKTOP`
- `AUTH_SESSION_HOURS`, con 12 por defecto
- `AUTH_SESSION_MAX_DAYS`, con 30 por defecto, que la política de la empresa puede bajar pero
  no subir

`WEB_ORIGIN` pasa a ser obligatorio para passkeys y SSO fuera de desarrollo. Sin él, esos
métodos no se ofrecen.

## Pruebas

Con `node:test`, como el resto del servidor:

- **Unitarias:** throttle (ventana, duplicación del bloqueo, reinicio), anti-reutilización del
  TOTP, resolución de política con varias empresas, reglas de contraseña, elección del RP ID por
  origen, firma y uso único de tickets y handoffs.
- **Integración** (`AUTH_TEST_DATABASE_URL`, con `auth_test` en el nombre de la base; sin ella
  se saltan):
  - login → sesión → revocar → 401;
  - cambiar la contraseña revoca las demás;
  - reto MFA con 5 intentos;
  - sesión limitada que solo llega a sus rutas;
  - handoff aprobado una sola vez;
  - email-code;
  - SSO con un proveedor OIDC de mentira montado en la propia prueba.
- **Navegador:** el flujo completo en la web con passkey virtual (CDP `WebAuthn.addVirtualAuthenticator`).

## Fases

1. Sesiones, revocación y `refresh`. Pantalla de sesiones.
2. Throttle y reto MFA con anti-reutilización del TOTP. Nuevo formulario del código en el login
   (`OtpInput`).
3. Historial y aviso de dispositivo nuevo.
4. Política por empresa, sesión limitada y reglas de contraseña opcionales.
5. Passkeys en la web.
6. Handoff y código o enlace por correo.
7. SSO (Google, Microsoft, OIDC).
8. Cambios en el escritorio y passkeys y SSO en él.

Cada fase deja el sistema usable y con sus pruebas.

## Decisiones mías (revísalas)

- 12 h de sesión deslizante y 30 días de máximo absoluto.
- Los límites del throttle (5/15 min por cuenta, 50/15 min por IP, bloqueo que dobla hasta 1 h).
- Que los tokens sin `sid` dejen de valer al desplegar.
- Revocación que tarda como mucho 15 s, con `LISTEN/NOTIFY` para acortarla.
- Que en el escritorio la passkey sea de `localhost`, distinta de la de la web.
- Que el SSO no cree usuarios y que, por defecto, no sustituya al segundo factor.
- Que los proveedores SSO sean de instancia y no de empresa, porque las cuentas son globales.
- Que la regla de contraseña más estricta gane cuando hay varias empresas.

## Riesgo con el otro trabajo en curso

La rama sale de `181787d`. El checkout principal tiene cambios sin commitear en `auth.ts`,
`tenantContext.ts`, `adminAuth.ts`, `AuthService.ts`, `apiMounts.ts`, `setup.ts`, `users.ts`,
`schema.ts` y `public-schema.sql`, entre otros. Al unir habrá conflictos en esos ficheros. Para
reducirlos, la lógica nueva va en módulos propios (`core/auth/sessions.ts`, `throttle.ts`,
`policy.ts`, `passkeys.ts`, `handoff.ts`, `sso.ts`) y los ficheros compartidos solo reciben
llamadas.
