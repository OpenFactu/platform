import React from 'react';
import { Button, Tooltip } from '@openfactu/ui';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Copy,
  Lock,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { CanvasElement } from '../../components/canvas/types';
import type { AlignMode } from '../layoutOps';

export interface ElementActions {
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  toggleLock: (id: string) => void;
  alignToPage: (id: string, mode: AlignMode) => void;
}

/** Qué elemento está seleccionado y lo que más se hace con él. */
export const ElementHeader: React.FC<{ element: CanvasElement; actions: ElementActions }> = ({
  element,
  actions,
}) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm font-semibold text-fg-default truncate">
        {t(`templates.designer.palette.${element.kind}`)}
      </div>
      <div className="flex items-center shrink-0">
        <Tooltip content={t('templates.designer.ctx.duplicate')}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t('templates.designer.ctx.duplicate')}
            onClick={() => actions.duplicate(element.id)}
          >
            <Copy size={14} />
          </Button>
        </Tooltip>
        <Tooltip
          content={
            element.locked ? t('templates.designer.ctx.unlock') : t('templates.designer.ctx.lock')
          }
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={
              element.locked ? t('templates.designer.ctx.unlock') : t('templates.designer.ctx.lock')
            }
            onClick={() => actions.toggleLock(element.id)}
          >
            {element.locked ? <Unlock size={14} /> : <Lock size={14} />}
          </Button>
        </Tooltip>
        <Tooltip content={t('templates.designer.ctx.delete')}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-danger"
            aria-label={t('templates.designer.ctx.delete')}
            onClick={() => actions.remove(element.id)}
          >
            <Trash2 size={14} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

const ALIGN_BUTTONS: { mode: AlignMode; icon: React.ReactNode }[] = [
  { mode: 'left', icon: <AlignStartVertical size={14} /> },
  { mode: 'hcenter', icon: <AlignCenterVertical size={14} /> },
  { mode: 'right', icon: <AlignEndVertical size={14} /> },
  { mode: 'top', icon: <AlignStartHorizontal size={14} /> },
  { mode: 'vcenter', icon: <AlignCenterHorizontal size={14} /> },
  { mode: 'bottom', icon: <AlignEndHorizontal size={14} /> },
];

/** Los seis botones de alinear: con la página o, con varios elementos, entre ellos. */
export const AlignButtons: React.FC<{ onAlign: (mode: AlignMode) => void }> = ({ onAlign }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between">
      {ALIGN_BUTTONS.map(({ mode, icon }) => (
        <Tooltip key={mode} content={t(`templates.designer.align.${mode}`)}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t(`templates.designer.align.${mode}`)}
            onClick={() => onAlign(mode)}
          >
            {icon}
          </Button>
        </Tooltip>
      ))}
    </div>
  );
};
