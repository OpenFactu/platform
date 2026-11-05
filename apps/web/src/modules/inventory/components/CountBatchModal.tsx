import React, { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal, NumberInput, Select, useToast } from '@openfactu/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/i18n/I18nContext';
import { allocationGap, type CountLine } from '../domain/inventoryCount';

interface Props {
  line: CountLine | null;
  onClose: () => void;
  onSave: (lineId: string, rows: Array<{ batchNum: string; quantity: number }>) => Promise<void>;
}

interface Row {
  batchNum: string;
  quantity: number | null;
}

/**
 * Por zona no se sabe qué lotes hay: el stock por lote es del almacén. Si contando una zona sale
 * una diferencia, aquí se dice de qué lote es.
 */
export const CountBatchModal: React.FC<Props> = ({ line, onClose, onSave }) => {
  const { t } = useI18n();
  const { format } = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const difference = Number(line?.difference ?? 0);
  const serial = line?.manageBy === 'S';
  const step = difference < 0 ? -1 : 1;

  useEffect(() => {
    if (!line) return;
    const saved = (line.allocations ?? []).filter((row) => row.batchNum);
    setRows(
      saved.length
        ? saved.map((row) => ({ batchNum: row.batchNum!, quantity: row.quantity }))
        : [{ batchNum: '', quantity: serial ? step : difference }],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  if (!line) return null;

  const options = line.batchOptions ?? [];
  const missing = allocationGap(difference, rows);
  // Lo que falta sale de lotes que ya están; lo que sobra puede ser un lote nuevo.
  const pickFromList = difference < 0;
  const canSave = missing === 0 && rows.every((row) => row.batchNum.trim() && row.quantity);

  const change = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(
        line.id,
        rows.map((row) => ({ batchNum: row.batchNum.trim(), quantity: Number(row.quantity) })),
      );
      onClose();
    } catch (error) {
      toast.error(
        (error instanceof Error ? error.message : undefined) || t('inventory.counts.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal noBodyPadding isOpen onClose={onClose} title={t('inventory.counts.batchTitle')}>
      <Modal.Body>
        <div className="space-y-3">
          <p className="text-sm text-fg-body">
            {t(pickFromList ? 'inventory.counts.batchMissing' : 'inventory.counts.batchExtra', {
              item: line.itemName,
              quantity: Math.abs(difference),
            })}
          </p>
          {rows.map((row, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                {pickFromList ? (
                  <Select
                    label={t(serial ? 'inventory.counts.serial' : 'inventory.counts.batch')}
                    value={row.batchNum}
                    onChange={(value) => change(index, { batchNum: value })}
                    placeholder={t('inventory.counts.chooseBatch')}
                    options={options.map((option) => ({
                      value: option.batchNum,
                      label: `${option.batchNum} (${option.quantity})`,
                    }))}
                  />
                ) : (
                  <Input
                    label={t(serial ? 'inventory.counts.serial' : 'inventory.counts.batch')}
                    value={row.batchNum}
                    onChange={(event) => change(index, { batchNum: event.target.value })}
                    list="count-batches"
                  />
                )}
              </div>
              {!serial && (
                <div className="w-24 shrink-0">
                  <NumberInput
                    label={t('inventory.counts.quantity')}
                    value={row.quantity === null ? null : Math.abs(row.quantity)}
                    onChange={(value) =>
                      change(index, { quantity: value === null ? null : value * step })
                    }
                    min={0}
                    precision={format.quantityPrecision}
                    thousandSeparator={false}
                    inputMode="decimal"
                  />
                </div>
              )}
              {rows.length > 1 && (
                <Button
                  variant="secondary"
                  aria-label={t('inventory.counts.removeRow')}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} />
                </Button>
              )}
            </div>
          ))}
          {!pickFromList && (
            <datalist id="count-batches">
              {options.map((option) => (
                <option key={option.batchNum} value={option.batchNum} />
              ))}
            </datalist>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="gap-1"
            onClick={() =>
              setRows((current) => [
                ...current,
                { batchNum: '', quantity: serial ? step : missing || step },
              ])
            }
          >
            <Plus size={14} /> {t('inventory.counts.addRow')}
          </Button>
          {missing !== 0 && (
            <Alert tone="warning">
              {t('inventory.counts.batchGap', { quantity: Math.abs(missing) })}
            </Alert>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t('inventory.counts.cancelAction')}
        </Button>
        <Button onClick={submit} disabled={!canSave} isLoading={saving}>
          {t('inventory.counts.saveAction')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
