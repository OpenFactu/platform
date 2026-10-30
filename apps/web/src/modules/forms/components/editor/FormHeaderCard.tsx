import { useI18n } from '@/i18n/I18nContext';
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
export const FormHeaderCard: React.FC<Props> = (p) => {
  const { t } = useI18n();
  return (
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
                aria-label={t('forms.header.removeImage')}
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
          aria-label={t('forms.header.titleLabel')}
          value={p.title}
          onChange={(e) => p.onTitle(e.target.value)}
          placeholder={t('forms.header.untitled')}
          className="text-2xl font-bold"
          disabled={p.disabled}
        />
        <Textarea
          aria-label={t('forms.header.description')}
          rows={2}
          value={p.intro}
          onChange={(e) => p.onIntro(e.target.value)}
          placeholder={t('forms.header.description')}
          helperText={t(RICH_TEXT_HINT)}
          disabled={p.disabled}
        />
        <div className="sm:w-64">
          <Select
            label={t('forms.textControls.titleEffect')}
            options={TITLE_EFFECT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
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
            label={p.headerImageUrl ? t('forms.header.changeImage') : t('forms.header.addImage')}
            onFiles={(files) => (files[0] ? p.onUploadHeader(files[0]) : undefined)}
          />
        )}
      </div>
    </Card>
  );
};
