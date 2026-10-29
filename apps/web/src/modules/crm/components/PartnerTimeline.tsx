import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyState, Skeleton } from '@openfactu/ui';
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

function labelOf(e: TimelineEntry) {
  if (e.kind === 'activity') return ACTIVITY_TYPE_LABEL[e.activityType ?? 'note'];
  if (e.kind === 'opportunity') return 'Oportunidad';
  return DOC_TYPE_LABEL[e.kind];
}

/**
 * Historial del cliente: actividades, oportunidades y documentos mezclados por
 * fecha. Los documentos solo aparecen si el usuario puede verlos.
 */
export const PartnerTimeline: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const fmt = useFormat();
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
      <EmptyState variant="compact" icon={<History size={18} />} title="Sin historial todavía" />
    );

  return (
    <div className="space-y-2">
      <ol className="relative border-l border-border-default ml-2 space-y-3">
        {entries.map((e) => (
          <li key={`${e.kind}-${e.id}`} className="ml-4">
            <span className="absolute -left-[9px] mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-bg-card border border-border-default text-fg-muted">
              {iconOf(e)}
            </span>
            <button
              type="button"
              onClick={() => open(e)}
              disabled={e.kind === 'activity'}
              className="w-full text-left disabled:cursor-default"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-fg-muted">{labelOf(e)}</span>
                <span className="text-sm font-medium text-fg-default">{e.title}</span>
                {e.status && e.kind === 'opportunity' && (
                  <Badge variant="neutral">{e.status}</Badge>
                )}
                <span className="flex-1" />
                {e.amount != null && (
                  <span className="text-xs tabular-nums text-fg-body">{fmt.money(e.amount)}</span>
                )}
                <span className="text-xs text-fg-subtle tabular-nums">{fmt.date(e.at)}</span>
              </div>
              {e.kind === 'activity' && e.detail && (
                <p className="text-xs text-fg-muted mt-0.5 line-clamp-2">{e.detail}</p>
              )}
            </button>
          </li>
        ))}
      </ol>
      {hasMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fetchPage(entries[entries.length - 1]?.at)}
        >
          Ver más
        </Button>
      )}
    </div>
  );
};
