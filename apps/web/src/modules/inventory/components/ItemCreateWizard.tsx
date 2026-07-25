import React, { useEffect, useState } from 'react';
import { Button, Loader, Modal, useToast } from '@openfactu/ui';
import { validateBarcode } from '@/utils/barcodeValidation';
import { useItemForm } from '../hooks/useItemForm';
import { ItemGeneralFields } from './ItemGeneralFields';
import { ItemLogisticsFields } from './ItemLogisticsFields';
import { ItemWebFields } from './ItemWebFields';
import type { Category } from '../domain/category';
import type { Item } from '../domain/item';
import type { Uom } from '../domain/uom';
import type { Warehouse, Zone } from '../domain/warehouse';

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
  { id: 1, label: 'Esencial' },
  { id: 2, label: 'Logística' },
  { id: 3, label: 'Web' },
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
        const ok = confirm(
          `El código de barras parece inválido (${v.format}: ${v.reason}). ¿Guardar de todos modos?`,
        );
        if (!ok) return;
      }
    }
    try {
      const saved = await form.submit();
      toast.success('Artículo creado');
      onCreated(saved, openDetail);
      onClose();
    } catch (err: any) {
      console.error('[ItemCreateWizard] error:', err);
      toast.error(`Error: ${err?.message || err}`);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={duplicateFrom ? `Duplicar: ${duplicateFrom.name}` : 'Nuevo Artículo'}
      subtitle="Con lo esencial basta — logística y web son opcionales."
      maxWidth="lg"
    >
      <div className="pt-2">
        {/* Indicador de pasos */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />}
              <button
                type="button"
                onClick={() => (s.id < step || essentialsOk ? setStep(s.id) : undefined)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all ${
                  step === s.id
                    ? 'bg-blue-600 text-white shadow'
                    : step > s.id
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}
              >
                <span>{step > s.id ? '✓' : s.id}</span>
                {s.label}
              </button>
            </React.Fragment>
          ))}
        </div>

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

        <div className="flex items-center justify-between gap-3 pt-6 mt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            {step > 1 && (
              <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
                ← Atrás
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={form.saving}>
              Cancelar
            </Button>
            {step < 3 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => create(false)}
                  disabled={!essentialsOk || form.saving}
                  title="Crear con los valores por defecto del resto de pasos"
                >
                  {form.saving ? <Loader size="sm" /> : 'Crear ya'}
                </Button>
                <Button type="button" onClick={() => setStep(step + 1)} disabled={!essentialsOk}>
                  Siguiente →
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => create(true)}
                disabled={!essentialsOk || form.saving}
              >
                {form.saving ? <Loader size="sm" variant="white" /> : 'Crear artículo'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
