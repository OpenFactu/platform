import { useEffect, useState } from 'react';
import { Button, Card, Input, Select, usePopup, Alert, CopyButton } from '@openfactu/ui';
import { timeclockManagementApi as api, type Reader } from '../api/timeclockManagementApi';
import type { Kiosk } from '../domain/kiosk';
import { ReaderUsbSetup } from './ReaderUsbSetup';
import { ReaderFirmwareUpdate } from './ReaderFirmwareUpdate';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';
export function TimeclockDevices({
  kiosks,
  canWrite,
  tenantId,
}: {
  kiosks: Kiosk[];
  canWrite: boolean;
  tenantId: string;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Reader[]>([]);
  const [editing, setEditing] = useState<Partial<Reader> | null>(null);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState<Reader | null>(null);
  const [provisioning, setProvisioning] = useState<(Reader & { token?: string }) | null>(null);
  const popup = usePopup();
  useEffect(() => {
    let active = true;
    void api
      .readers()
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [tenantId]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      setRows(await api.readers());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('hrTime.readers.saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  const reveal = (row: Reader & { token: string }) => {
    if (row.mode === 'paired') {
      setSecret('');
      setProvisioning(row);
      return;
    }
    setSecret(
      JSON.stringify(
        { baseUrl: window.location.origin, tenantId, deviceId: row.id, deviceToken: row.token },
        null,
        2,
      ),
    );
  };
  return (
    <Card className="p-5 space-y-4">
      {updating && canWrite && (
        <ReaderFirmwareUpdate
          key={updating.id}
          reader={updating}
          onClose={() => setUpdating(null)}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('hrTime.readers.title')}</h2>
          <p className="text-sm text-fg-muted">{t('hrTime.readers.subtitle')}</p>
        </div>
        {canWrite && (
          <Button
            type="button"
            disabled={!!provisioning || !!updating}
            onClick={() => {
              setSecret('');
              setEditing({ name: '', mode: 'paired', kioskId: '', isActive: true });
            }}
          >
            {t('hrTime.readers.new')}
          </Button>
        )}
      </div>
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      {provisioning && canWrite && (
        <ReaderUsbSetup
          key={provisioning.id}
          reader={provisioning}
          tenantId={tenantId}
          initialToken={provisioning.token}
          onClose={() => setProvisioning(null)}
          onConnected={() => void run(async () => {})}
        />
      )}
      {editing && (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (editing.id) await api.updateReader(editing.id, editing);
              else reveal(await api.createReader(editing));
              setEditing(null);
            });
          }}
        >
          <Input
            label={t('hrTime.readers.name')}
            required
            value={editing.name || ''}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <Input
            label={t('hrTime.readers.location')}
            value={editing.location || ''}
            onChange={(e) => setEditing({ ...editing, location: e.target.value })}
          />
          <Select
            label={t('hrTime.readers.mode')}
            value={editing.mode || 'paired'}
            onChange={(v) => setEditing({ ...editing, mode: v as Reader['mode'], kioskId: null })}
            options={[
              { value: 'paired', label: t('hrTime.readers.modePaired') },
              { value: 'standalone', label: t('hrTime.readers.modeStandalone') },
            ]}
          />
          {editing.mode === 'paired' ? (
            <Select
              label={t('hrTime.readers.kiosk')}
              value={editing.kioskId || ''}
              onChange={(v) => setEditing({ ...editing, kioskId: v })}
              options={[
                { value: '', label: t('hrTime.readers.selectKiosk') },
                ...kiosks.filter((k) => k.isActive).map((k) => ({ value: k.id, label: k.name })),
              ]}
            />
          ) : (
            <div role="note" className="self-center space-y-1 text-sm">
              <p className="font-medium text-fg-body">{t('hrTime.readers.standaloneTitle')}</p>
              <p className="text-fg-muted">{t('hrTime.readers.standaloneHint')}</p>
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy || !canWrite || !!provisioning}>
              {t('hrTime.readers.save')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              {t('hr.common.cancel')}
            </Button>
          </div>
        </form>
      )}
      {secret && (
        <div className="space-y-3 rounded-lg border border-border-subtle p-4">
          <p className="text-sm">{t('hrTime.readers.secretHint')}</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{secret}</pre>
          <CopyButton
            value={secret}
            variant="secondary"
            size="md"
            label={t('hrTime.readers.copyConfig')}
            onCopyError={() => setError(t('hrTime.readers.copyFailed'))}
          />
          <Button type="button" variant="secondary" onClick={() => setSecret('')}>
            {t('hrTime.readers.hide')}
          </Button>
        </div>
      )}
      <ul className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <p className="font-semibold">
                {row.name} {!row.isActive && t('hrTime.readers.disabledSuffix')}
              </p>
              <p className="text-sm text-fg-muted">
                {row.mode === 'standalone'
                  ? t('hrTime.readers.modeStandalone')
                  : t('hrTime.readers.kioskLabel', {
                      name:
                        kiosks.find((k) => k.id === row.kioskId)?.name ||
                        t('hrTime.readers.unlinked'),
                    })}
              </p>
              <p className="text-xs text-fg-muted">
                {row.lastSeenAt
                  ? t('hrTime.readers.lastSeen', { date: formatDateTime(row.lastSeenAt) })
                  : t('hrTime.readers.neverConnected')}
              </p>
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !!provisioning || !!updating}
                  onClick={() => setUpdating(row)}
                >
                  {t('hrTime.readers.updateFirmware')}
                </Button>
                {row.mode === 'paired' && row.isActive && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || !!provisioning || !!updating}
                    onClick={() => setProvisioning(row)}
                  >
                    {t('hrTime.readers.configureUsb')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !!provisioning || !!updating}
                  onClick={() => setEditing(row)}
                >
                  {t('hrTime.readers.edit')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !!provisioning || !!updating}
                  onClick={() =>
                    void run(() => api.updateReader(row.id, { isActive: !row.isActive }))
                  }
                >
                  {row.isActive ? t('hrTime.readers.deactivate') : t('hrTime.readers.activate')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !!provisioning || !!updating}
                  onClick={async () => {
                    if (
                      await popup.confirm({
                        title: t('hrTime.readers.rotateTitle'),
                        message: t('hrTime.readers.rotateMessage'),
                      })
                    )
                      void run(async () => reveal(await api.rotateReader(row.id)));
                  }}
                >
                  {t('hrTime.readers.rotate')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!rows.length && <p className="text-sm text-fg-muted">{t('hrTime.readers.empty')}</p>}
    </Card>
  );
}
