import React from 'react';
import { Button, FileDropzone, Tooltip } from '@openfactu/ui';
import { Image, PlusCircle, Rows3, Type } from 'lucide-react';

interface Props {
  onQuestion: () => void;
  onText: () => void;
  onImage: (file: File) => Promise<void>;
  onSection: () => void;
  uploadingImage: boolean;
}

const ToolButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({
  label,
  onClick,
  children,
}) => (
  <Tooltip content={label}>
    <Button type="button" variant="ghost" size="md" aria-label={label} onClick={onClick}>
      {children}
    </Button>
  </Tooltip>
);

/**
 * Barra para añadir elementos: columna fija junto al lienzo en escritorio y
 * barra flotante abajo en móvil (por encima de la navegación inferior).
 */
export const EditorToolbar: React.FC<Props> = ({
  onQuestion,
  onText,
  onImage,
  onSection,
  uploadingImage,
}) => (
  <div
    role="toolbar"
    aria-label="Añadir al formulario"
    className="z-30 flex items-center justify-around gap-1 rounded-xs border border-border-default bg-bg-card p-1 shadow-md max-md:fixed max-md:inset-x-4 max-md:bottom-[calc(80px+1rem+env(safe-area-inset-bottom))] md:sticky md:top-24 md:flex-col"
  >
    <ToolButton label="Añadir pregunta" onClick={onQuestion}>
      <PlusCircle size={20} />
    </ToolButton>
    <ToolButton label="Añadir título y texto" onClick={onText}>
      <Type size={20} />
    </ToolButton>
    <Tooltip content="Añadir imagen">
      <FileDropzone
        variant="button"
        accept="image/*"
        maxSizeMb={5}
        isUploading={uploadingImage}
        icon={<Image size={20} />}
        label={<span className="sr-only">Añadir imagen</span>}
        onFiles={(files) => (files[0] ? onImage(files[0]) : undefined)}
      />
    </Tooltip>
    <ToolButton label="Añadir sección" onClick={onSection}>
      <Rows3 size={20} />
    </ToolButton>
  </div>
);
