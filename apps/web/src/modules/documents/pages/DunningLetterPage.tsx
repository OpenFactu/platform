import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Loader,
  PageHeader,
  Switch,
  Table,
  useToast,
} from '@openfactu/ui';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { PageBack } from '@/components/common/PageBack';
import { ResponsiveActions } from '@/components/common/ResponsiveActions';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { useLetterPreview } from '../hooks/useDunning';
import { LetterFrame } from '../components/documents/LetterFrame';
import type { OverdueInvoice } from '../domain/sales';

/** La reclamación a un cliente: qué le va a llegar, antes de enviarla. */
export const DunningLetterPage: React.FC = () => {
  const { partnerId = '' } = useParams<{ partnerId: string }>();
  const { t } = useI18n();
  const fmt = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const letter = useLetterPreview(partnerId);
  const { preview, problem, loading, to, setTo, sending } = letter;
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/sales/dunning']?.write;
  const back = () => navigate('/sales/dunning');

  const backButton = (
    <PageBack onBack={back}>
      <Button type="button" variant="ghost" size="sm" onClick={back} className="w-fit gap-1">
        <ArrowLeft size={12} /> {t('doc.dunning.title')}
      </Button>
    </PageBack>
  );

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader />
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader size="sm" breadcrumbs={backButton} title={t('doc.dunning.letterTitle')} />
        <Card>
          <EmptyState
            icon={<CheckCircle2 size={22} />}
            title={problem ?? t('doc.dunning.notYet')}
          />
        </Card>
      </div>
    );
  }

  const send = async () => {
    try {
      const sent = await letter.send();
      toast.success(t('doc.dunning.sent', { to: sent.to }));
      back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    }
  };
  const blocked = preview.excluded || !!preview.mailProblem || !to.trim() || !canWrite;

  const columns = [
    {
      header: t('doc.common.document'),
      card: 'title' as const,
      accessor: (row: OverdueInvoice) => (
        <span className="font-bold text-fg-default">{row.code}</span>
      ),
    },
    {
      header: t('doc.dunning.dueDate'),
      card: 'meta' as const,
      accessor: (row: OverdueInvoice) => fmt.date(row.dueDate),
    },
    {
      header: t('doc.dunning.overdueDays'),
      align: 'right' as const,
      accessor: (row: OverdueInvoice) => <span className="tabular-nums">{row.days}</span>,
    },
    {
      header: t('doc.dunning.overdue'),
      align: 'right' as const,
      accessor: (row: OverdueInvoice) => (
        <span className="font-bold tabular-nums">{fmt.money(row.overdue)}</span>
      ),
    },
    {
      header: t('doc.dunning.level'),
      card: 'status' as const,
      align: 'center' as const,
      cell: (row: OverdueInvoice) =>
        row.nextLevel === null ? (
          <Badge variant="neutral">{t('doc.dunning.levelSent', { level: row.sentLevel })}</Badge>
        ) : (
          <Badge variant="warning">{t('doc.dunning.levelNext', { level: row.nextLevel })}</Badge>
        ),
    },
  ];

  return (
    <div className="p-4 pb-24 max-md:pb-32 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        size="sm"
        breadcrumbs={backButton}
        title={preview.name}
        subtitle={t('doc.dunning.letterSubtitle', {
          level: preview.level,
          total: fmt.money(preview.total),
        })}
        actions={
          <ResponsiveActions
            source="dunning-letter"
            actions={
              blocked
                ? []
                : [
                    {
                      id: 'send',
                      label: t('doc.dunning.send'),
                      icon: <Send size={16} />,
                      onClick: send,
                    },
                  ]
            }
          >
            <Button onClick={send} isLoading={sending} disabled={blocked || sending}>
              {!sending && <Send size={14} />} {t('doc.dunning.send')}
            </Button>
          </ResponsiveActions>
        }
      />

      {preview.mailProblem && <Alert tone="danger">{preview.mailProblem}</Alert>}
      {preview.excluded && <Alert tone="warning">{t('doc.dunning.excludedHint')}</Alert>}
      {!preview.excluded && !preview.needsLetter && (
        <Alert tone="info">{t('doc.dunning.nothingNew')}</Alert>
      )}
      {preview.daysSinceLetter !== null && (
        <Alert tone="info">
          {t('doc.dunning.lastSent', {
            date: fmt.date(preview.lastLetterAt),
            days: preview.daysSinceLetter,
          })}
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <Card title={t('doc.dunning.recipient')}>
            <div className="space-y-4">
              <Input
                label={t('doc.dunning.to')}
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={!canWrite}
                error={!to.trim() ? t('doc.dunning.noEmail') : undefined}
              />
              <Switch
                label={t('doc.dunning.exclude')}
                checked={preview.excluded}
                disabled={!canWrite}
                onChange={(checked) => {
                  letter.setExcluded(checked).catch((e) => {
                    toast.error(e instanceof Error ? e.message : undefined);
                  });
                }}
              />
            </div>
          </Card>
          <Card
            title={t('doc.dunning.invoicesTitle')}
            subtitle={t('doc.dunning.invoicesHint')}
            noPadding
          >
            <Table className="max-md:p-3" columns={columns} data={preview.invoices} />
          </Card>
        </div>
        <Card title={preview.subject} subtitle={t('doc.dunning.previewHint')}>
          <LetterFrame html={preview.html} title={preview.subject} />
        </Card>
      </div>
    </div>
  );
};

export default DunningLetterPage;
