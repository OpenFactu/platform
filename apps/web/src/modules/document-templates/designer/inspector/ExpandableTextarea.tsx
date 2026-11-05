import React, { useState } from 'react';
import { Button, Modal, Textarea } from '@openfactu/ui';
import { Maximize2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

/** Texto compacto que se abre en grande para escribir bloques largos. */
export const ExpandableTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  mono?: boolean;
  placeholder?: string;
  modalTitle?: string;
}> = ({ value, onChange, rows = 3, mono = false, placeholder, modalTitle }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-1">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={mono ? 'font-mono' : ''}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1"
        onClick={() => setExpanded(true)}
        title={t('templates.designer.expandable.open')}
      >
        <Maximize2 size={12} /> {t('templates.designer.expandable.editor')}
      </Button>
      <Modal
        isOpen={expanded}
        onClose={() => setExpanded(false)}
        title={modalTitle ?? t('templates.designer.expandable.defaultTitle')}
        subtitle={t('templates.designer.expandable.stats', {
          chars: value.length,
          lines: value.split('\n').length,
        })}
        size="4xl"
        hideCancel
        primaryAction={{
          label: t('templates.designer.expandable.done'),
          onClick: () => setExpanded(false),
        }}
      >
        <Textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={20}
          className={mono ? 'font-mono' : ''}
        />
      </Modal>
    </div>
  );
};
