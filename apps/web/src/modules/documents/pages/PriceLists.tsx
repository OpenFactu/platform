import { priceListsApi, type PriceList, type PriceListEntry } from '../api';
import { itemsApi } from '@/modules/inventory/api';
import type { Item } from '@/modules/inventory/domain/item';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Loader,
  useToast,
  Badge,
  useContextMenu,
  usePopup,
  EmptyState,
} from '@openfactu/ui';
import type { ContextMenuItem } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  Tag,
  Plus,
  Trash2,
  Search,
  DollarSign,
  Save,
  X,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Pencil,
} from 'lucide-react';

export const PriceLists: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;
  const toast = useToast();
  const popup = usePopup();
  // States for Price Lists
  const [lists, setLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [newListRow, setNewListRow] = useState<{ name: string } | null>(null);
  // States for selected list and its prices
  const [selectedList, setSelectedList] = useState<PriceList | null>(null);
  const [prices, setPrices] = useState<PriceListEntry[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [searchItem, setSearchItem] = useState('');
  const [savingItems, setSavingItems] = useState<string[]>([]);
  const fetchLists = async () => {
    setLoading(true);
    try {
      const data = await priceListsApi.list();
      const loadedLists = Array.isArray(data) ? data : [];
      setLists(loadedLists);
      // Auto-select first list if none selected
      if (loadedLists.length > 0 && !selectedList) {
        setSelectedList(loadedLists[0]);
        fetchPrices(loadedLists[0].id);
      }
    } catch (err) {
      toast.error('Error al cargar listas');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const data = await itemsApi.list();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPrices = async (listId: string) => {
    setLoadingPrices(true);
    try {
      const data = await priceListsApi.prices(listId);
      setPrices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPrices(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) {
      fetchLists();
      fetchItems();
    }
  }, [user?.tenantId]);

  const handleCreateList = async () => {
    if (!newListRow?.name) return;
    try {
      await priceListsApi.create(newListRow);
      setNewListRow(null);
      fetchLists();
      toast.success('Lista comercial creada');
    } catch (err) {
      toast.error('Error al crear');
    }
  };

  const handleUpdateList = async (id: string, name: string) => {
    try {
      await priceListsApi.update(id, { name });
      setEditingListId(null);
      fetchLists();
      toast.success('Lista actualizada');
    } catch (err) {
      toast.error('Error al actualizar');
    }
  };

  const handleDeleteList = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar lista de precios',
      message: '¿Seguro que deseas eliminar esta lista de precios?',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await priceListsApi.remove(id);
      if (selectedList?.id === id) setSelectedList(null);
      fetchLists();
      toast.success('Lista eliminada');
    } catch (err) {
      toast.error('Error al eliminar');
    }
  };

  const handleUpdatePrice = async (itemId: string, price: string) => {
    if (!selectedList || !price) return;
    setSavingItems((prev) => [...prev, itemId]);
    try {
      const updatedPrice = await priceListsApi.setPrice(selectedList.id, itemId, parseFloat(price));
      setPrices((prev) => {
        const exists = prev.find((p) => p.itemId === itemId);
        if (exists) return prev.map((p) => (p.itemId === itemId ? updatedPrice : p));
        return [...prev, updatedPrice];
      });
      toast.success('Precio actualizado');
    } catch (err) {
      toast.error('Error al actualizar precio');
    } finally {
      setSavingItems((prev) => prev.filter((id) => id !== itemId));
    }
  };

  const { contextMenu, openContextMenu } = useContextMenu();
  const buildCtxItems = (l: any): ContextMenuItem[] => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditingListId(l.id),
    },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDeleteList(l.id),
    },
  ];

  const filteredItems = items.filter(
    (i) =>
      i.name.toLowerCase().includes(searchItem.toLowerCase()) ||
      i.code.toLowerCase().includes(searchItem.toLowerCase()),
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-blue-600 rounded-lg text-white">
              <DollarSign size={20} />
            </span>
            <span className="text-[10px] font-black text-blue-600 dark:text-blue-300 uppercase tracking-[0.2em]">
              Comercial / Pricing
            </span>
          </div>
          <h1 className="text-4xl font-black text-fg-default tracking-tight">Gestión de Tarifas</h1>
          <p className="text-fg-muted font-medium">
            Controla tus márgenes y listas de precios de forma masiva.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Master Table: Price Lists */}
        <div className="xl:col-span-4 space-y-4">
          <Card
            noPadding
            title="Catálogos Activos"
            headerAction={
              <Button
                size="sm"
                onClick={() => setNewListRow({ name: '' })}
                disabled={!!newListRow || !canWrite}
                className="disabled:opacity-50 disabled:grayscale transition-all shadow-sm"
              >
                <Plus size={14} />
              </Button>
            }
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg-muted border-b border-border-subtle text-[10px] uppercase font-black text-fg-subtle">
                  <th className="px-6 py-4">Nombre de la Tarifa</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {newListRow && (
                  <tr className="bg-primary/5 dark:bg-primary/10">
                    <td className="px-4 py-3">
                      <Input
                        placeholder="Ej: Mayoristas"
                        value={newListRow.name}
                        onChange={(e) => setNewListRow({ name: e.target.value })}
                        className="h-9 text-sm"
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button size="sm" onClick={handleCreateList}>
                        <Save size={14} />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setNewListRow(null)}>
                        <X size={14} />
                      </Button>
                    </td>
                  </tr>
                )}
                {lists.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => {
                      setSelectedList(l);
                      fetchPrices(l.id);
                    }}
                    onContextMenu={(e) => {
                      // El hook del paquete solo hace preventDefault; el
                      // stopPropagation lo mantenemos como antes.
                      e.stopPropagation();
                      openContextMenu(e, buildCtxItems(l));
                    }}
                    className={`cursor-pointer transition-all group border-l-2 ${selectedList?.id === l.id ? 'bg-bg-muted border-l-primary' : 'border-l-transparent hover:bg-bg-hover'}`}
                  >
                    <td className="px-6 py-3">
                      {editingListId === l.id ? (
                        <Input
                          value={l.name}
                          onChange={(e) =>
                            setLists(
                              lists.map((x) =>
                                x.id === l.id ? { ...x, name: e.target.value } : x,
                              ),
                            )
                          }
                          className="h-9 text-sm"
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-1.5 rounded-lg transition-colors ${selectedList?.id === l.id ? 'bg-blue-600 text-white' : 'bg-bg-muted text-fg-subtle group-hover:bg-blue-100 dark:hover:bg-blue-500/20 group-hover:text-blue-600 dark:hover:text-blue-300'}`}
                          >
                            <Tag size={14} />
                          </div>
                          <span
                            className={`text-sm font-bold ${selectedList?.id === l.id ? 'text-blue-700 dark:text-blue-200' : 'text-fg-body'}`}
                          >
                            {l.name}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right space-x-1">
                      {editingListId === l.id ? (
                        <>
                          <Button size="sm" onClick={() => handleUpdateList(l.id, l.name)}>
                            <Save size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingListId(null)}
                          >
                            <X size={14} />
                          </Button>
                        </>
                      ) : (
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              canWrite && setEditingListId(l.id);
                            }}
                            disabled={!canWrite}
                            className="p-1.5 text-fg-subtle hover:text-blue-600 dark:hover:text-blue-300"
                          >
                            <Plus size={14} className="rotate-45" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              canDelete && handleDeleteList(l.id);
                            }}
                            disabled={!canDelete}
                            className="p-1.5 text-fg-subtle hover:text-rose-500"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {loading && (
                  <tr>
                    <td colSpan={2} className="p-10 text-center">
                      <Loader size="sm" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Detail Table: Prices per Item */}
        <div className="xl:col-span-8">
          {selectedList ? (
            <Card className="border-0 overflow-hidden" noPadding>
              <div className="p-6 bg-bg-muted border-b border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-fg-default leading-tight">
                    Precios: {selectedList.name}
                  </h2>
                  <p className="text-[10px] text-fg-subtle font-bold uppercase tracking-widest mt-1">
                    Asignación masiva de precios especiales
                  </p>
                </div>
                <Input
                  leftIcon={<Search size={14} />}
                  inputSize="sm"
                  placeholder="Buscador por código o nombre..."
                  value={searchItem}
                  onChange={(e) => setSearchItem(e.target.value)}
                  containerClassName="w-full md:w-64"
                />
              </div>

              <div className="overflow-x-auto max-h-[800px] scrollbar-thin scrollbar-thumb-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-bg-card border-b border-border-subtle text-[9px] uppercase font-black text-fg-subtle sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-3">Artículo</th>
                      <th className="px-6 py-3 text-center">Precio Base</th>
                      <th className="px-6 py-3 text-center">Variación</th>
                      <th className="px-6 py-3 text-right">Precio Especial</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredItems.map((item) => {
                      const itemPrice = prices.find((p) => p.itemId === item.id);
                      const diff = itemPrice
                        ? (parseFloat(String(itemPrice.price)) /
                            parseFloat(String(item.basePrice)) -
                            1) *
                          100
                        : 0;
                      return (
                        <tr key={item.id} className="hover:bg-bg-hover group transition-colors">
                          <td className="px-6 py-3">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black text-fg-subtle tracking-tighter uppercase">
                                {item.code}
                              </span>
                              <span className="text-sm font-bold text-fg-default leading-tight">
                                {item.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className="font-mono text-xs font-bold text-fg-muted">
                              {item.basePrice}€
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            {itemPrice ? (
                              <div
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black tracking-tighter border ${diff >= 0 ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-100 dark:border-rose-500/20' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-100 dark:border-emerald-500/20'}`}
                              >
                                {diff >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {Math.abs(diff).toFixed(1)}% {diff >= 0 ? 'Recargo' : 'Dcto'}
                              </div>
                            ) : (
                              <span className="text-fg-subtle italic text-[10px]">Sin cambios</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="relative w-32">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-fg-subtle">
                                  €
                                </span>
                                <input
                                  id={`price-input-${item.id}`}
                                  type="number"
                                  step="0.01"
                                  placeholder={String(item.basePrice ?? '')}
                                  defaultValue={itemPrice?.price || ''}
                                  className="h-9 w-full pl-6 pr-2 rounded-lg border border-border-subtle text-xs font-black text-fg-default bg-bg-muted focus:bg-bg-card focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none text-right"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const input = document.getElementById(
                                    `price-input-${item.id}`,
                                  ) as HTMLInputElement;
                                  handleUpdatePrice(item.id, input.value);
                                }}
                                disabled={savingItems.includes(item.id) || !canWrite}
                                isLoading={savingItems.includes(item.id)}
                                className="p-2 text-blue-600 dark:text-blue-300"
                              >
                                {!savingItems.includes(item.id) && <Save size={14} />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-20 text-center text-fg-subtle italic">
                          No hay artículos que coincidan con la búsqueda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={<Tag size={40} />}
              title="Potencia Comercial"
              hint="Selecciona una lista de la izquierda para empezar a optimizar tus márgenes de beneficio de forma masiva."
              className="h-full min-h-[400px] border-2 border-dashed border-border-default rounded-[2.5rem] bg-bg-muted"
            />
          )}
        </div>
      </div>
      {contextMenu}
    </div>
  );
};
