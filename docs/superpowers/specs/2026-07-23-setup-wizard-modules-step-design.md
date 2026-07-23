# Setup Wizard — paso de activación de módulos

Fecha: 2026-07-23
Rama: `dev`

## Contexto

La pantalla `/apps` (spec previo:
[2026-07-22-apps-module-activation-design.md](2026-07-22-apps-module-activation-design.md))
ya permite a un admin activar/desactivar módulos core desde
`CompanySettings` después de crear la empresa. Falta ofrecer la misma
elección durante el alta inicial: hoy `SetupWizard.tsx` tiene 4 pasos
(Base de datos → Administrador → Primera Empresa → Configuración de
Empresa) y crea el tenant siempre con todos los módulos activos por
defecto (`FLAGS_DEFAULTS`), sin darle al instalador la opción de
desactivar algo desde el principio.

Este spec añade un quinto paso al wizard para elegir qué módulos
activar antes de terminar el alta, reutilizando la misma lista de
módulos y el mismo componente de tarjeta que ya existen para `/apps`.

De paso se detectó (fuera de alcance de este spec, documentado para
más adelante) que `flags` vive hoy dentro de `ThemeContext`, junto a
`branding`/`format`, sin relación conceptual entre ambos — están ahí
porque los tres se leen con el mismo patrón de `SystemConfig` section.
14 archivos consumen `useTheme()`; de ellos, `IconSidebar.tsx`,
`ModuleTabBar.tsx`, `PluginManager.tsx`, `CompanySettings.tsx` y
`logistics/module.ts` son los que realmente necesitan `flags` (el
resto solo usa `branding`/`format`). Separar `flags` a su propio
contexto (`FlagsContext` o similar) es un refactor legítimo pero
independiente — no bloquea este spec, porque el wizard no pasa por
`ThemeContext` en ningún momento (no hay sesión de tenant todavía
durante el alta).

## Requisitos

- Nuevo Paso 5 "Módulos" en `SetupWizard.tsx`, entre "Configuración de
  Empresa" (que pasa a decir "Siguiente" en vez de "Finalizar") y el
  submit real.
- Lista de módulos idéntica a la que ya usa `/apps`: los que tengan
  `featureFlag` en `CORE_MODULES`, agrupados por `category`. Cero
  duplicación de la lista de módulos.
- Reutiliza el componente `ModuleCard` ya existente
  (`apps/web/src/modules/plugins/components/ModuleCard.tsx`), con el
  toggle escribiendo a estado local del wizard (no hay `PUT` en vivo
  durante el alta — no existe tenant ni sesión todavía).
- Todos los módulos marcados por defecto (coherente con que todos los
  flags nuevos ya default a `true`). Nota visible: "Podrás cambiarlo
  después en Apps."
- `StepIndicator` pasa de 4 a 5 iconos.
- `POST /api/setup/init` acepta un campo nuevo opcional
  `modules: Record<string, boolean>` — solo las claves que el admin
  desmarcó (no hace falta mandar las que quedan en `true`, ya son el
  default).
- El backend persiste esa elección con el mismo helper que ya usa esta
  función para `app`/`publicBaseUrl`: `setConfigSection`.

## Diseño

### Frontend — `apps/web/src/pages/SetupWizard.tsx`

Import nuevo: `CORE_MODULES` desde `@/modules`, `ModuleCard` desde
`@/modules/plugins/components/ModuleCard`.

`SetupFormData` gana un campo `modules: Record<string, boolean>`,
inicializado recorriendo `CORE_MODULES.filter(m => m.featureFlag)` y
poniendo cada `featureFlag` a `true`.

Nuevo componente `Step5Modules`:

```tsx
function Step5Modules({
  data,
  onChange,
  onPrev,
  onSubmit,
  loading,
}: {
  data: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
  onPrev: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const activatable = CORE_MODULES.filter((m) => Boolean(m.featureFlag));
  const byCategory = activatable.reduce<Record<string, typeof activatable>>((acc, m) => {
    const cat = m.category || 'General';
    (acc[cat] = acc[cat] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
      <h2 className="text-xl font-bold">5. Módulos</h2>
      <p className="text-sm text-gray-600 dark:text-slate-400">
        Elige qué módulos activar. Podrás cambiarlo después en Apps.
      </p>
      <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
        {Object.entries(byCategory).map(([category, mods]) => (
          <div key={category}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              {category}
            </h3>
            <div className="space-y-2">
              {mods.map((m) => (
                <ModuleCard
                  key={m.id}
                  module={m}
                  enabled={data[m.featureFlag as string] ?? true}
                  onToggle={() => onChange(m.featureFlag as string, !data[m.featureFlag as string])}
                  isToggling={false}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onPrev} className={BTN_SECONDARY_CLS}>
          <ChevronLeft size={18} /> Atrás
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 bg-[#0D9488] text-white p-3 rounded-sm font-bold hover:bg-[#0A6E63] transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader size="sm" variant="white" className="mr-0" /> : <CheckCircle2 size={18} />}
          <span>{loading ? 'Inicializando...' : 'Finalizar'}</span>
        </button>
      </div>
    </div>
  );
}
```

`StepIndicator`'s `steps` gana una quinta entrada (icono `LayoutGrid`,
el mismo que usa el módulo `apps`).

`Step4CompanyDetails` cambia su botón final: `onSubmit`→`onNext` (pasa
a Step5), icono `CheckCircle2`→`ChevronRight`, texto
"Finalizar"→"Siguiente". El wizard principal (`SetupWizard`) mueve
`handleSubmit`/`loading` a ser usados por `Step5Modules` en vez de
`Step4CompanyDetails`, y `step === 5` renderiza `Step5Modules`.

`handleSubmit` añade al body de `POST /api/setup/init`:

```ts
modules: Object.fromEntries(Object.entries(formData.modules).filter(([, v]) => v === false)),
```

(solo se mandan las claves desmarcadas — las que quedan en `true` ya
son el default del servidor, no hace falta mandarlas).

### Backend — `apps/server/src/api/setup.ts`

Import nuevo: `FLAGS_DEFAULTS` desde `../core/config/appConfig`.

En `router.post('/init', ...)`, dentro del mismo bloque `try` que ya
llama a `setConfigSection(tenantDb, 'app', ...)` para `publicBaseUrl`
(línea ~322), añadir justo después:

```ts
const { modules } = req.body;
if (modules && Object.keys(modules).length > 0) {
  await setConfigSection(tenantDb, 'flags', FLAGS_DEFAULTS, modules);
}
```

Nada más cambia en este endpoint — el resto del flujo (crear admin,
crear schema del tenant, sembrar datos de empresa, tipos de documento)
sigue igual.

## Orden de ejecución

1. Backend: aceptar y persistir `modules` en `/api/setup/init`.
2. Frontend: `Step5Modules` + cambios en `StepIndicator`/`Step4CompanyDetails`/`SetupWizard`.

## Tests

Sin test runner en el repo. Verificación manual:
- Levantar el wizard desde cero (o `?tab=` no aplica aquí, es una
  ruta separada `/setup`), desmarcar 2-3 módulos en el paso 5, terminar
  el alta.
- Loguearse como el admin recién creado, ir a `/apps`: los módulos
  desmarcados deben aparecer como "Inactivo"; el resto, activos.
- Confirmar que el sidebar del tenant recién creado no muestra los
  módulos desmarcados.

## Riesgos

- Si `company.name` genera un `schemaName` que colisiona con un tenant
  existente, el fallo ocurre antes de llegar al seed de `modules` —
  sin cambios de riesgo respecto al flujo actual.
- Ninguno de los módulos "siempre-on" (`home`, `configuration`,
  `system`) aparece en este paso (no tienen `featureFlag`), igual que
  en `/apps` — no se puede desactivar accidentalmente algo crítico
  desde el wizard.
