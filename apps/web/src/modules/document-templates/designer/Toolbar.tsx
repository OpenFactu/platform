import React from 'react';
import { Button, DropdownMenu, InlineEdit, Switch, Tooltip } from '@openfactu/ui';
import {
  ArrowLeft,
  Code,
  Eraser,
  Eye,
  FileDown,
  FileUp,
  Maximize,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  Plus,
  Redo,
  Save,
  Undo,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

interface ToolbarProps {
  title: string;
  onRename: (name: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  saveState: 'saved' | 'dirty' | 'saving';
  /** Aún no se ha guardado nunca en el lienzo: nada se guarda solo. */
  isDraft: boolean;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onExport: () => void;
  onImport: () => void;
  onImportFromTemplate: () => void;
  onEditCss: () => void;
  onClear: () => void;
  onPreview: () => void;
  previewLoading: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  /** Pintar el lienzo con datos de ejemplo o con los nombres de los campos. */
  showData: boolean;
  onShowDataChange: (show: boolean) => void;
}

const IconButton: React.FC<{
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, disabled, onClick, children }) => (
  <Tooltip content={label}>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  </Tooltip>
);

export const Toolbar: React.FC<ToolbarProps> = ({
  title,
  onRename,
  onBack,
  onSave,
  saving,
  saveState,
  isDraft,
  onToggleFullscreen,
  isFullscreen,
  onExport,
  onImport,
  onImportFromTemplate,
  onEditCss,
  onClear,
  onPreview,
  previewLoading,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  showData,
  onShowDataChange,
}) => {
  const { t } = useI18n();
  const status =
    saveState === 'saving'
      ? t('templates.designer.toolbar.saving')
      : isDraft || saveState === 'dirty'
        ? t('templates.designer.toolbar.unsaved')
        : t('templates.designer.toolbar.saved');
  return (
    <header className="flex items-center gap-2 px-3 h-14 border-b border-border-subtle bg-bg-card">
      <IconButton label={t('templates.designer.toolbar.back')} onClick={onBack}>
        <ArrowLeft size={16} />
      </IconButton>
      <div className="min-w-0 flex-1 text-sm font-semibold text-fg-default">
        <InlineEdit
          className="w-full"
          label={t('templates.designer.toolbar.rename')}
          value={title}
          onSave={onRename}
          validate={(value) => (value.trim() ? null : t('templates.designer.toolbar.nameRequired'))}
        />
      </div>

      <IconButton label={t('templates.designer.toolbar.undo')} disabled={!canUndo} onClick={onUndo}>
        <Undo size={15} />
      </IconButton>
      <IconButton label={t('templates.designer.toolbar.redo')} disabled={!canRedo} onClick={onRedo}>
        <Redo size={15} />
      </IconButton>

      <div className="w-px h-6 bg-border-subtle mx-1" />

      <IconButton label={t('templates.designer.toolbar.zoomOut')} onClick={onZoomOut}>
        <Minus size={15} />
      </IconButton>
      <Tooltip content={t('templates.designer.toolbar.zoomFit')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-14 tabular-nums"
          aria-label={t('templates.designer.toolbar.zoomFit')}
          onClick={onZoomFit}
        >
          {Math.round(zoom * 100)}%
        </Button>
      </Tooltip>
      <IconButton label={t('templates.designer.toolbar.zoomIn')} onClick={onZoomIn}>
        <Plus size={15} />
      </IconButton>

      <div className="w-px h-6 bg-border-subtle mx-1" />
      <Switch
        size="sm"
        className="whitespace-nowrap"
        label={t('templates.designer.toolbar.sampleData')}
        checked={showData}
        onChange={onShowDataChange}
      />

      <div className="w-px h-6 bg-border-subtle mx-1" />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-2"
        isLoading={previewLoading}
        onClick={onPreview}
      >
        <Eye size={14} /> {t('templates.designer.toolbar.preview')}
      </Button>

      <DropdownMenu
        align="end"
        aria-label={t('templates.designer.toolbar.more')}
        items={[
          {
            label: t('templates.designer.toolbar.importFromTemplate'),
            icon: <FileUp size={14} />,
            onClick: onImportFromTemplate,
          },
          {
            label: t('templates.designer.toolbar.importJson'),
            icon: <FileUp size={14} />,
            onClick: onImport,
          },
          {
            label: t('templates.designer.toolbar.exportJson'),
            icon: <FileDown size={14} />,
            onClick: onExport,
          },
          {
            label: t('templates.designer.ctx.editGlobalCss'),
            icon: <Code size={14} />,
            separatorBefore: true,
            onClick: onEditCss,
          },
          {
            label: isFullscreen
              ? t('templates.designer.toolbar.exitFullscreen')
              : t('templates.designer.toolbar.fullscreen'),
            icon: isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />,
            onClick: onToggleFullscreen,
          },
          {
            label: t('templates.designer.toolbar.fit'),
            icon: <Maximize size={14} />,
            onClick: onZoomFit,
          },
          {
            label: t('templates.designer.toolbar.clear'),
            icon: <Eraser size={14} />,
            destructive: true,
            separatorBefore: true,
            onClick: onClear,
          },
        ]}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('templates.designer.toolbar.more')}
        >
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenu>

      <span
        className={`text-[11px] select-none whitespace-nowrap ${
          saveState === 'saved' && !isDraft ? 'text-fg-muted' : 'text-warning'
        }`}
        title={isDraft ? undefined : t('templates.designer.toolbar.autosaveOn')}
      >
        {status}
      </span>
      <Button
        type="button"
        size="sm"
        className="gap-2"
        isLoading={saving}
        title={t('templates.designer.toolbar.saveNow')}
        onClick={onSave}
      >
        <Save size={14} /> {t('templates.designer.toolbar.save')}
      </Button>
    </header>
  );
};
