import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Loader, PageHeader, useToast, usePopup, Modal } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  MapPin,
  Plus,
  Trash2,
  LayoutGrid,
  Search,
  Star,
  ChevronRight,
  ChevronDown,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { BinGeneratorModal } from '../components/BinGeneratorModal';
import { warehousesApi, zonesApi } from '../api';
import type { Warehouse, Zone } from '../domain/warehouse';
import { useI18n } from '@/i18n/I18nContext';

export const Warehouses: React.FC = () => {
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

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [bins, setBins] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBins, setLoadingBins] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [name, setName] = useState('');
  const [whLocation, setWhLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [binQuery, setBinQuery] = useState('');
  const [newBinName, setNewBinName] = useState('');
  const [newBinDesc, setNewBinDesc] = useState('');
  const [creatingBin, setCreatingBin] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toast = useToast();
  const popup = usePopup();
  const { t } = useI18n();

  const fetchWarehouses = async () => {
    setLoading(true);
    try {
      const data = await warehousesApi.list();
      const list = Array.isArray(data) ? data : [];
      setWarehouses(list);
      if (list.length > 0 && !selectedWarehouse) setSelectedWarehouse(list[0]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBins = async (whId: string) => {
    setLoadingBins(true);
    try {
      const data = await zonesApi.list(whId);
      setBins(Array.isArray(data) ? data : []);
    } finally {
      setLoadingBins(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchWarehouses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  useEffect(() => {
    if (selectedWarehouse) fetchBins(selectedWarehouse.id);
    else setBins([]);
  }, [selectedWarehouse?.id]);

  const handleSubmitWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await warehousesApi.create({ name, location: whLocation });
      setName('');
      setWhLocation('');
      setShowWarehouseModal(false);
      await fetchWarehouses();
      toast.success(t('inventory.warehouses.created'));
    } catch {
      toast.error(t('inventory.warehouses.createError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const createBin = async () => {
    if (!newBinName.trim() || !selectedWarehouse) return;
    setCreatingBin(true);
    try {
      await zonesApi.create({
        warehouseId: selectedWarehouse.id,
        name: newBinName.trim().toUpperCase(),
        description: newBinDesc.trim() || null,
      });
      setNewBinName('');
      setNewBinDesc('');
      await fetchBins(selectedWarehouse.id);
      toast.success(t('inventory.warehouses.binCreated'));
    } catch (err) {
      toast.error(
        (err instanceof Error && err.message) || t('inventory.warehouses.binCreateError'),
      );
    } finally {
      setCreatingBin(false);
    }
  };

  const deleteBin = async (id: string) => {
    const ok = await popup.confirm({
      title: t('inventory.warehouses.deleteBinTitle'),
      message: t('inventory.warehouses.deleteBinMessage'),
      tone: 'danger',
      confirmLabel: t('inventory.warehouses.delete'),
    });
    if (!ok) return;
    if (!selectedWarehouse) return;
    try {
      await zonesApi.remove(id);
      fetchBins(selectedWarehouse.id);
      toast.success(t('inventory.warehouses.binDeleted'));
    } catch {
      toast.error(t('inventory.warehouses.error'));
    }
  };

  // Agrupar bins por prefijo "B01" (pasillo) para que una malla de 150
  // ubicaciones sea navegable. Acepta cualquier formato — si no hay "-"
  // caen en el grupo "Otros".
  const grouped = useMemo(() => {
    const q = binQuery.trim().toLowerCase();
    const filtered = q
      ? bins.filter(
          (b) =>
            b.name?.toLowerCase().includes(q) || (b.description || '').toLowerCase().includes(q),
        )
      : bins;
    const map = new Map<string, any[]>();
    for (const b of filtered) {
      const prefix = (b.name || '').split('-')[0] || t('inventory.warehouses.others');
      if (!map.has(prefix)) map.set(prefix, []);
      map.get(prefix)!.push(b);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [bins, binQuery, t]);

  const totalVisible = grouped.reduce((acc, [, arr]) => acc + arr.length, 0);

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={t('inventory.warehouses.title')}
        subtitle={t('inventory.warehouses.subtitle')}
        icon={<WarehouseIcon size={18} />}
        size="sm"
        divider
        className="pb-4"
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* PANEL IZQUIERDO — lista de almacenes */}
        <Card
          title={t('inventory.warehouses.listTitle')}
          headerAction={
            <Button
              size="sm"
              onClick={() => setShowWarehouseModal(true)}
              disabled={!canWrite}
              className="flex items-center gap-1"
            >
              <Plus size={14} /> {t('inventory.warehouses.new')}
            </Button>
          }
          bodyClassName="p-2 space-y-1 max-h-[70vh] overflow-y-auto"
        >
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader size="sm" />
            </div>
          ) : warehouses.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              {t('inventory.warehouses.empty')}
            </div>
          ) : (
            warehouses.map((w) => {
              const active = selectedWarehouse?.id === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => setSelectedWarehouse(w)}
                  className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${
                    active
                      ? 'bg-accent/10 border-accent/40'
                      : 'bg-bg-card border-border-subtle hover:border-accent/40'
                  }`}
                >
                  <div
                    className={`p-2 rounded-md ${
                      active ? 'bg-accent text-accent-fg' : 'bg-bg-muted text-fg-muted'
                    }`}
                  >
                    <MapPin size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-fg-default truncate">{w.name}</span>
                      {w.isDefault && <Star size={12} className="text-amber-500 fill-amber-500" />}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest font-semibold text-fg-subtle truncate">
                      {w.location || t('inventory.warehouses.noLocation')}
                    </div>
                  </div>
                  <ChevronRight size={14} className={active ? 'text-accent' : 'text-fg-subtle'} />
                </button>
              );
            })
          )}
        </Card>

        {/* PANEL DERECHO — bins del almacén */}
        <div className="space-y-4">
          {!selectedWarehouse ? (
            <Card bodyClassName="py-16 text-center">
              <WarehouseIcon size={40} className="mx-auto mb-4 text-fg-subtle" />
              <p className="text-sm font-semibold text-fg-body">
                {t('inventory.warehouses.selectWarehouse')}
              </p>
              <p className="text-xs text-fg-subtle mt-1">
                {t('inventory.warehouses.selectWarehouseHint')}
              </p>
            </Card>
          ) : (
            <>
              <Card bodyClassName="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-lg font-black text-fg-default">{selectedWarehouse.name}</h2>
                    <p className="text-xs text-fg-muted mt-0.5">
                      {selectedWarehouse.location || t('inventory.warehouses.noGeoLocation')} ·{' '}
                      {t('inventory.warehouses.binCount', { count: bins.length })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowGenerator(true)}
                    disabled={!canWrite}
                    className="flex items-center gap-2"
                  >
                    <LayoutGrid size={14} /> {t('inventory.warehouses.bulkGenerate')}
                  </Button>
                </div>
              </Card>

              {/* Crear bin inline */}
              {canWrite && (
                <Card bodyClassName="p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">
                    {t('inventory.warehouses.newBin')}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
                    <Input
                      value={newBinName}
                      onChange={(e) => setNewBinName(e.target.value)}
                      placeholder={t('inventory.warehouses.binCodePlaceholder')}
                    />
                    <Input
                      value={newBinDesc}
                      onChange={(e) => setNewBinDesc(e.target.value)}
                      placeholder={t('inventory.warehouses.binDescPlaceholder')}
                    />
                    <Button onClick={createBin} disabled={!newBinName.trim() || creatingBin}>
                      {creatingBin ? <Loader size="sm" variant="white" /> : <Plus size={14} />}
                    </Button>
                  </div>
                </Card>
              )}

              {/* Búsqueda */}
              <Card bodyClassName="p-3">
                <Input
                  leftIcon={<Search size={14} />}
                  value={binQuery}
                  onChange={(e) => setBinQuery(e.target.value)}
                  placeholder={t('inventory.warehouses.searchPlaceholder')}
                />
                {binQuery && (
                  <div className="text-[11px] text-fg-muted mt-2">
                    {t('inventory.warehouses.matches', { count: totalVisible })}
                  </div>
                )}
              </Card>

              {/* Lista agrupada */}
              {loadingBins ? (
                <div className="py-16 flex justify-center">
                  <Loader />
                </div>
              ) : bins.length === 0 ? (
                <Card bodyClassName="py-12 text-center">
                  <p className="text-sm text-fg-muted">{t('inventory.warehouses.noBins')}</p>
                  <p className="text-xs text-fg-subtle mt-1">
                    {t('inventory.warehouses.noBinsHint')}
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {grouped.map(([prefix, list]) => {
                    const isOpen = openGroups[prefix] ?? true;
                    return (
                      <Card key={prefix} bodyClassName="p-0">
                        <button
                          onClick={() => setOpenGroups((prev) => ({ ...prev, [prefix]: !isOpen }))}
                          className="w-full flex items-center gap-2 p-3 text-left hover:bg-bg-hover transition-colors"
                        >
                          {isOpen ? (
                            <ChevronDown size={14} className="text-fg-subtle" />
                          ) : (
                            <ChevronRight size={14} className="text-fg-subtle" />
                          )}
                          <span className="font-mono font-black text-xs uppercase tracking-wider text-fg-body">
                            {prefix}
                          </span>
                          <span className="text-[11px] text-fg-subtle">
                            {t('inventory.warehouses.binCount', { count: list.length })}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="border-t border-border-subtle">
                            <ul>
                              {list.map((b: any) => (
                                <li
                                  key={b.id}
                                  className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-0 hover:bg-bg-hover"
                                >
                                  <div className="px-2 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono font-black text-[11px] rounded border border-blue-100 dark:border-blue-500/20">
                                    {b.name}
                                  </div>
                                  <span className="flex-1 text-[11px] text-fg-muted truncate">
                                    {b.description || '—'}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteBin(b.id)}
                                    disabled={!canDelete}
                                    title={t('inventory.warehouses.deleteBinTitle')}
                                  >
                                    <Trash2 size={13} />
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showGenerator && selectedWarehouse && (
        <BinGeneratorModal
          warehouseId={selectedWarehouse.id}
          onClose={() => setShowGenerator(false)}
          onSuccess={() => {
            setShowGenerator(false);
            fetchBins(selectedWarehouse.id);
          }}
        />
      )}

      <Modal
        isOpen={showWarehouseModal}
        onClose={() => setShowWarehouseModal(false)}
        title={t('inventory.warehouses.newTitle')}
        subtitle={t('inventory.warehouses.newSubtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleSubmitWarehouse} className="space-y-4 pt-4">
          <Input
            label={t('inventory.warehouses.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t('inventory.warehouses.namePlaceholder')}
          />
          <Input
            label={t('inventory.warehouses.geoLocation')}
            value={whLocation}
            onChange={(e) => setWhLocation(e.target.value)}
            placeholder={t('inventory.warehouses.geoLocationPlaceholder')}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowWarehouseModal(false)} type="button">
              {t('inventory.warehouses.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader size="sm" variant="white" />
              ) : (
                t('inventory.warehouses.create')
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
