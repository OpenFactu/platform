import React, { useEffect, useState } from 'react';
import { Card, Input, SearchableSelect } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { crudApi } from '@/shared/api';

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
}) => {
  const [open, setOpen] = useState(!collapsible);
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

  return (
    <Card
      className="border-line dark:border-ink-700"
      bodyClassName={compact ? 'p-4 space-y-3' : 'p-6 space-y-4'}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-ink-500 dark:text-ink-400 border-b border-line dark:border-ink-700 pb-2"
        >
          <span>Fiscal y pago · opcional</span>
          <span className="text-xs">{open ? '▾' : '▸'}</span>
        </button>
      ) : (
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-ink-500 dark:text-ink-400 border-b border-line dark:border-ink-700 pb-2">
          Fiscal y pago
        </h3>
      )}

      {!open ? null : (
        <>
          <div className={compact ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
            <Field label="Tipo de documento">
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

            <Field label="Método de pago">
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

            <Field label="Plazo de pago">
              <SearchableSelect
                value={get('paymentTermId')}
                onChange={(v: string) => set('paymentTermId', v)}
                options={terms.map((t) => ({ label: t.name, value: t.id }))}
                placeholder="—"
              />
            </Field>

            <Field label="Vencimiento">
              <Input
                type="date"
                value={get('dueDate') || ''}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            </Field>

            <Field label="Fecha de operación">
              <Input
                type="date"
                value={get('supplyDate') || ''}
                onChange={(e) => set('supplyDate', e.target.value)}
              />
            </Field>

            <Field label="Retención %">
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
            <Field label="Notas (visibles en PDF)">
              <Input
                value={get('notes') || ''}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Texto que aparece en la factura…"
              />
            </Field>
            <Field label="Notas internas">
              <Input
                value={get('internalNotes') || ''}
                onChange={(e) => set('internalNotes', e.target.value)}
                placeholder="Sólo uso interno, nunca en PDF"
              />
            </Field>
          </div>
        </>
      )}
    </Card>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">
      {label}
    </label>
    {children}
  </div>
);
