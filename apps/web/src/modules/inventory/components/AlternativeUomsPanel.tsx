import React, { useEffect, useState } from 'react';
import { Button, Input, Loader, SearchableSelect, useToast } from '@openfactu/ui';
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
      <div className="p-4 text-center text-sm text-slate-400">
        Guarda el artículo primero para poder añadir unidades alternativas.
      </div>
    );
  }

  return (
    <div className="p-4">
      {loading ? (
        <div className="p-4 text-center">
          <Loader />
        </div>
      ) : (
        <>
          {alternatives.length > 0 ? (
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="py-2">Unidad</th>
                  <th className="py-2">Factor</th>
                  <th className="py-2">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {alternatives.map((a: any) => (
                  <tr key={a.id || a.uomId} className="border-t border-slate-100">
                    <td className="py-2">{a.code || a.name || a.uomId}</td>
                    <td className="py-2">{a.factor}</td>
                    <td className="py-2 w-20">
                      {!a.isBase && (
                        <Button size="sm" variant="secondary" onClick={() => handleRemove(a.id)}>
                          Eliminar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-center text-sm text-slate-400">
              Sin unidades alternativas configuradas.
            </div>
          )}

          <div className="pt-4 border-t mt-4">
            <div className="grid grid-cols-3 gap-2 items-end">
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1 block">
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
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1 block">
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
        </>
      )}
    </div>
  );
};
