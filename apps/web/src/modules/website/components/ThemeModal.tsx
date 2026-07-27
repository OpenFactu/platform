import React, { useEffect, useState } from 'react';
import { Button, ColorInput, Modal, Select, useToast } from '@openfactu/ui';
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { FONT_OPTIONS, useTheme } from '@/context/ThemeContext';
import { AdvancedEditor } from '@/modules/document-templates/components/AdvancedEditor';
import { websiteApi } from '../api/websiteApi';
import type { WebsiteSite } from '../domain/website';

interface Props {
  open: boolean;
  onClose: () => void;
  site: WebsiteSite;
  /** El site actualizado tras guardar — el editor re-tematiza el canvas al vuelo. */
  onSaved: (site: WebsiteSite) => void;
}

/**
 * Tema de la página desde el propio editor: colores principales y fuente.
 * Por defecto hereda el branding de la empresa; aquí se sobreescribe solo
 * para la web pública (mismos overrides que Website → Ajustes).
 */
const RADIUS_OPTIONS = [
  { value: 'none', label: 'Ninguna (esquinas rectas)' },
  { value: 'sm', label: 'Sutil' },
  { value: 'md', label: 'Normal' },
  { value: 'lg', label: 'Grande' },
];

export const ThemeModal: React.FC<Props> = ({ open, onClose, site, onSaved }) => {
  const toast = useToast();
  const { branding } = useTheme();
  const [overrides, setOverrides] = useState(site.themeOverrides ?? {});
  const [customCss, setCustomCss] = useState(site.customCss ?? '');
  const [saving, setSaving] = useState(false);
  const [cssFullscreen, setCssFullscreen] = useState(false);

  useEffect(() => {
    if (open) {
      setOverrides(site.themeOverrides ?? {});
      setCustomCss(site.customCss ?? '');
      setCssFullscreen(false);
    }
  }, [open, site.themeOverrides, site.customCss]);

  // Esc sale del CSS a pantalla completa
  useEffect(() => {
    if (!cssFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCssFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cssFullscreen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await websiteApi.updateSite({
        themeOverrides: Object.keys(overrides).length > 0 ? overrides : null,
        customCss: customCss.trim() || null,
      });
      onSaved(updated);
      toast.success('Tema guardado');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar el tema');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Tema de la web"
      subtitle="Por defecto se usa el branding de la empresa; lo que cambies aquí solo afecta a la web pública."
      maxWidth="2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <ColorInput
            label="Color primario"
            value={overrides.colorPrimary ?? branding.colorPrimary}
            onChange={(v) => setOverrides((o) => ({ ...o, colorPrimary: v }))}
          />
          <ColorInput
            label="Color de acento"
            value={overrides.colorAccent ?? branding.colorAccent}
            onChange={(v) => setOverrides((o) => ({ ...o, colorAccent: v }))}
          />
        </div>
        <Select
          label="Fuente"
          value={overrides.fontId ?? ''}
          onChange={(v) => setOverrides((o) => ({ ...o, fontId: v || undefined }))}
          options={[
            { value: '', label: `Como el branding (${branding.fontFamily})` },
            ...FONT_OPTIONS.map((f) => ({ value: f.id, label: f.label })),
          ]}
        />
        <Select
          label="Redondez de esquinas"
          value={overrides.radius ?? 'md'}
          onChange={(v) => setOverrides((o) => ({ ...o, radius: v }))}
          options={RADIUS_OPTIONS}
          helperText="Afecta a botones, tarjetas, imágenes, carrusel y galería de toda la web."
        />
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-500">CSS personalizado (avanzado)</label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCssFullscreen(true)}
              title="Pantalla completa"
              className="text-slate-400 hover:text-fg-body"
            >
              <Maximize2 size={13} />
            </Button>
          </div>
          <div className="h-40 rounded-lg border border-border-default overflow-hidden">
            <AdvancedEditor value={customCss} onChange={setCustomCss} language="css" />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Se añade después de los estilos de la web, así que puede sobreescribirlos. Solo para
            quien sepa CSS — no se valida.
          </p>
        </div>
        {cssFullscreen && (
          <div className="fixed inset-0 z-[100] bg-bg-card flex flex-col p-4 gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-fg-body">
                CSS personalizado — pantalla completa
              </span>
              <Button size="sm" variant="secondary" onClick={() => setCssFullscreen(false)}>
                <Minimize2 size={14} className="mr-2" /> Salir (Esc)
              </Button>
            </div>
            <div className="flex-1 min-h-0 rounded-lg border border-border-default overflow-hidden">
              <AdvancedEditor value={customCss} onChange={setCustomCss} language="css" />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-2">
          <Button variant="secondary" size="sm" onClick={() => setOverrides({})}>
            <RotateCcw size={14} className="mr-2" /> Volver al branding
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar tema'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
