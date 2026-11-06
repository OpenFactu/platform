import React from 'react';
import { Button } from '@openfactu/ui';
import {
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Trash2,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { Band, CanvasElement, CanvasLayout } from '../../components/canvas/types';
import type { FieldDef, FieldGroup } from '../../components/canvas/fieldRegistry';
import type { AlignMode } from '../layoutOps';
import { Section } from './controls';
import { AlignButtons, type ElementActions } from './ElementHeader';
import { ElementInspector } from './ElementInspector';
import { PageInspector } from './PageInspector';

interface Props {
  element: CanvasElement | null;
  /** Elementos seleccionados con Mayús; con dos o más se ofrece alinearlos entre sí. */
  selection: string[];
  onChange: (id: string, patch: Partial<CanvasElement>) => void;
  pluginGroup: FieldGroup | null;
  linePluginFields: FieldDef[];
  layout: CanvasLayout;
  docType?: string;
  queryFieldGroups: FieldGroup[];
  queryColumns: Record<string, string[]>;
  queryNames: string[];
  actions: ElementActions;
  onAlignSelection: (mode: AlignMode) => void;
  onDistribute: (axis: 'horizontal' | 'vertical') => void;
  onRemoveSelection: () => void;
  onUpdatePage: (patch: Partial<CanvasLayout>) => void;
  onUpdateBand: (bandId: string, patch: Partial<Band>) => void;
  onAddBand: () => void;
  onDeleteBand: (bandId: string) => void;
  onMoveBand: (bandId: string, dir: -1 | 1) => void;
}

/** Panel derecho: lo seleccionado o, sin selección, la página. */
export const InspectorPanel: React.FC<Props> = ({
  element,
  selection,
  onChange,
  pluginGroup,
  linePluginFields,
  layout,
  docType,
  queryFieldGroups,
  queryColumns,
  queryNames,
  actions,
  onAlignSelection,
  onDistribute,
  onRemoveSelection,
  onUpdatePage,
  onUpdateBand,
  onAddBand,
  onDeleteBand,
  onMoveBand,
}) => {
  const { t } = useI18n();
  return (
    <aside className="w-80 shrink-0 border-l border-border-subtle bg-bg-card overflow-y-auto">
      {selection.length > 1 ? (
        <div className="px-3 py-3 space-y-3 text-sm">
          <div className="text-sm font-semibold text-fg-default">
            {t('templates.designer.multi.title', { count: selection.length })}
          </div>
          <Section title={t('templates.designer.multi.align')}>
            <AlignButtons onAlign={onAlignSelection} />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1 gap-1"
                disabled={selection.length < 3}
                onClick={() => onDistribute('horizontal')}
              >
                <AlignHorizontalDistributeCenter size={14} />
                {t('templates.designer.multi.distributeH')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1 gap-1"
                disabled={selection.length < 3}
                onClick={() => onDistribute('vertical')}
              >
                <AlignVerticalDistributeCenter size={14} />
                {t('templates.designer.multi.distributeV')}
              </Button>
            </div>
          </Section>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-danger"
            onClick={onRemoveSelection}
          >
            <Trash2 size={14} /> {t('templates.designer.multi.remove')}
          </Button>
          <p className="text-[11px] text-fg-muted leading-snug">
            {t('templates.designer.multi.hint')}
          </p>
        </div>
      ) : element ? (
        <ElementInspector
          element={element}
          onChange={onChange}
          pluginGroup={pluginGroup}
          linePluginFields={linePluginFields}
          docType={docType}
          queryFieldGroups={queryFieldGroups}
          queryColumns={queryColumns}
          queryNames={queryNames}
          layout={layout}
          actions={actions}
        />
      ) : (
        <PageInspector
          layout={layout}
          onUpdatePage={onUpdatePage}
          onUpdateBand={onUpdateBand}
          onAddBand={onAddBand}
          onDeleteBand={onDeleteBand}
          onMoveBand={onMoveBand}
        />
      )}
    </aside>
  );
};
