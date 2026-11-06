import React, { useState } from 'react';
import {
  Button,
  ColorInput,
  FileDropzone,
  Input,
  NumberInput,
  Select,
  ToggleGroup,
} from '@openfactu/ui';
import { AlignCenter, AlignLeft, AlignRight, Bold, Code, Italic } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import {
  resolvePageDimensions,
  type CanvasElement,
  type CanvasLayout,
} from '../../components/canvas/types';
import { CssEditorModal } from '../../components/canvas/CssEditorModal';
import {
  getFieldGroupsForFieldElement,
  inferDefaultFormat,
  type FieldDef,
  type FieldGroup,
} from '../../components/canvas/fieldRegistry';
import { FONT_OPTIONS, STYLE_NO_FONT } from '../constants';
import { AlignButtons, ElementHeader, type ElementActions } from './ElementHeader';
import { ExpandableTextarea } from './ExpandableTextarea';
import { ExprCommands } from './ExprCommands';
import { FieldPicker } from './FieldPicker';
import { LinesTableEditor } from './LinesTableEditor';
import { RichTextEditor } from './RichTextEditor';
import { Label, NumberField, NumberGrid, Section, Toggle } from './controls';
import { appendSnippet, escapePlainToHtml, fileToDataUrl } from './textUtils';

/** Selector reutilizable de Fuente de datos + Columna (Resumen, Lista). */
const SourceColumnPicker: React.FC<{
  source?: string;
  path?: string;
  onSource: (s: string | undefined) => void;
  onPath: (p: string | undefined) => void;
  showPath?: boolean;
  pathLabel?: string;
  queryNames: string[];
  queryColumns: Record<string, string[]>;
}> = ({ source, path, onSource, onPath, showPath = true, pathLabel, queryNames, queryColumns }) => {
  const { t } = useI18n();
  const queryName = source && source.startsWith('query:') ? source.slice('query:'.length) : null;
  const cols = queryName ? (queryColumns[queryName] ?? []) : [];
  return (
    <>
      <Label>{t('templates.designer.source.title')}</Label>
      <Select
        options={[
          { value: '', label: t('templates.designer.source.docLines') },
          ...queryNames.map((n) => ({
            value: `query:${n}`,
            label: t('templates.designer.fields.queryGroup', { name: n }),
          })),
        ]}
        value={source ?? ''}
        onChange={(v) => onSource(v || undefined)}
        ariaLabel={t('templates.designer.source.title')}
      />
      {showPath && (
        <>
          <Label>{pathLabel ?? t('templates.designer.source.column')}</Label>
          <Input
            inputSize="sm"
            className="font-mono"
            value={path ?? ''}
            onChange={(e) => onPath(e.target.value || undefined)}
            placeholder={
              queryName ? t('templates.designer.source.columnPlaceholder') : 'itemName / lineTotal'
            }
          />
          {cols.length > 0 && (
            <Select
              options={[
                { value: '', label: t('templates.designer.source.pickColumn') },
                ...cols.map((c) => ({ value: c, label: c })),
              ]}
              value=""
              onChange={(v) => v && onPath(v)}
              className="text-xs"
              ariaLabel={t('templates.designer.source.column')}
            />
          )}
        </>
      )}
    </>
  );
};

export const ElementInspector: React.FC<{
  element: CanvasElement;
  onChange: (id: string, patch: Partial<CanvasElement>) => void;
  pluginGroup: FieldGroup | null;
  linePluginFields: FieldDef[];
  docType?: string;
  queryFieldGroups: FieldGroup[];
  queryColumns: Record<string, string[]>;
  queryNames: string[];
  layout: CanvasLayout;
  actions: ElementActions;
}> = ({
  actions,
  element,
  onChange,
  pluginGroup,
  linePluginFields,
  docType,
  queryFieldGroups,
  queryColumns,
  queryNames,
  layout,
}) => {
  const { t } = useI18n();
  const patch = (p: Partial<CanvasElement>) => onChange(element.id, p);
  // Dimensiones útiles para los botones "ocupar": ancho de página menos
  // márgenes y alto de la banda que contiene al elemento.
  const usableWidth = Math.max(
    10,
    resolvePageDimensions(layout).width - layout.margins.left - layout.margins.right,
  );
  const ownBand = layout.bands.find((b) => b.elements.some((e) => e.id === element.id));
  const fitWidth = () => patch({ x: layout.margins.left, w: Math.round(usableWidth) } as any);
  const fitBand = () =>
    patch({
      x: layout.margins.left,
      y: 0,
      w: Math.round(usableWidth),
      h: ownBand ? ownBand.height : element.h,
    } as any);
  const [cssOpen, setCssOpen] = useState(false);
  const isFreeOrLabel = docType === 'FREE' || docType === 'LABEL';
  // FREE/LABEL no tienen documento ligado: su catálogo son las columnas de las
  // consultas SQL + params. El resto de tipos usa el catálogo de documento.
  const fieldGroups = isFreeOrLabel
    ? queryFieldGroups
    : pluginGroup
      ? [...getFieldGroupsForFieldElement('docHeader'), pluginGroup]
      : getFieldGroupsForFieldElement('docHeader');
  return (
    <div className="px-3 py-3 space-y-4 text-sm">
      <ElementHeader element={element} actions={actions} />

      {/* Props específicas por tipo */}
      {element.kind === 'text' && (
        <Section title={t('templates.designer.el.content')}>
          {element.rich && !element.raw ? (
            <RichTextEditor
              value={element.text}
              onChange={(v) => patch({ text: v } as any)}
              defaultColor={element.style?.color}
              style={element.style}
            />
          ) : (
            <ExpandableTextarea
              value={element.text}
              onChange={(v) => patch({ text: v } as any)}
              rows={element.raw ? 5 : 3}
              mono={element.raw === true}
              placeholder={
                element.raw
                  ? t('templates.designer.el.exprPlaceholder')
                  : t('templates.designer.el.textPlaceholder')
              }
              modalTitle={t('templates.designer.el.exprEditor')}
            />
          )}
          <Toggle
            label={t('templates.designer.el.richText')}
            checked={element.rich === true}
            onChange={(v) =>
              patch({
                rich: v,
                // Mutuamente excluyente con `raw`.
                raw: v ? false : element.raw,
                // Al activar rich con texto plano sin etiquetas, conservamos
                // los saltos como <br/> para no perderlos al pasar a HTML.
                text:
                  v && element.text && !/<[a-z][^>]*>/i.test(element.text)
                    ? escapePlainToHtml(element.text)
                    : element.text,
              } as any)
            }
          />
          <Toggle
            label={t('templates.designer.el.rawExpr')}
            checked={element.raw === true}
            onChange={(v) => patch({ raw: v, rich: v ? false : element.rich } as any)}
          />
          {element.raw && (
            <ExprCommands
              onInsert={(snippet) => patch({ text: appendSnippet(element.text, snippet) } as any)}
            />
          )}
        </Section>
      )}

      {element.kind === 'image' && (
        <Section title={t('templates.designer.el.image')}>
          <FileDropzone
            accept="image/*"
            label={
              element.src
                ? t('templates.designer.el.changeImage')
                : t('templates.designer.el.selectFile')
            }
            onFiles={async (files) => {
              if (files[0]) patch({ src: await fileToDataUrl(files[0]) } as any);
            }}
          />
          {element.src && (
            <img
              src={element.src}
              alt="preview"
              className="mt-2 max-h-20 mx-auto rounded border border-border-subtle"
            />
          )}
          <Label>{t('templates.designer.el.orPasteUrl')}</Label>
          <Input
            inputSize="sm"
            value={element.src.startsWith('data:') ? '' : element.src}
            onChange={(e) => patch({ src: e.target.value } as any)}
            placeholder="https://..."
          />
          <Label>{t('templates.designer.el.fit')}</Label>
          <Select
            options={[
              { value: 'contain', label: t('templates.designer.opt.contain') },
              { value: 'cover', label: t('templates.designer.opt.cover') },
              { value: 'fill', label: t('templates.designer.opt.fill') },
            ]}
            value={element.fit ?? 'contain'}
            onChange={(v) => patch({ fit: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
        </Section>
      )}

      {element.kind === 'shape' && (
        <Section title={t('templates.designer.el.shape')}>
          <Label>{t('templates.designer.el.type')}</Label>
          <Select
            options={[
              { value: 'line', label: t('templates.designer.opt.line') },
              { value: 'rect', label: t('templates.designer.opt.rect') },
            ]}
            value={element.shape}
            onChange={(v) => patch({ shape: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <Label>{t('templates.designer.el.borderColor')}</Label>
          <ColorInput
            size="sm"
            showHex={false}
            value={element.style?.borderColor ?? '#000000'}
            onChange={(next) =>
              patch({
                style: { ...(element.style ?? {}), borderColor: next },
              } as any)
            }
          />
        </Section>
      )}

      {element.kind === 'field' && (
        <Section title={t('templates.designer.el.field')}>
          <Label>{t('templates.designer.el.linkedField')}</Label>
          <FieldPicker
            value={element.path}
            groups={fieldGroups}
            onPick={(field) =>
              patch({
                path: field.path,
                format: inferDefaultFormat(field),
              } as any)
            }
          />
          <Label>{t('templates.designer.el.pathAdvanced')}</Label>
          <Input
            inputSize="sm"
            className="font-mono"
            value={element.path}
            onChange={(e) => patch({ path: e.target.value } as any)}
            placeholder="doc.docCode"
          />
          <Label>{t('templates.designer.el.format')}</Label>
          <Select
            options={[
              { value: '', label: t('templates.designer.opt.noFormat') },
              { value: 'currency', label: t('templates.designer.opt.currency') },
              { value: 'number', label: t('templates.designer.opt.number') },
              { value: 'date', label: t('templates.designer.opt.date') },
              { value: 'percent', label: t('templates.designer.opt.percent') },
              { value: 'percentRaw', label: t('templates.designer.opt.percentRaw') },
              { value: 'address', label: t('templates.designer.opt.address') },
            ]}
            value={element.format ?? ''}
            onChange={(v) => patch({ format: (v || undefined) as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <Toggle
            label={t('templates.designer.el.richAffix')}
            checked={element.rich === true}
            onChange={(v) =>
              patch({
                rich: v,
                prefix:
                  v && element.prefix && !/<[a-z][^>]*>/i.test(element.prefix)
                    ? escapePlainToHtml(element.prefix)
                    : element.prefix,
                suffix:
                  v && element.suffix && !/<[a-z][^>]*>/i.test(element.suffix)
                    ? escapePlainToHtml(element.suffix)
                    : element.suffix,
              } as any)
            }
          />
          <Label>{t('templates.designer.el.prefix')}</Label>
          {element.rich ? (
            <RichTextEditor
              value={element.prefix ?? ''}
              onChange={(v) => patch({ prefix: v || undefined } as any)}
              defaultColor={element.style?.color}
            />
          ) : (
            <Input
              inputSize="sm"
              value={element.prefix ?? ''}
              onChange={(e) => patch({ prefix: e.target.value || undefined } as any)}
            />
          )}
          <Label>{t('templates.designer.el.suffix')}</Label>
          {element.rich ? (
            <RichTextEditor
              value={element.suffix ?? ''}
              onChange={(v) => patch({ suffix: v || undefined } as any)}
              defaultColor={element.style?.color}
            />
          ) : (
            <Input
              inputSize="sm"
              value={element.suffix ?? ''}
              onChange={(e) => patch({ suffix: e.target.value || undefined } as any)}
            />
          )}
        </Section>
      )}

      {element.kind === 'totals' && (
        <Section title={t('templates.designer.el.totalsToShow')}>
          <Toggle
            label="Subtotal"
            checked={element.showSubtotal !== false}
            onChange={(v) => patch({ showSubtotal: v } as any)}
          />
          <Toggle
            label={t('templates.designer.el.vatBreakdown')}
            checked={element.showTaxBreakdown !== false}
            onChange={(v) => patch({ showTaxBreakdown: v } as any)}
          />
          <Toggle
            label="Total"
            checked={element.showTotal !== false}
            onChange={(v) => patch({ showTotal: v } as any)}
          />
        </Section>
      )}

      {element.kind === 'qr' && (
        <Section title="QR">
          <Label>{t('templates.designer.el.valuePathOrLiteral')}</Label>
          <Input
            inputSize="sm"
            className="font-mono"
            value={element.value}
            onChange={(e) => patch({ value: e.target.value } as any)}
          />
        </Section>
      )}

      {element.kind === 'barcode' && (
        <Section title={t('templates.designer.el.barcode')}>
          <Label>{t('templates.designer.el.valuePathOrLiteral')}</Label>
          <Input
            inputSize="sm"
            className="font-mono"
            value={element.value}
            onChange={(e) => patch({ value: e.target.value } as any)}
          />
          <Label>{t('templates.designer.el.symbology')}</Label>
          <Select
            options={[
              { value: 'auto', label: t('templates.designer.sym.auto') },
              { value: 'code128', label: t('templates.designer.sym.code128') },
              { value: 'code39', label: t('templates.designer.sym.code39') },
              { value: 'code93', label: 'Code 93' },
              { value: 'codabar', label: 'Codabar' },
              { value: 'interleaved2of5', label: 'Interleaved 2 of 5 (ITF)' },
              { value: 'ean13', label: t('templates.designer.sym.ean13') },
              { value: 'ean8', label: t('templates.designer.sym.ean8') },
              { value: 'upca', label: t('templates.designer.sym.upca') },
              { value: 'upce', label: t('templates.designer.sym.upce') },
              { value: 'isbn', label: t('templates.designer.sym.isbn') },
              { value: 'itf14', label: t('templates.designer.sym.itf14') },
              { value: 'gs1-128', label: t('templates.designer.sym.gs1128') },
              { value: 'datamatrix', label: 'Data Matrix' },
              { value: 'pdf417', label: 'PDF417' },
              { value: 'qrcode', label: 'QR Code' },
              { value: 'azteccode', label: 'Aztec' },
            ]}
            value={element.symbology}
            onChange={(v) => patch({ symbology: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <div className="text-[10px] text-fg-muted leading-snug">
            {t('templates.designer.el.barcodeHint')}
          </div>
          <Toggle
            label={t('templates.designer.el.showHumanText')}
            checked={element.includeText ?? false}
            onChange={(v) => patch({ includeText: v } as any)}
          />
        </Section>
      )}

      {element.kind === 'linesTable' && (
        <LinesTableEditor
          element={element}
          onPatch={(p) => patch(p as any)}
          extraLineFields={linePluginFields}
          queryColumns={queryColumns}
          queryNames={queryNames}
          isFreeOrLabel={isFreeOrLabel}
        />
      )}

      {element.kind === 'signature' && (
        <Section title={t('templates.designer.el.signature')}>
          <Label>{t('templates.designer.el.label')}</Label>
          <Input
            inputSize="sm"
            value={element.label ?? ''}
            onChange={(e) => patch({ label: e.target.value } as any)}
            placeholder={t('templates.designer.el.signaturePlaceholder')}
          />
        </Section>
      )}

      {element.kind === 'pageBreak' && (
        <Section title={t('templates.designer.el.pageBreak')}>
          <div className="text-[11px] text-fg-muted leading-snug">
            {t('templates.designer.el.pageBreakHint')}
          </div>
        </Section>
      )}

      {element.kind === 'conditional' && (
        <Section title={t('templates.designer.el.condition')}>
          <Label>{t('templates.designer.el.pathToEval')}</Label>
          <Input
            inputSize="sm"
            className="font-mono"
            value={element.path}
            onChange={(e) => patch({ path: e.target.value } as any)}
            placeholder="doc.paid"
          />
          <Label>{t('templates.designer.el.operator')}</Label>
          <Select
            options={[
              { value: 'truthy', label: t('templates.designer.cond.truthy') },
              { value: 'falsy', label: t('templates.designer.cond.falsy') },
              { value: 'eq', label: t('templates.designer.cond.eq') },
              { value: 'neq', label: t('templates.designer.cond.neq') },
              { value: 'gt', label: t('templates.designer.cond.gt') },
              { value: 'lt', label: t('templates.designer.cond.lt') },
            ]}
            value={element.operator}
            onChange={(v) => patch({ operator: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          {element.operator !== 'truthy' && element.operator !== 'falsy' && (
            <>
              <Label>{t('templates.designer.el.compareValue')}</Label>
              <Input
                inputSize="sm"
                className="font-mono"
                value={element.value ?? ''}
                onChange={(e) => patch({ value: e.target.value } as any)}
                placeholder={t('templates.designer.el.compareValuePlaceholder')}
              />
              <div className="text-[11px] text-fg-muted leading-snug">
                {t('templates.designer.el.compareHint1')} <code>path.como.este</code>{' '}
                {t('templates.designer.el.compareHint2')}
              </div>
            </>
          )}
          <Label>{t('templates.designer.el.ifTrue')}</Label>
          <ExpandableTextarea
            value={element.thenText}
            onChange={(v) => patch({ thenText: v } as any)}
            rows={3}
            mono
            placeholder={t('templates.designer.el.ifTruePlaceholder')}
            modalTitle={t('templates.designer.el.ifTrueEditor')}
          />
          <Label>{t('templates.designer.el.ifFalse')}</Label>
          <ExpandableTextarea
            value={element.elseText ?? ''}
            onChange={(v) => patch({ elseText: v || undefined } as any)}
            rows={3}
            mono
            placeholder={t('templates.designer.el.ifFalsePlaceholder')}
            modalTitle={t('templates.designer.el.ifFalseEditor')}
          />
          <ExprCommands
            label={t('templates.designer.el.insertIntoTrue')}
            onInsert={(snippet) =>
              patch({ thenText: appendSnippet(element.thenText, snippet) } as any)
            }
          />
        </Section>
      )}

      {element.kind === 'divider' && (
        <Section title={t('templates.designer.el.divider')}>
          <Label>{t('templates.designer.el.orientation')}</Label>
          <Select
            options={[
              { value: 'horizontal', label: t('templates.designer.opt.horizontal') },
              { value: 'vertical', label: t('templates.designer.opt.vertical') },
            ]}
            value={element.orientation ?? 'horizontal'}
            onChange={(v) => patch({ orientation: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <div className="text-[10px] text-fg-subtle leading-snug">
            Grosor, color y estilo de línea se ajustan en la sección Estilo (borde).
          </div>
        </Section>
      )}

      {element.kind === 'summary' && (
        <Section title={t('templates.designer.el.summary')}>
          <Label>{t('templates.designer.el.operation')}</Label>
          <Select
            options={[
              { value: 'sum', label: t('templates.designer.agg.sum') },
              { value: 'count', label: t('templates.designer.agg.count') },
              { value: 'avg', label: t('templates.designer.agg.avg') },
              { value: 'min', label: t('templates.designer.agg.min') },
              { value: 'max', label: t('templates.designer.agg.max') },
            ]}
            value={element.op}
            onChange={(v) => patch({ op: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <SourceColumnPicker
            source={element.source}
            path={element.path}
            onSource={(s) => patch({ source: s } as any)}
            onPath={(p) => patch({ path: p } as any)}
            showPath={element.op !== 'count'}
            queryNames={queryNames}
            queryColumns={queryColumns}
          />
          <Label>{t('templates.designer.el.format')}</Label>
          <Select
            options={[
              { value: '', label: '—' },
              { value: 'currency', label: t('templates.designer.opt.currencySym') },
              { value: 'number', label: t('templates.designer.opt.numberSym') },
              { value: 'percent', label: t('templates.designer.opt.percentSym') },
            ]}
            value={element.format ?? ''}
            onChange={(v) => patch({ format: (v || undefined) as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11px] text-fg-muted">{t('templates.designer.el.prefix')}</div>
              <Input
                inputSize="sm"
                value={element.prefix ?? ''}
                onChange={(e) => patch({ prefix: e.target.value || undefined } as any)}
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-fg-muted">{t('templates.designer.el.suffix')}</div>
              <Input
                inputSize="sm"
                value={element.suffix ?? ''}
                onChange={(e) => patch({ suffix: e.target.value || undefined } as any)}
              />
            </label>
          </div>
        </Section>
      )}

      {element.kind === 'box' && (
        <Section title={t('templates.designer.el.box')}>
          <NumberField
            label={t('templates.designer.el.cornerRadius')}
            value={element.style?.borderRadius ?? 0}
            onChange={(v) =>
              patch({
                style: { ...(element.style ?? {}), borderRadius: Math.max(0, v) },
              } as any)
            }
          />
          <div className="text-[10px] text-fg-subtle leading-snug">
            {t('templates.designer.el.boxHint')}
          </div>
        </Section>
      )}

      {element.kind === 'list' && (
        <Section title={t('templates.designer.el.list')}>
          <SourceColumnPicker
            source={element.source}
            path={element.itemPath}
            onSource={(s) => patch({ source: s } as any)}
            onPath={(p) => patch({ itemPath: p } as any)}
            pathLabel={t('templates.designer.el.fieldToShow')}
            queryNames={queryNames}
            queryColumns={queryColumns}
          />
          <Toggle
            label={t('templates.designer.el.numbered')}
            checked={!!element.ordered}
            onChange={(v) => patch({ ordered: v } as any)}
          />
          <Label>{t('templates.designer.el.marker')}</Label>
          <Select
            options={[
              { value: 'bullet', label: t('templates.designer.opt.bullet') },
              { value: 'number', label: t('templates.designer.opt.number') },
              { value: 'none', label: t('templates.designer.opt.none') },
            ]}
            value={element.marker ?? 'bullet'}
            onChange={(v) => patch({ marker: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
        </Section>
      )}

      {element.kind === 'currentDate' && (
        <Section title={t('templates.designer.el.date')}>
          <Label>{t('templates.designer.el.mode')}</Label>
          <Select
            options={[
              { value: 'date', label: t('templates.designer.opt.dateOnly') },
              { value: 'datetime', label: t('templates.designer.opt.datetime') },
            ]}
            value={element.mode ?? 'date'}
            onChange={(v) => patch({ mode: v as any } as any)}
            ariaLabel={t('templates.designer.common.option')}
          />
          <Label>{t('templates.designer.el.prefix')}</Label>
          <Input
            inputSize="sm"
            value={element.prefix ?? ''}
            onChange={(e) => patch({ prefix: e.target.value || undefined } as any)}
            placeholder={t('templates.designer.el.datePrefixPlaceholder')}
          />
        </Section>
      )}

      {/* Geometría común */}
      <Section title={t('templates.designer.el.geometry')}>
        <NumberGrid>
          <NumberField label="X (mm)" value={element.x} onChange={(v) => patch({ x: v } as any)} />
          <NumberField label="Y (mm)" value={element.y} onChange={(v) => patch({ y: v } as any)} />
          <NumberField
            label={t('templates.designer.common.widthMm')}
            value={element.w}
            onChange={(v) => patch({ w: Math.max(1, v) } as any)}
          />
          <NumberField
            label={t('templates.designer.common.heightMm')}
            value={element.h}
            onChange={(v) => patch({ h: Math.max(1, v) } as any)}
          />
        </NumberGrid>
        <AlignButtons onAlign={(mode) => actions.alignToPage(element.id, mode)} />
        {(element.kind === 'text' || element.kind === 'totals') && (
          <Toggle
            label={t('templates.designer.el.flow')}
            checked={!!element.flow}
            onChange={(flow) => patch({ flow: flow || undefined } as any)}
          />
        )}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={fitWidth}
            title={t('templates.designer.el.fitWidthTitle')}
          >
            {t('templates.designer.el.fitWidth')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={fitBand}
            disabled={!ownBand}
            title={t('templates.designer.el.fitBandTitle')}
          >
            {t('templates.designer.el.fitBand')}
          </Button>
        </div>
      </Section>

      {/* Estilo común — visible para todos los tipos salvo los que no tienen
          superficie estilizable (salto de página / espacio). Antes se gateaba
          por `'style' in element`, que oculta la sección en elementos recién
          creados sin clave `style` (p.ej. un texto nuevo). */}
      {element.kind !== 'pageBreak' && element.kind !== 'spacer' && (
        <Section title={t('templates.designer.el.style')}>
          {!STYLE_NO_FONT.has(element.kind) && (
            <>
              <Label>{t('templates.designer.el.font')}</Label>
              <Select
                options={[
                  { value: '', label: t('templates.designer.opt.systemDefault') },
                  ...FONT_OPTIONS,
                ]}
                value={element.style?.fontFamily ?? ''}
                onChange={(v) =>
                  patch({
                    style: {
                      ...(element.style ?? {}),
                      fontFamily: v || undefined,
                    },
                  } as any)
                }
                ariaLabel={t('templates.designer.common.option')}
              />

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-[11px] text-fg-muted">
                    {t('templates.designer.common.sizePt')}
                  </div>
                  <NumberInput
                    inputSize="sm"
                    thousandSeparator={false}
                    min={4}
                    max={72}
                    value={element.style?.fontSize ?? null}
                    onChange={(num) =>
                      patch({
                        style: {
                          ...(element.style ?? {}),
                          fontSize: num ?? undefined,
                        },
                      } as any)
                    }
                  />
                </label>
                <label className="block">
                  <div className="text-[11px] text-fg-muted">
                    {t('templates.designer.common.color')}
                  </div>
                  <ColorInput
                    size="sm"
                    showHex={false}
                    value={element.style?.color ?? '#000000'}
                    onChange={(next) =>
                      patch({ style: { ...(element.style ?? {}), color: next } } as any)
                    }
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
                <ToggleGroup
                  type="multiple"
                  size="sm"
                  aria-label={t('templates.designer.el.font')}
                  items={[
                    {
                      value: 'bold',
                      icon: <Bold size={14} />,
                      title: t('templates.designer.common.bold'),
                    },
                    {
                      value: 'italic',
                      icon: <Italic size={14} />,
                      title: t('templates.designer.el.italic'),
                    },
                  ]}
                  value={[
                    ...(element.style?.fontWeight === 'bold' ? ['bold'] : []),
                    ...(element.style?.fontStyle === 'italic' ? ['italic'] : []),
                  ]}
                  onChange={(values) =>
                    patch({
                      style: {
                        ...(element.style ?? {}),
                        fontWeight: values.includes('bold') ? 'bold' : 'normal',
                        fontStyle: values.includes('italic') ? 'italic' : 'normal',
                      },
                    } as any)
                  }
                />
                <ToggleGroup
                  type="single"
                  size="sm"
                  aria-label={t('templates.designer.common.alignment')}
                  items={[
                    {
                      value: 'left',
                      icon: <AlignLeft size={14} />,
                      title: t('templates.designer.opt.left'),
                    },
                    {
                      value: 'center',
                      icon: <AlignCenter size={14} />,
                      title: t('templates.designer.opt.center'),
                    },
                    {
                      value: 'right',
                      icon: <AlignRight size={14} />,
                      title: t('templates.designer.opt.right'),
                    },
                  ]}
                  value={element.style?.textAlign ?? 'left'}
                  onChange={(textAlign) =>
                    textAlign && patch({ style: { ...(element.style ?? {}), textAlign } } as any)
                  }
                />
              </div>
            </>
          )}

          <Label>{t('templates.designer.el.bgColor')}</Label>
          <div className="flex gap-2 items-center">
            <ColorInput
              size="sm"
              showHex={false}
              value={element.style?.backgroundColor ?? '#ffffff'}
              onChange={(next) =>
                patch({
                  style: { ...(element.style ?? {}), backgroundColor: next },
                } as any)
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                patch({
                  style: { ...(element.style ?? {}), backgroundColor: undefined },
                } as any)
              }
            >
              {t('templates.designer.el.transparent')}
            </Button>
          </div>

          <Label>{t('templates.designer.el.border')}</Label>
          <div className="grid grid-cols-[1fr_70px_70px] gap-2 items-end">
            <label className="block">
              <div className="text-[11px] text-fg-muted">{t('templates.designer.el.style')}</div>
              <Select
                options={[
                  { value: 'none', label: t('templates.designer.opt.noBorder') },
                  { value: 'solid', label: t('templates.designer.opt.line') },
                  { value: 'dashed', label: t('templates.designer.opt.dashed') },
                  { value: 'dotted', label: t('templates.designer.opt.dotted') },
                ]}
                value={element.style?.borderStyle ?? 'none'}
                onChange={(value) => {
                  const v = value as 'none' | 'solid' | 'dashed' | 'dotted';
                  patch({
                    style: {
                      ...(element.style ?? {}),
                      borderStyle: v,
                      // Al activar un borde, aseguramos valores sensatos.
                      borderWidth: v === 'none' ? undefined : (element.style?.borderWidth ?? 1),
                      borderColor:
                        v === 'none' ? undefined : (element.style?.borderColor ?? '#000000'),
                    },
                  } as any);
                }}
                ariaLabel={t('templates.designer.common.option')}
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-fg-muted">
                {t('templates.designer.el.borderWidth')}
              </div>
              <NumberInput
                inputSize="sm"
                thousandSeparator={false}
                min={0}
                max={20}
                value={element.style?.borderWidth ?? null}
                onChange={(num) =>
                  patch({
                    style: {
                      ...(element.style ?? {}),
                      borderWidth: num ?? undefined,
                    },
                  } as any)
                }
              />
            </label>
            <label className="block">
              <div className="text-[11px] text-fg-muted">
                {t('templates.designer.common.color')}
              </div>
              <ColorInput
                size="sm"
                showHex={false}
                value={element.style?.borderColor ?? '#000000'}
                onChange={(next) =>
                  patch({
                    style: { ...(element.style ?? {}), borderColor: next },
                  } as any)
                }
              />
            </label>
          </div>
        </Section>
      )}

      {/* CSS por elemento — disponible para todos los kinds (fuera del guard de estilo). */}
      <Section title={t('templates.designer.css.elementTitle')}>
        <Label>{t('templates.designer.el.cssClass')}</Label>
        <Input
          inputSize="sm"
          className="font-mono"
          value={element.className ?? ''}
          placeholder={t('templates.designer.el.cssClassPlaceholder')}
          onChange={(e) => patch({ className: e.target.value || undefined } as any)}
        />
        <div className="text-[10px] text-fg-subtle leading-snug">
          {t('templates.designer.el.cssClassHint')}
        </div>
        <Label>{t('templates.designer.el.ownCss')}</Label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1"
          onClick={() => setCssOpen(true)}
        >
          <Code size={13} /> {t('templates.designer.ctx.editCss')}
          {element.customCss ? <span className="text-success">●</span> : null}
        </Button>
        <div className="text-[10px] text-fg-subtle leading-snug">
          {t('templates.designer.el.ownCssHint1')}{' '}
          <code>letter-spacing:2px;text-transform:uppercase</code>
          {t('templates.designer.el.ownCssHint2')}
        </div>
      </Section>

      <CssEditorModal
        open={cssOpen}
        value={element.customCss ?? ''}
        onChange={(v) => patch({ customCss: v.trim() ? v : undefined } as any)}
        onClose={() => setCssOpen(false)}
        title={t('templates.designer.css.elementTitle')}
        helpText={t('templates.designer.css.elementHelpLong')}
      />
    </div>
  );
};
