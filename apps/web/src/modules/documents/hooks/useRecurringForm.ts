import { useEffect, useRef, useState } from 'react';
import { DocType } from '@openfactu/common';
import { useAuth } from '@/context/AuthContext';
import { docsApi } from '../api';
import { recurringApi } from '../api/salesApi';
import { pluginDataFromHeader, recurringHeaderFrom, type Frequency } from '../domain/sales';
import { useDocument } from './useDocument';

const todayIso = () => new Date().toISOString().slice(0, 10);

export interface RecurringFields {
  name: string;
  frequency: Frequency;
  startDate: string;
  endDate: string;
  autoPost: boolean;
  autoSend: boolean;
}

/**
 * El formulario de una recurrente: las líneas y el cliente van por `useDocument`, igual que
 * en una factura, y lo propio de la repetición va aparte. Puede empezar de una guardada
 * (`id`) o de una factura (`fromInvoice`).
 */
export function useRecurringForm(options: { id?: string; fromInvoice?: string | null }) {
  const { id, fromInvoice } = options;
  const { token, user } = useAuth();
  const doc = useDocument({
    token: token || '',
    tenantId: user?.tenantId || '',
    docType: DocType.SalesInvoice,
    apiEndpoint: '/api/sales/invoices',
    permissions: (user as any)?.permissions?.['/sales/recurring'],
  });
  const { setState, masters } = doc;
  const [fields, setFields] = useState<RecurringFields>({
    name: '',
    frequency: 'monthly',
    startDate: todayIso(),
    endDate: '',
    autoPost: false,
    autoSend: false,
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id || !!fromInvoice);
  const loaded = useRef(false);

  const set = (patch: Partial<RecurringFields>) => {
    setFields((current) => {
      const next = { ...current, ...patch };
      // Enviarla sola sin emitirla no se admite: una cosa arrastra a la otra.
      if (patch.autoPost === false) next.autoSend = false;
      if (patch.autoSend === true) next.autoPost = true;
      return next;
    });
  };

  // Se cargan una vez, cuando ya están los maestros: `useDocument` pone los suyos al llegar.
  const mastersReady = masters.partners.length > 0 || !doc.state.mastersLoading;
  useEffect(() => {
    if (!mastersReady || loaded.current) return;
    if (!id && !fromInvoice) return;
    loaded.current = true;
    const fill = (source: {
      partnerId: string;
      warehouseId?: string | null;
      seriesId?: string | null;
      lines: any[];
    }) => {
      setState.setPartnerId(source.partnerId);
      if (source.warehouseId) setState.setWarehouseId(source.warehouseId);
      if (source.seriesId) setState.setSeriesId(source.seriesId);
      setState.setLines(
        source.lines.map((line: any) => ({
          ...line,
          quantity: Number(line.quantity),
          price: Number(line.price),
        })),
      );
    };
    const load = id
      ? recurringApi.get(id).then((row) => {
          fill(row);
          setState.setPluginData(pluginDataFromHeader(row.header));
          setFields({
            name: row.name,
            frequency: row.frequency,
            startDate: row.startDate,
            endDate: row.endDate ?? '',
            autoPost: row.autoPost,
            autoSend: row.autoSend,
          });
        })
      : docsApi.get<any>('/api/sales/invoices', fromInvoice as string).then((invoice) => {
          fill({
            partnerId: invoice.partnerId,
            warehouseId: invoice.warehouseId,
            seriesId: invoice.seriesId,
            lines: invoice.lines ?? [],
          });
          setState.setPluginData(
            pluginDataFromHeader({
              ...(invoice.documentTypeId ? { documentTypeId: invoice.documentTypeId } : {}),
              ...(invoice.paymentMethodId ? { paymentMethodId: invoice.paymentMethodId } : {}),
              ...(invoice.paymentTermId ? { paymentTermId: invoice.paymentTermId } : {}),
            }),
          );
        });
    load.catch(() => undefined).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mastersReady, id, fromInvoice]);

  const submit = async () => {
    const body = {
      ...fields,
      endDate: fields.endDate || null,
      partnerId: doc.state.partnerId,
      seriesId: doc.state.seriesId,
      warehouseId: doc.state.warehouseId,
      header: recurringHeaderFrom(doc.state.pluginData),
      lines: doc.state.lines.filter((line: any) => line.itemId),
    };
    setSaving(true);
    try {
      return id ? await recurringApi.update(id, body) : await recurringApi.create(body);
    } finally {
      setSaving(false);
    }
  };

  return { doc, fields, set, loading, saving, submit };
}
