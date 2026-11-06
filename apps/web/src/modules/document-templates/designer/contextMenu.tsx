import React from 'react';
import type { ContextMenuItem } from '@openfactu/ui';
import {
  BringToFront,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Code,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Plus,
  SendToBack,
  Trash2,
  Unlock,
} from 'lucide-react';
import { t } from '@/i18n/i18n';
import type { CanvasLayout } from '../components/canvas/types';
import { ELEMENT_GROUPS } from './constants';
import { findElement } from './layoutOps';
import type { CtxTarget } from './types';
import type { LayoutEditor } from './useLayoutEditor';

/** Opciones del menú contextual según lo que haya debajo del cursor. */
export function buildContextItems(
  target: CtxTarget,
  layout: CanvasLayout,
  editor: LayoutEditor,
  openCss: { element: (id: string) => void; page: () => void },
): ContextMenuItem[] {
  const hasClip = editor.hasClipboard();
  if (target.scope === 'element') {
    const { bandId, elementId } = target;
    const el = findElement(layout, elementId);
    const locked = !!el?.locked;
    const hidden = !!el?.hidden;
    const canStyle = !!el && 'style' in el;
    return [
      {
        label: t('templates.designer.ctx.duplicate'),
        icon: <Copy size={14} />,
        onClick: () => editor.duplicateElement(elementId),
      },
      {
        label: t('templates.designer.ctx.copy'),
        icon: <Copy size={14} />,
        onClick: () => editor.copyElement(elementId),
      },
      {
        label: t('templates.designer.ctx.paste'),
        icon: <ClipboardPaste size={14} />,
        disabled: !hasClip,
        onClick: () => editor.pasteElement(bandId),
      },
      {
        label: t('templates.designer.ctx.copyStyle'),
        disabled: !canStyle,
        onClick: () => editor.copyStyle(elementId),
      },
      {
        label: t('templates.designer.ctx.pasteStyle'),
        disabled: !editor.hasStyleClipboard() || !canStyle,
        onClick: () => editor.pasteStyle(elementId),
      },
      {
        label: t('templates.designer.ctx.bringToFront'),
        icon: <BringToFront size={14} />,
        separatorBefore: true,
        onClick: () => editor.setZOrder(bandId, elementId, 'front'),
      },
      {
        label: t('templates.designer.ctx.sendToBack'),
        icon: <SendToBack size={14} />,
        onClick: () => editor.setZOrder(bandId, elementId, 'back'),
      },
      {
        label: hidden ? t('templates.designer.ctx.show') : t('templates.designer.ctx.hide'),
        icon: hidden ? <Eye size={14} /> : <EyeOff size={14} />,
        separatorBefore: true,
        onClick: () => editor.updateElement(elementId, { hidden: !hidden }),
      },
      {
        label: locked ? t('templates.designer.ctx.unlock') : t('templates.designer.ctx.lock'),
        icon: locked ? <Unlock size={14} /> : <Lock size={14} />,
        onClick: () => editor.toggleLock(elementId),
      },
      {
        label: t('templates.designer.ctx.editCss'),
        icon: <Code size={14} />,
        onClick: () => openCss.element(elementId),
      },
      {
        label: t('templates.designer.ctx.delete'),
        icon: <Trash2 size={14} />,
        destructive: true,
        separatorBefore: true,
        onClick: () => editor.deleteElement(bandId, elementId),
      },
    ];
  }
  if (target.scope === 'band') {
    const { bandId, xMm, yMm } = target;
    return [
      {
        label: t('templates.designer.ctx.addElementHere'),
        icon: <Plus size={14} />,
        submenu: ELEMENT_GROUPS.flatMap((group) => group.items).map((item) => ({
          label: t(`templates.designer.palette.${item.kind}`),
          onClick: () => editor.addElementToBand(bandId, item.kind, xMm, yMm),
        })),
      },
      {
        label: t('templates.designer.ctx.paste'),
        icon: <ClipboardPaste size={14} />,
        disabled: !hasClip,
        onClick: () => editor.pasteElement(bandId, xMm, yMm),
      },
      {
        label: t('templates.designer.ctx.hideBand'),
        icon: <EyeOff size={14} />,
        separatorBefore: true,
        onClick: () => editor.updateBand(bandId, { hidden: true }),
      },
      {
        label: t('templates.designer.ctx.moveBandUp'),
        icon: <ChevronUp size={14} />,
        onClick: () => editor.moveBand(bandId, -1),
      },
      {
        label: t('templates.designer.ctx.moveBandDown'),
        icon: <ChevronDown size={14} />,
        onClick: () => editor.moveBand(bandId, 1),
      },
      {
        label: t('templates.designer.ctx.deleteSection'),
        icon: <Trash2 size={14} />,
        destructive: true,
        separatorBefore: true,
        disabled: layout.bands.find((b) => b.id === bandId)?.kind !== 'custom',
        onClick: () => editor.deleteBand(bandId),
      },
    ];
  }
  // Fondo de la página.
  return [
    {
      label: t('templates.designer.ctx.paste'),
      icon: <ClipboardPaste size={14} />,
      disabled: !hasClip,
      onClick: () => editor.pasteHere(),
    },
    {
      label: t('templates.designer.ctx.editGlobalCss'),
      icon: <Code size={14} />,
      separatorBefore: true,
      onClick: openCss.page,
    },
  ];
}
