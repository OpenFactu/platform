import { TimeclockDevices } from '../components/TimeclockDevices';
import { KioskAppearanceEditor } from '../components/KioskAppearanceEditor';
import { kiosksApi } from '../api';
import type { Kiosk } from '../domain/kiosk';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Table,
  useToast,
  usePopup,
  PageHeader,
  CopyButton,
} from '@openfactu/ui';
import type { TableColumn, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import {
  Tablet,
  Plus,
  RefreshCw,
  Trash2,
  Link as LinkIcon,
  ExternalLink,
  Palette,
} from 'lucide-react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';

export const Kiosks: React.FC = () => {
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { canWrite, canDelete } = usePagePermissions();
  const [rows, setRows] = useState<Kiosk[]>([]);
  const [editing, setEditing] = useState<Partial<Kiosk> | null>(null);
  const [appearanceKiosk, setAppearanceKiosk] = useState<Kiosk | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const popup = usePopup();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    setLoading(true);
    try {
      const d = await kiosksApi.list();
      setRows(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.name) return;
    const isNew = !editing.id;
    try {
      if (isNew) {
        await kiosksApi.create(editing);
      } else {
        await kiosksApi.update(editing.id!, editing);
      }
      setEditing(null);
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : t('hr.common.error'),
      );
    }
  };

  const regenerate = async (k: Kiosk) => {
    const ok = await popup.confirm({
      title: t('hrTime.kiosks.regenTitle'),
      message: t('hrTime.kiosks.regenMessage'),
      tone: 'danger',
      confirmLabel: t('hrTime.kiosks.regen'),
    });
    if (!ok) return;
    await kiosksApi.regenerateToken(k.id);
    fetchAll();
  };

  const remove = async (k: Kiosk) => {
    const ok = await popup.confirm({
      title: t('hrTime.kiosks.deleteTitle'),
      message: t('hrTime.kiosks.deleteMessage', { name: k.name }),
      tone: 'danger',
      confirmLabel: t('hr.common.delete'),
    });
    if (!ok) return;
    await kiosksApi.remove(k.id);
    fetchAll();
  };

  const kioskUrl = (k: Kiosk) => {
    const tenant = user?.tenantId || '';
    const params = new URLSearchParams({ token: k.token, tenant });
    return `${window.location.origin}/kiosk?${params.toString()}`;
  };

  const copyLink = (k: Kiosk) => {
    const url = kioskUrl(k);
    navigator.clipboard.writeText(url);
    toast.success(t('hrTime.kiosks.linkCopied'));
  };

  const openKiosk = (k: Kiosk) => {
    window.open(kioskUrl(k), '_blank', 'noopener');
  };

  const columns: TableColumn<Kiosk>[] = [
    { header: t('hr.common.name'), accessor: 'name', sortable: true, primary: true },
    {
      header: t('hr.common.location'),
      sortable: true,
      sortAccessor: (k) => k.location || '',
      cell: (k) => k.location || '—',
    },
    {
      header: t('hrTime.kiosks.tokenShort'),
      cell: (k) => (
        <div className="flex items-center gap-2 font-mono text-xs">
          {k.token.slice(0, 8)}…
          <CopyButton
            value={k.token}
            variant="ghost"
            iconOnly
            label={t('hrTime.kiosks.copyToken')}
          />
        </div>
      ),
    },
    {
      header: t('hr.common.active'),
      sortable: true,
      sortAccessor: (k) => (k.isActive ? 1 : 0),
      cell: (k) => (k.isActive ? t('hr.common.yes') : t('hr.common.no')),
    },
  ];

  const rowActions = (k: Kiosk): RowAction[] => [
    {
      label: t('hrTime.kiosks.customize'),
      icon: <Palette size={14} />,
      disabled: !canWrite,
      onClick: () => setAppearanceKiosk(k),
    },
    {
      label: t('hrTime.kiosks.copyLink'),
      icon: <LinkIcon size={14} />,
      onClick: () => copyLink(k),
    },
    {
      label: t('hrTime.kiosks.open'),
      icon: <ExternalLink size={14} />,
      onClick: () => openKiosk(k),
    },
    {
      label: t('hrTime.kiosks.regenTitle'),
      icon: <RefreshCw size={14} />,
      disabled: !canWrite,
      onClick: () => regenerate(k),
    },
    {
      label: t('hr.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => remove(k),
    },
  ];

  return (
    <div className="p-4 w-full space-y-6">
      <PageHeader
        title={t('hrTime.kiosks.title')}
        subtitle={t('hrTime.kiosks.subtitle')}
        icon={<Tablet size={18} />}
        size="lg"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={() => setEditing({ name: '', location: '' })}>
              <Plus size={14} /> {t('hrTime.kiosks.new')}
            </Button>
          )
        }
      />

      {appearanceKiosk && canWrite && (
        <KioskAppearanceEditor
          key={appearanceKiosk.id}
          kiosk={appearanceKiosk}
          onClose={() => setAppearanceKiosk(null)}
        />
      )}
      {editing && (
        <Card noPadding>
          <form onSubmit={save} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label={t('hr.common.name')}
              value={editing.name || ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              required
            />
            <Input
              label={t('hr.common.location')}
              value={editing.location || ''}
              onChange={(e) => setEditing({ ...editing, location: e.target.value })}
            />
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={!canWrite}>
                {t('hr.common.save')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('hr.common.cancel')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden" noPadding>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={rows}
          isLoading={loading}
          rowActions={rowActions}
          emptyMessage={t('hrTime.kiosks.empty')}
        />
      </Card>

      <TimeclockDevices
        key={user?.tenantId}
        kiosks={rows}
        canWrite={!!canWrite}
        tenantId={user?.tenantId || ''}
      />
      <p className="text-xs text-slate-400 italic">{t('hrTime.kiosks.footerHint')}</p>
    </div>
  );
};

export default Kiosks;
