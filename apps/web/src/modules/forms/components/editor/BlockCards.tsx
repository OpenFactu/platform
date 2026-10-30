import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import {
  Button,
  Card,
  DropdownMenu,
  FileDropzone,
  Input,
  Select,
  Textarea,
  Tooltip,
  cn,
  type SortableHandleProps,
} from '@openfactu/ui';
import { ArrowDown, ArrowUp, Copy, GripHorizontal, MoreVertical, Trash2 } from 'lucide-react';
import type { ImageBlock, Section, TextBlock, TitleEffect } from '@forms-engine';
import { TextBlockContent } from '../render/TextBlockView';
import { TextStyleControls } from './TextStyleControls';
import { RICH_TEXT_HINT, TITLE_EFFECT_OPTIONS } from '../../domain/types';

const Handle: React.FC<{ handleProps?: SortableHandleProps }> = ({ handleProps }) =>
  handleProps ? (
    <div className="flex justify-center -mt-2 -mb-2">
      <span {...handleProps} className={cn(handleProps.className, 'px-3 py-1 text-fg-subtle')}>
        <GripHorizontal size={16} />
      </span>
    </div>
  ) : null;

const BlockActions: React.FC<{
  onDuplicate: () => void;
  onRemove: () => void;
  disabled?: boolean;
}> = ({ onDuplicate, onRemove, disabled }) => {
  const { t } = useI18n();
  return (
    <div className="flex justify-end gap-1 border-t border-border-subtle pt-3">
      <Tooltip content={t('forms.blocks.duplicate')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('forms.blocks.duplicate')}
          onClick={onDuplicate}
          disabled={disabled}
        >
          <Copy size={16} />
        </Button>
      </Tooltip>
      <Tooltip content={t('forms.blocks.delete')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('forms.blocks.delete')}
          onClick={onRemove}
          disabled={disabled}
        >
          <Trash2 size={16} />
        </Button>
      </Tooltip>
    </div>
  );
};

interface BlockProps<T> {
  block: T;
  active: boolean;
  onActivate: () => void;
  onChange: (patch: Partial<T>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  handleProps?: SortableHandleProps;
  disabled?: boolean;
}

/** Envoltorio común: plegado enseña el bloque; activo se edita. */
const BlockShell: React.FC<{
  active: boolean;
  onActivate: () => void;
  label: string;
  handleProps?: SortableHandleProps;
  preview: React.ReactNode;
  children: React.ReactNode;
}> = ({ active, onActivate, label, handleProps, preview, children }) => (
  <Card
    className={cn(
      'transition-shadow',
      active ? 'border-l-4 border-l-accent shadow-md' : 'cursor-pointer hover:bg-bg-hover',
    )}
    bodyClassName="space-y-3"
  >
    <Handle handleProps={handleProps} />
    {active ? (
      children
    ) : (
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
        className="outline-none"
      >
        {preview}
      </div>
    )}
  </Card>
);

export const TextBlockCard: React.FC<BlockProps<TextBlock>> = ({
  block,
  onChange,
  disabled,
  ...p
}) => {
  const { t } = useI18n();
  return (
    <BlockShell
      active={p.active}
      onActivate={p.onActivate}
      label={t('forms.blocks.editText')}
      handleProps={p.handleProps}
      preview={
        block.title || block.description ? (
          <TextBlockContent block={block} />
        ) : (
          <span className="text-fg-subtle">{t('forms.blocks.title')}</span>
        )
      }
    >
      <Input
        aria-label={t('forms.blocks.title')}
        value={block.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder={t('forms.blocks.title')}
        disabled={disabled}
      />
      <Textarea
        aria-label={t('forms.blocks.text')}
        rows={4}
        value={block.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value || undefined })}
        placeholder={t('forms.blocks.textOptional')}
        helperText={t(RICH_TEXT_HINT)}
        disabled={disabled}
      />
      <TextStyleControls block={block} onChange={onChange} disabled={disabled} />
      {(block.title || block.description) && (
        <div className="space-y-2 rounded-xs border border-dashed border-border-default p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t('forms.blocks.preview')}
          </div>
          <TextBlockContent block={block} />
        </div>
      )}
      <BlockActions onDuplicate={p.onDuplicate} onRemove={p.onRemove} disabled={disabled} />
    </BlockShell>
  );
};

export const ImageBlockCard: React.FC<
  BlockProps<ImageBlock> & {
    imageUrl: string | null;
    onUpload: (file: File) => Promise<void>;
    uploading: boolean;
  }
> = ({ block, onChange, disabled, imageUrl, onUpload, uploading, ...p }) => {
  const { t } = useI18n();
  return (
    <BlockShell
      active={p.active}
      onActivate={p.onActivate}
      label={t('forms.blocks.editImage')}
      handleProps={p.handleProps}
      preview={
        <>
          {imageUrl ? (
            <img src={imageUrl} alt={block.caption ?? ''} className="w-full rounded-xs" />
          ) : (
            <p className="text-sm text-fg-subtle">{t('forms.blocks.noImage')}</p>
          )}
          {block.caption && <p className="text-sm text-fg-muted mt-2">{block.caption}</p>}
        </>
      }
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="w-full max-h-80 object-contain rounded-xs bg-bg-muted"
        />
      )}
      <FileDropzone
        variant="inline"
        accept="image/*"
        maxSizeMb={5}
        isUploading={uploading}
        label={imageUrl ? t('forms.blocks.changeImage') : t('forms.blocks.uploadImage')}
        onFiles={(files) => (files[0] ? onUpload(files[0]) : undefined)}
        disabled={disabled}
      />
      <Input
        aria-label={t('forms.blocks.caption')}
        value={block.caption ?? ''}
        onChange={(e) => onChange({ caption: e.target.value || undefined })}
        placeholder={t('forms.blocks.captionOptional')}
        disabled={disabled}
      />
      <BlockActions onDuplicate={p.onDuplicate} onRemove={p.onRemove} disabled={disabled} />
    </BlockShell>
  );
};

/** Cabecera de una sección cuando hay varias: «Sección 2 de 3», título, descripción y menú. */
export const SectionHeader: React.FC<{
  section: Section;
  index: number;
  count: number;
  onChange: (patch: Partial<Section>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  disabled?: boolean;
}> = ({ section, index, count, onChange, onMove, onRemove, disabled }) => {
  const { t } = useI18n();
  return (
    <div>
      <div className="inline-flex items-center rounded-t-xs bg-accent px-3 py-1 text-xs font-semibold text-accent-fg">
        {t('forms.blocks.sectionOf', { n: index + 1, count })}
      </div>
      <Card className="rounded-tl-none border-t-4 border-t-accent" bodyClassName="space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 space-y-2">
            <Input
              aria-label={t('forms.blocks.sectionTitle')}
              value={section.title ?? ''}
              onChange={(e) => onChange({ title: e.target.value || undefined })}
              placeholder={t('forms.blocks.untitledSection')}
              disabled={disabled}
            />
            <Textarea
              aria-label={t('forms.blocks.sectionDescription')}
              rows={2}
              value={section.description ?? ''}
              onChange={(e) => onChange({ description: e.target.value || undefined })}
              placeholder={t('forms.blocks.descriptionOptional')}
              helperText={t(RICH_TEXT_HINT)}
              disabled={disabled}
            />
            <div className="sm:w-64">
              <Select
                label={t('forms.textControls.titleEffect')}
                options={TITLE_EFFECT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={section.titleEffect ?? 'none'}
                onChange={(v) =>
                  onChange({ titleEffect: v === 'none' ? undefined : (v as TitleEffect) })
                }
                disabled={disabled}
              />
            </div>
          </div>
          <DropdownMenu
            align="end"
            aria-label={t('forms.blocks.sectionOptions')}
            disabled={disabled}
            items={[
              {
                label: t('forms.blocks.moveSectionUp'),
                icon: <ArrowUp size={14} />,
                onClick: () => onMove(-1),
                disabled: index === 0,
              },
              {
                label: t('forms.blocks.moveSectionDown'),
                icon: <ArrowDown size={14} />,
                onClick: () => onMove(1),
                disabled: index === count - 1,
              },
              {
                label: t('forms.blocks.deleteSection'),
                icon: <Trash2 size={14} />,
                onClick: onRemove,
                destructive: true,
                separatorBefore: true,
              },
            ]}
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xs text-fg-muted hover:bg-bg-hover">
              <MoreVertical size={16} />
            </span>
          </DropdownMenu>
        </div>
      </Card>
    </div>
  );
};

/** «Después de la sección N»: a dónde se va al terminarla. */
export const SectionNext: React.FC<{
  section: Section;
  index: number;
  sections: Section[];
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
}> = ({ section, index, sections, onChange, disabled }) => {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 text-sm text-fg-muted">
      <span>{t('forms.blocks.afterSection', { n: index + 1 })}</span>
      <div className="w-full sm:w-72">
        <Select
          ariaLabel={t('forms.blocks.afterSection', { n: index + 1 })}
          options={[
            { value: '', label: t('forms.options.continueNext') },
            ...sections
              .map((s, i) => ({
                value: s.id,
                label: `${t('forms.options.goToSection', { n: i + 1 })}${s.title ? `: ${s.title}` : ''}`,
              }))
              .filter((o) => o.value !== section.id),
            { value: 'submit', label: t('forms.options.submitForm') },
          ]}
          value={section.next ?? ''}
          onChange={(v) => onChange(v || undefined)}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
