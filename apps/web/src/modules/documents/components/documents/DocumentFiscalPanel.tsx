import React, { useEffect, useState } from 'react';
import { Card, DatePicker, Field as UiField, Input, SearchableSelect } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { crudApi } from '@/shared/api';
import { useI18n } from '@/i18n/I18nContext';

export type DocSideKind = 'sales' | 'purchase';

interface LookupRow {
  id: string;
  name: string;
  code?: string;
}

interface Props {
  kind: DocSideKind;
  /** Objeto `state` del hook useDocument (para leer/escribir campos). */
  state: any;
  /** Objeto `setState` del hook useDocument (setters tipados). */
  setState: any;
  /** Si true, se muestra más compacto (en forma de sidebar). */
  compact?: boolean;
  /** Si true, se pinta colapsable (cerrado por defecto). Útil en docs
   *  no fiscales como pedidos o albaranes, donde estos datos son opcionales. */
  collapsible?: boolean;
  /** Solo los campos, sin tarjeta ni título: el alta de documentos pone la
   *  sección por fuera (DocumentFormLayout). */
  bare?: boolean;
}

/**
 * Panel con los campos fiscales nuevos (DocumentType, PaymentMethod,
 * PaymentTerm, dueDate, supplyDate, withholding, notes, internalNotes).
 *
 * Se usa en el formulario de creación de SalesInvoice y PurchaseInvoice.
 * Lee los catálogos desde `/api/document-types`, `/api/payment-methods`,
 * `/api/payment-terms` (populados en el tenant seed).
 */
export const DocumentFiscalPanel: React.FC<Props> = ({
  kind: _kind,
  state,
  setState,
  compact,
  collapsible,
  bare,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(!collapsible || !!bare);
  const { token, user } = useAuth();
  const [docTypes, setDocTypes] = useState<LookupRow[]>([]);
  const [methods, setMethods] = useState<LookupRow[]>([]);
  const [terms, setTerms] = useState<LookupRow[]>([]);

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  useEffect(() => {
    if (!user?.tenantId) return;
    Promise.all([
      crudApi.list<any>('/api/document-types').catch(() => []),
      crudApi.list<any>('/api/payment-methods').catch(() => []),
      crudApi.list<any>('/api/payment-terms').catch(() => []),
    ])
      .then(([d, m, t]) => {
        setDocTypes(Array.isArray(d) ? d : []);
        setMethods(Array.isArray(m) ? m : []);
        setTerms(Array.isArray(t) ? t : []);
      })
      .catch(() => {
        /* silencioso */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  // Guardamos los campos en pluginData con prefijo `__fiscal_` — el
  // `handleSubmit` del page les quita el prefijo y los envía como campos
  // top-level del documento (extraBody).
  const PREFIX = '__fiscal_';
  const set = (k: string, v: any) => {
    setState.setPluginField?.(PREFIX + k, v);
  };
  const get = (k: string) => state.pluginData?.[PREFIX + k] ?? '';

  const fields = (
    <div className="space-y-4">
      <div className={compact ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        <Field label={t('invoice.documentType')}>
          <SearchableSelect
            value={get('documentTypeId')}
            onChange={(v: string) => set('documentTypeId', v)}
            options={docTypes.map((d) => ({
              label: d.code ? `${d.code} · ${d.name}` : d.name,
              value: d.id,
            }))}
            placeholder="—"
          />
        </Field>

        <Field label={t('invoice.paymentMethod')}>
          <SearchableSelect
            value={get('paymentMethodId')}
            onChange={(v: string) => set('paymentMethodId', v)}
            options={methods.map((m) => ({
              label: m.code ? `${m.code} · ${m.name}` : m.name,
              value: m.id,
            }))}
            placeholder="—"
          />
        </Field>

        <Field label={t('doc.fiscal.paymentTerm')}>
          <SearchableSelect
            value={get('paymentTermId')}
            onChange={(v: string) => set('paymentTermId', v)}
            options={terms.map((t) => ({ label: t.name, value: t.id }))}
            placeholder="—"
          />
        </Field>

        <Field label={t('invoice.dueDate')}>
          <DatePicker value={get('dueDate') || null} onChange={(v) => set('dueDate', v ?? '')} />
        </Field>

        <Field label={t('invoice.supplyDate')}>
          <DatePicker
            value={get('supplyDate') || null}
            onChange={(v) => set('supplyDate', v ?? '')}
          />
        </Field>

        <Field label={t('invoice.withholdingRate')}>
          <Input
            type="number"
            step="0.01"
            value={state.withholdingRate ?? 0}
            onChange={(e) => setState.setWithholdingRate?.(Number(e.target.value) || 0)}
            placeholder="0.00"
          />
        </Field>
      </div>

      <div className="space-y-3">
        <Field label={t('doc.fiscal.notesPdf')}>
          <Input
            value={get('notes') || ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={t('doc.fiscal.notesPlaceholder')}
          />
        </Field>
        <Field label={t('invoice.internalNotes')}>
          <Input
            value={get('internalNotes') || ''}
            onChange={(e) => set('internalNotes', e.target.value)}
            placeholder={t('doc.fiscal.internalNotesPlaceholder')}
          />
        </Field>
      </div>
    </div>
  );

  if (bare) return fields;

  return (
    <Card
      className="border-border-default"
      bodyClassName={compact ? 'p-4 space-y-3' : 'p-6 space-y-4'}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-fg-muted border-b border-border-default pb-2"
        >
          <span>{t('doc.fiscal.titleOptional')}</span>
          <span className="text-xs">{open ? '▾' : '▸'}</span>
        </button>
      ) : (
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-fg-muted border-b border-border-default pb-2">
          {t('doc.steps.fiscal')}
        </h3>
      )}

      {open && fields}
    </Card>
  );
};

// Field de @openfactu/ui: etiqueta enlazada al control y estilo del tema.
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <UiField label={label}>{children}</UiField>
);
