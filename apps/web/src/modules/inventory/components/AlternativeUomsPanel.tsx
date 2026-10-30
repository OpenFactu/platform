import React, { useEffect, useState } from 'react';
import { Button, Input, SearchableSelect, Table, useToast } from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { Trash2 } from 'lucide-react';
import { itemsApi } from '../api';
import type { ItemUomAlternative, Uom } from '../domain/uom';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Unidades alternativas de un artículo (con factor de conversión a la base).
 * Extraído del antiguo modal de Items — lo usan el wizard y la ficha.
 */
export const AlternativeUomsPanel: React.FC<{
  itemId?: string;
  baseUomId: string;
  uoms: Uom[];
}> = ({ itemId, uoms }) => {
  const [alternatives, setAlternatives] = useState<ItemUomAlternative[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUomId, setNewUomId] = useState('');
  const [newFactor, setNewFactor] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { t } = useI18n();

  const fetchAlts = async () => {
    if (!itemId) return setAlternatives([]);
    setLoading(true);
    try {
      const data = await itemsApi.listUoms(itemId);
      setAlternatives(Array.isArray(data) ? data : []);
    } catch {
      setAlternatives([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const handleAdd = async () => {
    if (!itemId || !newUomId || !newFactor) return;
    setSaving(true);
    try {
      await itemsApi.addUom(itemId, { uomId: newUomId, factor: Number(newFactor) });
      toast.success(t('inventory.altUoms.added'));
      setNewUomId('');
      setNewFactor('');
      fetchAlts();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || t('inventory.altUoms.addError'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!itemId) return;
    try {
      await itemsApi.removeUom(itemId, id);
      toast.success(t('inventory.altUoms.removed'));
      fetchAlts();
    } catch {
      toast.error(t('inventory.altUoms.removeError'));
    }
  };

  if (!itemId) {
    return (
      <div className="p-4 text-center text-sm text-fg-subtle">
        {t('inventory.altUoms.saveFirst')}
      </div>
    );
  }

  const columns: TableColumn<any>[] = [
    { header: t('inventory.altUoms.unit'), cell: (a) => a.code || a.name || a.uomId },
    { header: t('inventory.altUoms.factor'), accessor: 'factor' },
  ];

  // La unidad base no se puede quitar: para esas filas no hay acciones.
  const rowActions = (a: any): RowAction[] =>
    a.isBase
      ? []
      : [
          {
            label: t('inventory.altUoms.delete'),
            icon: <Trash2 size={14} />,
            destructive: true,
            onClick: () => handleRemove(a.id),
          },
        ];

  return (
    <div className="p-4">
      {/* La Table trae cabecera, esqueleto de carga y estado vacío: el <table>
          a mano, el Loader y el div de "sin unidades" sobraban. */}
      <Table
        responsive="scroll"
        columns={columns}
        data={alternatives}
        isLoading={loading}
        rowKey={(a: any, i) => a.id || a.uomId || i}
        rowActions={rowActions}
        emptyMessage={t('inventory.altUoms.empty')}
      />

      <div className="pt-4 border-t border-border-subtle mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-[9px] font-black uppercase tracking-wider text-fg-subtle mb-1 block">
              {t('inventory.altUoms.unit')}
            </label>
            <SearchableSelect
              value={newUomId}
              onChange={setNewUomId}
              options={uoms.map((u) => ({ label: `${u.code} — ${u.name}`, value: u.id }))}
              placeholder={t('inventory.altUoms.selectUom')}
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-wider text-fg-subtle mb-1 block">
              {t('inventory.altUoms.factor')}
            </label>
            <Input
              value={newFactor}
              onChange={(e) => setNewFactor(e.target.value)}
              placeholder="1.00"
            />
          </div>
          <div>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={!newUomId || !newFactor}
              isLoading={saving}
              className="w-full"
            >
              {t('inventory.altUoms.add')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
