import { priceListsApi, type PriceList, type PriceListEntry } from '../api';
import { itemsApi } from '@/modules/inventory/api';
import type { Item } from '@/modules/inventory/domain/item';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Table,
  useToast,
  usePopup,
  EmptyState,
  PageHeader,
  CurrencyInput,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import {
  Tag,
  Plus,
  Trash2,
  Search,
  DollarSign,
  Save,
  X,
  TrendingUp,
  TrendingDown,
  Pencil,
} from 'lucide-react';

export const PriceLists: React.FC = () => {
  const { t } = useI18n();
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
  // Precio tecleado y aún sin guardar, por artículo. Antes el valor se leía del
  // DOM con getElementById; con CurrencyInput el campo es controlado.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, number | null>>({});
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
      toast.error(t('doc.priceLists.loadError'));
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
      toast.success(t('doc.priceLists.created'));
    } catch (err) {
      toast.error(t('doc.common.createError'));
    }
  };

  const handleUpdateList = async (id: string, name: string) => {
    try {
      await priceListsApi.update(id, { name });
      setEditingListId(null);
      fetchLists();
      toast.success(t('doc.priceLists.updated'));
    } catch (err) {
      toast.error(t('doc.common.updateError'));
    }
  };

  const handleDeleteList = async (id: string) => {
    const ok = await popup.confirm({
      title: t('doc.priceLists.deleteTitle'),
      message: t('doc.priceLists.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('doc.lines.delete'),
    });
    if (!ok) return;
    try {
      await priceListsApi.remove(id);
      if (selectedList?.id === id) setSelectedList(null);
      fetchLists();
      toast.success(t('doc.priceLists.deleted'));
    } catch (err) {
      toast.error(t('doc.common.deleteError'));
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
      toast.success(t('doc.priceLists.priceUpdated'));
    } catch (err) {
      toast.error(t('doc.priceLists.priceUpdateError'));
    } finally {
      setSavingItems((prev) => prev.filter((id) => id !== itemId));
    }
  };

  // Editar/eliminar viven en el menú ⋯ y en el click derecho que ya trae la
  // Table; el gating de permisos es el mismo que tenían los botones de la fila.
  const listActions = (l: PriceList): RowAction[] => [
    {
      label: t('doc.common.edit'),
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditingListId(l.id),
    },
    {
      label: t('doc.lines.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDeleteList(l.id),
    },
  ];

  const listColumns: TableColumn<PriceList>[] = [
    {
      header: t('doc.priceLists.colName'),
      cell: (l) =>
        editingListId === l.id ? (
          // Edición en línea: el click no debe seleccionar la lista.
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Input
              value={l.name}
              onChange={(e) =>
                setLists(lists.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))
              }
              inputSize="sm"
              containerClassName="flex-1"
              autoFocus
            />
            <Button type="button" size="sm" onClick={() => handleUpdateList(l.id, l.name)}>
              <Save size={14} />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setEditingListId(null)}
            >
              <X size={14} />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className={`p-1.5 rounded-lg transition-colors ${
                selectedList?.id === l.id
                  ? 'bg-accent text-accent-fg'
                  : 'bg-bg-muted text-fg-subtle group-hover:text-accent'
              }`}
            >
              <Tag size={14} />
            </div>
            <span
              className={`text-sm font-bold ${
                selectedList?.id === l.id ? 'text-accent' : 'text-fg-body'
              }`}
            >
              {l.name}
            </span>
          </div>
        ),
    },
  ];

  const filteredItems = items.filter(
    (i) =>
      i.name.toLowerCase().includes(searchItem.toLowerCase()) ||
      i.code.toLowerCase().includes(searchItem.toLowerCase()),
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
      <PageHeader
        size="lg"
        className="pb-2"
        eyebrow={t('doc.priceLists.eyebrow')}
        icon={<DollarSign size={18} />}
        title={t('doc.priceLists.title')}
        subtitle={t('doc.priceLists.subtitle')}
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Master Table: Price Lists */}
        <div className="xl:col-span-4 space-y-4">
          <Card
            noPadding
            title={t('doc.priceLists.activeCatalogs')}
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
            <Table
              columns={listColumns}
              data={lists}
              isLoading={loading}
              rowActions={listActions}
              emptyMessage={t('doc.priceLists.empty')}
              skeletonRowHeight={28}
              onRowClick={(l) => {
                // Mientras se renombra, el click se queda en el formulario.
                if (editingListId === l.id) return;
                setSelectedList(l);
                fetchPrices(l.id);
              }}
              appendRow={
                newListRow ? (
                  <div className="flex items-center gap-1 px-4 py-3 bg-bg-muted">
                    <Input
                      placeholder={t('doc.priceLists.namePlaceholder')}
                      value={newListRow.name}
                      onChange={(e) => setNewListRow({ name: e.target.value })}
                      inputSize="sm"
                      containerClassName="flex-1"
                      autoFocus
                    />
                    <Button type="button" size="sm" onClick={handleCreateList}>
                      <Save size={14} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setNewListRow(null)}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ) : null
              }
            />
          </Card>
        </div>

        {/* Detail Table: Prices per Item */}
        <div className="xl:col-span-8">
          {selectedList ? (
            <Card className="border-0 overflow-hidden" noPadding>
              <div className="p-6 bg-bg-muted border-b border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-fg-default leading-tight">
                    {t('doc.priceLists.pricesOf', { name: selectedList.name })}
                  </h2>
                  <p className="text-[10px] text-fg-subtle font-bold uppercase tracking-widest mt-1">
                    {t('doc.priceLists.bulkHint')}
                  </p>
                </div>
                <Input
                  leftIcon={<Search size={14} />}
                  inputSize="sm"
                  placeholder={t('doc.priceLists.search')}
                  value={searchItem}
                  onChange={(e) => setSearchItem(e.target.value)}
                  containerClassName="w-full md:w-64"
                />
              </div>

              <div className="overflow-x-auto max-h-[800px]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-bg-card border-b border-border-subtle text-[9px] uppercase font-black text-fg-subtle sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-3">{t('doc.lines.item')}</th>
                      <th className="px-6 py-3 text-center">{t('doc.priceLists.basePrice')}</th>
                      <th className="px-6 py-3 text-center">{t('doc.priceLists.variation')}</th>
                      <th className="px-6 py-3 text-right">{t('doc.priceLists.specialPrice')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
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
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black tracking-tighter border ${diff >= 0 ? 'bg-danger-bg text-danger-fg border-danger/20' : 'bg-success-bg text-success-fg border-success/20'}`}
                              >
                                {diff >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {Math.abs(diff).toFixed(1)}%{' '}
                                {diff >= 0
                                  ? t('doc.priceLists.surcharge')
                                  : t('doc.priceLists.discount')}
                              </div>
                            ) : (
                              <span className="text-fg-subtle italic text-[10px]">
                                {t('doc.priceLists.noChanges')}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <CurrencyInput
                                aria-label={t('doc.priceLists.priceOf', { name: item.name })}
                                containerClassName="w-32"
                                align="right"
                                placeholder={String(item.basePrice ?? '')}
                                value={
                                  item.id in priceDrafts
                                    ? priceDrafts[item.id]
                                    : itemPrice?.price != null && itemPrice.price !== ''
                                      ? Number(itemPrice.price)
                                      : null
                                }
                                onChange={(v) => setPriceDrafts((d) => ({ ...d, [item.id]: v }))}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const v =
                                    item.id in priceDrafts
                                      ? priceDrafts[item.id]
                                      : itemPrice?.price != null
                                        ? Number(itemPrice.price)
                                        : null;
                                  handleUpdatePrice(item.id, v == null ? '' : String(v));
                                }}
                                disabled={savingItems.includes(item.id) || !canWrite}
                                isLoading={savingItems.includes(item.id)}
                                className="p-2 text-accent"
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
                          {t('doc.priceLists.noMatches')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={<Tag size={18} />}
              title={t('doc.priceLists.emptyTitle')}
              hint={t('doc.priceLists.emptyHint')}
              className="h-full min-h-[400px] border-2 border-dashed border-border-default rounded-[2.5rem] bg-bg-muted"
            />
          )}
        </div>
      </div>
    </div>
  );
};
