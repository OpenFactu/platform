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
import type { ImageBlock, Section, TextBlock } from '@forms-engine';

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
}> = ({ onDuplicate, onRemove, disabled }) => (
  <div className="flex justify-end gap-1 border-t border-border-subtle pt-3">
    <Tooltip content="Duplicar">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Duplicar"
        onClick={onDuplicate}
        disabled={disabled}
      >
        <Copy size={16} />
      </Button>
    </Tooltip>
    <Tooltip content="Eliminar">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Eliminar"
        onClick={onRemove}
        disabled={disabled}
      >
        <Trash2 size={16} />
      </Button>
    </Tooltip>
  </div>
);

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
}) => (
  <BlockShell
    active={p.active}
    onActivate={p.onActivate}
    label="Editar bloque de texto"
    handleProps={p.handleProps}
    preview={
      <>
        <div className="text-base font-semibold text-fg-default">
          {block.title || <span className="text-fg-subtle">Título</span>}
        </div>
        {block.description && (
          <p className="text-sm text-fg-muted mt-1 whitespace-pre-wrap">{block.description}</p>
        )}
      </>
    }
  >
    <Input
      aria-label="Título"
      value={block.title}
      onChange={(e) => onChange({ title: e.target.value })}
      placeholder="Título"
      disabled={disabled}
    />
    <Textarea
      aria-label="Texto"
      rows={3}
      value={block.description ?? ''}
      onChange={(e) => onChange({ description: e.target.value || undefined })}
      placeholder="Texto (opcional)"
      disabled={disabled}
    />
    <BlockActions onDuplicate={p.onDuplicate} onRemove={p.onRemove} disabled={disabled} />
  </BlockShell>
);

export const ImageBlockCard: React.FC<
  BlockProps<ImageBlock> & {
    imageUrl: string | null;
    onUpload: (file: File) => Promise<void>;
    uploading: boolean;
  }
> = ({ block, onChange, disabled, imageUrl, onUpload, uploading, ...p }) => (
  <BlockShell
    active={p.active}
    onActivate={p.onActivate}
    label="Editar imagen"
    handleProps={p.handleProps}
    preview={
      <>
        {imageUrl ? (
          <img src={imageUrl} alt={block.caption ?? ''} className="w-full rounded-xs" />
        ) : (
          <p className="text-sm text-fg-subtle">Sin imagen</p>
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
      label={imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
      onFiles={(files) => (files[0] ? onUpload(files[0]) : undefined)}
      disabled={disabled}
    />
    <Input
      aria-label="Pie de foto"
      value={block.caption ?? ''}
      onChange={(e) => onChange({ caption: e.target.value || undefined })}
      placeholder="Pie de foto (opcional)"
      disabled={disabled}
    />
    <BlockActions onDuplicate={p.onDuplicate} onRemove={p.onRemove} disabled={disabled} />
  </BlockShell>
);

/** Cabecera de una sección cuando hay varias: «Sección 2 de 3», título, descripción y menú. */
export const SectionHeader: React.FC<{
  section: Section;
  index: number;
  count: number;
  onChange: (patch: Partial<Section>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  disabled?: boolean;
}> = ({ section, index, count, onChange, onMove, onRemove, disabled }) => (
  <div>
    <div className="inline-flex items-center rounded-t-xs bg-accent px-3 py-1 text-xs font-semibold text-accent-fg">
      Sección {index + 1} de {count}
    </div>
    <Card className="rounded-tl-none border-t-4 border-t-accent" bodyClassName="space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-2">
          <Input
            aria-label="Título de la sección"
            value={section.title ?? ''}
            onChange={(e) => onChange({ title: e.target.value || undefined })}
            placeholder="Sección sin título"
            disabled={disabled}
          />
          <Textarea
            aria-label="Descripción de la sección"
            rows={2}
            value={section.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value || undefined })}
            placeholder="Descripción (opcional)"
            disabled={disabled}
          />
        </div>
        <DropdownMenu
          align="end"
          aria-label="Opciones de la sección"
          disabled={disabled}
          items={[
            {
              label: 'Subir sección',
              icon: <ArrowUp size={14} />,
              onClick: () => onMove(-1),
              disabled: index === 0,
            },
            {
              label: 'Bajar sección',
              icon: <ArrowDown size={14} />,
              onClick: () => onMove(1),
              disabled: index === count - 1,
            },
            {
              label: 'Eliminar sección (sus preguntas se conservan)',
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

/** «Después de la sección N»: a dónde se va al terminarla. */
export const SectionNext: React.FC<{
  section: Section;
  index: number;
  sections: Section[];
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
}> = ({ section, index, sections, onChange, disabled }) => (
  <div className="flex flex-wrap items-center gap-2 px-1 text-sm text-fg-muted">
    <span>Después de la sección {index + 1}</span>
    <div className="w-full sm:w-72">
      <Select
        ariaLabel={`Después de la sección ${index + 1}`}
        options={[
          { value: '', label: 'Continuar a la siguiente sección' },
          ...sections
            .map((s, i) => ({
              value: s.id,
              label: `Ir a la sección ${i + 1}${s.title ? `: ${s.title}` : ''}`,
            }))
            .filter((o) => o.value !== section.id),
          { value: 'submit', label: 'Enviar formulario' },
        ]}
        value={section.next ?? ''}
        onChange={(v) => onChange(v || undefined)}
        disabled={disabled}
      />
    </div>
  </div>
);
