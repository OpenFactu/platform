# Sidebar — iconos en chip de color en vez de planos

Fecha: 2026-07-23
Rama: `dev`

## Contexto

Los iconos del sidebar principal (`IconSidebar.tsx`) van pelados: lucide-react
con trazo fino de 2px, sin fondo ni color, directamente sobre el fondo oscuro.
El resto de la app ya usa un lenguaje visual distinto para los iconos de
módulo — chips cuadrados redondeados con color (`ModuleCard.tsx`,
`PluginCard.tsx`) — así que el sidebar desentona con el resto de la marca
(ink + teal, Space Grotesk, patrón geométrico del login).

## Diseño

- `PluginIcon.tsx` gana un prop opcional `strokeWidth?: number` (pasado tal
  cual a lucide-react; sin valor por defecto explícito para no tocar el
  resto de usos existentes).
- Componente nuevo `apps/web/src/components/layout/NavIconChip.tsx`: envuelve
  `PluginIcon` en un chip cuadrado redondeado.
  - Activo: `bg-accent/15 border border-accent/30 text-accent`.
  - Inactivo: `bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-ink-700 dark:text-slate-300`.
  - Mismo lenguaje de color que ya usan `ModuleCard`/`PluginCard` (color =
    algo relevante, no decoración), pero aplicado a "es el módulo activo"
    en vez de "está activado".
  - `strokeWidth={2.25}` (vs. el 2 por defecto de lucide) para un trazo algo
    más firme.
- `IconSidebar.tsx`: sustituir `<PluginIcon iconName={mod.icon} size={20} />`
  (rail de escritorio, línea ~410) y `<PluginIcon iconName={mod.icon}
  size={22} />` (cabecera del acordeón móvil, línea ~563) por
  `<NavIconChip iconName={mod.icon} size={18} active={isActive} />` (y su
  equivalente en móvil). Se retira la barra lateral de acento
  (`w-1 h-6 bg-accent`) que hoy marca el activo — el propio chip ya lo
  comunica, y mantener las dos señales sería redundante.
- Los iconos pequeños y densos (resultados del buscador, sub-tabs de la
  topbar — tamaños 14-16px) **no** cambian: un chip a ese tamaño se vería
  apretado y esos contextos son de lista densa, no de icono protagonista.

## Riesgos

Ninguno relevante — cambio puramente visual, sin tocar lógica de
navegación ni datos.
