import React, { useState } from 'react';
import { Button } from '@openfactu/ui';
import { Mail, X } from 'lucide-react';
import { BulkSendModal, type AnyDocType } from './BulkSendModal';
import { formatDocCode } from '@/utils/docCode';

interface PartnerLike {
  id: string;
  name: string;
  email?: string | null;
}

interface Props {
  selectedKeys: Set<string | number>;
  rows: any[];
  partners: PartnerLike[];
  docType: AnyDocType;
  /** Campo que contiene el id de partner en la fila (default: 'partnerId'). */
  partnerField?: string;
  onClear: () => void;
  onSent?: () => void;
}

/**
 * Barra que aparece sobre el listado cuando hay filas seleccionadas.
 * Muestra contador + acciones masivas (ahora mismo sólo "Enviar por email").
 * Se despliega el `BulkSendModal` al pulsar enviar.
 */
export const BulkSendToolbar: React.FC<Props> = ({
  selectedKeys,
  rows,
  partners,
  docType,
  partnerField = 'partnerId',
  onClear,
  onSent,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  if (selectedKeys.size === 0) return null;

  const selectedRows = rows.filter((r) => selectedKeys.has(r.id));
  const items = selectedRows.map((r) => {
    const p = partners.find((pp) => pp.id === r[partnerField]);
    return {
      docType,
      docId: r.id,
      docCode: r.docCode || formatDocCode(r),
      partnerName: p?.name || r.partnerName || '—',
      partnerEmail: p?.email || null,
    };
  });

  const withoutEmail = items.filter((i) => !i.partnerEmail).length;

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-accent/10 border-b border-accent/30 text-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onClear}
            className="p-1 rounded-xs text-ink-500 hover:text-ink-900 dark:hover:text-slate-100"
            title="Deseleccionar"
          >
            <X size={14} />
          </button>
          <span className="font-bold text-accent">
            {selectedKeys.size} seleccionado{selectedKeys.size === 1 ? '' : 's'}
          </span>
          {withoutEmail > 0 && (
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              · {withoutEmail} sin email
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setModalOpen(true)}
            className="gap-2 border-accent/40 text-accent hover:bg-accent/10"
          >
            <Mail size={14} /> Enviar por email
          </Button>
        </div>
      </div>
      <BulkSendModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        items={items}
        onSuccess={() => {
          onSent?.();
        }}
      />
    </>
  );
};
