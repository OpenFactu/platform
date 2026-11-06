# Seguridad del acceso y formas de entrar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sesiones revocables, freno contra fuerza bruta, MFA con reto, historial, política por empresa y nuevas formas de entrar (passkeys, código/enlace por correo, Google/Microsoft/OIDC), en la web y en el escritorio Tauri.

**Architecture:** Toda la lógica nueva vive en módulos propios de `apps/server/src/core/auth/` (`sessions`, `throttle`, `challenges`, `authEvents`, `policy`, `passkeys`, `handoff`, `emailCode`, `sso`). Las rutas nuevas van en `apps/server/src/api/auth/*.ts`, montadas desde `api/auth.ts`. Los ficheros compartidos con el otro trabajo en curso (`tenantContext`, `adminAuth`, `auth.ts`, `server.ts`) solo reciben llamadas. En la web, la lógica va en hooks y módulos puros y los TSX solo componen.

**Tech Stack:**
- Express (CommonJS) y Drizzle sobre Postgres en el esquema `public`.
- `node:test` para las pruebas.
- `@simplewebauthn/server` y `@simplewebauthn/browser` `^13`.
- `openid-client` `^5.7` (la v5 es CommonJS; la v6 es solo ESM).
- React con `@openfactu/ui` 0.7.0 (`OtpInput`).
- Tauri 2 en `D:\dev\destokp-program-and-setup\apps\desktop`.

**Spec:** `docs/superpowers/specs/2026-11-06-seguridad-acceso-design.md`

## Global Constraints

- **Secretos:** todo token de un solo uso (reto, ticket, handoff, código por correo, `pollSecret`) se guarda como `hashCode()` de `core/auth/totpCrypto.ts`, nunca en claro.
- **Mensajes:** ningún error ni respuesta distingue entre usuario existente e inexistente (`/login`, `/forgot-password`, `/email-code`, SSO sin coincidencia en el primer factor).
- **Tokens de API:** los `tk_…` siguen funcionando sin sesión. `apiTokenMiddleware` no se toca.
- **SUPERUSER:** nunca queda sujeto a `policy.mfa`, `allowedMethods` ni `ssoRequired`.
- **Valores fijos:**
  - sesión de 12 h deslizante (`AUTH_SESSION_HOURS`), máximo absoluto de 30 días (`AUTH_SESSION_MAX_DAYS`);
  - caché de sesión de 15 s; `lastSeenAt` como mucho cada 60 s;
  - throttle por cuenta: 5 fallos en 15 min → 1 min de bloqueo, que se dobla en cada bloqueo hasta 1 h;
  - throttle por IP: 50 fallos en 15 min → 15 min;
  - reto MFA: 5 min y 5 intentos; código por correo: 10 min y 5 intentos; reenviar, cada 60 s;
  - handoff: 10 min, con sondeo cada 2 s; ticket SSO: 60 s.
- **Errores:** `429 TOO_MANY_ATTEMPTS` con `retryAfter` en segundos; `409 MFA_REQUIRED_BY_POLICY`; `401 SESSION_REVOKED`; `403 SESSION_RESTRICTED`.
- **Cabeceras del cliente:** `x-keirost-client` (`web` | `desktop/<versión>`) y `x-keirost-device` (id aleatorio guardado en `localStorage` con la clave `keirost_device`).
- **Comentarios:** en español, como el código de alrededor. Prettier del repo.
- **Web:**
  - solo componentes de `@openfactu/ui` y tokens de color (`bg-bg-card`, `text-fg-muted`…), nunca la paleta de Tailwind;
  - textos en `apps/web/src/i18n/locales/{es,en}/auth.json` (nuevo), sin "IVA", "NIF" ni términos de un país;
  - las llamadas a la API van por `apiClient` o `coreApi`, nunca `fetch` suelto fuera de `shared/http`.
- **Pruebas de integración:** usan `AUTH_TEST_DATABASE_URL`, y la base tiene que llevar `auth_test` en el nombre. Sin ella se saltan.
- **Esquema público:** toda tabla nueva va en `apps/server/src/db/schema.ts` y en la lista de `scripts/generate-public-schema.mjs`, y se regenera `sql/public-schema.sql` con `npm run db:schema:public --workspace apps/server`.
- **Antes de empezar:** el worktree no tiene `node_modules`. Hay que ejecutar `npm install` en su raíz y luego `npm run link:local`.

## Review Focus

1. **Login con mayúsculas o espacios** (`Admin@X.com `): tiene que contar en el mismo contador de throttle que `admin@x.com`, o el bloqueo por cuenta se esquiva. La prueba va en la tarea 5.
2. **Usuario en dos empresas con políticas distintas:** al hacer `switch-tenant` a la que exige MFA sin tenerla configurada, la sesión tiene que pasar a restringida, y no quedarse normal por venir de la otra. La prueba va en la tarea 10.
3. **Sesión revocada con un websocket abierto o un ticket de mensajería recién pedido:** la revocación tiene que cerrar el socket `/ws/events` de ese `sid`, y no se puede pedir un ticket nuevo. La prueba va en la tarea 3.
4. **TOTP con el reloj desfasado un paso:** se acepta el código del paso anterior y, después, el del paso actual. Lo que no se acepta es repetir el mismo paso ni uno anterior al último aceptado. La prueba va en la tarea 6.
5. **Escritorio que cambia de puerto y pierde `localStorage`:** el usuario no puede recibir un correo de «dispositivo nuevo» cada vez que abre la app. Como mucho, 1 aviso por usuario cada 24 h para el mismo `userAgent` + `clientKind`. La prueba va en la tarea 8.

---

## Fase 1 — Sesiones

### Task 1: Tablas nuevas del esquema público

**Files:**
- Modify: `apps/server/src/db/schema.ts` (junto a `globalUsers`, línea ~40)
- Modify: `apps/server/scripts/generate-public-schema.mjs` (lista de tablas)
- Modify: `apps/server/sql/public-schema.sql` (regenerado)
- Test: `apps/server/src/core/auth/__tests__/publicSchema.test.ts`

**Interfaces:**
- Produce en `schema.ts`:
  - `userSessions` (`UserSession`): `id`, `userId` → `GlobalUser.id` con borrado en cascada, `tenantId`, `createdAt`, `lastSeenAt`, `expiresAt`, `absoluteExpiresAt`, `revokedAt`, `revokedReason`, `method`, `mfa`, `restricted` (texto, nulo = normal), `clientKind`, `deviceId`, `userAgent` e `ip`. Índice por `userId`.
  - `authThrottles` (`AuthThrottle`): `key` como clave primaria, `failures` int, `windowStart`, `lockedUntil` y `lockCount` int.
  - `authChallenges` (`AuthChallenge`): `id`, `kind` (`mfa` | `handoff` | `email_code` | `sso_ticket` | `sso_state` | `webauthn`), `secretHash` (único), `userId` (nulo), `expiresAt`, `attempts` int, `status` (`pending` | `approved` | `consumed`) y `data` (texto JSON).
  - `authEvents` (`AuthEvent`): `id`, `userId` (nulo), `at`, `kind`, `ok`, `method`, `ip`, `userAgent`, `clientKind`, `deviceId` y `detail` (JSON). Índice por `(userId, at)`.
  - `userPasskeys` (`UserPasskey`): `id`, `userId`, `credentialId` (único), `publicKey` (base64url), `counter` int, `transports` (JSON), `rpId`, `name`, `createdAt` y `lastUsedAt`.
  - `authProviders` (`AuthProvider`): `id`, `kind`, `name`, `issuer`, `clientId`, `clientSecretEnc`, `scopes`, `enabled`, `allowedDomains` (JSON), `trustProviderMfa`, `createdAt` y `updatedAt`.
  - `userIdentities` (`UserIdentity`): `id`, `userId`, `providerId`, `subject`, `email` y `linkedAt`. Único por `(providerId, subject)`.
  - En `globalUsers`, una columna nueva: `totpLastStep: integer('totpLastStep')`.

- [ ] **Step 1:** Escribir `publicSchema.test.ts`. Lee `sql/public-schema.sql` y comprueba que contiene `"UserSession"`, `"AuthThrottle"`, `"AuthChallenge"`, `"AuthEvent"`, `"UserPasskey"`, `"AuthProvider"`, `"UserIdentity"` y la columna `"totpLastStep"`.
- [ ] **Step 2:** Ejecutar `npm test --workspace apps/server -- --test-name-pattern=publicSchema`. Esperado: FAIL.
- [ ] **Step 3:** Añadir las tablas a `schema.ts` y sus nombres a la lista de `generate-public-schema.mjs`, y ejecutar `npm run db:schema:public --workspace apps/server`.
- [ ] **Step 4:** Volver a ejecutar la prueba. Esperado: PASS. Además, `npx tsc --noEmit -p apps/server` sin errores.
- [ ] **Step 5:** Commit con el mensaje `Acceso: tablas de sesiones, throttle, retos, eventos, passkeys y SSO`.

### Task 2: Base de pruebas y núcleo de sesiones

**Files:**
- Create: `apps/server/src/core/auth/__tests__/authTestDb.ts`
- Create: `apps/server/src/core/auth/clientInfo.ts`
- Create: `apps/server/src/core/auth/sessions.ts`
- Modify: `apps/server/src/core/auth/AuthService.ts` (`generateToken` acepta `sid` y `expiresIn`)
- Test: `apps/server/src/core/auth/__tests__/sessions.integration.test.ts`

**Interfaces:**
- `authTestDb.ts`: `export const authTestDatabaseUrl: string | undefined`, `export async function useAuthTestDb(): Promise<{ publicDb: any; createUser(opts?: Partial<{ role: string; totp: boolean; email: string }>): Promise<{ id: string; email: string; password: string }>; drop(): Promise<void> }>`. Sigue el patrón de `core/tenant/__tests__/testTenant.ts`: comprueba `auth_test` en el nombre, ejecuta `public-schema.sql` y para `mailQueue` y `webhookQueue` si no hay base.
- `clientInfo.ts`: `export interface ClientInfo { ip: string; userAgent: string; clientKind: 'web' | 'desktop'; clientVersion?: string; deviceId?: string }` y `export function clientInfo(req): ClientInfo`.
- `sessions.ts`:
  - `export interface SessionRow` (fila de `userSessions`);
  - `createSession(input: { userId: string; tenantId: string | null; method: string; mfa: string | null; restricted?: string | null; client: ClientInfo }): Promise<SessionRow>`;
  - `issueToken(session: SessionRow, user: { id; email; username; role }): string`, que firma `{ userId, email, username, role, tenantId, sid }` con `expiresIn` hasta `expiresAt`;
  - `resolveSession(token: string): Promise<{ payload: any; session: SessionRow } | { error: 'INVALID' | 'SESSION_REVOKED' | 'SESSION_EXPIRED' }>`;
  - `touchSession(sid: string): Promise<void>`, que es deslizante y nunca pasa de `absoluteExpiresAt`;
  - `revokeSession(sid: string, reason: string): Promise<void>`;
  - `revokeAllForUser(userId: string, reason: string, exceptSid?: string): Promise<number>`;
  - `listSessions(userId: string): Promise<SessionRow[]>`, solo las vivas;
  - `setSessionTenant(sid: string, tenantId: string | null, restricted: string | null): Promise<SessionRow>`;
  - `onSessionRevoked(cb: (sid: string, userId: string) => void): void`, que la tarea 3 usa para cerrar sockets;
  - `startSessionListener(): Promise<void>`, que hace `LISTEN keirost_sessions`; cada revocación hace `NOTIFY` con `{ sid, userId }` o `{ userId, all: true }` y vacía la caché.
- La caché es un `Map<sid, { session, at }>` de 15 s, que se borra al revocar en la propia instancia.

- [ ] **Step 1:** Escribir `sessions.integration.test.ts`, que se salta sin `authTestDatabaseUrl`. Pruebas:
  - `crea y resuelve`: `resolveSession(issueToken(s,u))` devuelve `session.id === s.id`.
  - `revocada da SESSION_REVOKED`: también justo después de revocar, sin esperar a la caché.
  - `revokeAllForUser respeta exceptSid`: devuelve el número de revocadas y la exceptuada sigue resolviendo.
  - `token sin sid da INVALID`: con `AuthService.generateToken({ userId })`.
  - `expira`: una sesión con `expiresAt` en el pasado da `SESSION_EXPIRED`.
  - `touch no pasa del máximo absoluto`: con `absoluteExpiresAt` a 1 min, tras `touchSession` se cumple `expiresAt <= absoluteExpiresAt`.
- [ ] **Step 2:** Ejecutar `AUTH_TEST_DATABASE_URL=postgres://…/keirost_auth_test npm test --workspace apps/server -- --test-name-pattern=sessions`. Esperado: FAIL (no existe el módulo). Para crear la base: `docker exec platform-db-1 createdb -U openfactu keirost_auth_test`.
- [ ] **Step 3:** Implementar `clientInfo.ts`, `sessions.ts` y el cambio de `AuthService.generateToken(payload, opts?: { expiresIn?: number })`.
- [ ] **Step 4:** Volver a ejecutar las pruebas. Esperado: PASS.
- [ ] **Step 5:** Commit con el mensaje `Acceso: sesiones en el servidor`.

### Task 3: Usar la sesión en todo lo que valida un JWT

**Files:**
- Modify: `apps/server/src/api/middleware/tenantContext.ts:19-38`
- Modify: `apps/server/src/api/middleware/adminAuth.ts`
- Modify: `apps/server/src/api/tenants.ts:20-28`
- Modify: `apps/server/src/api/auth.ts`: `/login` crea la sesión; `/switch-tenant` y `/me` resuelven la sesión; `/reset-password` hace `revokeAllForUser(userId, 'password_change')`.
- Modify: `apps/server/src/api/twofa.ts`: `disable` revoca las demás sesiones.
- Modify: `apps/server/src/core/realtime/EventSocket.ts`: valida con `resolveSession` si autentica, y cierra los sockets del `sid` en `onSessionRevoked`.
- Create: `apps/server/src/api/auth/sessionRoutes.ts`, que monta `auth.ts` en el mismo router.
- Modify: `apps/server/src/server.ts`: `await startSessionListener()` junto a los demás `LISTEN`.
- Test: `apps/server/src/core/auth/__tests__/sessionRoutes.integration.test.ts`

**Interfaces:**
- Consume `resolveSession`, `createSession`, `issueToken`, `revokeSession`, `revokeAllForUser`, `listSessions`, `setSessionTenant` y `touchSession` de la tarea 2.
- Produce estas rutas en `/api/auth`, que piden sesión dentro del router aunque el montaje sea público:
  - `POST /logout` → `204`;
  - `POST /refresh` → `{ token }`, con el mismo `sid` y la sesión renovada;
  - `GET /sessions` → `{ sessions: Array<{ id, createdAt, lastSeenAt, clientKind, userAgent, ip, method, current: boolean }> }`;
  - `DELETE /sessions/:id` → `204` (solo una sesión propia; si no, `404`);
  - `DELETE /sessions?others=1` → `{ revoked: number }`.
- Produce `req.session: SessionRow` en `tenantContext`. Con un token inválido o revocado, `req.user` queda sin poner, igual que hoy con un token malo.
- Produce el helper `requireSession(req, res): SessionRow | null` en `sessionRoutes.ts`, que responde `401 SESSION_REVOKED` o `UNAUTHORIZED`.

- [ ] **Step 1:** Escribir `sessionRoutes.integration.test.ts`. Levanta un `express()` con `tenantContextMiddleware` y el router de auth, y usa `supertest` si ya es dependencia; si no, `http` con `fetch`. Pruebas:
  - `login → me → logout → me 401`.
  - `reset-password revoca todas`: después, el token anterior da 401.
  - `DELETE /sessions?others=1 deja la actual`.
  - `no borra sesiones de otro usuario`: el `DELETE` da 404.
  - `refresh mantiene sid`: el payload decodificado tiene el mismo `sid`.
  - `revocar cierra el websocket del sid`: abre `ws` contra `startEventSocket` y, tras `revokeSession`, recibe `close`.
  - `sesión revocada no obtiene ticket de mensajería`: `POST /api/messaging/ticket` da 401 con el token revocado. Hay que montar el router de mensajería en la app de prueba.
- [ ] **Step 2:** Ejecutar las pruebas. Esperado: FAIL.
- [ ] **Step 3:** Implementar. `tenantContext` llama a `resolveSession` en lugar de `AuthService.verifyToken` y a `touchSession` sin esperar. El `x-tenant-id` se sigue resolviendo como esté en el código al unir: es un punto de conflicto con el otro trabajo, así que solo se cambian esas líneas.
- [ ] **Step 4:** Ejecutar las pruebas de este fichero y `npm test --workspace apps/server` entero. Esperado: PASS, sin romper `apiMounts.test.ts`.
- [ ] **Step 5:** Commit con el mensaje `Acceso: el token se valida contra su sesión; logout, refresh y sesiones abiertas`.

### Task 4: Web — cliente con sesión, refresh y «Sesiones abiertas»

**Files:**
- Modify: `apps/web/src/shared/http/ApiClient.ts`: añade `x-keirost-client` y `x-keirost-device` a cada petición.
- Create: `apps/web/src/shared/auth/deviceId.ts`: `getDeviceId(): string`, con `localStorage` `keirost_device` y `crypto.randomUUID()`, en un `try/catch`.
- Create: `apps/web/src/shared/auth/clientKind.ts`: `getClientKind(): 'web' | 'desktop'`. Detecta `'__TAURI_INTERNALS__' in window` o `?client=desktop` guardado en `sessionStorage`.
- Modify: `apps/web/src/context/AuthContext.tsx`:
  - `logout` llama a `POST /api/auth/logout` antes de borrar el token;
  - un temporizador de refresh llama a `POST /api/auth/refresh` cuando ha pasado la mitad de la vida del JWT (la saca de `exp` y `iat`);
  - un 401 con `SESSION_REVOKED` hace `logout` local.
- Create: `apps/web/src/modules/settings/security/api.ts`: `securityApi.listSessions()`, `revokeSession(id)` y `revokeOthers()`.
- Create: `apps/web/src/modules/settings/security/useSessions.ts`
- Create: `apps/web/src/modules/settings/security/SessionsCard.tsx`: `Card` con una `List` de sesiones. Cada una muestra un icono según `clientKind`, el navegador o sistema resumido del `userAgent`, la IP, «Activa hace…» y un chip «Esta sesión». Lleva «Cerrar» por sesión y «Cerrar las demás» con `ConfirmDialog`.
- Create: `apps/web/src/modules/settings/pages/AccountSecurity.tsx`, que compone `TwoFactorSettings` (lo saca de `UserProfile`) y `SessionsCard`.
- Modify: `apps/web/src/modules/settings/module.ts`: nueva SubTab `{ id: 'security', label: 'settings.nav.security', path: '/profile/security' }` después de `profile`.
- Modify: `apps/web/src/modules/settings/pages/UserProfile.tsx:293`: quita `TwoFactorSettings` y pone un enlace a «Seguridad».
- Create: `apps/web/src/i18n/locales/es/auth.json` y `en/auth.json`, registrados donde se registran los demás *namespaces* (ver cómo se carga `banking.json`).

- [ ] **Step 1:** Ejecutar `npm run typecheck --workspace apps/web` y `npm run lint --workspace apps/web` como base. Esperado: PASS antes de los cambios.
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Volver a ejecutar typecheck y lint. Esperado: PASS.
- [ ] **Step 4:** Verificar en el navegador con `npm run dev:all` desde el worktree, y antes mirar que el puerto 3000 está libre (ver la memoria `servidor-dev-aplica-migraciones`). Entrar en dos pestañas, una de ellas privada, y en la pantalla Seguridad ver dos sesiones. «Cerrar las demás» hace que la otra pestaña vuelva al login en su siguiente petición.
- [ ] **Step 5:** Commit con el mensaje `Acceso: la web renueva y cierra la sesión de verdad; pantalla de sesiones`.

## Fase 2 — Freno y segundo paso

### Task 5: Throttle

**Files:**
- Create: `apps/server/src/core/auth/throttle.ts`
- Test: `apps/server/src/core/auth/__tests__/throttle.test.ts` (unitaria, sobre la función pura)
- Test: `apps/server/src/core/auth/__tests__/throttle.integration.test.ts`

**Interfaces:**
- `export type ThrottleAction = 'login' | 'mfa' | 'forgot' | 'email_code' | 'handoff'`.
- `export function normalizeAccount(input: string): string`, que hace `trim().toLowerCase()`.
- `export function step(state: { failures; windowStart; lockedUntil; lockCount } | null, ok: boolean, now: Date, rule: { max: number; windowMs: number; baseLockMs: number; maxLockMs: number; doubling: boolean })`, que devuelve el nuevo estado (o `null` si se reinicia). Es la función pura.
- `export const RULES: { account: Rule; ip: Rule }`, con los valores de *Global Constraints*.
- `export async function checkThrottle(action, keys: { account?: string; ip: string }): Promise<{ blocked: false } | { blocked: true; retryAfter: number }>`.
- `export async function recordAttempt(action, keys, ok: boolean): Promise<void>`. Con `ok` reinicia la cuenta, pero no la IP.
- `export function sendThrottled(res, retryAfter: number)`, que responde `429 { error, code: 'TOO_MANY_ATTEMPTS', retryAfter }` con la cabecera `Retry-After`.
- Las claves en la base tienen la forma `<action>:acct:<normalizeAccount>` y `<action>:ip:<ip>`.

- [ ] **Step 1:** Escribir `throttle.test.ts` con estas pruebas:
  - `5 fallos bloquean 1 min`;
  - `el siguiente bloqueo dura 2 min, luego 4, con tope 60`;
  - `fuera de la ventana de 15 min se reinicia`;
  - `un acierto reinicia la cuenta`;
  - `normalizeAccount(' Admin@X.com ') === 'admin@x.com'`.
- [ ] **Step 2:** Ejecutar las pruebas. Esperado: FAIL.
- [ ] **Step 3:** Implementar `step`, `RULES` y `normalizeAccount`. Las funciones de la base hacen un `INSERT … ON CONFLICT` con la fila bloqueada (`SELECT … FOR UPDATE` dentro de una transacción).
- [ ] **Step 4:** Escribir `throttle.integration.test.ts`. La prueba `50 fallos de cuentas distintas bloquean la IP` comprueba que el intento 51 de una cuenta nueva da `blocked: true`. Ejecutar las dos. Esperado: PASS.
- [ ] **Step 5:** Commit con el mensaje `Acceso: freno contra fuerza bruta por cuenta e IP`.

### Task 6: Reto MFA, anti-reutilización del TOTP y throttle en las rutas

**Files:**
- Create: `apps/server/src/core/auth/challenges.ts`
- Modify: `apps/server/src/api/twofa.ts` (`verifyTwoFactor`)
- Create: `apps/server/src/api/auth/completeLogin.ts`
- Create: `apps/server/src/api/auth/mfaRoutes.ts`
- Modify: `apps/server/src/api/auth.ts`: `/login`, `/forgot-password` y `/reset-password` usan el throttle; `/login` usa `completeLogin`.
- Test: `apps/server/src/core/auth/__tests__/totpReplay.test.ts`
- Test: `apps/server/src/core/auth/__tests__/mfa.integration.test.ts`

**Interfaces:**
- `challenges.ts`:
  - `createChallenge(kind, opts: { userId?: string; ttlMs: number; data?: object; maxAttempts?: number }): Promise<{ id: string; secret: string }>`. `secret` son 32 bytes en base64url; solo se guarda su hash.
  - `findChallenge(kind, secret): Promise<ChallengeRow | null>`, solo vivos y `pending` o `approved`.
  - `failChallenge(id): Promise<{ exhausted: boolean }>`.
  - `consumeChallenge(id): Promise<boolean>`: un `UPDATE … WHERE status <> 'consumed'`, que devuelve `false` si ya se consumió.
  - `approveChallenge(id, userId, data?): Promise<void>`.
- `verifyTwoFactor(code, encryptedSecret, backupCodesJson, lastStep: number | null)` devuelve `{ ok, usedBackup, remainingBackups?, step?: number }`. Usa `authenticator.checkDelta` con `window: 1` y rechaza si `currentStep + delta <= lastStep`.
- `completeLogin(req, res, user, opts: { method: string; mfa: string | null; tenantId?: string | null })`. Resuelve empresa, rol y permisos (lo que hoy hay en `/login` entre la resolución de tenant y el `res.json`, movido aquí sin cambiarlo) y llama a `createSession` e `issueToken`. Responde el mismo cuerpo que hoy `/login`. Las tareas 10, 12, 15 y 17 lo reutilizan.
- `startMfaOrComplete(req, res, user, opts)`: si `user.totpEnabled` o el usuario tiene passkeys, crea un reto `mfa` (5 min, 5 intentos, `data: { method, tenantId }`) y responde `{ mfaRequired: true, challenge, methods, user: { name, email, avatarImageUrl } }`. Si no, llama a `completeLogin`.
- `POST /api/auth/mfa { challenge, code? , passkey? }`:
  - con un `code` válido, guarda `totpLastStep` (o los respaldos que quedan) y llama a `completeLogin` con `mfa: 'totp' | 'backup'`;
  - con un código erróneo, `failChallenge` y `401 MFA_INVALID`; agotado el reto, `401 MFA_CHALLENGE_EXPIRED`;
  - la rama `passkey` la añade la tarea 12.
- `/login`:
  - aplica el throttle `login` (cuenta e IP);
  - si el usuario no existe, hace `bcrypt.compare` contra un hash fijo de prueba;
  - con una contraseña correcta, llama a `startMfaOrComplete`;
  - mantiene `totpCode` en el cuerpo como atajo compatible hasta la tarea 20.

- [ ] **Step 1:** Escribir `totpReplay.test.ts` con estas pruebas, generando los tokens con `authenticator.generate` y un `Date` controlado mediante `authenticator.options = { epoch }`:
  - `el mismo código dos veces: la segunda falla`;
  - `un paso atrás y luego el actual: los dos valen`;
  - `uno anterior al último aceptado: falla`.
- [ ] **Step 2:** Escribir `mfa.integration.test.ts` con estas pruebas:
  - `login con 2FA devuelve challenge y no token`;
  - `mfa con código válido devuelve token`;
  - `6.º intento con el mismo reto da MFA_CHALLENGE_EXPIRED`;
  - `reto consumido no vale dos veces`;
  - `usuario inexistente y contraseña mala responden igual`, comparando el cuerpo;
  - `6 contraseñas malas dan 429 con retryAfter`.
- [ ] **Step 3:** Ejecutar las pruebas. Esperado: FAIL.
- [ ] **Step 4:** Implementar.
- [ ] **Step 5:** Volver a ejecutar las pruebas y `npm test` entero. Esperado: PASS.
- [ ] **Step 6:** Commit con el mensaje `Acceso: segundo paso con reto, TOTP de un solo uso y freno en login y recuperación`.

### Task 7: Web — nuevo formulario del código en el login

**Files:**
- Create: `apps/web/src/pages/login/loginApi.ts`: `login(body)`, `verifyMfa({ challenge, code })` y, más adelante, el resto de llamadas del login.
- Create: `apps/web/src/pages/login/useMfaStep.ts`
- Create: `apps/web/src/pages/login/LoginMfaStep.tsx`
- Modify: `apps/web/src/pages/Login.tsx`: quita `twoFactorRequired` y `totpCode` y su `Input` (líneas 40-41, 122-151, 207-233) y pinta `LoginMfaStep` cuando hay un reto.
- Modify: `apps/web/src/i18n/locales/{es,en}/auth.json`

**Interfaces:**
- `useMfaStep(params: { challenge: string; methods: string[]; onDone: (data) => void; onExpired: () => void })` devuelve `{ mode: 'totp' | 'backup'; setMode; code; setCode; error?: string; submitting; lockedFor: number; submit(code?: string) }`.
  - Si el error es `MFA_INVALID`, pone el texto de `auth.mfa.invalid` y vacía el código.
  - Con `429`, cuenta atrás de `lockedFor`.
  - Con `MFA_CHALLENGE_EXPIRED`, llama a `onExpired`.
- `LoginMfaStep` (props: el resultado de `useMfaStep` más `user: { name; email; avatarImageUrl }` y `onNotYou`) pinta:
  - `Avatar` y nombre;
  - en modo `totp`, `<OtpInput length={6} groupSize={3} autoFocus onComplete={submit} error={error} disabled={lockedFor > 0} />`;
  - en modo `backup`, `<OtpInput length={8} groupSize={4} mode="alphanumeric" … />`;
  - el botón «Verificar» y los enlaces «Usar un código de respaldo» o «Usar la app de autenticación»;
  - el espacio de «Usar una passkey», que se oculta hasta la tarea 13;
  - «No eres tú».
- Con el reto caducado, se vuelve al primer paso con el usuario escrito y un `Alert` con `auth.mfa.expired`.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Ejecutar typecheck y lint de la web. Esperado: PASS.
- [ ] **Step 3:** Verificar en el navegador: activar el 2FA en Seguridad, salir y entrar. Comprobar que se pide el código en casillas, que pegarlo lo envía solo, que un código malo marca las casillas en rojo y las vacía, que un código de respaldo funciona y que el sexto intento muestra la cuenta atrás. Hacer una captura.
- [ ] **Step 4:** Commit con el mensaje `Login: el código del segundo paso en casillas`.

## Fase 3 — Historial y avisos

### Task 8: Eventos de acceso y aviso de dispositivo nuevo

**Files:**
- Create: `apps/server/src/core/auth/authEvents.ts`
- Create: `apps/server/src/core/auth/newDeviceNotice.ts`
- Create: `apps/server/src/core/auth/authCleanupCron.ts`, que arranca en `server.ts` junto a los demás crons.
- Modify: `completeLogin.ts`, `sessionRoutes.ts`, `auth.ts` (fallos de login, `reset-password`), `twofa.ts` y `throttle.ts` (al bloquear registra `lockout`).
- Create: `apps/server/src/api/auth/eventRoutes.ts`: `GET /api/auth/events?limit=50`.
- Modify: `apps/server/src/api/users.ts`:
  - `GET /:id/auth-events`;
  - `GET /:id/sessions`;
  - `DELETE /:id/sessions`, con el permiso de escritura de `/users`. Solo para miembros de la empresa de quien pregunta, como el resto del router.
- Test: `apps/server/src/core/auth/__tests__/authEvents.integration.test.ts`

**Interfaces:**
- `recordAuthEvent(e: { userId?: string; kind: AuthEventKind; ok: boolean; method?: string; client: ClientInfo; detail?: object }): Promise<void>`. No lanza nunca: los fallos van al log.
- `listAuthEvents(userId, limit): Promise<AuthEventRow[]>`.
- `isKnownDevice(userId, client): Promise<boolean>`: el `deviceId` ya está en un evento `login` con `ok`, o, sin `deviceId`, el mismo `userAgent` + `clientKind`.
- `maybeNotifyNewDevice(user, client, tenantId)`:
  - envía con `enqueueMail(tenantId, …)` y el texto por `tr`, en la carpeta `i18n/messages/<locale>/authEmails.ts`, como `shipmentEmails`;
  - como mucho una vez cada 24 h por usuario + `userAgent` + `clientKind`;
  - sin `WEB_ORIGIN` o sin empresa, solo deja una línea en el log.
- El cron diario borra los `AuthEvent` de más de 365 días y los `AuthChallenge` y `UserSession` caducados hace más de 7 días.

- [ ] **Step 1:** Escribir pruebas:
  - `login correcto deja evento login ok`;
  - `contraseña mala deja login no ok con el userId`;
  - `primer login desde un dispositivo encola un correo y el segundo no`, espiando `mailQueue.enqueue`;
  - `dispositivo nuevo cada vez con el mismo UA: un solo correo en 24 h`.
- [ ] **Step 2:** Ejecutar las pruebas. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Volver a ejecutar las pruebas. Esperado: PASS.
- [ ] **Step 5:** Commit con el mensaje `Acceso: historial de accesos y aviso de dispositivo nuevo`.

### Task 9: Web — historial y acciones del administrador

**Files:**
- Create: `apps/web/src/modules/settings/security/AuthHistoryCard.tsx` y `useAuthHistory.ts`. Una `List` con icono de éxito o fallo, el texto del evento (`auth.events.<kind>`), el método, el dispositivo y la fecha relativa.
- Modify: `AccountSecurity.tsx`, para añadir la tarjeta.
- Modify: la ficha o el *drawer* de usuario de `modules/settings/components/UsersTable.tsx`, para añadir la sección «Accesos» con el historial y «Cerrar todas sus sesiones». Se condiciona con `canWrite('/users')`.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Ejecutar typecheck y lint. Esperado: PASS.
- [ ] **Step 3:** Verificar en el navegador: un fallo de contraseña aparece en el historial y un administrador cierra las sesiones de otro usuario. Hacer una captura.
- [ ] **Step 4:** Commit con el mensaje `Acceso: historial en Seguridad y en la ficha del usuario`.

## Fase 4 — Política por empresa

### Task 10: Política, sesión restringida y reglas de contraseña

**Files:**
- Create: `apps/server/src/core/auth/policy.ts`
- Create: `apps/server/src/core/auth/commonPasswords.txt`: las 10.000 contraseñas más comunes, una por línea, en minúsculas. Fuente: la lista *10-million-password-list-top-10000* de SecLists (MIT). Hay que copiarla a la carpeta `dist` en `copy-assets`.
- Create: `apps/server/src/api/middleware/restrictedSession.ts`, montado en `server.ts` justo después de `tenantContextMiddleware`.
- Create: `apps/server/src/api/settingsSecurity.ts`: `GET` y `PUT /api/settings/security`, montado con `mountApi(app, '/api/settings/security', '/settings/security', …)`.
- Modify: `apps/server/src/core/auth/permissionCatalog.ts`: añade `{ path: '/settings/security', label: 'Seguridad del acceso', group: 'Configuración' }`.
- Modify: `completeLogin.ts` y `auth.ts` (`/switch-tenant`), para aplicar la política.
- Modify: todo punto que pone una contraseña. Están en `api/users.ts` (crear y editar), `auth.ts` (`/reset-password`), `api/userProfile.ts` (cambio propio) y `api/setup.ts`, y se encuentran con `grep -rn "hashPassword" apps/server/src/api`.
- Test: `apps/server/src/core/auth/__tests__/policy.test.ts`
- Test: `apps/server/src/core/auth/__tests__/policy.integration.test.ts`

**Interfaces:**
- `export interface AuthPolicy { mfa: 'off' | 'admins' | 'all'; sessionMaxDays: number; idleHours: number; allowedMethods: Array<'password' | 'passkey' | 'email_code' | 'sso'>; ssoRequired: boolean; passwordRules: { enabled: boolean; minLength: number; blockCommon: boolean } }`.
- `DEFAULT_POLICY`: `mfa: 'off'`, 30 días, 12 h, los cuatro métodos, `ssoRequired: false` y `passwordRules: { enabled: false, minLength: 10, blockCommon: true }`.
- `readPolicy(tenantId: string): Promise<AuthPolicy>`, de la clave `auth.policy` del `SystemConfig` del tenant (`ClientFactory.getTenantClient`).
- `normalizePolicy(raw: unknown): AuthPolicy`, que valida con zod. El servidor ya usa zod en `plugins/manifest.ts`.
- `policyGate(policy, user: { role; hasMfa: boolean }, method: string): { allowed: boolean; code?: 'METHOD_NOT_ALLOWED' | 'SSO_REQUIRED'; restricted: 'mfa_setup' | null }`. Para un SUPERUSER, siempre `{ allowed: true, restricted: null }`.
- `passwordProblem(pw: string, rules: AuthPolicy['passwordRules']): null | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_COMMON'`.
- `strictestPasswordRules(userId): Promise<AuthPolicy['passwordRules']>`: entre las empresas del usuario con reglas activas, el `minLength` más alto y `blockCommon` si alguna lo tiene. Sin ninguna activa, `enabled: false`.
- **`restrictedSession`:** si `req.session?.restricted === 'mfa_setup'`, solo deja pasar `/api/2fa/*`, `/api/auth/passkeys/*`, `/api/auth/me`, `/api/auth/logout` y `/api/auth/refresh`. Lo demás responde `403 SESSION_RESTRICTED`. Al activar el 2FA o la primera passkey, la sesión deja de estar restringida (`setSessionTenant(sid, tenantId, null)`).
- `/me` y el login devuelven `restricted` en `user`.
- **Duración de la sesión:** el máximo absoluto es `min(AUTH_SESSION_MAX_DAYS, policy.sessionMaxDays)` y la ventana deslizante `min(AUTH_SESSION_HOURS, policy.idleHours)`. `createSession` y `touchSession` reciben las dos cifras, que calcula `completeLogin` (y `switch-tenant`) a partir de la política de la empresa en la que se entra.
- Hay que añadir una prueba a `policy.integration.test.ts`: `idleHours 1 hace que la sesión caduque a la hora`.

- [ ] **Step 1:** Escribir `policy.test.ts` con estas pruebas:
  - `mfa all sin 2FA da restricted mfa_setup`;
  - `mfa admins no afecta a USER`;
  - `SUPERUSER nunca restringido`;
  - `ssoRequired rechaza password con SSO_REQUIRED`;
  - `passwordProblem('corto', {enabled:true,minLength:10})` da `'PASSWORD_TOO_SHORT'`;
  - `passwordProblem('password123456', …blockCommon)` da `'PASSWORD_TOO_COMMON'`;
  - `con enabled false todo vale`;
  - `normalizePolicy({})` es igual a `DEFAULT_POLICY`.
- [ ] **Step 2:** Escribir `policy.integration.test.ts`. Hace falta una empresa real: se usa `createTestTenant` pasándole la URL de auth, o se crea con el esquema mínimo que `MigrationManager.syncTenant` deja. Pruebas:
  - `switch-tenant a empresa con mfa all deja la sesión restringida`;
  - `sesión restringida recibe 403 en /api/items y 200 en /api/2fa/status`;
  - `activar 2FA quita la restricción`;
  - `la regla más estricta de dos empresas gana al cambiar contraseña`.
- [ ] **Step 3:** Ejecutar las pruebas. Esperado: FAIL.
- [ ] **Step 4:** Implementar.
- [ ] **Step 5:** Volver a ejecutar las pruebas y `npm test` entero. Esperado: PASS.
- [ ] **Step 6:** Commit con el mensaje `Acceso: política por empresa, 2FA obligatorio y reglas de contraseña opcionales`.

### Task 11: Web — política de la empresa y alta obligada del 2FA

**Files:**
- Create: `apps/web/src/modules/settings/pages/SecurityPolicy.tsx` y `modules/settings/security/usePolicy.ts`. Es un `Form`:
  - `SegmentedControl` para el 2FA (No / Administradores / Todos);
  - `NumberInput` para los días de sesión y las horas de inactividad;
  - `Checkbox` por cada método;
  - `Switch` «Solo con SSO»;
  - la sección «Reglas de contraseña», con un `Switch` y, al activarlo, un mínimo y «Rechazar contraseñas comunes».

  Se condiciona con `canWrite('/settings/security')`.
- Modify: `modules/settings/module.ts`: SubTab `{ id: 'security-policy', label: 'settings.nav.securityPolicy', path: '/settings/security' }`.
- Create: `apps/web/src/pages/MfaSetupRequired.tsx`. Pantalla completa sin `MainLayout`: explica que la empresa exige un segundo factor y ofrece `TwoFactorSettings` y, desde la tarea 13, «Añadir passkey». Al terminar, llama a `/me` y entra.
- Modify: `App.tsx` o el *guard* de rutas, para que con `user.restricted === 'mfa_setup'` se pinte solo `MfaSetupRequired`.
- Modify: los formularios de contraseña (`UsersTable`, `ResetPassword.tsx`, el perfil), para mostrar `PASSWORD_TOO_SHORT` y `PASSWORD_TOO_COMMON` traducidos.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Ejecutar typecheck y lint. Esperado: PASS.
- [ ] **Step 3:** Verificar en el navegador: poner el 2FA en «Todos», entrar con un usuario sin 2FA y comprobar que llega a la pantalla obligada; activarlo y comprobar que entra al ERP. Hacer una captura.
- [ ] **Step 4:** Commit con el mensaje `Acceso: pantalla de política y alta obligada del segundo factor`.

## Fase 5 — Passkeys

### Task 12: Passkeys en el servidor

**Files:**
- Modify: `apps/server/package.json`: añade `@simplewebauthn/server@^13`.
- Create: `apps/server/src/core/auth/passkeys.ts`
- Create: `apps/server/src/api/auth/passkeyRoutes.ts`
- Modify: `mfaRoutes.ts` (rama `passkey`) y `startMfaOrComplete` (`methods` incluye `passkey` si tiene alguna para el RP del origen).
- Modify: `.env.example`: `WEBAUTHN_ALLOW_DESKTOP=true`, con un comentario.
- Test: `apps/server/src/core/auth/__tests__/passkeys.test.ts`

**Interfaces:**
- `rpFor(origin: string | undefined): { rpId: string; origin: string } | null`:
  - `WEB_ORIGIN` → su host;
  - `http://localhost:<puerto>` → `localhost`, solo si `WEBAUTHN_ALLOW_DESKTOP !== 'false'`;
  - en desarrollo, también `http://localhost:5173`;
  - cualquier otro → `null`, que la ruta convierte en `400 ORIGIN_NOT_ALLOWED`.
- `registrationOptions(user, rp): Promise<PublicKeyCredentialCreationOptionsJSON>`, con `residentKey: 'required'`, `userVerification: 'preferred'` y `excludeCredentials` con las del mismo RP. El *challenge* se guarda con `createChallenge('webauthn', { userId, data: { challenge, rpId, purpose: 'register' } })`.
- `verifyRegistration(user, rp, response, name): Promise<PasskeyRow>`.
- `authenticationOptions(rp, userId?: string): Promise<{ options; challengeSecret: string }>`.
- `verifyAuthentication(rp, challengeSecret, response): Promise<{ userId: string; passkeyId: string }>`. Actualiza `counter` y `lastUsedAt` y lanza `PASSKEY_INVALID`.
- **Rutas:**
  - `POST /api/auth/passkeys/register/options` y `/register/verify { response, name }`, con sesión; quedan las demás sesiones y se registra `passkey_add`;
  - `GET /api/auth/passkeys` → `[{ id, name, rpId, createdAt, lastUsedAt, here: boolean }]`;
  - `PATCH /:id { name }`;
  - `DELETE /:id`: `409 MFA_REQUIRED_BY_POLICY` si es el último factor y la política lo exige; si no, revoca las demás sesiones;
  - `POST /api/auth/passkey/options` → `{ options, challenge }` y `POST /api/auth/passkey/verify { challenge, response }` → `completeLogin(…, { method: 'passkey', mfa: 'passkey' })`. No pasan por el throttle de cuenta, solo por el de IP con la acción `login`.

- [ ] **Step 1:** Escribir `passkeys.test.ts` con estas pruebas sobre `rpFor`:
  - con `WEB_ORIGIN=https://erp.x.com`, `rpFor('https://erp.x.com')` da `rpId` `erp.x.com`;
  - `rpFor('http://localhost:43123')` da `localhost`;
  - con `WEBAUTHN_ALLOW_DESKTOP=false`, `localhost` da `null`;
  - `rpFor('https://evil.com')` da `null`;
  - `rpFor('http://127.0.0.1:43123')` da `null`.
- [ ] **Step 2:** Ejecutar las pruebas. Esperado: FAIL.
- [ ] **Step 3:** Instalar la dependencia (`npm install @simplewebauthn/server@^13 --workspace apps/server`, y después `npm run link:local`) e implementar.
- [ ] **Step 4:** Volver a ejecutar las pruebas. Esperado: PASS. El flujo completo se prueba en la tarea 13 con un autenticador virtual.
- [ ] **Step 5:** Commit con el mensaje `Acceso: passkeys en el servidor`.

### Task 13: Passkeys en la web

**Files:**
- Modify: `apps/web/package.json`: añade `@simplewebauthn/browser@^13`.
- Create: `apps/web/src/modules/settings/security/PasskeysCard.tsx` y `usePasskeys.ts`. Una lista con el nombre editable, «Esta llave es de este equipo» o «de la web» (`here`), la fecha del último uso y «Quitar» con `ConfirmDialog`; más «Añadir passkey» con el nombre propuesto a partir del `userAgent`.
- Modify: `pages/login/loginApi.ts` (`passkeyOptions`, `passkeyVerify`) y `Login.tsx` (botón «Entrar con passkey» en el primer paso, si `browserSupportsWebAuthn()`).
- Modify: `useMfaStep.ts` y `LoginMfaStep.tsx`: el modo `passkey` lanza `startAuthentication` y envía `POST /api/auth/mfa { challenge, passkey }`.
- Modify: `MfaSetupRequired.tsx`, para añadir `PasskeysCard`.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Ejecutar typecheck y lint. Esperado: PASS.
- [ ] **Step 3:** Verificar en el navegador con un autenticador virtual (CDP `WebAuthn.enable` y `WebAuthn.addVirtualAuthenticator { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true }` desde `javascript_tool`, o el panel WebAuthn de DevTools). Comprobar que se puede:
  - añadir una passkey;
  - salir y entrar con «Entrar con passkey» sin escribir el usuario;
  - con el 2FA activo, usar la passkey como segundo paso.

  Hacer una captura.
- [ ] **Step 4:** Commit con el mensaje `Acceso: passkeys en la web`.

## Fase 6 — Handoff y correo

### Task 14: Entrega de login entre dispositivos

**Files:**
- Create: `apps/server/src/core/auth/handoff.ts`
- Create: `apps/server/src/api/auth/handoffRoutes.ts`
- Test: `apps/server/src/core/auth/__tests__/handoff.integration.test.ts`

**Interfaces:**
- `createHandoff(client: ClientInfo): Promise<{ handoffId: string; pollSecret: string; confirmCode: string; expiresAt: Date }>`:
  - `handoffId` es el `id` del reto (público);
  - `pollSecret` es el secreto, guardado como hash;
  - `confirmCode` son 2 letras sin vocales y 2 cifras (`BK-47`), y va en `data` junto con el cliente.
- `handoffInfo(handoffId): Promise<{ confirmCode; clientKind; userAgent; ipHint; expiresAt } | null>`. `ipHint` son los dos primeros octetos y `x.x`.
- `approveHandoff(handoffId, userId, method: string, mfaDone: string | null): Promise<void>`. Solo un `pending` vivo; si no, `HANDOFF_INVALID`.
- `pollHandoff(handoffId, pollSecret)` devuelve `{ status: 'pending' } | { status: 'approved'; userId; method; mfaDone } | { status: 'expired' }`. El `approved` se consume (`consumeChallenge`) y la segunda lectura da `expired`.
- **Rutas:**
  - `POST /api/auth/handoff` → `{ handoffId, pollSecret, confirmCode, expiresAt }`, con throttle IP `handoff`;
  - `GET /api/auth/handoff/:id` → `handoffInfo`, para la página de aprobación;
  - `POST /api/auth/handoff/poll { handoffId, pollSecret }`. Con `approved`, llama a `startMfaOrComplete(req, res, user, { method: 'handoff:' + method })`. Si `mfaDone`, salta el segundo paso con `mfa: mfaDone`. El cliente que entra es el que sondea, así que `clientInfo(req)` es el suyo.

- [ ] **Step 1:** Escribir pruebas:
  - `aprobado se recoge una sola vez`;
  - `pollSecret incorrecto da pending y no consume`, sin revelar nada;
  - `caducado da expired`;
  - `aprobar dos veces da HANDOFF_INVALID`;
  - `poll aprobado con 2FA devuelve mfaRequired`.
- [ ] **Step 2:** Ejecutar las pruebas. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Volver a ejecutar las pruebas. Esperado: PASS.
- [ ] **Step 5:** Commit con el mensaje `Acceso: entrega de login entre dispositivos`.

### Task 15: Código y enlace por correo

**Files:**
- Create: `apps/server/src/core/auth/emailCode.ts`
- Create: `apps/server/src/api/auth/emailCodeRoutes.ts`
- Create: `apps/server/src/api/auth/methodsRoutes.ts`: `GET /api/auth/methods`.
- Modify: `apps/server/src/i18n/messages/{es,en}/authEmails.ts`, de la tarea 8, con el correo del código.
- Test: `apps/server/src/core/auth/__tests__/emailCode.integration.test.ts`

**Interfaces:**
- `requestEmailCode(email: string, client, handoffId?: string): Promise<void>`. Busca por email o usuario como `/login`; si no existe o no hay SMTP, no hace nada. Si existe:
  - crea un reto `email_code` (10 min, 5 intentos) con un `code` de 6 cifras (`crypto.randomInt`) cuyo hash va en `data.codeHash`, más el `secret` del enlace;
  - envía `WEB_ORIGIN/login/email?token=<secret>`;
  - aplica el throttle `email_code` por cuenta e IP, y como mucho un envío cada 60 s por cuenta.
- `verifyEmailCode(email, code): Promise<{ userId } | null>`, que consume el reto.
- `redeemEmailLink(secret): Promise<{ userId; handoffId?: string } | null>`.
- **Rutas:**
  - `POST /api/auth/email-code { email, handoffId? }` → siempre `202 { sent: true }`;
  - `POST /api/auth/email-code/verify { email, code }` → `startMfaOrComplete(…, { method: 'email_code' })`, o `401 CODE_INVALID`;
  - `POST /api/auth/email-link { token }`. Sin `handoffId` llama a `startMfaOrComplete`. Con `handoffId` responde `{ handoff: handoffInfo }` y espera `POST /api/auth/email-link/approve { token }`, que llama a `approveHandoff(…, 'email_code', null)`.
- `GET /api/auth/methods?tenantId=` → `{ password: true, passkey: boolean, emailCode: boolean, sso: Array<{ id; name; kind }> }`:
  - `passkey` es `rpFor(origin) !== null`;
  - `emailCode` es «hay SMTP en alguna empresa y `WEB_ORIGIN`»;
  - `sso` sale de la tarea 17 y ahora es `[]`;
  - con `tenantId`, filtra por la `allowedMethods` de esa empresa.

- [ ] **Step 1:** Escribir pruebas:
  - `email inexistente responde igual y no encola`;
  - `código correcto entra`;
  - `código usado no vale otra vez`;
  - `5 códigos malos agotan el reto`;
  - `dos peticiones en 60 s envían un solo correo`;
  - `enlace con handoff no entra en este navegador y aprueba el handoff`.
- [ ] **Step 2:** Ejecutar las pruebas. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Volver a ejecutar las pruebas. Esperado: PASS.
- [ ] **Step 5:** Commit con el mensaje `Acceso: código y enlace por correo`.

### Task 16: Web — código por correo, espera del handoff y aprobación

**Files:**
- Modify: `pages/login/loginApi.ts` (`methods`, `requestEmailCode`, `verifyEmailCode`, `createHandoff`, `pollHandoff`, `handoffInfo`, `redeemEmailLink`, `approveEmailLink`).
- Create: `pages/login/useLoginMethods.ts`, que llama a `GET /methods` y elige qué botones mostrar.
- Create: `pages/login/useEmailCode.ts` y `LoginEmailCodeStep.tsx`: `OtpInput` de 6 casillas, «Enviado a …», «Reenviar» con 60 s y el texto «Abrir el enlace del correo también sirve».
  - En la web, sin handoff, el usuario escribe el código.
  - En el escritorio, se crea primero un handoff y se pasa `handoffId` a `requestEmailCode`; mientras se puede escribir el código, se sondea `pollHandoff` cada 2 s, y gana lo que llegue antes.
- Create: `pages/login/useHandoffWait.ts` y `LoginHandoffWait.tsx`: «Termina en tu navegador», el `confirmCode` en grande, un `Loader` y «Cancelar». Lo usan el correo en el escritorio y el SSO (tarea 18).
- Create: `pages/LoginEmailLink.tsx` (`/login/email?token=`):
  - sin handoff, entra;
  - con handoff, muestra el dispositivo que pide entrar, su `confirmCode` y un botón «Sí, soy yo, dejarle entrar», y termina en «Ya puedes volver a Keirost».
- Modify: el registro de rutas públicas (donde está `/login` y `/reset-password`), para añadir `/login/email`.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Ejecutar typecheck y lint. Esperado: PASS.
- [ ] **Step 3:** Verificar en el navegador con el SMTP de desarrollo, o leyendo el correo encolado en el log:
  - pedir un código, escribirlo y entrar;
  - pedir otro y abrir el enlace en otra pestaña, y comprobar que entra.
  - Simular el escritorio con `?client=desktop` y comprobar que el enlace aprueba y la primera pestaña entra sola.

  Hacer una captura.
- [ ] **Step 4:** Commit con el mensaje `Login: código por correo y espera entre dispositivos`.

## Fase 7 — SSO

### Task 17: Google, Microsoft y OIDC en el servidor

**Files:**
- Modify: `apps/server/package.json`: añade `openid-client@^5.7`.
- Create: `apps/server/src/core/auth/sso.ts`
- Create: `apps/server/src/api/auth/ssoRoutes.ts`
- Create: `apps/server/src/api/authProviders.ts`: CRUD de `AuthProvider`, montado con `mountShared` y comprobación de SUPERUSER de la base dentro del router (como `POST /api/geo/seed`).
- Modify: `methodsRoutes.ts` (`sso`) y `eventRoutes.ts`, o un fichero nuevo `identityRoutes.ts`: `GET /api/auth/identities`, `POST /api/auth/identities/link/:providerId` (inicia con la sesión) y `DELETE /api/auth/identities/:id`.
- Test: `apps/server/src/core/auth/__tests__/sso.integration.test.ts`

**Interfaces:**
- `ISSUERS`: `google` → `https://accounts.google.com` y `microsoft` → `https://login.microsoftonline.com/common/v2.0`. El *issuer* de Microsoft se valida a mano por `tid`, porque `common` cambia el `iss` según el tenant.
- `getClient(provider): Promise<Client>`, con `Issuer.discover`, cacheado por `id` + `updatedAt`.
- `startSso(provider, opts: { handoffId?: string; linkUserId?: string; returnTo?: string })` devuelve `{ url }`. Crea un reto `sso_state` (10 min) con `state`, `nonce`, `codeVerifier` (`generators`) y las opciones, y el `redirect_uri` es `WEB_ORIGIN/api/auth/sso/<id>/callback`.
- `finishSso(provider, req)` devuelve `{ userId; mfaDone: 'provider' | null; email } | { error: 'NO_ACCOUNT' | 'EMAIL_UNVERIFIED' | 'DOMAIN_NOT_ALLOWED' }`. Las reglas de enlace son las del spec, punto 9. Al enlazar por primera vez, registra el evento `sso_link` y envía un correo.
- `mfaDone` es `'provider'` solo si `trustProviderMfa` y `amr` incluye `mfa`.
- **Rutas:**
  - `GET /api/auth/sso/:id/start?handoff=&return=` → `302`;
  - `GET /api/auth/sso/:id/callback`:
    - con handoff, `approveHandoff` y una página HTML mínima, sin la SPA, «Ya puedes volver a Keirost», en el idioma de `Accept-Language`;
    - con `linkUserId`, enlaza y redirige a `/profile/security`;
    - si no, crea un reto `sso_ticket` (60 s) y redirige a `WEB_ORIGIN/login/sso?ticket=<secret>`;
    - un error redirige a `/login?ssoError=<code>`;
  - `POST /api/auth/sso/ticket { ticket }` → `startMfaOrComplete(…, { method: 'sso:' + kind, mfa: mfaDone })`.
- `clientSecret` se cifra con `encryptSecret` de `totpCrypto.ts` y nunca se devuelve en el `GET`: se manda `hasSecret: true`.

- [ ] **Step 1:** Escribir `sso.integration.test.ts` con un proveedor OIDC de mentira:
  - `oidc-provider`, como devDependency, levantado en un puerto libre; o un Express propio que sirva `/.well-known/openid-configuration`, `jwks`, `authorize` y `token`, firmando con `jose`, que ya llega como dependencia de `openid-client`.
  - Pruebas:
    - `email verificado de un usuario existente enlaza y entra`;
    - `segunda vez entra por subject aunque cambie el email`;
    - `email no verificado da EMAIL_UNVERIFIED`;
    - `sin cuenta da NO_ACCOUNT y no crea usuario`;
    - `state reutilizado falla`;
    - `ticket vale una vez`;
    - `con handoff aprueba el handoff`.
- [ ] **Step 2:** Ejecutar las pruebas. Esperado: FAIL.
- [ ] **Step 3:** Instalar la dependencia e implementar.
- [ ] **Step 4:** Volver a ejecutar las pruebas. Esperado: PASS.
- [ ] **Step 5:** Commit con el mensaje `Acceso: inicio de sesión con Google, Microsoft y OIDC`.

### Task 18: Web — botones SSO, cuentas enlazadas y proveedores

**Files:**
- Modify: `Login.tsx` y `useLoginMethods.ts`: un `Button` `variant="secondary"` por proveedor, con su logo en SVG local (Google y Microsoft) o un icono genérico.
  - En la web, `window.location.assign(start)`.
  - En el escritorio, `createHandoff`, abrir `start?handoff=` en el navegador del sistema (`openExternal`, de la tarea 19; hasta entonces, `window.open`) y `LoginHandoffWait`.
  - `?ssoError=` se muestra traducido en un `Alert`.
- Create: `pages/LoginSso.tsx` (`/login/sso?ticket=`), que canjea el ticket y sigue como el login (MFA si hace falta).
- Create: `modules/settings/security/LinkedAccountsCard.tsx` y `useIdentities.ts`: enlazar y desenlazar.
- Create: `modules/settings/pages/LoginProviders.tsx` y `modules/settings/security/useProviders.ts`. Solo para SUPERUSER, en la SubTab `{ id: 'login-providers', path: '/settings/login-providers' }`, oculta a los demás. Tiene una tabla y un `Drawer` con tipo, nombre, *issuer* (solo para OIDC), client ID, secreto (`PasswordInput`, «Sin cambiar» si `hasSecret`), dominios permitidos, «Confiar en el MFA del proveedor» y activado. Muestra la URL de *callback* para copiarla (`CopyButton`).
- Create: `apps/web/src/shared/auth/openExternal.ts`: `openExternal(url): Promise<void>`. En el escritorio llama a `window.__TAURI_INTERNALS__.invoke('abrir_en_navegador', { url })`; si falla, `window.open`.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Ejecutar typecheck y lint. Esperado: PASS.
- [ ] **Step 3:** Verificar en el navegador con el proveedor de mentira de la tarea 17 levantado a mano: configurarlo en Proveedores y entrar con él. Hacer una captura.
- [ ] **Step 4:** Commit con el mensaje `Login: entrar con Google, Microsoft u OIDC`.

## Fase 8 — Escritorio y cierre

### Task 19: Cambios en la app de escritorio (otro repositorio)

**Antes de empezar:** confirmar con el usuario que se puede tocar `D:\dev\destokp-program-and-setup`, en qué rama y si tiene trabajo sin commitear (`git status`).

**Files:**
- Modify: `apps/desktop/src-tauri/src/proxy.rs`: sigue escuchando en `127.0.0.1`. La URL que devuelve `arrancar` pasa a `http://localhost:<puerto>`, y en todas las peticiones reenviadas se añade la cabecera `x-keirost-client: desktop/<CARGO_PKG_VERSION>`.
- Modify: `apps/desktop/src-tauri/src/config.rs`: guarda `proxyPort: Option<u16>` y lo reintenta; solo si está ocupado se elige otro y se guarda.
- Modify: `apps/desktop/src-tauri/Cargo.toml`: `tauri-plugin-opener = "2"`.
- Modify: `apps/desktop/src-tauri/src/lib.rs`: el comando `abrir_en_navegador(url: String)`. Solo acepta `http(s)` cuyo origen sea el del servidor configurado; si no, `Err`.
- Modify: las capacidades de Tauri (`capabilities/*.json`), para permitir el comando desde el origen `http://localhost:*`.
- Test: pruebas de Rust en `config.rs` (puerto guardado y reutilizado) y en `lib.rs` (`abrir_en_navegador` rechaza otro origen y `file://`).

- [ ] **Step 1:** Escribir las pruebas de Rust: `reutiliza_puerto_guardado`, `rechaza_url_de_otro_origen` y `rechaza_esquema_no_http`.
- [ ] **Step 2:** Ejecutar `cargo test` desde un *x64 Native Tools Command Prompt* o con el script del repo, si lo tiene. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Volver a ejecutar las pruebas. Esperado: PASS.
- [ ] **Step 5:** Verificación manual, que la hace el usuario o se hace con *computer use* si lo autoriza: abrir la app y comprobar que una passkey creada en ella funciona al volver a entrar; que «Entrar con Google» abre el navegador del sistema y la app entra sola; y que cerrar y abrir la app no pierde la sesión.
- [ ] **Step 6:** Commit en ese repositorio con el mensaje `Escritorio: localhost para passkeys, puerto estable y abrir en el navegador`.

### Task 20: Cierre

**Files:**
- Modify: `apps/server/src/api/auth.ts`: quita el atajo `totpCode` de `/login`.
- Modify: `.env.example`: `TRUST_PROXY`, `WEBAUTHN_ALLOW_DESKTOP`, `AUTH_SESSION_HOURS` y `AUTH_SESSION_MAX_DAYS`, con comentarios. Se aplica `app.set('trust proxy', …)` en `server.ts` según `TRUST_PROXY`.
- Modify: `CLAUDE.md`: una sección «Acceso» bajo *Seguridad del servidor*, con sesiones, throttle, reto, política, passkeys, handoff, correo y SSO, en el estilo del resto, más una línea en *Variables obligatorias* sobre `WEB_ORIGIN` para passkeys y SSO.
- Modify: `apps/web/src/i18n/locales/en/auth.json`: completo, sin claves que falten respecto a `es`.

- [ ] **Step 1:** Ejecutar `npm test --workspace apps/server` (con `AUTH_TEST_DATABASE_URL`), `npm run check:neutral --workspace apps/server`, `npm run typecheck --workspace apps/web`, `npm run lint --workspace apps/web` y `npm run format:check`. Esperado: todo PASS.
- [ ] **Step 2:** Recorrer en el navegador los flujos de punta a punta: contraseña, contraseña + TOTP, respaldo, passkey, código por correo, enlace, SSO, política con alta obligada, cerrar sesiones y bloqueo por intentos. Hacer una captura de cada pantalla nueva.
- [ ] **Step 3:** Commit con el mensaje `Acceso: cierre, documentación y variables`.
