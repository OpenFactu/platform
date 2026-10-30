import { useEffect, useState } from 'react';
import { Badge, Button, Card, Input, usePopup, Alert } from '@openfactu/ui';
import { CreditCard, Download, Plus, QrCode } from 'lucide-react';
import { timeclockManagementApi as api, type Credential } from '../api/timeclockManagementApi';
import { ReadCardButton } from './ReadCardButton';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate } from '@/i18n/format';

export function EmployeeCredentials({
  employeeId,
  canWrite,
}: {
  employeeId: string;
  canWrite: boolean;
}) {
  return <CredentialPanel key={employeeId} employeeId={employeeId} canWrite={canWrite} />;
}
function CredentialPanel({ employeeId, canWrite }: { employeeId: string; canWrite: boolean }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Credential[]>([]);
  const [uid, setUid] = useState('');
  const [label, setLabel] = useState(() => t('hr.credentials.defaultCardLabel'));
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [readingCard, setReadingCard] = useState(false);
  const popup = usePopup();
  useEffect(() => {
    let active = true;
    void api
      .credentials(employeeId)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [employeeId]);
  const activeQr = rows.find((r) => r.kind === 'qr' && !r.revokedAt);
  const cards = rows.filter((r) => r.kind === 'rfid');
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
      setRows(await api.credentials(employeeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('hr.credentials.opFailed'));
    } finally {
      setBusy(false);
    }
  };
  const issueQr = async () => {
    if (
      activeQr &&
      !(await popup.confirm({
        title: t('hr.credentials.regenTitle'),
        message: t('hr.credentials.regenMessage'),
        confirmLabel: t('hr.credentials.regen'),
      }))
    )
      return;
    void run(async () => {
      await api.issue({ employeeId, kind: 'qr', label: 'QR personal' });
      setQr('');
      setQr((await api.qr(employeeId)).qrDataUrl);
    });
  };
  const revoke = async (row: Credential) => {
    if (
      !(await popup.confirm({
        title:
          row.kind === 'qr'
            ? t('hr.credentials.revokeQrTitle')
            : t('hr.credentials.revokeCardTitle'),
        message: t('hr.credentials.revokeMessage', { label: row.label }),
        confirmLabel: t('hr.credentials.deactivate'),
      }))
    )
      return;
    void run(async () => {
      await api.revoke(row.id);
      if (row.kind === 'qr') setQr('');
    });
  };
  return (
    <Card title={t('hr.credentials.title')} subtitle={t('hr.credentials.subtitle')}>
      {error && (
        <Alert tone="danger" role="alert" className="mb-4">
          {error}
        </Alert>
      )}
      {loading ? (
        <p className="text-sm text-fg-muted" role="status">
          {t('hr.credentials.loading')}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section
            className="space-y-4 lg:border-r lg:border-border-subtle lg:pr-6"
            aria-label={t('hr.credentials.personalQr')}
          >
            <div className="flex items-center gap-2">
              <QrCode size={18} className="text-fg-muted" />
              <h3 className="font-semibold text-sm">{t('hr.credentials.personalQr')}</h3>
              <Badge variant={activeQr ? 'success' : 'neutral'}>
                {activeQr ? t('hr.credentials.active') : t('hr.credentials.noQr')}
              </Badge>
            </div>
            {qr ? (
              <div className="space-y-3">
                <div className="w-48 h-48 bg-white border border-border-subtle">
                  <img src={qr} width={192} height={192} alt={t('hr.credentials.qrAlt')} />
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <a
                    className="inline-flex items-center gap-1 underline"
                    href={qr}
                    download="qr-fichaje.png"
                  >
                    <Download size={14} />
                    {t('hr.credentials.download')}
                  </a>
                  <button type="button" className="underline" onClick={() => setQr('')}>
                    {t('hr.credentials.hide')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-fg-muted leading-relaxed">
                {activeQr ? t('hr.credentials.qrHintActive') : t('hr.credentials.qrHintNone')}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {activeQr && !qr && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(async () => setQr((await api.qr(employeeId)).qrDataUrl))}
                >
                  {t('hr.credentials.showQr')}
                </Button>
              )}
              {canWrite && (
                <Button
                  type="button"
                  variant={activeQr ? 'ghost' : 'primary'}
                  disabled={busy}
                  onClick={() => void issueQr()}
                >
                  {activeQr ? t('hr.credentials.regen') : t('hr.credentials.createQr')}
                </Button>
              )}
              {canWrite && activeQr && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void revoke(activeQr)}
                >
                  {t('hr.credentials.deactivate')}
                </Button>
              )}
            </div>
          </section>
          <section className="min-w-0 space-y-4" aria-label={t('hr.credentials.rfidAria')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-fg-muted" />
                <h3 className="font-semibold text-sm">{t('hr.credentials.cards')}</h3>
                <span className="text-xs text-fg-muted">
                  {t('hr.credentials.activeCount', {
                    count: cards.filter((c) => !c.revokedAt).length,
                  })}
                </span>
              </div>
              {canWrite && !assigning && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setAssigning(true)}
                  className="gap-1"
                >
                  <Plus size={14} />
                  {t('hr.credentials.assignCard')}
                </Button>
              )}
            </div>
            {cards.length ? (
              <ul className="divide-y divide-border-subtle">
                {cards.map((row) => (
                  <li
                    key={row.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm break-words">{row.label}</p>
                      <p className="text-xs text-fg-muted mt-1">
                        {row.revokedAt
                          ? t('hr.credentials.revoked')
                          : t('hr.credentials.assignedOn', { date: formatDate(row.createdAt) })}
                      </p>
                    </div>
                    {canWrite && !row.revokedAt && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void revoke(row)}
                      >
                        {t('hr.credentials.deactivate')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted py-2">{t('hr.credentials.noCards')}</p>
            )}
            {canWrite && assigning && (
              <form
                className="border-t border-border-subtle pt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (readingCard) return;
                  void run(async () => {
                    await api.issue({ employeeId, kind: 'rfid', uid, label });
                    setUid('');
                    setAssigning(false);
                  });
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={t('hr.credentials.uid')}
                    value={uid}
                    onChange={(e) => setUid(e.target.value)}
                    placeholder="04A1B2C3"
                    required
                    disabled={busy || readingCard}
                  />
                  <Input
                    label={t('hr.credentials.cardName')}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    required
                  />
                </div>
                <ReadCardButton disabled={busy} onRead={setUid} onReadingChange={setReadingCard} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={busy || readingCard || !uid.trim() || !label.trim()}
                  >
                    {busy ? t('hr.credentials.saving') : t('hr.credentials.saveCard')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setAssigning(false);
                      setUid('');
                      setReadingCard(false);
                    }}
                  >
                    {t('hr.common.cancel')}
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </Card>
  );
}
