import React, { useCallback, useRef, useState } from 'react';
import { Button, Modal, Textarea } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

interface Ask {
  title: string;
  message: string;
  confirmLabel: string;
}

/**
 * Confirmar una cancelación pidiendo su motivo, que es opcional y se queda en el documento.
 * `ask` devuelve el motivo, o `null` si al final no se cancela.
 */
export function useCancelReason() {
  const { t } = useI18n();
  const [asking, setAsking] = useState<Ask | null>(null);
  const [reason, setReason] = useState('');
  const resolver = useRef<((value: string | null) => void) | null>(null);

  const ask = useCallback((options: Ask) => {
    setReason('');
    setAsking(options);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (value: string | null) => {
    setAsking(null);
    resolver.current?.(value);
    resolver.current = null;
  };

  const dialog = (
    <Modal
      isOpen={!!asking}
      onClose={() => finish(null)}
      title={asking?.title}
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-2 p-3">
          <Button type="button" variant="secondary" onClick={() => finish(null)}>
            {t('doc.common.back')}
          </Button>
          <Button type="button" variant="danger" onClick={() => finish(reason)}>
            {asking?.confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-fg-body">{asking?.message}</p>
        <Textarea
          label={t('doc.common.cancelReason')}
          placeholder={t('doc.common.cancelReasonHint')}
          value={reason}
          rows={3}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </Modal>
  );

  return { ask, dialog };
}
