import React, { useMemo } from 'react';
import { resolveTheme, themeToCssVars, type ThemePreset } from '@openfactu/ui';
import { Check } from 'lucide-react';

/**
 * Muestra de un preset pintada con su propio tema: las variables que genera
 * `resolveTheme` se ponen en el botón, así que fondo, tarjeta, textos, acento,
 * radios, tipografía y cristal son los que tendrá la app al elegirlo. Antes se
 * aproximaba con el primario y un blanco fijo, y no se parecía al resultado.
 */
export const ThemePresetCard: React.FC<{
  preset: ThemePreset;
  selected: boolean;
  onSelect: () => void;
}> = ({ preset, selected, onSelect }) => {
  const { style, glass } = useMemo(() => {
    const resolved = resolveTheme(preset.theme);
    const vars = themeToCssVars(resolved) as React.CSSProperties;
    return {
      style: {
        ...vars,
        background: resolved.backdrop !== 'none' ? resolved.backdrop : resolved.colors.bgApp,
        colorScheme: resolved.mode,
      } as React.CSSProperties,
      glass: resolved.material.blur > 0 || resolved.material.alpha < 1,
    };
  }, [preset]);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={style}
      className={
        'relative flex flex-col gap-3 p-3 text-left border transition-shadow ' +
        'rounded-[var(--k-radius-md)] font-sans ' +
        (selected
          ? 'border-accent ring-2 ring-accent'
          : 'border-[var(--border-default)] hover:shadow-[var(--k-shadow-md)]')
      }
    >
      {/* Tarjeta de muestra: superficie, texto, acento y primario del tema. */}
      <div
        className="w-full p-3 border border-[var(--border-default)] rounded-[var(--k-radius-sm)] shadow-[var(--k-shadow-sm)]"
        style={{
          background: glass
            ? 'color-mix(in srgb, var(--bg-card) 60%, transparent)'
            : 'var(--bg-card)',
          backdropFilter: glass ? 'blur(12px)' : undefined,
        }}
      >
        <div className="h-1.5 w-2/3 rounded-full bg-[var(--fg-default)] opacity-80" />
        <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-[var(--fg-muted)] opacity-60" />
        <div className="mt-3 flex gap-1.5">
          <span className="h-4 w-10 rounded-[var(--k-radius-xs)] bg-[var(--color-accent)]" />
          <span className="h-4 w-6 rounded-[var(--k-radius-xs)] bg-[var(--color-primary)] border border-[var(--border-default)]" />
        </div>
      </div>
      <div>
        <div className="font-display font-semibold text-[14px] text-[var(--fg-default)]">
          {preset.label}
        </div>
        <div className="text-[11px] mt-0.5 leading-snug text-[var(--fg-muted)]">
          {preset.description}
        </div>
      </div>
      {selected && (
        <span className="absolute top-2 right-2 grid place-items-center w-5 h-5 rounded-full bg-[var(--color-accent)] text-[color:var(--color-accent-fg)]">
          <Check size={12} />
        </span>
      )}
    </button>
  );
};
