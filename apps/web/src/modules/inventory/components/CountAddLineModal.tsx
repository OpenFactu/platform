import React, { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal, NumberInput, SearchInput, useToast } from '@openfactu/ui';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/i18n/I18nContext';
import { inventoryCountsApi, type AddLineInput } from '../api/inventoryCountsApi';
import type { CountItemOption } from '../domain/inventoryCount';

interface Props {
  open: boolean;
  countId: string;
  /** En un recuento de zona, un artículo con lote se cuenta por su total: no pide el lote. */
  zoneScoped: boolean;
  /** Viene del lector: ya se sabe el artículo. */
  presetItem?: CountItemOption | null;
  onClose: () => void;
  onAdd: (input: AddLineInput) => Promise<unknown>;
}

/** Añadir lo que aparece y no estaba en la lista. */
export const CountAddLineModal: React.FC<Props> = ({
  open,
  countId,
  zoneScoped,
  presetItem,
  onClose,
  onAdd,
}) => {
  const { t } = useI18n();
  const { format } = useTheme();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CountItemOption[]>([]);
  const [item, setItem] = useState<CountItemOption | null>(null);
  const [batchNum, setBatchNum] = useState('');
  const [quantity, setQuantity] = useState<number | null>(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setResults([]);
    setItem(presetItem ?? null);
    setBatchNum('');
    setQuantity(1);
  }, [open, presetItem]);

  const find = async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    try {
      setResults(await inventoryCountsApi.searchItems(countId, term));
    } catch {
      setResults([]);
    }
  };

  const tracked = !!item && item.manageBy !== 'N' && !zoneScoped;
  const serial = item?.manageBy === 'S' && tracked;
  const canSubmit = !!item && (!tracked || !!batchNum.trim()) && quantity !== null && quantity >= 0;

  const submit = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await onAdd({
        itemId: item.id,
        batchNum: tracked ? batchNum.trim() : null,
        countedQty: serial ? 1 : quantity,
      });
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
    <Modal noBodyPadding isOpen={open} onClose={onClose} title={t('inventory.counts.addTitle')}>
      <Modal.Body>
        <div className="space-y-4">
          {item ? (
            <div className="flex items-center justify-between gap-3 border border-border-subtle bg-bg-muted p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg-default">{item.name}</p>
                <p className="font-mono text-xs text-fg-muted">{item.code}</p>
              </div>
              {!presetItem && (
                <Button variant="secondary" size="sm" onClick={() => setItem(null)}>
                  {t('inventory.counts.changeItem')}
                </Button>
              )}
            </div>
          ) : (
            <>
              <SearchInput
                autoFocus
                value={search}
                onChange={setSearch}
                onDebouncedChange={find}
                debounceMs={250}
                placeholder={t('inventory.counts.searchItem')}
              />
              <div className="max-h-64 divide-y divide-border-subtle overflow-y-auto">
                {results.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="block w-full px-2 py-2 text-left hover:bg-bg-hover"
                    onClick={() => setItem(row)}
                  >
                    <span className="block truncate font-medium text-fg-default">{row.name}</span>
                    <span className="block font-mono text-xs text-fg-muted">{row.code}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {tracked && (
            <>
              <Alert tone="info">
                {t(serial ? 'inventory.counts.serialNeeded' : 'inventory.counts.batchNeeded')}
              </Alert>
              <Input
                autoFocus
                label={t(serial ? 'inventory.counts.serial' : 'inventory.counts.batch')}
                required
                value={batchNum}
                onChange={(event) => setBatchNum(event.target.value)}
              />
            </>
          )}
          {item && !serial && (
            <NumberInput
              label={t('inventory.counts.counted')}
              value={quantity}
              onChange={setQuantity}
              min={0}
              precision={format.quantityPrecision}
              thousandSeparator={false}
              inputMode="decimal"
            />
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t('inventory.counts.cancelAction')}
        </Button>
        <Button onClick={submit} disabled={!canSubmit} isLoading={saving}>
          {t('inventory.counts.addAction')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
