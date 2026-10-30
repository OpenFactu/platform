/**
 * Plataformas ajenas — catálogo de ubicaciones logísticas externas
 * (cross-docks, naves alquiladas, hubs compartidos). Las `StagingArea` las
 * referencian vía `platformId` para heredar address/coords.
 */
import { platformsApi } from '../api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  NumberInput,
  Modal,
  Badge,
  Loader,
  Switch,
  useToast,
  usePopup,
} from '@openfactu/ui';
import { Plus, Trash2, Edit2, RotateCcw, Archive, Building2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import type { Platform } from '../domain/platform';

export const PlatformsTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const { t } = useI18n();
  const [rows, setRows] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    setLoading(true);
    try {
      const d = await platformsApi.list(showArchived ? { includeArchived: true } : undefined);
      setRows(Array.isArray(d) ? d : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, showArchived]);

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setShowModal(true);
  };
  const openEdit = (p: Platform) => {
    setEditing(p);
    setForm({ ...p });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name) {
      toast.error(t('logistics.platforms.nameRequired'));
      return;
    }
    try {
      if (editing) await platformsApi.update(editing.id, form);
      else await platformsApi.create(form);
      toast.success(editing ? t('logistics.platforms.updated') : t('logistics.platforms.created'));
      setShowModal(false);
      setForm({});
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const archive = async (p: Platform) => {
    const ok = await popup.confirm({
      title: t('logistics.platforms.archiveTitle'),
      message: t('logistics.platforms.archiveMessage', { name: p.name }),
      tone: 'danger',
      confirmLabel: t('logistics.platforms.archive'),
    });
    if (!ok) return;
    await platformsApi.archive(p.id);
    load();
  };
  const restore = async (p: Platform) => {
    await platformsApi.restore(p.id);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {/* Surte efecto al instante (recarga la lista), no es campo de un
            formulario → Switch, que además sí tiene prop `label`. */}
        <Switch
          checked={showArchived}
          onChange={setShowArchived}
          label={t('logistics.platforms.showArchived')}
        />
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> {t('logistics.platforms.new')}
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">
          {t('logistics.platforms.empty')}
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((p) => {
              const archived = !!p.archivedAt;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0 ${
                    archived ? 'opacity-60' : ''
                  }`}
                >
                  <Building2 size={16} className="text-slate-400 shrink-0" />
                  <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                    {p.code}
                  </code>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-fg-default">{p.name}</span>
                      {archived && (
                        <Badge variant="neutral">{t('logistics.platforms.archived')}</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-fg-muted mt-0.5 flex gap-3 flex-wrap">
                      {p.address && <span className="truncate max-w-md">{p.address}</span>}
                      {p.openingHours && <span>· {p.openingHours}</span>}
                      {p.contactPhone && <span>· {p.contactPhone}</span>}
                    </div>
                  </div>
                  {!archived ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(p)}
                        title={t('logistics.common.edit')}
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => archive(p)}
                        title={t('logistics.platforms.archive')}
                      >
                        <Archive size={13} />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => restore(p)}
                      title={t('logistics.platforms.restore')}
                    >
                      <RotateCcw size={13} />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? t('logistics.platforms.editTitle') : t('logistics.platforms.new')}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <Input
            label={t('logistics.platforms.name')}
            requiredMark
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('logistics.platforms.namePlaceholder')}
          />
          <Input
            label={t('logistics.platforms.address')}
            value={form.address || ''}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder={t('logistics.platforms.addressPlaceholder')}
            helperText={t('logistics.platforms.addressHelp')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* `lat`/`lng` son doublePrecision en el servidor, así que llegan ya
                numéricas: NumberInput trabaja con ellas sin conversión, y el
                campo vacío se envía como null (emptyValue por defecto). */}
            <NumberInput
              label={t('logistics.platforms.latitude')}
              value={form.lat ?? null}
              onChange={(v) => setForm({ ...form, lat: v })}
              precision={6}
              thousandSeparator={false}
              allowNegative
              placeholder="40.3981"
            />
            <NumberInput
              label={t('logistics.platforms.longitude')}
              value={form.lng ?? null}
              onChange={(v) => setForm({ ...form, lng: v })}
              precision={6}
              thousandSeparator={false}
              allowNegative
              placeholder="-3.6554"
            />
          </div>
          <Input
            label={t('logistics.platforms.openingHours')}
            value={form.openingHours || ''}
            onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
            placeholder={t('logistics.platforms.openingHoursPlaceholder')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('logistics.platforms.contact')}
              value={form.contactName || ''}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              placeholder={t('logistics.platforms.contactPlaceholder')}
            />
            <Input
              label={t('logistics.platforms.phone')}
              value={form.contactPhone || ''}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              placeholder="+34 600 000 000"
            />
          </div>
          <Input
            label={t('logistics.platforms.email')}
            type="email"
            value={form.contactEmail || ''}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
          <Input
            label={t('logistics.platforms.notes')}
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('logistics.common.cancel')}
            </Button>
            <Button onClick={save}>
              {editing ? t('logistics.common.save') : t('logistics.common.create')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
