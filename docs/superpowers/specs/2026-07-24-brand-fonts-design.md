# Fuentes de marca por empresa (Roboto, Roboto Flex, Geist)

## Contexto

El branding por tenant ya tiene un selector "Familia tipográfica" (Ajustes → Empresa →
Apariencia) con tres valores genéricos (`sans` / `serif` / `mono`) que solo cambian
`--font-sans`. Se quiere ofrecer fuentes con nombre propio — Roboto, Roboto Flex (como
opción de estética Google; Google Sans es propietaria y no distribuible) y Geist — y que
el cambio afecte a **toda** la app: cuerpo, tablas, títulos y KPIs.

Bug latente que este cambio arregla: `ThemeContext` siempre pisa `--font-sans` con un
stack Helvetica cuando `fontFamily === 'sans'`, así que la DM Sans por defecto de
`index.css` nunca se ve tras montar React.

## Diseño

### Catálogo (`apps/web/src/context/ThemeContext.tsx`)

`FONT_OPTIONS: FontOption[]` con `{ id, label, google?, sans, display }`:

| id | label | google (spec css2) |
|---|---|---|
| `sans` | Keirost — DM Sans (por defecto) | — (ya cargada en index.html) |
| `roboto` | Roboto | `Roboto:wght@300;400;500;700` |
| `roboto-flex` | Roboto Flex (estilo Google) | `Roboto+Flex:opsz,wght@8..144,300..800` |
| `geist` | Geist | `Geist:wght@300..800` |
| `serif` | Serif (Georgia) | — (sistema) |
| `mono` | Monospace | — (sistema) |

- `BrandingConfig.fontFamily` pasa a `string`; id desconocido → opción `sans`
  (`fontOptionFor(id)`). Se elimina `fontStackForFamily`.
- El tipo espejo del servidor (`apps/server/src/core/config/appConfig.ts`) también pasa a
  `string`. No hay validación en runtime en el PUT (se guarda como JSON por claves).

### Aplicación global

En el `useLayoutEffect` de tema existente:

- `sans` → `removeProperty('--font-sans'/'--font-display')` (vuelven los defaults de
  `index.css`: DM Sans + Space Grotesk).
- Cualquier otra opción → `setProperty` de **ambas** variables. Como `body`/tablas heredan
  `--font-sans` y `h1-h5`/`.font-display` usan `--font-display`, cambia toda la app.
  `--font-mono` no se toca.
- Si la opción tiene `google`, se inyecta/actualiza `<link data-tenant-font rel=stylesheet>`
  hacia `fonts.googleapis.com/css2?family=<spec>&display=swap`. Solo se descarga la fuente
  elegida; si se vuelve a una opción sin `google`, el link se elimina.

### Sin FOUC

El cache `openfactu_theme` de `localStorage` gana tres campos precomputados: `fontSans`,
`fontDisplay`, `fontUrl` (ausentes cuando la opción es `sans`). El script inline de
`index.html` los aplica antes de montar React (mismo patrón que los `*Rgb` de colores):
setea las dos variables y añade el `<link data-tenant-font>` que luego React reutiliza.

### Selector (`CompanySettings.tsx`)

El `select` se genera desde `FONT_OPTIONS`. Debajo, una línea de vista previa renderizada
con el stack de la opción seleccionada ("AaBbCc 0123 — Ejemplo de texto"). Un `useEffect`
inyecta el `<link>` de Google Fonts de la opción del borrador (deduplicado por href) para
que la preview se vea sin guardar.

## Fuera de alcance

- Login / SetupWizard / logo Keirost (fuentes de marca hardcodeadas a propósito).
- Plantillas PDF (fuentes propias del renderizador).
- Auto-hospedaje de fuentes (la app ya depende del CDN de Google Fonts).

## Verificación

Sin test runner en el repo: `npm run typecheck` + `npx eslint` sobre los archivos tocados,
y smoke manual — cambiar la fuente en Ajustes → Apariencia y comprobar que tablas
(p.ej. Items), títulos y KPIs cambian; volver a "Keirost" restaura DM Sans/Space Grotesk;
recarga sin flash de fuente.
