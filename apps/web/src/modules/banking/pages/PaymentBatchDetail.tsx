import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
  Textarea,
  usePopup,
  useToast,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { ArrowLeft, Download, FileCog, Lock, Trash2 } from 'lucide-react';
import { PageBack } from '@/components/common/PageBack';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { saveBlob } from '@/utils/downloadPdf';
import { paymentBatchesApi } from '../api/bankingApi';
import {
  BATCH_STATUS_VARIANT,
  formatIban,
  type BatchExporterOption,
  type PaymentBatchDetail as Batch,
  type PaymentBatchLine,
} from '../domain/banking';

const PERMISSION_PATH = '/banking/batches';

/** Una remesa: su fichero, cerrarla y anotar lo que el banco devuelva. */
export const PaymentBatchDetail: React.FC = () => {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const popup = usePopup();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporters, setExporters] = useState<BatchExporterOption[]>([]);
  const [exporterId, setExporterId] = useState('');
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState<PaymentBatchLine | null>(null);
  const [reason, setReason] = useState('');

  const privileged = user?.role === 'SUPERUSER' || user?.role === 'ADMIN';
  const canWrite = privileged || !!user?.permissions?.[PERMISSION_PATH]?.write;

  const load = useCallback(
    () =>
      paymentBatchesApi
        .get(id)
        .then(setBatch)
        .catch(() => setFailed(true)),
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const kind = batch?.kind;
  useEffect(() => {
    if (!kind) return;
    paymentBatchesApi
      .exporters(kind)
      .then((rows) => {
        setExporters(rows);
        setExporterId((current) => current || rows[0]?.id || '');
      })
      .catch(() => undefined);
  }, [kind]);

  const attempt = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await action();
      if (done) toast.success(done);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('banking.batches.saveError'));
    } finally {
      setBusy(false);
    }
  };

  const back = () => navigate(PERMISSION_PATH);

  const download = () =>
    attempt(async () => {
      const { blob, filename } = await paymentBatchesApi.file(id);
      saveBlob(blob, filename ?? batch?.fileName ?? 'remesa');
    });

  const close = async () => {
    const sure = await popup.confirm({
      title: t('banking.batches.closeTitle'),
      message: t(`banking.batches.closeMessage.${batch?.kind}`, {
        amount: fmt.money(Number(batch?.total ?? 0)),
      }),
      confirmLabel: t('banking.batches.close'),
      cancelLabel: t('banking.common.cancel'),
    });
    if (sure) await attempt(() => paymentBatchesApi.close(id), t('banking.batches.closed'));
  };

  const remove = async () => {
    const sure = await popup.confirm({
      title: t('banking.batches.deleteTitle'),
      message: t('banking.batches.deleteMessage'),
      confirmLabel: t('banking.batches.delete'),
      cancelLabel: t('banking.common.cancel'),
    });
    if (!sure) return;
    setBusy(true);
    try {
      await paymentBatchesApi.remove(id);
      toast.success(t('banking.batches.deleted'));
      back();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('banking.batches.saveError'));
      setBusy(false);
    }
  };

  const confirmReturn = async () => {
    if (!returning) return;
    await attempt(
      () => paymentBatchesApi.returnLine(id, returning.id, reason.trim()),
      t('banking.batches.returned'),
    );
    setReturning(null);
    setReason('');
  };

  if (failed) {
    return (
      <div className="p-4 space-y-4">
        <Alert tone="danger">{t('banking.batches.loadError')}</Alert>
        <Button variant="secondary" onClick={back}>
          {t('banking.batches.title')}
        </Button>
      </div>
    );
  }
  if (!batch) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const columns: TableColumn<PaymentBatchLine>[] = [
    {
      header: t('banking.batches.invoice'),
      card: 'title',
      cell: (row) => <span className="font-semibold">{row.invoiceCode ?? '—'}</span>,
    },
    {
      header: t(
        batch.kind === 'collection' ? 'banking.batches.customer' : 'banking.batches.supplier',
      ),
      card: 'subtitle',
      cell: (row) => (
        <div className="min-w-0">
          <p>{row.partnerName}</p>
          <p className="font-mono text-xs text-fg-muted">{formatIban(row.iban) || '—'}</p>
        </div>
      ),
    },
    {
      header: t('banking.batches.dueDate'),
      card: 'meta',
      cell: (row) => <span className="tabular-nums">{fmt.date(row.dueDate)}</span>,
    },
    {
      header: t('banking.batches.amount'),
      align: 'right',
      card: 'meta',
      cell: (row) => (
        <span className="tabular-nums font-semibold">{fmt.money(Number(row.amount))}</span>
      ),
    },
    {
      header: t('banking.batches.status'),
      card: 'status',
      cell: (row) =>
        row.status === 'returned' ? (
          <div className="min-w-0">
            <Badge variant="danger">{t('banking.batches.lineReturned')}</Badge>
            {row.returnReason && <p className="mt-1 text-xs text-fg-muted">{row.returnReason}</p>}
          </div>
        ) : batch.status === 'closed' ? (
          <Badge variant="success">{t('banking.batches.lineCollected')}</Badge>
        ) : (
          <Badge variant="neutral">{t('banking.batches.linePending')}</Badge>
        ),
    },
  ];

  const rowActions = (row: PaymentBatchLine): RowAction[] =>
    batch.status === 'closed' && row.status === 'open' && canWrite
      ? [
          {
            id: 'return',
            label: t('banking.batches.markReturned'),
            onClick: () => setReturning(row),
          },
        ]
      : [];

  return (
    <div className="p-4 space-y-4">
      <PageBack onBack={back}>
        <Button type="button" variant="ghost" size="sm" onClick={back} className="w-fit gap-2">
          <ArrowLeft size={12} /> {t('banking.batches.title')}
        </Button>
      </PageBack>
      <PageHeader
        title={batch.code}
        subtitle={`${t(`banking.batches.kinds.${batch.kind}`)} · ${batch.accountName ?? ''} · ${fmt.date(batch.chargeDate)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={BATCH_STATUS_VARIANT[batch.status]}>
              {t(`banking.batches.statuses.${batch.status}`)}
            </Badge>
            <span className="tabular-nums text-lg font-semibold">
              {fmt.money(Number(batch.total))}
            </span>
          </div>
        }
      />
      {canWrite && batch.status !== 'closed' && (
        <Card>
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">{t(`banking.batches.next.${batch.status}`)}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Select
                label={t('banking.batches.format')}
                containerClassName="w-full sm:w-72"
                value={exporterId}
                onChange={setExporterId}
                options={exporters.map((row) => ({ value: row.id, label: row.label }))}
              />
              <Button
                className="gap-2"
                variant={batch.status === 'draft' ? 'primary' : 'secondary'}
                isLoading={busy}
                disabled={!exporterId}
                onClick={() =>
                  attempt(
                    () => paymentBatchesApi.generate(id, exporterId),
                    t('banking.batches.generated'),
                  )
                }
              >
                <FileCog size={16} /> {t('banking.batches.generate')}
              </Button>
              {batch.status === 'generated' && (
                <Button className="gap-2" disabled={busy} onClick={close}>
                  <Lock size={16} /> {t('banking.batches.close')}
                </Button>
              )}
              <Button variant="ghost" className="gap-2" disabled={busy} onClick={remove}>
                <Trash2 size={16} /> {t('banking.batches.delete')}
              </Button>
            </div>
          </div>
        </Card>
      )}
      {batch.fileName && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-all font-mono text-sm">{batch.fileName}</p>
            <Button variant="secondary" className="gap-2" disabled={busy} onClick={download}>
              <Download size={16} /> {t('banking.batches.download')}
            </Button>
          </div>
        </Card>
      )}
      <Card noPadding>
        <Table
          className="max-md:p-3"
          columns={columns}
          data={batch.lines}
          rowKey={(row) => row.id}
          rowActions={batch.status === 'closed' && canWrite ? rowActions : undefined}
        />
      </Card>
      <Modal
        isOpen={!!returning}
        onClose={() => setReturning(null)}
        title={t('banking.batches.returnTitle', { code: returning?.invoiceCode ?? '' })}
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-fg-muted">{t('banking.batches.returnHint')}</p>
          <Textarea
            label={t('banking.batches.returnReason')}
            required
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setReturning(null)}>
            {t('banking.common.cancel')}
          </Button>
          <Button disabled={!reason.trim()} isLoading={busy} onClick={confirmReturn}>
            {t('banking.batches.markReturned')}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default PaymentBatchDetail;
