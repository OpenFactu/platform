import React from 'react';
import { Button, Card, FileDropzone, Input, Select, Textarea } from '@openfactu/ui';
import { X } from 'lucide-react';
import type { TitleEffect } from '@forms-engine';
import { RICH_TEXT_HINT, TITLE_EFFECT_OPTIONS } from '../../domain/types';

interface Props {
  title: string;
  intro: string;
  headerImageUrl: string | null;
  onTitle: (v: string) => void;
  onIntro: (v: string) => void;
  titleEffect?: TitleEffect;
  onTitleEffect: (v: TitleEffect | undefined) => void;
  onUploadHeader: (file: File) => Promise<void>;
  onRemoveHeader: () => void;
  uploading: boolean;
  disabled?: boolean;
}

/** Primera tarjeta: título, descripción e imagen de cabecera del formulario. */
export const FormHeaderCard: React.FC<Props> = (p) => (
  <Card noPadding className="overflow-hidden">
    {p.headerImageUrl && (
      <div className="relative">
        <img src={p.headerImageUrl} alt="" className="w-full max-h-56 object-cover" />
        {!p.disabled && (
          <div className="absolute right-2 top-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={p.onRemoveHeader}
              aria-label="Quitar imagen de cabecera"
            >
              <X size={14} />
            </Button>
          </div>
        )}
      </div>
    )}
    <div className="h-2 bg-accent" />
    <div className="p-5 space-y-3">
      <Input
        aria-label="Título del formulario"
        value={p.title}
        onChange={(e) => p.onTitle(e.target.value)}
        placeholder="Formulario sin título"
        className="text-2xl font-bold"
        disabled={p.disabled}
      />
      <Textarea
        aria-label="Descripción del formulario"
        rows={2}
        value={p.intro}
        onChange={(e) => p.onIntro(e.target.value)}
        placeholder="Descripción del formulario"
        helperText={RICH_TEXT_HINT}
        disabled={p.disabled}
      />
      <div className="sm:w-64">
        <Select
          label="Efecto del título"
          options={TITLE_EFFECT_OPTIONS}
          value={p.titleEffect ?? 'none'}
          onChange={(v) => p.onTitleEffect(v === 'none' ? undefined : (v as TitleEffect))}
          disabled={p.disabled}
        />
      </div>
      {!p.disabled && (
        <FileDropzone
          variant="inline"
          accept="image/*"
          maxSizeMb={5}
          isUploading={p.uploading}
          label={p.headerImageUrl ? 'Cambiar imagen de cabecera' : 'Añadir imagen de cabecera'}
          onFiles={(files) => (files[0] ? p.onUploadHeader(files[0]) : undefined)}
        />
      )}
    </div>
  </Card>
);
