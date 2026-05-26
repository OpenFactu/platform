/**
 * Editor "tonto" de etiquetas FREE: formulario con toggles que produce el
 * `CanvasLayout` automáticamente sin que el usuario tenga que tocar el
 * diseñador canvas. Va dentro del `DocumentTemplateDesigner` como modo
 * alternativo al canvas.
 *
 * Cualquier cambio en el formulario llama a `onChange(layout)` con el layout
 * recompilado. Persistir el layout también persiste `simpleLabel` (la
 * configuración) dentro del propio layout, así al recargar volvemos al modo
 * simple por defecto.
 */

import React from 'react';
import {
  buildSimpleLabelLayout,
  defaultSimpleArticleSettings,
  defaultSimpleDocumentSettings,
} from './canvas/buildSimpleLabel';
import {
  PAGE_SIZE_LABELS,
  type CanvasLayout,
  type PageSize,
  type SimpleLabelSettings,
  type BarcodeSymbology,
} from './canvas/types';

interface Props {
  settings: SimpleLabelSettings;
  onChange: (layout: CanvasLayout) => void;
}

export const SimpleLabelEditor: React.FC<Props> = ({ settings, onChange }) => {
  const update = (patch: Partial<SimpleLabelSettings>) => {
    const next = { ...settings, ...patch };
    onChange(buildSimpleLabelLayout(next));
  };

  return (
    <div className="px-6 py-5 max-w-2xl mx-auto space-y-5 text-sm overflow-y-auto h-full">
      <div className="text-[11px] uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
        Editor simple — etiqueta
      </div>

      <FormSection title="Origen de los datos">
        <RadioRow
          label="¿Qué imprimes?"
          value={settings.kind}
          options={[
            { value: 'article', label: 'Etiqueta de artículo' },
            { value: 'document', label: 'Etiqueta de documento' },
          ]}
          onChange={(v) => {
            // Cambiar el origen reinicia los toggles a defaults sensatos del
            // nuevo tipo para evitar referencias a paths que no existen.
            const base =
              v === 'article' ? defaultSimpleArticleSettings() : defaultSimpleDocumentSettings();
            // Conservamos pageSize/accentColor que no dependen del origen.
            update({
              ...base,
              pageSize: settings.pageSize,
              customWidthMm: settings.customWidthMm,
              customHeightMm: settings.customHeightMm,
              accentColor: settings.accentColor,
            });
          }}
        />
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-1">
          {settings.kind === 'article'
            ? 'Lee el artículo desde la tabla Item con :itemId. Botón "Etiqueta" en Items o por línea de documento.'
            : 'Usa params.docCode (sin tocar BD). Botón "Etiqueta" en la barra del detalle del documento.'}
        </p>
      </FormSection>

      <FormSection title="Tamaño">
        <Field label="Tamaño de página">
          <select
            value={settings.pageSize}
            onChange={(e) => update({ pageSize: e.target.value as PageSize })}
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <optgroup label="Tiquets / Recibos">
              <option value="Ticket80">{PAGE_SIZE_LABELS.Ticket80}</option>
              <option value="Ticket58">{PAGE_SIZE_LABELS.Ticket58}</option>
            </optgroup>
            <optgroup label="Etiquetas">
              <option value="Label100x62">{PAGE_SIZE_LABELS.Label100x62}</option>
              <option value="Label70x37">{PAGE_SIZE_LABELS.Label70x37}</option>
              <option value="Label50x25">{PAGE_SIZE_LABELS.Label50x25}</option>
            </optgroup>
            <optgroup label="Otros">
              <option value="A4">{PAGE_SIZE_LABELS.A4}</option>
              <option value="Letter">{PAGE_SIZE_LABELS.Letter}</option>
              <option value="Custom">{PAGE_SIZE_LABELS.Custom}</option>
            </optgroup>
          </select>
        </Field>
        {settings.pageSize === 'Custom' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ancho (mm)">
              <input
                type="number"
                value={settings.customWidthMm ?? 100}
                onChange={(e) =>
                  update({ customWidthMm: Math.max(10, Number(e.target.value) || 10) })
                }
                className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </Field>
            <Field label="Alto (mm)">
              <input
                type="number"
                value={settings.customHeightMm ?? 60}
                onChange={(e) =>
                  update({ customHeightMm: Math.max(10, Number(e.target.value) || 10) })
                }
                className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </Field>
          </div>
        )}
      </FormSection>

      <FormSection title="Qué mostrar">
        <ToggleRow
          label="Cabecera (texto fijo arriba)"
          checked={settings.showTitle === true}
          onChange={(v) => update({ showTitle: v })}
        />
        {settings.showTitle && (
          <Field label="Texto de la cabecera">
            <input
              type="text"
              value={settings.titleText ?? ''}
              onChange={(e) => update({ titleText: e.target.value })}
              placeholder={settings.kind === 'document' ? 'DOCUMENTO' : 'PRODUCTO'}
              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </Field>
        )}
        <ToggleRow
          label={
            settings.kind === 'article' ? 'Nombre del artículo' : 'Código del documento (texto)'
          }
          checked={settings.showName === true}
          onChange={(v) => update({ showName: v })}
        />
        {settings.kind === 'article' && (
          <ToggleRow
            label="Código interno del artículo"
            checked={settings.showCode === true}
            onChange={(v) => update({ showCode: v })}
          />
        )}
        {settings.kind === 'article' && (
          <ToggleRow
            label="Precio (formato moneda)"
            checked={settings.showPrice === true}
            onChange={(v) => update({ showPrice: v })}
          />
        )}
        <ToggleRow
          label="Código de barras"
          checked={settings.showBarcode === true}
          onChange={(v) => update({ showBarcode: v })}
        />
        {settings.showBarcode && (
          <Field label="Simbología">
            <select
              value={settings.barcodeSymbology ?? 'auto'}
              onChange={(e) => update({ barcodeSymbology: e.target.value as BarcodeSymbology })}
              className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="auto">Auto (detectar EAN-13/UPC-A/EAN-8/Code128)</option>
              <option value="code128">Code 128</option>
              <option value="ean13">EAN-13</option>
              <option value="ean8">EAN-8</option>
              <option value="upca">UPC-A</option>
              <option value="code39">Code 39</option>
              <option value="itf14">ITF-14</option>
              <option value="datamatrix">Data Matrix</option>
              <option value="pdf417">PDF417</option>
            </select>
          </Field>
        )}
        <ToggleRow
          label="Código QR"
          checked={settings.showQr === true}
          onChange={(v) => update({ showQr: v })}
        />
      </FormSection>

      <FormSection title="Texto al pie (opcional)">
        <Field label="Texto adicional">
          <input
            type="text"
            value={settings.footerText ?? ''}
            onChange={(e) => update({ footerText: e.target.value || undefined })}
            placeholder="Ej: {{company.name}} · gracias por su compra"
            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Admite expresiones Handlebars como <code>{'{{params.docCode}}'}</code>.
          </p>
        </Field>
      </FormSection>

      <FormSection title="Color de acento">
        <Field label="Color principal de textos destacados">
          <input
            type="color"
            value={settings.accentColor ?? '#0f172a'}
            onChange={(e) => update({ accentColor: e.target.value })}
            className="h-9 w-full rounded border border-slate-200 dark:border-slate-700"
          />
        </Field>
      </FormSection>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic leading-snug border-t border-slate-200 dark:border-slate-800 pt-3">
        Si necesitas algo más concreto que estos toggles, cambia al editor avanzado — pero ojo: si
        después vuelves al simple, los cambios manuales se perderán.
      </p>
    </div>
  );
};

// ---------- helpers UI ----------

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="space-y-2 border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
    <div className="text-[11px] uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
      {title}
    </div>
    {children}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</div>
    {children}
  </label>
);

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between cursor-pointer py-1">
    <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4"
    />
  </label>
);

const RadioRow: React.FC<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: any) => void;
}> = ({ label, value, options, onChange }) => (
  <div>
    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</div>
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-2 text-xs rounded border transition-all ${
            value === o.value
              ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-200 font-bold'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);
