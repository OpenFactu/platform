import React, { useEffect, useState } from 'react';
import { Button, Loader, Modal, Stepper, usePopup, useToast } from '@openfactu/ui';
import { validateBarcode } from '@/utils/barcodeValidation';
import { useItemForm } from '../hooks/useItemForm';
import { ItemGeneralFields } from './ItemGeneralFields';
import { ItemLogisticsFields } from './ItemLogisticsFields';
import { ItemWebFields } from './ItemWebFields';
import type { Category } from '../domain/category';
import type { Item } from '../domain/item';
import type { Uom } from '../domain/uom';
import type { Warehouse, Zone } from '../domain/warehouse';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  uoms: Uom[];
  warehouses: Warehouse[];
  zones: Zone[];
  /** Artículo de origen para "Duplicar" — precarga todo menos code/barcode. */
  duplicateFrom?: Item | null;
  /** Se llama con el artículo creado; el 2º parámetro pide abrir su ficha. */
  onCreated: (item: Item, openDetail: boolean) => void;
}

const STEPS = [
  { id: 1, label: 'inventory.itemWizard.steps.essential' },
  { id: 2, label: 'inventory.itemWizard.steps.logistics' },
  { id: 3, label: 'inventory.itemWizard.steps.web' },
];

/**
 * Alta de artículos en pasos: lo esencial primero (con "Crear ya" para el
 * alta rápida), logística y web opcionales. Sustituye al antiguo modal de
 * creación con 4 pestañas. La lógica vive en useItemForm; esto es composición.
 */
export const ItemCreateWizard: React.FC<Props> = ({
  open,
  onClose,
  categories,
  uoms,
  warehouses,
  zones,
  duplicateFrom,
  onCreated,
}) => {
  const toast = useToast();
  const { t } = useI18n();
  const popup = usePopup();
  const form = useItemForm();
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    if (duplicateFrom) {
      // Duplicado: todo menos código (auto/manual nuevo) y barcode (único)
      form.reset({ ...duplicateFrom, code: '', barcode: '' });
    } else {
      form.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duplicateFrom]);

  const { values } = form;
  const hasPrefix = !!categories.find((c) => c.id === values.categoryId)?.codePrefix;
  const essentialsOk = !!values.name && !!values.uomId && (!!values.code || hasPrefix);

  const create = async (openDetail: boolean) => {
    // Aviso no bloqueante de barcode inválido — misma regla que el modal viejo
    if (values.barcode.trim()) {
      const v = validateBarcode(values.barcode);
      if (!v.valid) {
        const ok = await popup.confirm({
          title: t('inventory.barcode.invalidTitle'),
          message: t('inventory.barcode.invalidMessage', { format: v.format, reason: v.reason }),
          tone: 'warning',
          confirmLabel: t('inventory.barcode.saveAnyway'),
        });
        if (!ok) return;
      }
    }
    try {
      const saved = await form.submit();
      toast.success(t('inventory.itemWizard.created'));
      onCreated(saved, openDetail);
      onClose();
    } catch (err: any) {
      console.error('[ItemCreateWizard] error:', err);
      toast.error(t('inventory.itemWizard.error', { message: err?.message || err }));
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={
        duplicateFrom
          ? t('inventory.itemWizard.duplicateTitle', { name: duplicateFrom.name })
          : t('inventory.itemWizard.newTitle')
      }
      subtitle={t('inventory.itemWizard.subtitle')}
      maxWidth="lg"
    >
      <div className="pt-2">
        {/* Stepper de @openfactu/ui: hechos, actual y pendientes, y volver
            atrás pulsando. Saltar adelante solo con lo esencial completo. */}
        <Stepper
          className="mb-6"
          size="sm"
          aria-label={t('inventory.itemWizard.stepsAria')}
          current={step - 1}
          allowForward={essentialsOk}
          steps={STEPS.map((s) => ({ id: String(s.id), label: t(s.label) }))}
          onStepClick={(_, i) => setStep(i + 1)}
        />

        {step === 1 && (
          <div className="animate-in slide-in-from-left-2 duration-200">
            <ItemGeneralFields values={values} set={form.set} categories={categories} uoms={uoms} />
          </div>
        )}
        {step === 2 && (
          <div className="animate-in slide-in-from-right-2 duration-200">
            <ItemLogisticsFields
              values={values}
              set={form.set}
              warehouses={warehouses}
              zones={zones}
            />
          </div>
        )}
        {step === 3 && (
          <div className="animate-in slide-in-from-right-2 duration-200">
            <ItemWebFields
              webVisible={values.webVisible}
              setWebVisible={(v) => form.set('webVisible', v)}
              webDescription={values.webDescription}
              setWebDescription={(v) => form.set('webDescription', v)}
              webImages={values.webImages}
              setWebImages={(v) => form.set('webImages', v)}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-6 mt-4 border-t border-border-subtle">
          <div>
            {step > 1 && (
              <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
                {t('inventory.itemWizard.back')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={form.saving}>
              {t('inventory.itemWizard.cancel')}
            </Button>
            {step < 3 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => create(false)}
                  disabled={!essentialsOk || form.saving}
                  title={t('inventory.itemWizard.createNowHint')}
                >
                  {form.saving ? <Loader size="sm" /> : t('inventory.itemWizard.createNow')}
                </Button>
                <Button type="button" onClick={() => setStep(step + 1)} disabled={!essentialsOk}>
                  {t('inventory.itemWizard.next')}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => create(true)}
                disabled={!essentialsOk || form.saving}
              >
                {form.saving ? (
                  <Loader size="sm" variant="white" />
                ) : (
                  t('inventory.itemWizard.create')
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
