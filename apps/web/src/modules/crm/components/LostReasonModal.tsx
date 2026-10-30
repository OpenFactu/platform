import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import { Input, Modal, Select } from '@openfactu/ui';

const OTHER = '__other__';

interface Props {
  open: boolean;
  reasons: string[];
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Pide el motivo al dar una oportunidad por perdida. Sin motivo los informes
 * de pérdidas no dicen nada, así que es obligatorio.
 */
export const LostReasonModal: React.FC<Props> = ({ open, reasons, onCancel, onConfirm }) => {
  const { t } = useI18n();
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const options = [
    ...reasons.filter((r) => r !== 'Otro').map((r) => ({ value: r, label: r })),
    { value: OTHER, label: t('crm.lostReason.other') },
  ];
  const reason = choice === OTHER ? other.trim() : choice;

  return (
    <Modal
      isOpen={open}
      onClose={onCancel}
      title={t('crm.lostReason.title')}
      size="sm"
      tone="warning"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) onConfirm(reason);
      }}
      primaryAction={{ label: t('crm.lostReason.confirm'), type: 'submit', disabled: !reason }}
    >
      <div className="space-y-3">
        <Select
          label={t('crm.lostReason.reason')}
          options={options}
          value={choice}
          onChange={setChoice}
          placeholder={t('crm.lostReason.choose')}
        />
        {choice === OTHER && (
          <Input
            label={t('crm.lostReason.describe')}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            autoFocus
          />
        )}
      </div>
    </Modal>
  );
};
