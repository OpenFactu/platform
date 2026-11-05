import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  EmptyState,
  FormGrid,
  PageHeader,
  SegmentedControl,
  Select,
  Spinner,
  Table,
  useToast,
} from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { ArrowLeft } from 'lucide-react';
import { PageBack } from '@/components/common/PageBack';
import { useAuth } from '@/context/AuthContext';
import { useHideFloatingButton } from '@/context/MobilePageActionsContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { bankAccountsApi, paymentBatchesApi } from '../api/bankingApi';
import {
  candidateKey,
  candidatesTotal,
  defaultChargeDate,
  type BankAccountOption,
  type BatchCandidate,
  type BatchKind,
} from '../domain/banking';

const PERMISSION_PATH = '/banking/batches';

/** Una remesa nueva: qué vencimientos entran, por qué cuenta y con qué fecha de cargo. */
export const PaymentBatchCreate: React.FC = () => {
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Abajo ya está el botón de crear: el flotante le quitaría sitio.
  useHideFloatingButton();
  const [kind, setKind] = useState<BatchKind>('collection');
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [chargeDate, setChargeDate] = useState(defaultChargeDate());
  const [until, setUntil] = useState('');
  const [candidates, setCandidates] = useState<BatchCandidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const privileged = user?.role === 'SUPERUSER' || user?.role === 'ADMIN';
  const canWrite = privileged || !!user?.permissions?.[PERMISSION_PATH]?.write;

  useEffect(() => {
    bankAccountsApi
      .options()
      .then((rows) => {
        setAccounts(rows);
        setBankAccountId(rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? '');
      })
      .catch(() => toast.error(t('banking.accounts.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPicked(new Set());
    paymentBatchesApi
      .candidates(kind, until || undefined)
      .then((rows) => {
        if (alive) setCandidates(rows);
      })
      .catch(() => {
        if (alive) toast.error(t('banking.batches.loadError'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, until]);

  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allPicked = candidates.length > 0 && picked.size === candidates.length;
  const total = useMemo(() => candidatesTotal(candidates, picked), [candidates, picked]);
  const withProblems = candidates.filter(
    (candidate) => picked.has(candidateKey(candidate)) && candidate.problems.length > 0,
  ).length;

  const back = () => navigate(PERMISSION_PATH);

  const create = async () => {
    setSaving(true);
    try {
      const created = await paymentBatchesApi.create({
        kind,
        bankAccountId,
        chargeDate,
        lines: candidates
          .filter((candidate) => picked.has(candidateKey(candidate)))
          .map(({ invoiceId, dueDate, amount }) => ({ invoiceId, dueDate, amount })),
      });
      toast.success(t('banking.batches.created', { code: created.code }));
      navigate(`${PERMISSION_PATH}/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('banking.batches.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumn<BatchCandidate>[] = [
    {
      header: '',
      width: '3rem',
      card: 'hidden',
      cell: (row) => (
        <Checkbox
          aria-label={t('banking.batches.pick', { code: row.code })}
          checked={picked.has(candidateKey(row))}
          onChange={() => toggle(candidateKey(row))}
        />
      ),
    },
    {
      header: t('banking.batches.invoice'),
      card: 'title',
      cell: (row) => <span className="font-semibold">{row.code}</span>,
    },
    {
      header: t(kind === 'collection' ? 'banking.batches.customer' : 'banking.batches.supplier'),
      card: 'subtitle',
      cell: (row) => (
        <div className="min-w-0">
          <p>{row.partnerName}</p>
          {row.problems.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {row.problems.map((problem) => (
                <Badge key={problem} variant="warning">
                  {t(`banking.batches.problems.${problem}`)}
                </Badge>
              ))}
            </span>
          )}
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
      card: 'status',
      cell: (row) => <span className="tabular-nums font-semibold">{fmt.money(row.amount)}</span>,
    },
  ];

  return (
    <div className="p-4 pb-28 md:pb-4 space-y-4">
      <PageBack onBack={back}>
        <Button type="button" variant="ghost" size="sm" onClick={back} className="w-fit gap-2">
          <ArrowLeft size={12} /> {t('banking.batches.title')}
        </Button>
      </PageBack>
      <PageHeader title={t('banking.batches.new')} subtitle={t('banking.batches.newHint')} />
      <Card>
        <div className="space-y-4">
          <SegmentedControl<BatchKind>
            aria-label={t('banking.batches.kind')}
            value={kind}
            onChange={setKind}
            options={(['collection', 'payment'] as const).map((value) => ({
              value,
              label: t(`banking.batches.kinds.${value}`),
            }))}
          />
          <FormGrid columns={3}>
            <Select
              label={t('banking.batches.account')}
              required
              value={bankAccountId}
              onChange={setBankAccountId}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
            />
            <DatePicker
              label={t('banking.batches.chargeDate')}
              required
              value={chargeDate}
              onChange={(date) => setChargeDate(date ?? '')}
            />
            <DatePicker
              label={t('banking.batches.until')}
              value={until}
              onChange={(date) => setUntil(date ?? '')}
            />
          </FormGrid>
          {accounts.length === 0 && <Alert tone="warning">{t('banking.batches.noAccounts')}</Alert>}
        </div>
      </Card>
      <Card noPadding>
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : candidates.length === 0 ? (
          <EmptyState
            title={t('banking.batches.noCandidates')}
            hint={t('banking.batches.noCandidatesHint')}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-border-subtle">
              <Checkbox
                label={t('banking.batches.pickAll', { count: candidates.length })}
                checked={allPicked}
                onChange={(value) =>
                  setPicked(value ? new Set(candidates.map(candidateKey)) : new Set())
                }
              />
            </div>
            <Table
              className="max-md:p-3"
              columns={columns}
              data={candidates}
              rowKey={candidateKey}
              onRowClick={(row) => toggle(candidateKey(row))}
            />
          </>
        )}
      </Card>
      {withProblems > 0 && (
        <Alert tone="warning">{t('banking.batches.withProblems', { count: withProblems })}</Alert>
      )}
      {/* Abajo en móvil, como el alta de cualquier documento. En escritorio deja sitio al asistente. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border-default bg-bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:sticky md:inset-x-auto md:rounded md:border md:pr-24">
        <div className="min-w-0 text-sm">
          <p className="text-fg-muted">
            {t('banking.batches.picked', { picked: picked.size, total: candidates.length })}
          </p>
          <p className="font-semibold tabular-nums">{fmt.money(total)}</p>
        </div>
        <Button
          onClick={create}
          isLoading={saving}
          disabled={!canWrite || picked.size === 0 || !bankAccountId || !chargeDate}
        >
          {t('banking.batches.create')}
        </Button>
      </div>
    </div>
  );
};

export default PaymentBatchCreate;
