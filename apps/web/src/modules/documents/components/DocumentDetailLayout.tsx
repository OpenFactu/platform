import React from 'react';
import { Alert, Badge, Button, PageHeader } from '@openfactu/ui';
import { ArrowLeft } from 'lucide-react';
import { PageBack } from '@/components/common/PageBack';
import { useFormat } from '@/hooks/useFormat';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nContext';

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface Props {
  onBack: () => void;
  breadcrumb: string;
  title: string;
  status?: { label: string; variant: StatusVariant };
  /** Cuándo se canceló, para que el documento lo diga. */
  cancelledAt?: string | Date | null;
  cancelReason?: string | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const DocumentDetailLayout: React.FC<Props> = ({
  onBack,
  breadcrumb,
  title,
  status,
  cancelledAt,
  cancelReason,
  actions,
  children,
}) => {
  const { t } = useI18n();
  const mobile = useIsMobile();
  const fmt = useFormat();
  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300">
      <PageHeader
        size="lg"
        divider
        className="pb-6"
        // En móvil la flecha va en la misma línea que el antetítulo, no sola
        // en una fila encima del título.
        breadcrumbs={
          <div className="flex items-center gap-2">
            <PageBack onBack={onBack}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onBack}
                aria-label={t('doc.common.back')}
                className="p-2.5 shrink-0 self-start"
              >
                <ArrowLeft size={18} />
              </Button>
            </PageBack>
            {mobile && (
              <span className="min-w-0 truncate text-[10px] font-mono font-semibold uppercase tracking-[1.5px] text-fg-subtle">
                {breadcrumb}
              </span>
            )}
          </div>
        }
        eyebrow={mobile ? undefined : breadcrumb}
        title={
          <>
            {title}
            {status && (
              <Badge variant={status.variant} className="uppercase tracking-wide">
                {status.label}
              </Badge>
            )}
          </>
        }
        actions={actions}
      />
      {cancelledAt && (
        <Alert tone="info">
          {t('doc.common.cancelledOn', { date: fmt.date(cancelledAt) })}
          {cancelReason ? ` ${t('doc.common.cancelledBecause', { reason: cancelReason })}` : ''}
        </Alert>
      )}
      {children}
    </div>
  );
};
