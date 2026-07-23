# Apps/Módulos activables — pantalla unificada estilo Odoo

Fecha: 2026-07-22
Rama: `feat/modular-hexagonal-web`

## Contexto

Hoy existen dos mecanismos de activación independientes y no unificados:

1. **Módulos core** (`apps/web/src/modules/<id>/module.ts`): cada `Module`
   puede tener un `featureFlag` (string) que se comprueba contra
   `useTheme().flags[key]` en `IconSidebar.tsx`/`ModuleTabBar.tsx`. Solo
   Logística (`logisticsEnabled`) y 5 sub-flags de RRHH usan este mecanismo
   hoy — el resto de módulos core (Inventario, Partners, Contabilidad,
   Ventas, Compras, Analytics, Reports, Asistente IA) no tienen flag: están
   siempre activos, sin forma de desactivarlos por tenant.
2. **Plugins** (`/plugins/*`): tienen su propio ciclo de vida completo vía
   la tabla `TenantPlugin` (schema `public`) + `TenantPluginCache` +
   `PluginManager.tsx` (grid de tarjetas con toggle activar/desactivar que
   ya refresca el sidebar en caliente vía `reloadManifests()`).

No hay una sola pantalla que liste todo lo instalable (módulos core +
plugins) con una experiencia de activación consistente, al estilo del
grid de "Apps" de Odoo. Este spec cubre esa pantalla unificada.

De paso, se detectó que `PUT /api/config/:section` (usado por
`CompanySettings.tsx` para branding/format/**flags**/app/fiscal/backup) y
`POST /api/plugins/:pluginId/activate|deactivate` no tienen ningún control
de rol — cualquier usuario autenticado del tenant puede llamarlos
directamente. Como la nueva pantalla Apps expone activación de módulos y
plugins bajo una misma superficie de administración, este spec cierra ese
hueco puntual reutilizando el middleware `adminMiddleware` ya existente
(`apps/server/src/api/middleware/adminAuth.ts`) — no se audita el resto de
rutas REST (ver memoria `rest-api-permission-gap`, que sigue abierta como
ítem aparte).

## Requisitos

- Pantalla `/apps` (nuevo módulo top-level `apps`, sustituye a `plugins`
  en el navbar) con un grid de tarjetas que mezcla:
  - Módulos core activables (los que tengan `featureFlag` en su
    manifiesto), agrupados por categoría.
  - Plugins instalados (una tarjeta por plugin, igual que hoy en
    `PluginManager.tsx`).
- Cada tarjeta: icono, nombre, descripción corta, badge de categoría,
  badge de madurez si aplica (`alpha`/`beta`/`dev`), toggle on/off.
- Toggle de módulo core → `PUT /api/config/flags`. Toggle de plugin →
  `POST /api/plugins/:id/activate|deactivate` (sin cambios de contrato).
  Ambos deben reflejarse en el sidebar sin recargar la página.
- Módulos siempre-on (`home`, `configuration`, `system`) NO aparecen en
  `/apps` — no tienen flag, no son desactivables.
- Cero migración de datos: los flags nuevos son claves añadidas a
  `FlagsConfig`/`FLAGS_DEFAULTS`, con default `true` (preserva el
  comportamiento actual de cualquier tenant existente). `logisticsEnabled`
  no se toca (ya vive en `flags`, default `false`, sin cambios).
- Enforcement solo en frontend (oculta nav + bloquea ruta), igual que el
  comportamiento actual de `logisticsEnabled`. No se tocan rutas API de
  negocio.
- `/apps` solo visible para ADMIN/SUPERUSER.
- `PUT /api/config/:section` y `POST /api/plugins/:id/activate|deactivate`
  pasan a requerir `adminMiddleware`.
- La pestaña "Flags" de `CompanySettings.tsx` pierde los toggles que se
  mudan a Apps (`logisticsEnabled` y los módulos core nuevos); conserva
  los flags puramente de comportamiento (`allowNegativeStock`,
  `watermarkDraft`, `logisticsOnly`, sub-flags de RRHH,
  `trackingChatEnabled`, etc.).

## Diseño

### 1. Almacenamiento — extender `FlagsConfig` (sin tabla nueva, sin migración)

En `apps/server/src/core/config/appConfig.ts`, añadir a `FlagsConfig` y a
`FLAGS_DEFAULTS` (todas con default `true`):

```ts
inventoryEnabled: boolean;
salesEnabled: boolean;
purchasesEnabled: boolean;
partnersEnabled: boolean;
accountingEnabled: boolean;
analyticsEnabled: boolean;
reportsEnabled: boolean;
hrEnabled: boolean;
assistantEnabled: boolean;
```

Replicar el mismo cambio en la copia del tipo en
`apps/web/src/context/ThemeContext.tsx` (`FlagsConfig`/`FLAGS_DEFAULTS`),
que hoy ya está desincronizada respecto al servidor (le faltan los 5
sub-flags de RRHH y `trackingChatEnabled`) — aprovechar para sincronizarla
del todo.

No se crea sección `SystemConfig` nueva ni se migra ningún dato: las
claves nuevas simplemente no existen aún en ningún tenant, así que
`getConfigSection` les aplica el default (`true`) hasta que un admin las
desactive explícitamente desde `/apps`.

### 2. Registry — `description` y `category` en `Module`

En `apps/web/src/modules/registry.ts`, añadir a la interfaz `Module`:

```ts
description?: string; // usado solo por la tarjeta en /apps
category?: string;    // agrupación visual en /apps (fallback: "General")
adminOnly?: boolean;  // como superuserOnly, pero para ADMIN + SUPERUSER
```

`adminOnly` es necesario porque hoy `Module` solo tiene `superuserOnly`
(excluiría a ADMIN también) y no hay forma de ocultar un módulo completo
del sidebar solo para roles no-admin — el requisito "`/apps` solo visible
para ADMIN/SUPERUSER" lo necesita. Se comprueba en los mismos dos sitios
donde ya se comprueba `superuserOnly`
(`apps/web/src/components/layout/IconSidebar.tsx:74` y `:142`).

Sin más cambios en `SubTab` ni en el resto de consumidores — campos
opcionales, ignorados por `ModuleTabBar`.

### 3. Mapeo de módulos activables

| id (`Module.id`) | `featureFlag` (nuevo salvo indicado) | `category` | Siempre-on |
|---|---|---|---|
| `home` | — | — | Sí |
| `configuration` | — | — | Sí |
| `system` | — | — | Sí |
| `inventory` | `inventoryEnabled` | Operaciones | No |
| `partners` | `partnersEnabled` | Operaciones | No |
| `sales` | `salesEnabled` | Ventas y compras | No |
| `purchases` | `purchasesEnabled` | Ventas y compras | No |
| `accounting` | `accountingEnabled` | Finanzas | No |
| `analytics` | `analyticsEnabled` | Análisis | No |
| `reports` | `reportsEnabled` | Análisis | No |
| `hr` | `hrEnabled` | RRHH | No |
| `logistics` | `logisticsEnabled` (ya existe) | Logística | No |
| `assistant` | `assistantEnabled` | Productividad | No |

Cada `module.ts` de estos módulos añade `featureFlag`, `description` y
`category` a su export `nav`. `hrEnabled` es un flag nuevo de nivel
"módulo completo", independiente de los 5 sub-flags existentes
(`hrShiftsEnabled`, etc.) que siguen controlando sub-tabs una vez el
módulo HR está activo.

### 4. Backend — cerrar el hueco de permisos

En `apps/server/src/api/config.ts`, la función `mount()` genera tanto el
`GET` como el `PUT` de cada sección. Añadir `adminMiddleware` (import de
`../middleware/adminAuth`) solo al `router.put(...)` dentro de `mount()` —
el `GET` sigue abierto a cualquier miembro del tenant (necesario para que
la UI normal lea branding/format/flags sin ser admin). Esto cubre de una
vez `branding`, `format`, `flags`, `app`, `fiscal` y `backup`.

En `apps/server/src/api/plugins.ts`, añadir `adminMiddleware` a
`POST /:pluginId/activate` y `POST /:pluginId/deactivate`.

No se toca `/storage` (tiene sus propias rutas fuera de `mount()`, fuera
de alcance de este spec) ni ninguna otra ruta REST — el resto del hueco
descrito en la memoria `rest-api-permission-gap` sigue pendiente como
ítem separado.

### 5. Pantalla `/apps` (frontend)

Módulo `apps/web/src/modules/plugins/module.ts` cambia su `Module.id` de
`'plugins'` a `'apps'`, label "Apps", `adminOnly: true`, y `NAV_ORDER` en
`apps/web/src/modules/index.ts` sustituye la entrada `'plugins'` por
`'apps'` (misma posición). `apps/web/src/context/PluginContext.tsx:255`
busca el módulo destino de los `menuItems` legacy por id literal
`'plugins'` — hay que actualizarlo a `'apps'` o los plugins que aún usen
ese campo deprecado dejan de mostrar sus items silenciosamente (el
`if (legacyTarget)` los descarta sin avisar).

`PluginManager.tsx` (o su sucesor, mismo archivo) conserva su estructura
de tabs internos ("Aplicaciones" / "Base de datos" / "Desarrollo"), pero
la tab "Aplicaciones" pasa a renderizar un grid único que combina:

- Módulos core con `featureFlag` (leídos de `CORE_MODULES`, filtrando los
  que no tengan flag), agrupados por `category`.
- Plugins instalados (`pluginsApi.list()`, sin cambios).

Cada tarjeta usa primitivas de `@openfactu/ui` (`Card`, `Badge`, el
checkbox/switch existente). Toggle de módulo core:
`update('flags', { [featureFlag]: !current })` (mismo helper que ya usa
`ThemeContext`/`CompanySettings`, dispara re-render inmediato del
sidebar). Toggle de plugin: sin cambios respecto a hoy
(`togglePlugin` + `reloadManifests()`). Sin diálogo de confirmación —
toggle optimista + toast, igual que el patrón actual de flags y plugins.

### 6. `CompanySettings.tsx` — pestaña "Flags"

Se elimina solo la fila `logisticsEnabled` (843-848) — se muda a
`/apps` junto con el resto de módulos core. Las 5 filas de RRHH
(861-890, `hrShiftsEnabled`/`hrTimeclockEnabled`/`hrIncidentsEnabled`/
`hrPlanningEnabled`/`hrAdvancedEnabled`) **se quedan tal cual**: gestionan
sub-tabs dentro del módulo HR, no el módulo HR completo (ese es
`hrEnabled`, la fila nueva que sí vive en Apps — ver sección 3). Se
conservan también `logisticsOnly`, `allowNegativeStock`, `watermarkDraft`,
`trackingChatEnabled` y el resto de flags de comportamiento puro que no
representan un módulo completo.

## Orden de ejecución

1. `FlagsConfig`/`FLAGS_DEFAULTS` (servidor + web) — nuevas claves,
   default `true`. Verificar que ThemeContext no rompe con las claves
   añadidas.
2. `Module`/`SubTab` registry — campos `description`/`category` +
   poblarlos en cada `module.ts` de la tabla de la sección 3.
3. Backend: `adminMiddleware` en `mount()` (config.ts) y en
   activate/deactivate (plugins.ts).
4. Renombrar módulo `plugins` → `apps` en `NAV_ORDER` + `module.ts`.
5. Grid unificado en la pantalla Apps (fusiona `CORE_MODULES` filtrados +
   `pluginsApi.list()`).
6. Limpiar la pestaña "Flags" de `CompanySettings.tsx`.

## Tests

No hay infraestructura de test en el repo (Jest/Vitest no están
disponibles). Verificación manual:

- Con un tenant existente: confirmar que tras el deploy, todos los
  módulos antes siempre-on siguen visibles (default `true` sin acción del
  admin).
- Desactivar un módulo core desde `/apps` como ADMIN → desaparece del
  sidebar sin recargar; recargar la página → sigue desactivado
  (persistido); reactivarlo lo devuelve.
- Confirmar que Logística sigue funcionando exactamente igual que antes
  (mismo flag, sin migración).
- Activar/desactivar un plugin desde el nuevo grid → mismo comportamiento
  que en `PluginManager.tsx` hoy.
- Como usuario no-admin: `PUT /api/config/flags` y
  `POST /api/plugins/:id/activate` deben devolver 403; `/apps` no debe
  aparecer en el sidebar.

## Riesgos

- ~~La duplicación actual de `FlagsConfig` entre servidor y web ya estaba
  desincronizada antes de este cambio...~~ **Resuelto por adelantado**
  (commit `72e842f`): se sincronizó `ThemeContext.tsx` con los 6 campos
  que le faltaban (`trackingChatEnabled` + 5 sub-flags de RRHH) y se
  quitaron los `(flagsDraft as any)` de `CompanySettings.tsx`. El paso 1
  del plan de implementación parte ya de las dos copias sincronizadas.
- Añadir `adminMiddleware` a `mount()` afecta también a
  branding/format/app/fiscal/backup, no solo a flags — si algún flujo no
  ADMIN dependía de poder guardar, por ejemplo, su propia configuración
  de `format`, dejaría de poder hacerlo. No se encontró ningún caso así
  en la exploración, pero conviene un smoke test explícito de
  `CompanySettings.tsx` completo (todas las pestañas) con un usuario
  ADMIN real antes de mergear.
- Ninguno de los flags nuevos tiene aún control de dependencias (p. ej.
  desactivar `partnersEnabled` no impide crear documentos que referencian
  partners) — fuera de alcance de este spec (enforcement solo-frontend,
  decisión ya tomada).
