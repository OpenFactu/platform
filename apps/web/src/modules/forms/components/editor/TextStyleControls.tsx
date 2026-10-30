import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { SegmentedControl, Select, Switch } from '@openfactu/ui';
import type { TextBlock, TextStyle, TitleEffect } from '@forms-engine';
import { TEXT_STYLE_LABEL, TITLE_EFFECT_OPTIONS } from '../../domain/types';
/** `label` es una clave de i18n. */
const STYLE_OPTIONS = (Object.keys(TEXT_STYLE_LABEL) as TextStyle[]).map((k) => ({
  value: k,
  label: TEXT_STYLE_LABEL[k],
}));

/** Efecto del título, estilo del texto, alineación y letra capital de un bloque de texto. */
export const TextStyleControls: React.FC<{
  block: TextBlock;
  onChange: (patch: Partial<TextBlock>) => void;
  disabled?: boolean;
}> = ({ block, onChange, disabled }) => {
  const { t } = useI18n();
  const style = block.textStyle ?? 'body';
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t('forms.textControls.titleEffect')}
          options={TITLE_EFFECT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
          value={block.effect ?? 'none'}
          onChange={(v) => onChange({ effect: v === 'none' ? undefined : (v as TitleEffect) })}
          disabled={disabled}
        />
        <Select
          label={t('forms.textControls.textStyle')}
          options={STYLE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
          value={style}
          onChange={(v) => onChange({ textStyle: v === 'body' ? undefined : (v as TextStyle) })}
          disabled={disabled}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl
          aria-label={t('forms.textControls.alignment')}
          size="sm"
          className="shrink-0"
          value={block.align ?? 'left'}
          onChange={(v) => onChange({ align: v === 'left' ? undefined : 'center' })}
          options={[
            { value: 'left', label: t('forms.textControls.left') },
            { value: 'center', label: t('forms.textControls.center') },
          ]}
          disabled={disabled}
        />
        {(style === 'body' || style === 'lead') && (
          <Switch
            label={t('forms.textControls.dropCap')}
            checked={!!block.dropCap}
            onChange={(v) => onChange({ dropCap: v || undefined })}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
};
