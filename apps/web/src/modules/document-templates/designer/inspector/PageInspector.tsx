import React, { useState } from 'react';
import { Button, DropdownMenu, Input, NumberInput, Select } from '@openfactu/ui';
import {
  ChevronDown,
  ChevronUp,
  Code,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import {
  PAGE_SIZE_LABELS,
  resolvePageDimensions,
  type Band,
  type CanvasLayout,
  type PageSize,
} from '../../components/canvas/types';
import { CssEditorModal } from '../../components/canvas/CssEditorModal';
import { bandLabel, FONT_OPTIONS } from '../constants';
import { Label, NumberField, Section } from './controls';
import {
  PageNumbersInspector,
  TraceabilityFooterInspector,
  WatermarkInspector,
} from './PageOptions';
import { ParamsSchemaInspector, QueriesInspector } from './QueriesInspector';

export const PageInspector: React.FC<{
  layout: CanvasLayout;
  docType?: string;
  onUpdatePage: (patch: Partial<CanvasLayout>) => void;
  onUpdateBand: (bandId: string, patch: Partial<Band>) => void;
  onAddBand: () => void;
  onDeleteBand: (bandId: string) => void;
  onMoveBand: (bandId: string, dir: -1 | 1) => void;
}> = ({ layout, docType, onUpdatePage, onUpdateBand, onAddBand, onDeleteBand, onMoveBand }) => {
  const { t } = useI18n();
  const [cssOpen, setCssOpen] = useState(false);
  return (
    <div className="px-3 py-3 space-y-4 text-sm">
      <div className="text-[11px] uppercase tracking-wide font-bold text-fg-muted">
        {t('templates.designer.page.title')}
      </div>
      <Section title={t('templates.designer.page.format')}>
        <Label>{t('templates.designer.common.size')}</Label>
        <Select
          options={[
            { value: 'A4', label: t(PAGE_SIZE_LABELS.A4) },
            { value: 'Letter', label: t(PAGE_SIZE_LABELS.Letter) },
            { value: 'Ticket80', label: t(PAGE_SIZE_LABELS.Ticket80) },
            { value: 'Ticket58', label: t(PAGE_SIZE_LABELS.Ticket58) },
            { value: 'Label100x62', label: t(PAGE_SIZE_LABELS.Label100x62) },
            { value: 'Label70x37', label: t(PAGE_SIZE_LABELS.Label70x37) },
            { value: 'Label50x25', label: t(PAGE_SIZE_LABELS.Label50x25) },
            { value: 'Custom', label: t(PAGE_SIZE_LABELS.Custom) },
          ]}
          value={layout.pageSize}
          onChange={(v) => onUpdatePage({ pageSize: v as PageSize })}
          ariaLabel={t('templates.designer.common.option')}
        />
        {layout.pageSize === 'Custom' && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={t('templates.designer.common.widthMm')}
              value={layout.customWidthMm ?? 100}
              onChange={(v) => onUpdatePage({ customWidthMm: Math.max(10, v) })}
            />
            <NumberField
              label={t('templates.designer.common.heightMm')}
              value={layout.customHeightMm ?? 100}
              onChange={(v) => onUpdatePage({ customHeightMm: Math.max(10, v) })}
            />
          </div>
        )}
        <Label>{t('templates.designer.page.font')}</Label>
        <Select
          options={[
            { value: '', label: t('templates.designer.opt.systemDefault') },
            ...FONT_OPTIONS,
            // La que traiga el documento aunque no esté en la lista.
            ...(layout.fontFamily && !FONT_OPTIONS.some((o) => o.value === layout.fontFamily)
              ? [
                  {
                    value: layout.fontFamily,
                    label: layout.fontFamily.split(',')[0].replace(/'/g, ''),
                  },
                ]
              : []),
          ]}
          value={layout.fontFamily ?? ''}
          onChange={(v) => onUpdatePage({ fontFamily: v || undefined })}
          ariaLabel={t('templates.designer.page.font')}
        />
        <Label>{t('templates.designer.page.marginsMm')}</Label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t('templates.designer.page.top')}
            value={layout.margins.top}
            onChange={(v) => onUpdatePage({ margins: { ...layout.margins, top: v } })}
          />
          <NumberField
            label={t('templates.designer.page.right')}
            value={layout.margins.right}
            onChange={(v) => onUpdatePage({ margins: { ...layout.margins, right: v } })}
          />
          <NumberField
            label={t('templates.designer.page.bottom')}
            value={layout.margins.bottom}
            onChange={(v) => onUpdatePage({ margins: { ...layout.margins, bottom: v } })}
          />
          <NumberField
            label={t('templates.designer.page.left')}
            value={layout.margins.left}
            onChange={(v) => onUpdatePage({ margins: { ...layout.margins, left: v } })}
          />
        </div>
      </Section>
      <Section title={t('templates.designer.page.bands')}>
        {layout.bands.map((b, i) => (
          <div key={b.id} className={`flex items-center gap-1 ${b.hidden ? 'opacity-50' : ''}`}>
            {b.kind === 'custom' ? (
              <Input
                inputSize="sm"
                containerClassName="flex-1 min-w-0"
                value={b.label ?? ''}
                placeholder={t('templates.designer.bands.custom')}
                onChange={(e) => onUpdateBand(b.id, { label: e.target.value })}
              />
            ) : (
              <div className="flex-1 min-w-0 text-xs leading-tight text-fg-body">
                {bandLabel(b)}
              </div>
            )}
            <NumberInput
              inputSize="sm"
              thousandSeparator={false}
              containerClassName="w-[60px] shrink-0"
              min={0}
              aria-label={t('templates.designer.page.bands')}
              value={Math.round(b.height)}
              onChange={(num) => onUpdateBand(b.id, { height: Math.max(0, num ?? 0) })}
            />
            <DropdownMenu
              align="end"
              aria-label={t('templates.designer.page.bandActions')}
              items={[
                {
                  label: b.hidden
                    ? t('templates.designer.page.showBand')
                    : t('templates.designer.ctx.hideBand'),
                  icon: b.hidden ? <Eye size={14} /> : <EyeOff size={14} />,
                  onClick: () => onUpdateBand(b.id, { hidden: !b.hidden }),
                },
                {
                  label: t('templates.designer.page.moveUp'),
                  icon: <ChevronUp size={14} />,
                  disabled: i === 0,
                  onClick: () => onMoveBand(b.id, -1),
                },
                {
                  label: t('templates.designer.page.moveDown'),
                  icon: <ChevronDown size={14} />,
                  disabled: i === layout.bands.length - 1,
                  onClick: () => onMoveBand(b.id, 1),
                },
                ...(b.kind === 'custom'
                  ? [
                      {
                        label: t('templates.designer.ctx.deleteSection'),
                        icon: <Trash2 size={14} />,
                        destructive: true,
                        separatorBefore: true,
                        onClick: () => onDeleteBand(b.id),
                      },
                    ]
                  : []),
              ]}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('templates.designer.page.bandActions')}
              >
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenu>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onAddBand}>
          <Plus size={13} /> {t('templates.designer.page.addBand')}
        </Button>
        <div className="pt-1 text-[11px] text-fg-subtle">
          {t('templates.designer.page.bandsTotal', {
            total: layout.bands.filter((b) => !b.hidden).reduce((a, b) => a + b.height, 0),
            usable:
              resolvePageDimensions(layout).height - layout.margins.top - layout.margins.bottom,
          })}
        </div>
      </Section>
      <WatermarkInspector
        watermark={layout.watermark}
        onChange={(w) => onUpdatePage({ watermark: w })}
      />
      <PageNumbersInspector
        value={layout.pageNumbers}
        onChange={(pn) => onUpdatePage({ pageNumbers: pn })}
      />
      <TraceabilityFooterInspector
        showDocQr={layout.showDocQr}
        showDocBarcode={layout.showDocBarcode}
        onChange={(v) => onUpdatePage(v)}
      />
      <QueriesInspector
        queries={layout.queries}
        testParams={layout.testParams ?? {}}
        paramsSchema={layout.paramsSchema}
        docType={docType}
        onChange={(q) => onUpdatePage({ queries: q })}
        onTestParamsChange={(p) => onUpdatePage({ testParams: p })}
      />
      <ParamsSchemaInspector
        queries={layout.queries}
        schema={layout.paramsSchema}
        onChange={(s) => onUpdatePage({ paramsSchema: s })}
      />
      <Section title={t('templates.designer.page.customCss')}>
        <p className="text-[11px] text-fg-muted leading-snug">
          {t('templates.designer.page.customCssHint')}{' '}
          <code>
            .mi-clase {'{'} color:red {'}'}
          </code>
          ).
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1"
          onClick={() => setCssOpen(true)}
        >
          <Code size={14} /> {t('templates.designer.ctx.editGlobalCss')}
          {layout.customCss ? <span className="text-success">●</span> : null}
        </Button>
      </Section>
      <div className="text-[11px] text-fg-subtle italic">
        {t('templates.designer.page.selectElementHint')}
      </div>
      <CssEditorModal
        open={cssOpen}
        value={layout.customCss ?? ''}
        onChange={(v) => onUpdatePage({ customCss: v.trim() ? v : undefined })}
        onClose={() => setCssOpen(false)}
        title={t('templates.designer.css.globalTitle')}
        helpText={t('templates.designer.css.globalHelpLong')}
      />
    </div>
  );
};
