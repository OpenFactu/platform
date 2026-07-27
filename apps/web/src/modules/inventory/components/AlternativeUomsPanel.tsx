import React, { useEffect, useState } from 'react';
import { Button, Input, SearchableSelect, Table, useToast } from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { Trash2 } from 'lucide-react';
import { itemsApi } from '../api';
import type { ItemUomAlternative, Uom } from '../domain/uom';

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
      toast.success('Unidad alternativa añadida');
      setNewUomId('');
      setNewFactor('');
      fetchAlts();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'Error al añadir unidad alternativa');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!itemId) return;
    try {
      await itemsApi.removeUom(itemId, id);
      toast.success('Eliminado');
      fetchAlts();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (!itemId) {
    return (
      <div className="p-4 text-center text-sm text-fg-subtle">
        Guarda el artículo primero para poder añadir unidades alternativas.
      </div>
    );
  }

  const columns: TableColumn<any>[] = [
    { header: 'Unidad', cell: (a) => a.code || a.name || a.uomId },
    { header: 'Factor', accessor: 'factor' },
  ];

  // La unidad base no se puede quitar: para esas filas no hay acciones.
  const rowActions = (a: any): RowAction[] =>
    a.isBase
      ? []
      : [
          {
            label: 'Eliminar',
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
        columns={columns}
        data={alternatives}
        isLoading={loading}
        rowKey={(a: any, i) => a.id || a.uomId || i}
        rowActions={rowActions}
        emptyMessage="Sin unidades alternativas configuradas."
      />

      <div className="pt-4 border-t border-border-subtle mt-4">
        <div className="grid grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-[9px] font-black uppercase tracking-wider text-fg-subtle mb-1 block">
              Unidad
            </label>
            <SearchableSelect
              value={newUomId}
              onChange={setNewUomId}
              options={uoms.map((u) => ({ label: `${u.code} — ${u.name}`, value: u.id }))}
              placeholder="Seleccionar UoM..."
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-wider text-fg-subtle mb-1 block">
              Factor
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
              Añadir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
