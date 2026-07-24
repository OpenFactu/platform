import React, { useEffect, useState } from 'react';
import { Button, Modal, useToast } from '@openfactu/ui';
import { RotateCcw } from 'lucide-react';
import { FONT_OPTIONS, useTheme } from '@/context/ThemeContext';
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
export const ThemeModal: React.FC<Props> = ({ open, onClose, site, onSaved }) => {
  const toast = useToast();
  const { branding } = useTheme();
  const [overrides, setOverrides] = useState(site.themeOverrides ?? {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setOverrides(site.themeOverrides ?? {});
  }, [open, site.themeOverrides]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await websiteApi.updateSite({
        themeOverrides: Object.keys(overrides).length > 0 ? overrides : null,
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
      maxWidth="lg"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Color primario</label>
            <input
              type="color"
              value={overrides.colorPrimary ?? branding.colorPrimary}
              onChange={(e) => setOverrides((o) => ({ ...o, colorPrimary: e.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Color de acento</label>
            <input
              type="color"
              value={overrides.colorAccent ?? branding.colorAccent}
              onChange={(e) => setOverrides((o) => ({ ...o, colorAccent: e.target.value }))}
              className="h-11 w-full rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Fuente</label>
          <select
            value={overrides.fontId ?? ''}
            onChange={(e) => setOverrides((o) => ({ ...o, fontId: e.target.value || undefined }))}
            className="h-11 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-sm"
          >
            <option value="">Como el branding ({branding.fontFamily})</option>
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
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
