import React, { useState } from 'react';
import { ChoiceCards, Field, Input, Modal, SearchableSelect } from '@openfactu/ui';
import { Palette, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { getDocTypeLabel, useDocTypeOptions, type DocType } from './constants';

export type NewTemplateMode = 'designer' | 'visual' | 'ai';

interface Props {
  initialDocType: DocType;
  canUseAi: boolean;
  onClose: () => void;
  onConfirm: (choice: { docType: DocType; name: string; mode: NewTemplateMode }) => Promise<void>;
}

/** Para crear una plantilla: de qué documento es y cómo se quiere hacer. */
export const NewTemplateModal: React.FC<Props> = ({
  initialDocType,
  canUseAi,
  onClose,
  onConfirm,
}) => {
  const { t } = useI18n();
  const options = useDocTypeOptions();
  const [docType, setDocType] = useState<DocType>(initialDocType);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<NewTemplateMode>('designer');
  const [saving, setSaving] = useState(false);
  // Sin datos de documento, no hay plantilla estándar que ajustar.
  const isFree = docType === 'FREE' || docType === 'LABEL';
  const effectiveMode: NewTemplateMode = isFree ? 'designer' : mode;

  const submit = async () => {
    setSaving(true);
    try {
      await onConfirm({
        docType,
        mode: effectiveMode,
        name:
          name.trim() || t('templates.newModal.defaultName', { type: getDocTypeLabel(docType) }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={t('templates.newModal.title')}
      cancelLabel={t('templates.newModal.cancel')}
      primaryAction={{
        label: t('templates.newModal.create'),
        onClick: submit,
        isLoading: saving,
      }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('templates.newModal.docType')}>
            <SearchableSelect
              ariaLabel={t('templates.newModal.docType')}
              options={options}
              value={docType}
              onChange={(value) => setDocType(value as DocType)}
            />
          </Field>
          <Field label={t('templates.newModal.name')}>
            <Input
              value={name}
              placeholder={t('templates.newModal.defaultName', {
                type: getDocTypeLabel(docType),
              })}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>
        <ChoiceCards
          label={t('templates.newModal.how')}
          value={effectiveMode}
          onChange={(value) => setMode(value as NewTemplateMode)}
          options={[
            {
              value: 'designer',
              title: t('templates.newModal.designer'),
              description: isFree
                ? t('templates.newModal.designerFreeHint')
                : t('templates.newModal.designerHint'),
              icon: <Palette size={16} />,
            },
            {
              value: 'visual',
              title: t('templates.newModal.visual'),
              description: t('templates.newModal.visualHint'),
              icon: <SlidersHorizontal size={16} />,
              disabled: isFree,
            },
            ...(canUseAi
              ? [
                  {
                    value: 'ai' as const,
                    title: t('templates.newModal.ai'),
                    description: t('templates.newModal.aiHint'),
                    icon: <Sparkles size={16} />,
                    disabled: isFree,
                  },
                ]
              : []),
          ]}
        />
      </div>
    </Modal>
  );
};
