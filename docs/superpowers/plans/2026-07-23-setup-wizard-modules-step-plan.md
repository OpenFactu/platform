# Setup Wizard — Paso de Módulos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un quinto paso "Módulos" al `SetupWizard` para que, al dar de alta el primer tenant, el admin elija qué módulos activar — reutilizando la misma lista y tarjeta que ya usa la pantalla `/apps`.

**Architecture:** El frontend reutiliza `CORE_MODULES` (fuente única de la lista de módulos) y el componente `ModuleCard` ya existentes, con el toggle escribiendo a estado local del wizard (no hay `PUT` en vivo — no hay tenant ni sesión durante el alta). El backend acepta un campo opcional `modules` en `POST /api/setup/init` y lo persiste con el mismo helper genérico (`setConfigSection`) que ya usa esa misma función para `publicBaseUrl`.

**Tech Stack:** React + TypeScript (Vite) en `apps/web`; Express + Drizzle en `apps/server`.

Spec de referencia: [`docs/superpowers/specs/2026-07-23-setup-wizard-modules-step-design.md`](../specs/2026-07-23-setup-wizard-modules-step-design.md).

## Global Constraints

- No hay test runner en el repo — cada tarea se verifica con `tsc`/`typecheck` más pasos manuales.
- Prettier: `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`.
- Todos los módulos vienen marcados `true` por defecto (mismo criterio que `FLAGS_DEFAULTS`) — solo se envían al backend las claves que el admin desmarcó.
- Los módulos siempre-on (`home`, `configuration`, `system`) no tienen `featureFlag`, así que quedan excluidos automáticamente de este paso — no hay riesgo de desactivar algo crítico desde el wizard.
- Español en textos de cara al usuario y comentarios, consistente con el resto del archivo.

---

### Task 1: Backend — aceptar y persistir `modules` en `POST /api/setup/init`

**Files:**
- Modify: `apps/server/src/api/setup.ts`

**Interfaces:**
- Consumes: `setConfigSection` (ya importado en este archivo), `FLAGS_DEFAULTS` (nuevo import desde `../core/config/appConfig`).
- Produces: el body de `POST /api/setup/init` acepta un campo opcional `modules?: Record<string, boolean>`, persistido en la sección `flags` del tenant recién creado.

- [ ] **Step 1: Importar `FLAGS_DEFAULTS`**

Sustituir:

```ts
import { setCompanyConfig } from '../core/config/companyConfig';
import { setConfigSection } from '../core/config/systemConfigSection';
```

por:

```ts
import { setCompanyConfig } from '../core/config/companyConfig';
import { setConfigSection } from '../core/config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../core/config/appConfig';
```

- [ ] **Step 2: Persistir `modules` justo después del bloque que guarda `publicBaseUrl`**

Sustituir:

```ts
      if (publicBaseUrl) {
        await setConfigSection(
          tenantDb,
          'app',
          { publicBaseUrl: '' },
          { publicBaseUrl: publicBaseUrl.replace(/\/$/, '') },
        );
      }

      // Seed de tipos de documento fiscales según país (F1/F2/R1 en ES,
      // 33/34/61 en CL, I/E/T en MX...). Idempotente.
      const { seedDocumentTypesForCountry } = await import('../core/documents/seedDocumentTypes');
```

por:

```ts
      if (publicBaseUrl) {
        await setConfigSection(
          tenantDb,
          'app',
          { publicBaseUrl: '' },
          { publicBaseUrl: publicBaseUrl.replace(/\/$/, '') },
        );
      }

      // Módulos elegidos en el paso 5 del wizard — solo llegan las claves que
      // el admin desmarcó (el resto ya son `true` por defecto en FLAGS_DEFAULTS).
      const { modules } = req.body;
      if (modules && Object.keys(modules).length > 0) {
        await setConfigSection(tenantDb, 'flags', FLAGS_DEFAULTS, modules);
      }

      // Seed de tipos de documento fiscales según país (F1/F2/R1 en ES,
      // 33/34/61 en CL, I/E/T en MX...). Idempotente.
      const { seedDocumentTypesForCountry } = await import('../core/documents/seedDocumentTypes');
```

- [ ] **Step 3: Verificar tipos del servidor**

Run: `cd apps/server && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/api/setup.ts
git commit -m "feat(server): aceptar modules en POST /api/setup/init"
```

---

### Task 2: Frontend — Paso 5 "Módulos" en `SetupWizard.tsx`

**Files:**
- Modify: `apps/web/src/pages/SetupWizard.tsx`

**Interfaces:**
- Consumes: `CORE_MODULES` (de `@/modules`, cada entrada con `id`/`label`/`icon`/`description?`/`category?`/`featureFlag?`), `ModuleCard` (de `@/modules/plugins/components/ModuleCard`, props `{ module: Module; enabled: boolean; onToggle: () => void; isToggling: boolean }`).
- Produces: `SetupFormData.modules: Record<string, boolean>`, enviado como `modules` (solo las claves en `false`) en el body de `POST /api/setup/init` — consumido por la Task 1.

- [ ] **Step 1: Añadir los imports nuevos**

Sustituir:

```ts
import {
  Eye,
  EyeOff,
  Database,
  User,
  Building,
  Settings,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
} from 'lucide-react';
import { Loader, useToast, usePopup } from '@openfactu/ui';
import { KeirostLogo } from '../components/branding/KeirostLogo';
```

por:

```ts
import {
  Eye,
  EyeOff,
  Database,
  User,
  Building,
  Settings,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  LayoutGrid,
} from 'lucide-react';
import { Loader, useToast, usePopup } from '@openfactu/ui';
import { KeirostLogo } from '../components/branding/KeirostLogo';
import { CORE_MODULES } from '@/modules';
import { ModuleCard } from '@/modules/plugins/components/ModuleCard';
```

- [ ] **Step 2: Añadir `modules` a `SetupFormData`**

Sustituir:

```ts
interface SetupFormData {
  db: DbConfig;
  admin: AdminConfig;
  company: CompanyConfig;
}
```

por:

```ts
interface SetupFormData {
  db: DbConfig;
  admin: AdminConfig;
  company: CompanyConfig;
  modules: Record<string, boolean>;
}
```

- [ ] **Step 3: Añadir el quinto icono a `StepIndicator`**

Sustituir:

```ts
function StepIndicator({ step }: { step: number }) {
  const steps = [
    { id: 1, icon: Database },
    { id: 2, icon: User },
    { id: 3, icon: Building },
    { id: 4, icon: Settings },
  ];
```

por:

```ts
function StepIndicator({ step }: { step: number }) {
  const steps = [
    { id: 1, icon: Database },
    { id: 2, icon: User },
    { id: 3, icon: Building },
    { id: 4, icon: Settings },
    { id: 5, icon: LayoutGrid },
  ];
```

- [ ] **Step 4: `Step4CompanyDetails` deja de enviar el formulario — solo avanza al paso 5**

Sustituir:

```ts
function Step4CompanyDetails({
  data,
  onChange,
  onPrev,
  onSubmit,
  loading,
}: {
  data: Omit<CompanyConfig, 'name' | 'nif'>;
  onChange: (partial: Partial<Omit<CompanyConfig, 'name' | 'nif'>>) => void;
  onPrev: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
```

por:

```ts
function Step4CompanyDetails({
  data,
  onChange,
  onPrev,
  onNext,
}: {
  data: Omit<CompanyConfig, 'name' | 'nif'>;
  onChange: (partial: Partial<Omit<CompanyConfig, 'name' | 'nif'>>) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
```

Sustituir el footer de este mismo componente:

```tsx
      <div className="flex gap-3 mt-6">
        <button onClick={onPrev} className={BTN_SECONDARY_CLS}>
          <ChevronLeft size={18} /> Atrás
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 bg-[#0D9488] text-white p-3 rounded-sm font-bold hover:bg-[#0A6E63] transition flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap shadow-md hover:shadow-lg"
        >
          {loading ? (
            <Loader size="sm" variant="white" className="mr-0" />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{loading ? 'Inicializando...' : 'Finalizar'}</span>
        </button>
      </div>
    </div>
  );
}
```

por:

```tsx
      <div className="flex gap-3 mt-6">
        <button onClick={onPrev} className={BTN_SECONDARY_CLS}>
          <ChevronLeft size={18} /> Atrás
        </button>
        <button
          onClick={onNext}
          className="flex-1 bg-[#0D9488] text-white p-3 rounded-sm font-bold hover:bg-[#0A6E63] transition flex items-center justify-center gap-2 whitespace-nowrap shadow-md hover:shadow-lg"
        >
          Siguiente{' '}
          <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Añadir el componente `Step5Modules`**

Insertar, justo después del cierre de `Step4CompanyDetails` (después del `}` que sigue al footer del Step 4) y antes del comentario `// ─── Main Wizard ───`:

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
                  onToggle={() =>
                    onChange(m.featureFlag as string, !(data[m.featureFlag as string] ?? true))
                  }
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
          className="flex-1 bg-[#0D9488] text-white p-3 rounded-sm font-bold hover:bg-[#0A6E63] transition flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap shadow-md hover:shadow-lg"
        >
          {loading ? (
            <Loader size="sm" variant="white" className="mr-0" />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{loading ? 'Inicializando...' : 'Finalizar'}</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Inicializar `formData.modules` en el componente principal**

Sustituir:

```ts
  const [formData, setFormData] = useState<SetupFormData>({
    db: {
      host: isDocker ? 'db' : '127.0.0.1',
      port: isDocker ? '5432' : '5439',
      user: 'openfactu',
      password: 'openfactu_pass',
    },
    admin: { email: '', username: '', password: '' },
    company: {
```

por:

```ts
  const [formData, setFormData] = useState<SetupFormData>({
    db: {
      host: isDocker ? 'db' : '127.0.0.1',
      port: isDocker ? '5432' : '5439',
      user: 'openfactu',
      password: 'openfactu_pass',
    },
    admin: { email: '', username: '', password: '' },
    modules: Object.fromEntries(
      CORE_MODULES.filter((m) => m.featureFlag).map((m) => [m.featureFlag as string, true]),
    ),
    company: {
```

- [ ] **Step 7: Añadir el handler `updateModule`**

Sustituir:

```ts
  const updateCompany = (partial: Partial<CompanyConfig>) =>
    setFormData((prev) => ({ ...prev, company: { ...prev.company, ...partial } }));
```

por:

```ts
  const updateCompany = (partial: Partial<CompanyConfig>) =>
    setFormData((prev) => ({ ...prev, company: { ...prev.company, ...partial } }));
  const updateModule = (key: string, value: boolean) =>
    setFormData((prev) => ({ ...prev, modules: { ...prev.modules, [key]: value } }));
```

- [ ] **Step 8: Enviar `modules` (solo las claves en `false`) en el `POST /api/setup/init`**

Sustituir:

```ts
      await apiClient.post(
        '/api/setup/init',
        {
          dbConfig: {
            host: formData.db.host,
            port: parseInt(formData.db.port),
            user: formData.db.user,
            password: formData.db.password,
          },
          admin: formData.admin,
          company: {
```

por:

```ts
      await apiClient.post(
        '/api/setup/init',
        {
          dbConfig: {
            host: formData.db.host,
            port: parseInt(formData.db.port),
            user: formData.db.user,
            password: formData.db.password,
          },
          admin: formData.admin,
          modules: Object.fromEntries(
            Object.entries(formData.modules).filter(([, v]) => v === false),
          ),
          company: {
```

- [ ] **Step 9: Renderizar el paso 5 y ajustar el paso 4**

Sustituir:

```tsx
        {step === 4 && (
          <Step4CompanyDetails
            data={formData.company}
            onChange={updateCompany}
            onPrev={() => setStep(3)}
            onSubmit={handleSubmit}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};
```

por:

```tsx
        {step === 4 && (
          <Step4CompanyDetails
            data={formData.company}
            onChange={updateCompany}
            onPrev={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}
        {step === 5 && (
          <Step5Modules
            data={formData.modules}
            onChange={updateModule}
            onPrev={() => setStep(4)}
            onSubmit={handleSubmit}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 10: Verificar tipos**

Run: `cd apps/web && npm run typecheck`
Expected: sin errores.

- [ ] **Step 11: Verificación manual**

Sin test runner ni dev server disponible para este paso — verificar por inspección: `Step5Modules` recorre `CORE_MODULES.filter(m => m.featureFlag)` (los mismos 9 módulos que ya aparecen en `/apps`), cada `ModuleCard` refleja `data[featureFlag]` con default `true`, y `handleSubmit` solo manda al backend las claves que el admin puso en `false`. Si hay oportunidad de correr `npm run dev:all` y pasar por `/setup` manualmente: confirmar que desmarcar 2-3 módulos en el paso 5 y terminar el alta deja esos módulos como "Inactivo" en `/apps` al loguearse con el admin recién creado.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/pages/SetupWizard.tsx
git commit -m "feat(web): paso 5 (módulos) en el setup wizard"
```

---

## Self-Review

**Cobertura del spec:** almacenamiento vía `setConfigSection`/`FLAGS_DEFAULTS` (Task 1) ✓; paso 5 reutilizando `CORE_MODULES`/`ModuleCard` (Task 2) ✓; `StepIndicator` a 5 pasos ✓; `Step4CompanyDetails` deja de enviar el formulario ✓; envío de solo las claves `false` ✓. Sin huecos.

**Placeholders:** ninguno — cada paso trae el código completo.

**Consistencia de tipos:** `Step5Modules` recibe exactamente `{ data, onChange, onPrev, onSubmit, loading }`, y la Task 2 Step 9 lo invoca con esas cinco props tal cual. `updateModule(key: string, value: boolean)` coincide con la firma que `Step5Modules.onChange` espera. El campo `modules` en el body de `POST /api/setup/init` (Task 2 Step 8) coincide en nombre y forma (`Record<string, boolean>`) con lo que la Task 1 lee (`const { modules } = req.body`).
