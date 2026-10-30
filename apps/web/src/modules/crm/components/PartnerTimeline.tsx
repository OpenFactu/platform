import { useI18n } from '@/i18n/I18nContext';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyState, Skeleton, Timeline, type TimelineTone } from '@openfactu/ui';
import {
  CalendarClock,
  CheckCircle2,
  FileSignature,
  FileStack,
  FileText,
  History,
  Mail,
  MessageSquare,
  Phone,
  Target,
  Users,
} from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { crmPartnersApi } from '../api';
import {
  ACTIVITY_TYPE_LABEL,
  DOC_ROUTE,
  DOC_TYPE_LABEL,
  type ActivityType,
  type TimelineEntry,
} from '../domain/crm';

const ACTIVITY_ICON: Record<ActivityType, React.ReactNode> = {
  call: <Phone size={14} />,
  meeting: <Users size={14} />,
  email: <Mail size={14} />,
  note: <MessageSquare size={14} />,
  task: <CalendarClock size={14} />,
};

const DOC_ICON = {
  SQ: <FileSignature size={14} />,
  SO: <FileText size={14} />,
  SINV: <FileStack size={14} />,
};

function iconOf(e: TimelineEntry) {
  if (e.kind === 'activity')
    return e.done ? <CheckCircle2 size={14} /> : ACTIVITY_ICON[e.activityType ?? 'note'];
  if (e.kind === 'opportunity') return <Target size={14} />;
  return DOC_ICON[e.kind];
}

function toneOf(e: TimelineEntry): TimelineTone {
  if (e.kind === 'activity') return e.done ? 'success' : 'default';
  if (e.kind === 'opportunity') return 'accent';
  return 'info';
}

/** Clave de i18n de la etiqueta de la entrada. */
function labelOf(e: TimelineEntry) {
  if (e.kind === 'activity') return ACTIVITY_TYPE_LABEL[e.activityType ?? 'note'];
  if (e.kind === 'opportunity') return 'crm.common.opportunity';
  return DOC_TYPE_LABEL[e.kind];
}

/**
 * Historial del cliente: actividades, oportunidades y documentos mezclados por
 * fecha. Los documentos solo aparecen si el usuario puede verlos.
 */
export const PartnerTimeline: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const fmt = useFormat();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    (before?: string) =>
      crmPartnersApi
        .timeline(partnerId, before)
        .then((page) => {
          setEntries((prev) => (before ? [...prev, ...page] : page));
          setHasMore(page.length >= 30);
        })
        .catch(() => setHasMore(false))
        .finally(() => setLoading(false)),
    [partnerId],
  );

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const open = (e: TimelineEntry) => {
    if (e.kind === 'opportunity') navigate(`/crm/opportunities/${e.id}`);
    else if (e.kind !== 'activity') navigate(DOC_ROUTE[e.kind](e.id));
  };

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (entries.length === 0)
    return (
      <EmptyState variant="compact" icon={<History size={18} />} title={t('crm.timeline.empty')} />
    );

  return (
    <div className="space-y-2">
      {/* Timeline de @openfactu/ui: agrupa por día y pone la fecha relativa;
          antes era una <ol> con la línea y los puntos montados a mano. */}
      <Timeline
        aria-label={t('crm.timeline.ariaLabel')}
        events={entries.map((e) => ({
          id: `${e.kind}-${e.id}`,
          date: e.at,
          icon: iconOf(e),
          tone: toneOf(e),
          author: t(labelOf(e)),
          title: (
            <span className="inline-flex flex-wrap items-center gap-2">
              {e.title}
              {e.status && e.kind === 'opportunity' && <Badge variant="neutral">{e.status}</Badge>}
              {e.amount != null && (
                <span className="text-xs font-normal tabular-nums text-fg-body">
                  {fmt.money(e.amount)}
                </span>
              )}
            </span>
          ),
          description: e.kind === 'activity' && e.detail ? e.detail : undefined,
          onClick: e.kind === 'activity' ? undefined : () => open(e),
        }))}
      />
      {hasMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fetchPage(entries[entries.length - 1]?.at)}
        >
          {t('crm.common.showMore')}
        </Button>
      )}
    </div>
  );
};
