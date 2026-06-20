import React from 'react';
import { Input, SearchableSelect, cn } from '@openfactu/ui';
import {
  Palette,
  Layout,
  Image as ImageIcon,
  Building2,
  Users,
  Table,
  Stamp,
  AlignCenter,
  Code2,
} from 'lucide-react';
import type { VisualOptions } from '@openfactu/pdf/browser';
import { Section } from './Section';

interface Props {
  opts: VisualOptions;
  updateOpt: <K extends keyof VisualOptions>(key: K, value: VisualOptions[K]) => void;
}

// -------------------- Field helpers --------------------

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
    {children}
  </label>
);

const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <div className="space-y-1">
    <FieldLabel>{label}</FieldLabel>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer flex-shrink-0"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 font-mono text-xs h-9"
      />
    </div>
  </div>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, unit, onChange }) => (
  <div className="space-y-1">
    <FieldLabel>
      {label}
      {unit && <span className="text-slate-400 dark:text-slate-500 normal-case"> ({unit})</span>}
    </FieldLabel>
    <Input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="h-9 text-xs"
    />
  </div>
);

const RangeField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <FieldLabel>{label}</FieldLabel>
      <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
        {value}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step ?? 1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-indigo-600"
    />
  </div>
);

const SelectField: React.FC<{
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="space-y-1">
    <FieldLabel>{label}</FieldLabel>
    <SearchableSelect value={value} onChange={onChange} options={options} />
  </div>
);

const CheckboxRow: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description?: string;
}> = ({ checked, onChange, title, description }) => (
  <label className="flex items-center gap-3 p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 flex-shrink-0"
    />
    <div>
      <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{title}</div>
      {description && (
        <div className="text-[10px] text-slate-400 dark:text-slate-500">{description}</div>
      )}
    </div>
  </label>
);

const Grid2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 gap-3">{children}</div>
);

// -------------------- Main form --------------------

export const VisualForm: React.FC<Props> = ({ opts, updateOpt }) => {
  const updateColumn = <K extends keyof VisualOptions['columns']>(key: K, value: boolean) => {
    updateOpt('columns', { ...opts.columns, [key]: value });
  };
  const updateWatermark = <K extends keyof VisualOptions['watermark']>(
    key: K,
    value: VisualOptions['watermark'][K],
  ) => {
    updateOpt('watermark', { ...opts.watermark, [key]: value });
  };
  const updateFooter = <K extends keyof VisualOptions['footer']>(
    key: K,
    value: VisualOptions['footer'][K],
  ) => {
    updateOpt('footer', { ...opts.footer, [key]: value });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
      <Section title="Diseño" icon={<Palette size={14} />} defaultExpanded>
        <div className="space-y-3">
          <Grid2>
            <ColorField
              label="Color principal"
              value={opts.accentColor}
              onChange={(v) => updateOpt('accentColor', v)}
            />
            <ColorField
              label="Color cabecera"
              value={opts.headerBgColor}
              onChange={(v) => updateOpt('headerBgColor', v)}
            />
          </Grid2>
          <Grid2>
            <ColorField
              label="Color texto"
              value={opts.textColor}
              onChange={(v) => updateOpt('textColor', v)}
            />
            <ColorField
              label="Color secundario"
              value={opts.mutedColor}
              onChange={(v) => updateOpt('mutedColor', v)}
            />
          </Grid2>
          <Grid2>
            <SelectField
              label="Tipo de letra"
              value={opts.fontFamily}
              onChange={(v) => updateOpt('fontFamily', v as any)}
              options={[
                { label: 'Sans-serif (moderna)', value: 'sans' },
                { label: 'Serif (clásica)', value: 'serif' },
                { label: 'Monoespaciada', value: 'mono' },
              ]}
            />
            <NumberField
              label="Tamaño base"
              value={opts.baseFontSize}
              min={7}
              max={14}
              unit="pt"
              onChange={(v) => updateOpt('baseFontSize', v)}
            />
          </Grid2>
        </div>
      </Section>

      <Section title="Página" icon={<Layout size={14} />}>
        <div className="space-y-3">
          <Grid2>
            <SelectField
              label="Tamaño"
              value={opts.pageSize}
              onChange={(v) => updateOpt('pageSize', v as any)}
              options={[
                { label: 'A4 (210 × 297 mm)', value: 'A4' },
                { label: 'Letter (US)', value: 'Letter' },
                { label: 'A5 (148 × 210 mm)', value: 'A5' },
              ]}
            />
            <SelectField
              label="Orientación"
              value={opts.orientation}
              onChange={(v) => updateOpt('orientation', v as any)}
              options={[
                { label: 'Vertical', value: 'portrait' },
                { label: 'Horizontal', value: 'landscape' },
              ]}
            />
          </Grid2>
          <SelectField
            label="Márgenes"
            value={opts.margins}
            onChange={(v) => updateOpt('margins', v as any)}
            options={[
              { label: 'Estrechos', value: 'narrow' },
              { label: 'Normales', value: 'normal' },
              { label: 'Amplios', value: 'wide' },
            ]}
          />
        </div>
      </Section>

      <Section title="Cabecera y logo" icon={<ImageIcon size={14} />}>
        <div className="space-y-3">
          <div className="space-y-1">
            <FieldLabel>Título personalizado</FieldLabel>
            <Input
              value={opts.customTitle}
              onChange={(e) => updateOpt('customTitle', e.target.value)}
              placeholder="Vacío = usar título por defecto (Factura de Venta, ...)"
            />
          </div>
          <div className="space-y-1">
            <FieldLabel>URL del logo</FieldLabel>
            <Input
              value={opts.logoUrl}
              onChange={(e) => updateOpt('logoUrl', e.target.value)}
              placeholder="https://miempresa.com/logo.png"
            />
          </div>
          <Grid2>
            <SelectField
              label="Posición del logo"
              value={opts.logoPosition}
              onChange={(v) => updateOpt('logoPosition', v as any)}
              options={[
                { label: 'Izquierda', value: 'left' },
                { label: 'Centrado', value: 'center' },
                { label: 'Derecha', value: 'right' },
              ]}
            />
            <NumberField
              label="Alto máximo"
              value={opts.logoMaxHeight}
              min={20}
              max={200}
              unit="px"
              onChange={(v) => updateOpt('logoMaxHeight', v)}
            />
          </Grid2>
        </div>
      </Section>

      <Section title="Datos de la empresa" icon={<Building2 size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={opts.showCompanyTaxId}
            onChange={(v) => updateOpt('showCompanyTaxId', v)}
            title="Mostrar CIF/NIF"
          />
          <CheckboxRow
            checked={opts.showCompanyAddress}
            onChange={(v) => updateOpt('showCompanyAddress', v)}
            title="Mostrar dirección"
          />
          <CheckboxRow
            checked={opts.showCompanyContact}
            onChange={(v) => updateOpt('showCompanyContact', v)}
            title="Mostrar contacto (teléfono, email, web)"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 italic pt-1">
            Los datos se leen de <code>SystemConfig</code> (company_name, company_phone...).
            Configurables en los ajustes del tenant.
          </p>
        </div>
      </Section>

      <Section title="Datos del cliente/proveedor" icon={<Users size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={opts.showPartnerTaxId}
            onChange={(v) => updateOpt('showPartnerTaxId', v)}
            title="Mostrar NIF/CIF"
          />
          <CheckboxRow
            checked={opts.showPartnerAddress}
            onChange={(v) => updateOpt('showPartnerAddress', v)}
            title="Mostrar dirección principal"
          />
          <CheckboxRow
            checked={opts.showPartnerContact}
            onChange={(v) => updateOpt('showPartnerContact', v)}
            title="Mostrar email y teléfono"
          />
          <CheckboxRow
            checked={opts.showBillTo}
            onChange={(v) => updateOpt('showBillTo', v)}
            title="Bloque 'Dirección de facturación'"
            description="Si el documento la tiene"
          />
          <CheckboxRow
            checked={opts.showShipTo}
            onChange={(v) => updateOpt('showShipTo', v)}
            title="Bloque 'Dirección de envío'"
            description="Si el documento la tiene"
          />
          <CheckboxRow
            checked={opts.showBaseDoc}
            onChange={(v) => updateOpt('showBaseDoc', v)}
            title="Mostrar albarán origen"
            description="En facturas creadas desde un albarán"
          />
          {/* Extensión propia: el toggle no está en el paquete @openfactu/pdf
              (se serializa en el meta y lo lee renderDocumentPdf en el server). */}
          <CheckboxRow
            checked={Boolean((opts as any).showInternalOrder)}
            onChange={(v) => (updateOpt as unknown as (k: string, val: boolean) => void)('showInternalOrder', v)}
            title="Mostrar proyecto"
            description="Si el documento tiene un proyecto/orden interna asignado en cabecera"
          />
        </div>
      </Section>

      <Section title="Tabla de líneas" icon={<Table size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={opts.columns.code}
            onChange={(v) => updateColumn('code', v)}
            title="Código del artículo"
          />
          <CheckboxRow
            checked={opts.columns.description}
            onChange={(v) => updateColumn('description', v)}
            title="Descripción (nombre + descripción larga)"
          />
          <CheckboxRow
            checked={opts.columns.quantity}
            onChange={(v) => updateColumn('quantity', v)}
            title="Cantidad"
          />
          <CheckboxRow
            checked={opts.columns.uom}
            onChange={(v) => updateColumn('uom', v)}
            title="Unidad de medida"
          />
          <CheckboxRow
            checked={opts.columns.price}
            onChange={(v) => updateColumn('price', v)}
            title="Precio unitario"
          />
          <CheckboxRow
            checked={opts.columns.iva}
            onChange={(v) => updateColumn('iva', v)}
            title="% IVA"
          />
          <CheckboxRow
            checked={opts.columns.lineTotal}
            onChange={(v) => updateColumn('lineTotal', v)}
            title="Total de línea"
          />
        </div>
      </Section>

      <Section title="Totales" icon={<Stamp size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={opts.showTaxBreakdown}
            onChange={(v) => updateOpt('showTaxBreakdown', v)}
            title="Desglose de IVA"
            description="Mostrar IVA desglosado por tipo (21%, 10%...)"
          />
          <CheckboxRow
            checked={opts.showTotalInWords}
            onChange={(v) => updateOpt('showTotalInWords', v)}
            title="Total en letras"
            description="Añadir el total escrito en español bajo los totales"
          />
        </div>
      </Section>

      <Section title="Campos personalizados" icon={<Stamp size={14} />}>
        <div className="space-y-2">
          <CheckboxRow
            checked={!!(opts as any).showCustomFields}
            onChange={(v) => (updateOpt as unknown as (k: string, val: boolean) => void)('showCustomFields', v)}
            title="Mostrar campos personalizados"
            description="Vuelca automáticamente los campos custom definidos para este documento (`visibleIn=pdf`) al final del PDF."
          />
          {(opts as any).showCustomFields && (
            <div className="space-y-1">
              <FieldLabel>Título del bloque</FieldLabel>
              <Input
                value={(opts as any).customFieldsLabel ?? 'Datos adicionales'}
                onChange={(e) => (updateOpt as unknown as (k: string, val: string) => void)('customFieldsLabel', e.target.value)}
                placeholder="Datos adicionales"
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Marca de agua" icon={<Stamp size={14} />}>
        <div className="space-y-3">
          <CheckboxRow
            checked={opts.watermark.enabled}
            onChange={(v) => updateWatermark('enabled', v)}
            title="Activar marca de agua"
            description="Se repite en todas las páginas del PDF"
          />
          {opts.watermark.enabled && (
            <>
              <div className="space-y-1">
                <FieldLabel>Texto</FieldLabel>
                <Input
                  value={opts.watermark.text}
                  onChange={(e) => updateWatermark('text', e.target.value)}
                  placeholder="BORRADOR, PAGADO, COPIA..."
                />
              </div>
              <Grid2>
                <ColorField
                  label="Color"
                  value={opts.watermark.color}
                  onChange={(v) => updateWatermark('color', v)}
                />
                <NumberField
                  label="Tamaño"
                  value={opts.watermark.fontSize}
                  min={40}
                  max={200}
                  unit="px"
                  onChange={(v) => updateWatermark('fontSize', v)}
                />
              </Grid2>
              <RangeField
                label="Opacidad"
                value={Math.round(opts.watermark.opacity * 100) / 100}
                min={0.05}
                max={1}
                step={0.05}
                onChange={(v) => updateWatermark('opacity', v)}
              />
              <RangeField
                label="Rotación"
                value={opts.watermark.rotation}
                min={-90}
                max={90}
                step={5}
                onChange={(v) => updateWatermark('rotation', v)}
              />
            </>
          )}
        </div>
      </Section>

      <Section title="Pie de página" icon={<AlignCenter size={14} />}>
        <div className="space-y-3">
          <div className="space-y-1">
            <FieldLabel>Mensaje del pie</FieldLabel>
            <Input
              value={opts.footer.text}
              onChange={(e) => updateFooter('text', e.target.value)}
              placeholder="Documento generado electrónicamente..."
            />
            <p className="text-[9px] text-slate-400 dark:text-slate-500 italic">
              Admite variables: <code>{'{{company.name}}'}</code>, <code>{'{{doc.docCode}}'}</code>,{' '}
              <code>{'{{generatedAt}}'}</code>
            </p>
          </div>
          <SelectField
            label="Alineación"
            value={opts.footer.alignment}
            onChange={(v) => updateFooter('alignment', v as any)}
            options={[
              { label: 'Izquierda', value: 'left' },
              { label: 'Centro', value: 'center' },
              { label: 'Derecha', value: 'right' },
            ]}
          />
          <CheckboxRow
            checked={opts.footer.showPageNumbers}
            onChange={(v) => updateFooter('showPageNumbers', v)}
            title="Mostrar números de página"
            description="Formato: 1 / 3 — aparece en todas las páginas"
          />
          <CheckboxRow
            checked={opts.footer.showGeneratedAt}
            onChange={(v) => updateFooter('showGeneratedAt', v)}
            title="Mostrar fecha y hora de generación"
          />
        </div>
      </Section>

      <Section title="CSS personalizado (avanzado)" icon={<Code2 size={14} />}>
        <div className="space-y-2">
          <FieldLabel>CSS extra</FieldLabel>
          <textarea
            value={opts.customCss}
            onChange={(e) => updateOpt('customCss', e.target.value)}
            placeholder="/* Ej: .party { background: #fef3c7; } */"
            rows={8}
            className={cn(
              'w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2',
              'text-[11px] font-mono text-slate-800 dark:text-slate-100 resize-y',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300',
            )}
          />
          <p className="text-[9px] text-slate-400 dark:text-slate-500 italic">
            Se añade al final del bloque <code>&lt;style&gt;</code>, por lo que puede sobrescribir
            cualquier estilo de la plantilla base.
          </p>
        </div>
      </Section>
    </div>
  );
};
