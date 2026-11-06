import React from 'react';
import { Button, useToast } from '@openfactu/ui';
import { Camera, RotateCcw } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { resizePhoto } from '../../domain/proofImages';

interface Props {
  value: string | null;
  onChange: (photo: string | null) => void;
  /** Abrir la cámara directamente. Sin esto, deja elegir también una captura ya hecha. */
  camera?: boolean;
  label: string;
}

/** Hacer o elegir una foto, con el dedo y en grande. */
export const PhotoCapture: React.FC<Props> = ({ value, onChange, camera = true, label }) => {
  const { t } = useI18n();
  const toast = useToast();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      onChange(await resizePhoto(file));
    } catch {
      toast.error(t('logistics.wizard.photo.error'));
    }
  };

  if (value) {
    return (
      <div className="space-y-3">
        <img
          src={value}
          alt={label}
          className="max-h-[50vh] w-full rounded-lg border border-border-default object-contain"
        />
        <Button size="lg" variant="secondary" className="w-full" onClick={() => onChange(null)}>
          <RotateCcw size={18} /> {t('logistics.wizard.photo.again')}
        </Button>
      </div>
    );
  }

  return (
    <label className="flex h-48 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border-strong bg-bg-muted active:bg-bg-hover">
      <Camera size={40} className="text-fg-muted" />
      <span className="text-lg font-semibold text-fg-default">{label}</span>
      {/* <input type="file"> oculto disparado por el <label>. No se sustituye por
          FileDropzone: `capture` es lo que abre la cámara del móvil. */}
      <input
        type="file"
        accept="image/*"
        capture={camera ? 'environment' : undefined}
        className="hidden"
        onChange={onFile}
      />
    </label>
  );
};
