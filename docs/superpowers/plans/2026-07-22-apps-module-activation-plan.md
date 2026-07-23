# Apps/Módulos activables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar de alta una pantalla `/apps` que unifica módulos core activables y plugins instalados en un solo grid de tarjetas con toggle on/off, estilo Odoo.

**Architecture:** Extiende `FlagsConfig` (servidor + web) con una clave booleana por módulo core activable, default `true` (cero migración, cero regresión); añade `description`/`category`/`adminOnly` al registry de módulos (`registry.ts`); renombra el módulo `plugins`→`apps` y fusiona sus tarjetas de plugin con nuevas tarjetas de módulo core en un único grid dentro de `PluginManager.tsx`; cierra el hueco de permisos en las rutas que esa pantalla ahora expone (`PUT /api/config/:section`, activar/desactivar plugin).

**Tech Stack:** React + TypeScript (Vite) en `apps/web`; Express + Drizzle en `apps/server`; `@openfactu/ui` para primitivas; `lucide-react` para iconos.

Spec de referencia: [`docs/superpowers/specs/2026-07-22-apps-module-activation-design.md`](../specs/2026-07-22-apps-module-activation-design.md).

## Global Constraints

- No hay test runner en el repo (ni Jest ni Vitest — ver CLAUDE.md). Cada tarea se verifica con `tsc`/`typecheck` más pasos manuales explícitos, no con tests automatizados.
- Prettier: `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`.
- Toda nueva UI se construye con componentes de `@openfactu/ui` cuando exista equivalente (`Badge`, etc.); solo se usa HTML/CSS a mano donde ya era el patrón existente (p. ej. el toggle a mano de `PluginCard.tsx`, que se replica por consistencia visual).
- Los defaults de los 9 flags nuevos deben ser `true` — ningún tenant existente puede perder acceso a un módulo que hoy ve siempre.
- Comentarios y textos de cara al usuario en español, consistente con el resto del código.
- `logisticsEnabled` no se renombra ni se mueve de sección — sigue viviendo en `flags` exactamente igual que hoy.

---

### Task 1: Sincronizar `FlagsConfig` (servidor + web) con las claves de módulos activables

**Files:**
- Modify: `apps/server/src/core/config/appConfig.ts`
- Modify: `apps/web/src/context/ThemeContext.tsx`

**Interfaces:**
- Produces: 9 claves booleanas nuevas en `FlagsConfig`/`FLAGS_DEFAULTS` (ambas copias, servidor y web): `inventoryEnabled`, `salesEnabled`, `purchasesEnabled`, `partnersEnabled`, `accountingEnabled`, `analyticsEnabled`, `reportsEnabled`, `hrEnabled`, `assistantEnabled`. Todas con default `true`. Tareas posteriores (3, 6, 7) leen y escriben estas claves.

- [ ] **Step 1: Añadir las 9 claves a `FlagsConfig` en `appConfig.ts`**

En `apps/server/src/core/config/appConfig.ts`, sustituir:

```ts
  /** RRHH avanzado+ : convenios, evaluaciones, comisiones, rendimiento,
   *  coste laboral, tareas y Gantt. */
  hrAdvancedEnabled: boolean;
}
```

por:

```ts
  /** RRHH avanzado+ : convenios, evaluaciones, comisiones, rendimiento,
   *  coste laboral, tareas y Gantt. */
  hrAdvancedEnabled: boolean;
  /** Módulos core activables desde la pantalla /apps. Cada uno oculta su
   *  módulo entero del sidebar cuando es false. Default true: preserva el
   *  comportamiento de cualquier tenant existente hasta que un admin lo
   *  desactive explícitamente. */
  inventoryEnabled: boolean;
  salesEnabled: boolean;
  purchasesEnabled: boolean;
  partnersEnabled: boolean;
  accountingEnabled: boolean;
  analyticsEnabled: boolean;
  reportsEnabled: boolean;
  hrEnabled: boolean;
  assistantEnabled: boolean;
}
```

- [ ] **Step 2: Añadir los defaults correspondientes en el mismo archivo**

Sustituir:

```ts
  hrAdvancedEnabled: false,
};
```

por:

```ts
  hrAdvancedEnabled: false,
  inventoryEnabled: true,
  salesEnabled: true,
  purchasesEnabled: true,
  partnersEnabled: true,
  accountingEnabled: true,
  analyticsEnabled: true,
  reportsEnabled: true,
  hrEnabled: true,
  assistantEnabled: true,
};
```

- [ ] **Step 3: Verificar tipos del servidor**

Run: `cd apps/server && npx tsc --noEmit`
Expected: sin salida (sin errores).

- [ ] **Step 4: Repetir Steps 1-2 en `ThemeContext.tsx` (copia del cliente)**

En `apps/web/src/context/ThemeContext.tsx`, sustituir:

```ts
  /** RRHH avanzado+: convenios, evaluaciones, comisiones, rendimiento, coste laboral, tareas y Gantt. */
  hrAdvancedEnabled: boolean;
}
```

por:

```ts
  /** RRHH avanzado+: convenios, evaluaciones, comisiones, rendimiento, coste laboral, tareas y Gantt. */
  hrAdvancedEnabled: boolean;
  /** Módulos core activables desde /apps. Default true: preserva el
   *  comportamiento de cualquier tenant existente. */
  inventoryEnabled: boolean;
  salesEnabled: boolean;
  purchasesEnabled: boolean;
  partnersEnabled: boolean;
  accountingEnabled: boolean;
  analyticsEnabled: boolean;
  reportsEnabled: boolean;
  hrEnabled: boolean;
  assistantEnabled: boolean;
}
```

Y sustituir:

```ts
  hrAdvancedEnabled: false,
};
```

por:

```ts
  hrAdvancedEnabled: false,
  inventoryEnabled: true,
  salesEnabled: true,
  purchasesEnabled: true,
  partnersEnabled: true,
  accountingEnabled: true,
  analyticsEnabled: true,
  reportsEnabled: true,
  hrEnabled: true,
  assistantEnabled: true,
};
```

- [ ] **Step 5: Verificar tipos del cliente**

Run: `cd apps/web && npm run typecheck`
Expected: termina sin errores (sin líneas de error de `tsc`).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/core/config/appConfig.ts apps/web/src/context/ThemeContext.tsx
git commit -m "feat: añadir flags de activación por módulo core a FlagsConfig"
```

---

### Task 2: `Module.description` / `.category` / `.adminOnly` en el registry + wiring en `IconSidebar`

**Files:**
- Modify: `apps/web/src/modules/registry.ts`
- Modify: `apps/web/src/components/layout/IconSidebar.tsx`

**Interfaces:**
- Consumes: nada de la Task 1.
- Produces: `Module.description?: string`, `Module.category?: string`, `Module.adminOnly?: boolean` — leídos por la Task 3 (poblar los module.ts) y la Task 5 (módulo `apps`).

- [ ] **Step 1: Añadir los tres campos a la interfaz `Module`**

En `apps/web/src/modules/registry.ts`, sustituir:

```ts
export interface Module {
  id: string;
  label: string;
  /** Nombre de un icono lucide-react. */
  icon: string;
  subTabs: SubTab[];
  /** Si es true, solo se renderiza en el sidebar para usuarios con rol SUPERUSER. */
  superuserOnly?: boolean;
  /** Si se pasa, el módulo solo se renderiza si `flags[featureFlag] === true`. */
  featureFlag?: string;
  /** Si es true, el módulo se esconde cuando el flag `logisticsOnly` está activo
   *  (modo "sólo logística" para clientes que nos contratan únicamente el
   *  módulo de reparto). Se marcan los módulos que NO son logísticos. */
  hiddenInLogisticsOnly?: boolean;
}
```

por:

```ts
export interface Module {
  id: string;
  label: string;
  /** Nombre de un icono lucide-react. */
  icon: string;
  subTabs: SubTab[];
  /** Si es true, solo se renderiza en el sidebar para usuarios con rol SUPERUSER. */
  superuserOnly?: boolean;
  /** Si es true, solo se renderiza en el sidebar para ADMIN o SUPERUSER
   *  (a diferencia de superuserOnly, que excluye también a ADMIN). */
  adminOnly?: boolean;
  /** Si se pasa, el módulo solo se renderiza si `flags[featureFlag] === true`. */
  featureFlag?: string;
  /** Si es true, el módulo se esconde cuando el flag `logisticsOnly` está activo
   *  (modo "sólo logística" para clientes que nos contratan únicamente el
   *  módulo de reparto). Se marcan los módulos que NO son logísticos. */
  hiddenInLogisticsOnly?: boolean;
  /** Descripción corta usada solo por la tarjeta en /apps. */
  description?: string;
  /** Agrupación visual en /apps (fallback: "General" si no se pasa). */
  category?: string;
}
```

- [ ] **Step 2: Comprobar `adminOnly` en el filtro de sidebar (desktop)**

En `apps/web/src/components/layout/IconSidebar.tsx`, sustituir:

```ts
    const logisticsOnly = !!(flags as any).logisticsOnly;
    return allModules.filter((m) => {
      if (m.superuserOnly && user?.role !== 'SUPERUSER') return false;
      if (m.featureFlag && !(flags as any)[m.featureFlag]) return false;
```

por:

```ts
    const logisticsOnly = !!(flags as any).logisticsOnly;
    const isAdminRole = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
    return allModules.filter((m) => {
      if (m.superuserOnly && user?.role !== 'SUPERUSER') return false;
      if (m.adminOnly && !isAdminRole) return false;
      if (m.featureFlag && !(flags as any)[m.featureFlag]) return false;
```

- [ ] **Step 3: Comprobar `adminOnly` en el filtro del buscador del drawer**

En el mismo archivo, sustituir:

```ts
    for (const mod of allModules) {
      // Saltamos sólo los de SUPERUSER si el user no lo es.
      if (mod.superuserOnly && user?.role !== 'SUPERUSER') continue;
```

por:

```ts
    for (const mod of allModules) {
      // Saltamos sólo los de SUPERUSER si el user no lo es.
      if (mod.superuserOnly && user?.role !== 'SUPERUSER') continue;
      if (mod.adminOnly && user?.role !== 'ADMIN' && user?.role !== 'SUPERUSER') continue;
```

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/web && npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/registry.ts apps/web/src/components/layout/IconSidebar.tsx
git commit -m "feat: añadir description/category/adminOnly a Module para la pantalla Apps"
```

---

### Task 3: Poblar `featureFlag`/`description`/`category` en los `module.ts` activables

**Files:**
- Modify: `apps/web/src/modules/inventory/module.ts`
- Modify: `apps/web/src/modules/partners/module.ts`
- Modify: `apps/web/src/modules/documents/module.ts` (dos entradas: `sales`, `purchases`)
- Modify: `apps/web/src/modules/accounting/module.ts`
- Modify: `apps/web/src/modules/analytics/module.ts`
- Modify: `apps/web/src/modules/reports/module.tsx`
- Modify: `apps/web/src/modules/hr/module.ts`
- Modify: `apps/web/src/modules/logistics/module.ts`
- Modify: `apps/web/src/modules/ai/module.ts`

**Interfaces:**
- Consumes: `Module.featureFlag`/`.description`/`.category` (Task 2), claves de `FlagsConfig` de la Task 1.
- Produces: 9 entradas de `CORE_MODULES` con `featureFlag` — la Task 6/7 las filtra con `Boolean(m.featureFlag)` para construir el grid de Apps.

- [ ] **Step 1: `inventory/module.ts`**

Sustituir:

```ts
  nav: {
    id: 'inventory',
    label: 'Inventario',
    icon: 'Package',
    subTabs: [
```

por:

```ts
  nav: {
    id: 'inventory',
    label: 'Inventario',
    icon: 'Package',
    featureFlag: 'inventoryEnabled',
    description: 'Catálogo, categorías, unidades, almacenes y movimientos de stock.',
    category: 'Operaciones',
    subTabs: [
```

- [ ] **Step 2: `partners/module.ts`**

Sustituir:

```ts
  nav: {
    id: 'partners',
    label: 'Interlocutores',
    icon: 'Users',
    subTabs: [
```

por:

```ts
  nav: {
    id: 'partners',
    label: 'Interlocutores',
    icon: 'Users',
    featureFlag: 'partnersEnabled',
    description: 'Directorio de clientes y proveedores, agrupados por categorías.',
    category: 'Operaciones',
    subTabs: [
```

- [ ] **Step 3: `documents/module.ts` — entrada `sales`**

Sustituir:

```ts
    {
      id: 'sales',
      label: 'Ventas',
      icon: 'ShoppingCart',
      hiddenInLogisticsOnly: true,
      subTabs: [
```

por:

```ts
    {
      id: 'sales',
      label: 'Ventas',
      icon: 'ShoppingCart',
      hiddenInLogisticsOnly: true,
      featureFlag: 'salesEnabled',
      description: 'Pedidos, albaranes y facturas de venta, con tarifas de precio.',
      category: 'Ventas y compras',
      subTabs: [
```

- [ ] **Step 4: `documents/module.ts` — entrada `purchases`**

Sustituir:

```ts
    {
      id: 'purchases',
      label: 'Compras',
      icon: 'Truck',
      hiddenInLogisticsOnly: true,
      subTabs: [
```

por:

```ts
    {
      id: 'purchases',
      label: 'Compras',
      icon: 'Truck',
      hiddenInLogisticsOnly: true,
      featureFlag: 'purchasesEnabled',
      description: 'Pedidos, albaranes y facturas de compra a proveedores.',
      category: 'Ventas y compras',
      subTabs: [
```

- [ ] **Step 5: `accounting/module.ts`**

Sustituir:

```ts
  nav: {
    id: 'accounting',
    label: 'Contabilidad',
    icon: 'Wallet',
    hiddenInLogisticsOnly: true,
    subTabs: [
```

por:

```ts
  nav: {
    id: 'accounting',
    label: 'Contabilidad',
    icon: 'Wallet',
    hiddenInLogisticsOnly: true,
    featureFlag: 'accountingEnabled',
    description: 'Plan contable, asientos, libro mayor, periodos e impuestos.',
    category: 'Finanzas',
    subTabs: [
```

- [ ] **Step 6: `analytics/module.ts`**

Sustituir:

```ts
  nav: {
    id: 'analytics',
    label: 'Analítica',
    icon: 'Layers',
    hiddenInLogisticsOnly: true,
    subTabs: [
```

por:

```ts
  nav: {
    id: 'analytics',
    label: 'Analítica',
    icon: 'Layers',
    hiddenInLogisticsOnly: true,
    featureFlag: 'analyticsEnabled',
    description: 'Centros de coste, centros de beneficio y proyectos/órdenes internas.',
    category: 'Análisis',
    subTabs: [
```

- [ ] **Step 7: `reports/module.tsx`**

Sustituir:

```ts
  nav: {
    id: 'reports',
    label: 'Informes',
    icon: 'BarChart3',
    subTabs: [
```

por:

```ts
  nav: {
    id: 'reports',
    label: 'Informes',
    icon: 'BarChart3',
    featureFlag: 'reportsEnabled',
    description: 'Informes contables, de gestión, RRHH y stock.',
    category: 'Análisis',
    subTabs: [
```

- [ ] **Step 8: `hr/module.ts`**

Sustituir:

```ts
export const hrModule: ModuleManifest = {
  nav: {
    id: 'hr',
    hiddenInLogisticsOnly: true,
    label: 'Recursos Humanos',
    icon: 'UsersRound',
    subTabs: [
```

por:

```ts
export const hrModule: ModuleManifest = {
  nav: {
    id: 'hr',
    hiddenInLogisticsOnly: true,
    label: 'Recursos Humanos',
    icon: 'UsersRound',
    featureFlag: 'hrEnabled',
    description:
      'Empleados, departamentos y nóminas. Los sub-módulos de turnos, fichajes, planificación e incidencias se activan aparte, en Ajustes → Empresa → Flags.',
    category: 'RRHH',
    subTabs: [
```

Nota: `hrEnabled` es un flag NUEVO de módulo completo, distinto de los 5 sub-flags (`hrShiftsEnabled`, etc.) que ya existen en este mismo archivo — esos NO se tocan, siguen gestionando sub-tabs dentro de HR.

- [ ] **Step 9: `logistics/module.ts`**

Sustituir:

```ts
  nav: {
    id: 'logistics',
    label: 'Logística',
    icon: 'Route',
    /** Visible solo si `flags.logisticsEnabled=true`. El filtrado lo hace
     *  `PluginContext` al mergear módulos. */
    featureFlag: 'logisticsEnabled',
    subTabs: [
```

por:

```ts
  nav: {
    id: 'logistics',
    label: 'Logística',
    icon: 'Route',
    /** Visible solo si `flags.logisticsEnabled=true`. El filtrado lo hace
     *  `IconSidebar`/`ModuleTabBar` al leer `useTheme().flags`. */
    featureFlag: 'logisticsEnabled',
    description: 'Envíos, rutas de reparto y seguimiento en tiempo real.',
    category: 'Logística',
    subTabs: [
```

(De paso se corrige un comentario desactualizado que atribuía el filtrado a `PluginContext` — el filtrado real ocurre en `IconSidebar`/`ModuleTabBar`, ver Task 2.)

- [ ] **Step 10: `ai/module.ts`**

Sustituir:

```ts
export const aiModule: ModuleManifest = {
  nav: {
    id: 'assistant',
    label: 'Asistente IA',
    icon: 'Bot',
    subTabs: [{ id: 'ai-chat', label: 'Keiro', path: '/ai/chat', status: 'beta' }],
  },
```

por:

```ts
export const aiModule: ModuleManifest = {
  nav: {
    id: 'assistant',
    label: 'Asistente IA',
    icon: 'Bot',
    featureFlag: 'assistantEnabled',
    description: 'Chat con Keiro, el asistente de IA de Keirost.',
    category: 'Productividad',
    subTabs: [{ id: 'ai-chat', label: 'Keiro', path: '/ai/chat', status: 'beta' }],
  },
```

- [ ] **Step 11: Verificar tipos**

Run: `cd apps/web && npm run typecheck`
Expected: sin errores.

- [ ] **Step 12: Verificación manual — nada cambia todavía para el usuario**

Con `npm run dev:all` corriendo, iniciar sesión como cualquier usuario y confirmar que el sidebar se ve exactamente igual que antes (todos los flags nuevos son `true` por defecto, así que ningún módulo desaparece).

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/modules/inventory/module.ts apps/web/src/modules/partners/module.ts \
  apps/web/src/modules/documents/module.ts apps/web/src/modules/accounting/module.ts \
  apps/web/src/modules/analytics/module.ts apps/web/src/modules/reports/module.tsx \
  apps/web/src/modules/hr/module.ts apps/web/src/modules/logistics/module.ts \
  apps/web/src/modules/ai/module.ts
git commit -m "feat: featureFlag/description/category en los módulos core activables"
```

---

### Task 4: Cerrar el hueco de permisos en config y activación de plugins

**Files:**
- Modify: `apps/server/src/api/config.ts`
- Modify: `apps/server/src/api/plugins.ts`

**Interfaces:**
- Consumes: `adminMiddleware` de `apps/server/src/api/middleware/adminAuth.ts` (ya existe, exporta `(req, res, next)`, responde 403 si `payload.role` no es `'ADMIN'`/`'SUPERUSER'`).

- [ ] **Step 1: Importar `adminMiddleware` en `config.ts`**

Sustituir:

```ts
import { Router } from 'express';
import { getConfigSection, setConfigSection } from '../core/config/systemConfigSection';
```

por:

```ts
import { Router } from 'express';
import { getConfigSection, setConfigSection } from '../core/config/systemConfigSection';
import { adminMiddleware } from './middleware/adminAuth';
```

- [ ] **Step 2: Aplicar `adminMiddleware` al `PUT` dentro de `mount()`**

Sustituir:

```ts
  router.put(`/${section}`, async (req: any, res) => {
```

por:

```ts
  router.put(`/${section}`, adminMiddleware, async (req: any, res) => {
```

Esto cubre de una vez `branding`, `format`, `flags`, `app`, `fiscal` y `backup` (todos montados vía `mount()`). El `GET` de la misma función no se toca — sigue abierto a cualquier miembro del tenant.

- [ ] **Step 3: Aplicar `adminMiddleware` a activar/desactivar plugin**

`apps/server/src/api/plugins.ts` ya importa `adminMiddleware` en la línea 13 pero no lo usa en ninguna ruta. Sustituir:

```ts
router.post('/:pluginId/activate', async (req: any, res) => {
```

por:

```ts
router.post('/:pluginId/activate', adminMiddleware, async (req: any, res) => {
```

y sustituir:

```ts
router.post('/:pluginId/deactivate', async (req: any, res) => {
```

por:

```ts
router.post('/:pluginId/deactivate', adminMiddleware, async (req: any, res) => {
```

- [ ] **Step 4: Verificar tipos del servidor**

Run: `cd apps/server && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Verificación manual con el servidor corriendo**

Con `npm run dev:server` activo y un usuario de rol `USER` (no ADMIN) logueado, desde la consola del navegador (con su token real):

```js
fetch('/api/config/flags', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ inventoryEnabled: false }),
}).then((r) => console.log(r.status));
```

Expected: `403`. Repetir el mismo fetch con el token de un usuario `ADMIN` → Expected: `200`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/api/config.ts apps/server/src/api/plugins.ts
git commit -m "fix(server): exigir rol admin en PUT /api/config/:section y activar/desactivar plugin"
```

---

### Task 5: Renombrar el módulo `plugins` → `apps`

**Files:**
- Modify: `apps/web/src/modules/plugins/module.ts`
- Modify: `apps/web/src/modules/index.ts`
- Modify: `apps/web/src/context/PluginContext.tsx`

**Interfaces:**
- Consumes: `Module.adminOnly` (Task 2).
- Produces: módulo de navbar con `id: 'apps'`, ruta `/apps`, visible solo ADMIN/SUPERUSER — consumido por la Task 6/7 (el contenido de la página en sí).

- [ ] **Step 1: Renombrar el manifiesto en `plugins/module.ts`**

Sustituir el archivo completo:

```ts
import type { ModuleManifest } from '../types';
import { PluginManager } from './pages/PluginManager';

export const pluginsModule: ModuleManifest = {
  nav: {
    id: 'plugins',
    label: 'Plugins',
    icon: 'Puzzle',
    subTabs: [{ id: 'plugins-manager', label: 'Gestor', path: '/plugins' }],
  },
  routes: [
    {
      pattern: '/plugins',
      Component: PluginManager,
      title: 'Plugins',
      iconName: 'Layers',
      permissionPath: '/plugins',
    },
  ],
};
```

por:

```ts
import type { ModuleManifest } from '../types';
import { PluginManager } from './pages/PluginManager';

export const appsModule: ModuleManifest = {
  nav: {
    id: 'apps',
    label: 'Apps',
    icon: 'LayoutGrid',
    adminOnly: true,
    subTabs: [{ id: 'apps-manager', label: 'Aplicaciones', path: '/apps' }],
  },
  routes: [
    {
      pattern: '/apps',
      Component: PluginManager,
      title: 'Apps',
      iconName: 'LayoutGrid',
      permissionPath: '/apps',
    },
  ],
};
```

- [ ] **Step 2: Actualizar el import y `NAV_ORDER` en `index.ts`**

Sustituir:

```ts
import { pluginsModule } from './plugins/module';
```

por:

```ts
import { appsModule } from './plugins/module';
```

Sustituir:

```ts
  logisticsModule,
  homeModule,
  aiModule,
  pluginsModule,
  settingsModule,
```

por:

```ts
  logisticsModule,
  homeModule,
  aiModule,
  appsModule,
  settingsModule,
```

Sustituir en `NAV_ORDER`:

```ts
  'logistics',
  'assistant',
  'plugins',
  'configuration',
```

por:

```ts
  'logistics',
  'assistant',
  'apps',
  'configuration',
```

- [ ] **Step 3: Actualizar el destino de `menuItems` legacy en `PluginContext.tsx`**

Sustituir:

```ts
      // 3) Legacy menuItems → mapear todos al módulo "plugins"
      const legacyTarget = merged.find((m) => m.id === 'plugins');
```

por:

```ts
      // 3) Legacy menuItems → mapear todos al módulo "apps" (antes "plugins")
      const legacyTarget = merged.find((m) => m.id === 'apps');
```

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/web && npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Verificación manual**

Con `npm run dev:all` corriendo:
- Logueado como ADMIN: el icono de sidebar antes llamado "Plugins" ahora dice "Apps"; al hacer click, la URL es `/apps` y la página (todavía con el contenido viejo de `PluginManager`, sin cambios de la Task 6/7) carga sin errores en consola.
- Logueado como un usuario `USER` sin permisos especiales: el icono "Apps" ya NO aparece en el sidebar.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/plugins/module.ts apps/web/src/modules/index.ts apps/web/src/context/PluginContext.tsx
git commit -m "refactor(web): renombrar módulo plugins -> apps"
```

---

### Task 6: `ModuleCard` — tarjeta de módulo core para el grid de Apps

**Files:**
- Create: `apps/web/src/modules/plugins/components/ModuleCard.tsx`

**Interfaces:**
- Consumes: `Module` (tipo de `@/modules`, con `label`/`icon`/`description?`/`category?`/`featureFlag?` ya poblados por la Task 3), `PluginIcon` (`@/components/PluginIcon`, prop `iconName?: string`), `Badge` de `@openfactu/ui` (prop `variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'teal'`).
- Produces: componente `ModuleCard` con props `{ module: Module; enabled: boolean; onToggle: () => void; isToggling: boolean }` — consumido por la Task 7.

- [ ] **Step 1: Crear el componente**

Crear `apps/web/src/modules/plugins/components/ModuleCard.tsx`:

```tsx
import React from 'react';
import { Badge } from '@openfactu/ui';
import { PluginIcon } from '@/components/PluginIcon';
import type { Module } from '@/modules';

interface ModuleCardProps {
  module: Module;
  enabled: boolean;
  onToggle: () => void;
  isToggling: boolean;
}

export const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  enabled,
  onToggle,
  isToggling,
}) => {
  return (
    <div
      className={`
        relative bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200
        ${
          enabled
            ? 'border-emerald-300 dark:border-emerald-700 shadow-sm shadow-emerald-100 dark:shadow-none'
            : 'border-slate-200 dark:border-slate-800 opacity-75'
        }
      `}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`
                w-11 h-11 rounded-xl flex items-center justify-center border shadow-sm overflow-hidden p-2
                ${
                  enabled
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-700'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }
              `}
            >
              <PluginIcon
                iconName={module.icon}
                size={24}
                className={
                  enabled
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }
              />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {module.label}
              </h3>
              {module.category && (
                <Badge variant="teal" className="mt-1">
                  {module.category}
                </Badge>
              )}
            </div>
          </div>

          <button
            onClick={onToggle}
            disabled={isToggling}
            className={`
              relative w-12 h-7 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
              ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
              ${
                enabled
                  ? 'bg-emerald-500 focus:ring-emerald-400'
                  : 'bg-slate-300 dark:bg-slate-600 focus:ring-slate-400'
              }
            `}
            title={enabled ? 'Desactivar módulo' : 'Activar módulo'}
          >
            <span
              className="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200"
              style={{
                left: enabled ? 'auto' : '2px',
                right: enabled ? '2px' : 'auto',
              }}
            />
          </button>
        </div>

        {module.description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
            {module.description}
          </p>
        )}

        <div className="flex items-center text-xs">
          <span
            className={`
              ml-auto flex items-center gap-1 font-semibold
              ${enabled ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}
            `}
          >
            {enabled ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/web && npm run typecheck`
Expected: sin errores. (El componente aún no se usa en ningún sitio — eso es la Task 7 — pero debe compilar de forma aislada.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/modules/plugins/components/ModuleCard.tsx
git commit -m "feat(web): componente ModuleCard para el grid de Apps"
```

---

### Task 7: Fusionar módulos core + plugins en un único grid dentro de `PluginManager.tsx`

**Files:**
- Modify: `apps/web/src/modules/plugins/pages/PluginManager.tsx`

**Interfaces:**
- Consumes: `useModules()` (`@/context/PluginContext`, devuelve `Module[]` ya mergeados core+plugin), `useTheme()` (`@/context/ThemeContext`, expone `{ flags: FlagsConfig; update: (section, patch) => Promise<void> }`), `ModuleCard` (Task 6).

- [ ] **Step 1: Añadir los imports nuevos**

Sustituir:

```ts
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Button, useToast } from '@openfactu/ui';
import { Puzzle, Database, RefreshCw, Zap, Key } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePlugins } from '@/context/PluginContext';
import { ApiError } from '@/shared/http';
import { DevKeysPanel } from '../components/DevKeysPanel';
import { PluginCard } from '../components/PluginCard';
import { pluginsApi } from '../api';
import type { PluginInfo } from '../domain/PluginInfo';
import type { PluginField } from '../domain/PluginField';
import type { PluginTable } from '../domain/PluginTable';
```

por:

```ts
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Button, useToast } from '@openfactu/ui';
import { Puzzle, Database, RefreshCw, Zap, Key, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePlugins, useModules } from '@/context/PluginContext';
import { useTheme } from '@/context/ThemeContext';
import { ApiError } from '@/shared/http';
import { DevKeysPanel } from '../components/DevKeysPanel';
import { PluginCard } from '../components/PluginCard';
import { ModuleCard } from '../components/ModuleCard';
import { pluginsApi } from '../api';
import type { PluginInfo } from '../domain/PluginInfo';
import type { PluginField } from '../domain/PluginField';
import type { PluginTable } from '../domain/PluginTable';
import type { Module } from '@/modules';
```

- [ ] **Step 2: Calcular los módulos activables agrupados por categoría**

Sustituir:

```ts
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [fields, setFields] = useState<PluginField[]>([]);
  const [tables, setTables] = useState<PluginTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [tab, setTab] = useState<'plugins' | 'dev'>('plugins');
```

por:

```ts
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [fields, setFields] = useState<PluginField[]>([]);
  const [tables, setTables] = useState<PluginTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [tab, setTab] = useState<'plugins' | 'dev'>('plugins');

  const allModules = useModules();
  const { flags, update } = useTheme();
  const activatableModules = allModules.filter((m) => Boolean(m.featureFlag));
  const modulesByCategory = activatableModules.reduce<Record<string, Module[]>>((acc, m) => {
    const cat = m.category || 'General';
    (acc[cat] = acc[cat] || []).push(m);
    return acc;
  }, {});
```

- [ ] **Step 3: Añadir el handler de toggle de módulo**

Sustituir:

```ts
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error al cambiar estado del plugin');
    } finally {
      setToggling(null);
    }
  };

  const activeCount = plugins.filter((p) => p.isActive).length;
```

por:

```ts
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error al cambiar estado del plugin');
    } finally {
      setToggling(null);
    }
  };

  const toggleModule = async (mod: Module) => {
    if (!mod.featureFlag) return;
    const key = mod.featureFlag;
    const currentlyEnabled = !!(flags as Record<string, boolean>)[key];
    setTogglingModule(mod.id);
    try {
      await update('flags', { [key]: !currentlyEnabled });
      toast.success(
        currentlyEnabled ? `Módulo "${mod.label}" desactivado` : `Módulo "${mod.label}" activado`,
      );
    } catch {
      toast.error('Error al cambiar estado del módulo');
    } finally {
      setTogglingModule(null);
    }
  };

  const activeCount = plugins.filter((p) => p.isActive).length;
```

- [ ] **Step 4: Actualizar el título y subtítulo de cabecera**

Sustituir:

```tsx
          <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Gestor de Plugins
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gestiona extensiones y credenciales de desarrollo.
          </p>
```

por:

```tsx
          <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Apps
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Activa o desactiva módulos y plugins para esta empresa.
          </p>
```

- [ ] **Step 5: Renombrar la pestaña "Plugins" a "Aplicaciones"**

Sustituir:

```tsx
        <button
          onClick={() => setTab('plugins')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'plugins'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-500 dark:text-ink-400 hover:text-accent dark:hover:text-accent'
          }`}
        >
          <span className="flex items-center gap-2">
            <Puzzle size={15} /> Plugins
          </span>
        </button>
```

por:

```tsx
        <button
          onClick={() => setTab('plugins')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'plugins'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-500 dark:text-ink-400 hover:text-accent dark:hover:text-accent'
          }`}
        >
          <span className="flex items-center gap-2">
            <LayoutGrid size={15} /> Aplicaciones
          </span>
        </button>
```

- [ ] **Step 6: Insertar el grid de módulos core antes del grid de plugins**

Sustituir:

```tsx
        <>
          {/* Plugin Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-10">
```

por:

```tsx
        <>
          {/* Módulos core activables, agrupados por categoría */}
          {Object.entries(modulesByCategory).map(([category, mods]) => (
            <div key={category} className="mb-8">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                {category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {mods.map((mod) => (
                  <ModuleCard
                    key={mod.id}
                    module={mod}
                    enabled={!!(flags as Record<string, boolean>)[mod.featureFlag as string]}
                    onToggle={() => toggleModule(mod)}
                    isToggling={togglingModule === mod.id}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Plugin Cards Grid */}
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
            Plugins
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-10">
```

- [ ] **Step 7: Verificar tipos**

Run: `cd apps/web && npm run typecheck`
Expected: sin errores.

- [ ] **Step 8: Verificación manual completa**

Con `npm run dev:all` corriendo, logueado como ADMIN:
1. Ir a `/apps` → ver tarjetas de módulos agrupadas por categoría ("Operaciones", "Ventas y compras", "Finanzas", "Análisis", "RRHH", "Logística", "Productividad") y, debajo, la sección "Plugins" con las tarjetas de plugin de siempre.
2. Desactivar "Analítica" desde su tarjeta → la tarjeta pasa a gris/"Inactivo" sin recargar la página, y el icono de Analítica desaparece del sidebar inmediatamente.
3. Recargar la página (F5) → Analítica sigue desactivada (persistida en `SystemConfig`).
4. Reactivarla desde la misma tarjeta → reaparece en el sidebar sin recargar.
5. Activar/desactivar un plugin instalado desde su tarjeta → comportamiento idéntico al de antes (sin regresión).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/modules/plugins/pages/PluginManager.tsx
git commit -m "feat(web): grid unificado de módulos core + plugins en /apps"
```

---

### Task 8: Limpiar la fila `logisticsEnabled` de `CompanySettings.tsx` y checklist final

**Files:**
- Modify: `apps/web/src/modules/settings/pages/CompanySettings.tsx`

**Interfaces:**
- Ninguna — tarea de limpieza de UI + verificación end-to-end de todo lo anterior.

- [ ] **Step 1: Quitar la fila de logística de la pestaña Flags**

Sustituir:

```tsx
              <FlagRow
                label="Gestión de logística"
                hint="Activa el módulo de envíos, rutas y seguimiento en tiempo real (mapa + timeline por albarán)."
                checked={!!flagsDraft.logisticsEnabled}
                onChange={(v) => setFlagsDraft({ ...flagsDraft, logisticsEnabled: v })}
              />
              <FlagRow
                label="Chat de Keiro en seguimiento público"
```

por:

```tsx
              <FlagRow
                label="Chat de Keiro en seguimiento público"
```

Las 5 filas de RRHH (`hrShiftsEnabled`, `hrPlanningEnabled`, `hrTimeclockEnabled`, `hrIncidentsEnabled`, `hrAdvancedEnabled`) **no se tocan** — siguen aquí, gestionan sub-tabs dentro de HR, no el módulo completo.

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/web && npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Checklist de verificación manual final**

Con `npm run dev:all` corriendo:

- [ ] Un tenant existente (creado antes de este cambio): tras reiniciar el servidor, todos los módulos que antes eran siempre-on siguen visibles sin que nadie haya tocado `/apps` (los defaults `true` los preservan).
- [ ] `Ajustes → Empresa → Flags`: la fila "Gestión de logística" ya no aparece; las 5 filas de RRHH siguen ahí y siguen funcionando igual que antes.
- [ ] Como usuario `USER` sin permiso explícito en `/apps`: el icono "Apps" no aparece en el sidebar; navegar manualmente a `/apps` por URL es bloqueado por `PermittedRoute`.
- [ ] Como ADMIN: `/apps` muestra el grid completo, activar/desactivar módulos y plugins funciona y persiste tras recargar.
- [ ] `PUT /api/config/flags` y `POST /api/plugins/:id/activate` devuelven `403` para un usuario no-admin (ya verificado en la Task 4, repetir aquí como regresión final).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/modules/settings/pages/CompanySettings.tsx
git commit -m "refactor(web): quitar el toggle de logística de Ajustes (se mudó a /apps)"
```

---

## Self-Review

**Cobertura del spec:** Almacenamiento (Task 1) ✓; `description`/`category` en registry (Task 2) ✓; mapeo de módulos de la sección 3 del spec (Task 3) ✓; `adminMiddleware` en config/plugins (Task 4) ✓; renombrar `plugins`→`apps` + `PluginContext` legacy target (Task 5) ✓; pantalla unificada (Tasks 6-7) ✓; limpieza de `CompanySettings` (Task 8) ✓. Sin huecos.

**Placeholders:** ninguno — cada paso trae el código completo, sin "TBD" ni "similar a la tarea N".

**Consistencia de tipos:** `Module.featureFlag`/`.description`/`.category`/`.adminOnly` (Task 2) se usan con los mismos nombres en Tasks 3, 5, 6 y 7. `ModuleCard` (Task 6) recibe exactamente `{ module, enabled, onToggle, isToggling }`, y la Task 7 lo invoca con esas cuatro props tal cual. `toggleModule`/`togglingModule` (Task 7) no colisionan con `togglePlugin`/`toggling` ya existentes (nombres distintos, mantenidos ambos).
