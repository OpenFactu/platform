import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Skeleton,
  cn,
  usePopup,
  useToast,
} from '@openfactu/ui';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { activitiesApi, type ActivityFilter } from '../api';
import { ACTIVITY_TYPE_LABEL, isOverdue, type Activity } from '../domain/crm';
import { useActivities } from '../hooks/useCrmData';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { ActivityForm, type ActivityDraft } from './ActivityForm';

interface Props {
  filter: ActivityFilter;
  /** Valores con los que nace una actividad nueva (a qué va ligada). */
  defaults?: ActivityDraft;
  /** Permite crear actividades sueltas eligiendo el interlocutor. */
  askPartner?: boolean;
  title?: string;
  /** Sin cabecera grande ni contexto redundante: para paneles dentro de una ficha. */
  compact?: boolean;
}

export const ActivityList: React.FC<Props> = ({ filter, defaults, askPartner, title, compact }) => {
  const fmt = useFormat();
  const { t } = useI18n();
  const toast = useToast();
  const popup = usePopup();
  const { canWrite, canDelete, canRead } = useCrmPermissions('/crm/activities');
  const { activities, loading, refresh } = useActivities(filter);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);

  if (!canRead) return null;

  const toggleDone = async (a: Activity) => {
    try {
      await activitiesApi.update(a.id, { done: !a.doneAt });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('crm.errors.updateFailed'));
    }
  };

  const remove = async (a: Activity) => {
    const ok = await popup.confirm({
      title: t('crm.activityList.deleteTitle'),
      message: t('crm.activityList.deleteMessage', { subject: a.subject }),
      tone: 'danger',
      confirmLabel: t('crm.common.delete'),
    });
    if (!ok) return;
    try {
      await activitiesApi.remove(a.id);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('crm.errors.deleteFailed'));
    }
  };

  // Contexto que aporta información: en la ficha de una oportunidad no hace
  // falta repetir la oportunidad en cada fila.
  const context = (a: Activity) =>
    [
      !filter.partnerId && !filter.opportunityId ? a.partnerName : null,
      !filter.opportunityId ? a.opportunityTitle : null,
      a.contactName,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <div className="space-y-2">
      {(title || canWrite) && (
        <div className="flex items-center justify-between gap-2">
          {title && (
            <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted">{title}</h3>
          )}
          {canWrite && (
            <Button
              type="button"
              size="sm"
              variant={compact ? 'ghost' : 'primary'}
              onClick={() => setDraft({ type: 'call', ...defaults })}
            >
              <Plus size={14} /> {t('crm.activityForm.newTitle')}
            </Button>
          )}
        </div>
      )}

      {loading && activities.length === 0 ? (
        <Skeleton className="h-16 w-full" />
      ) : activities.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={<CalendarClock size={18} />}
          title={t('crm.activityList.empty')}
          hint={compact ? undefined : t('crm.activityList.emptyHint')}
        />
      ) : (
        <ul className="divide-y divide-border-subtle rounded-xs border border-border-default bg-bg-card">
          {activities.map((a) => {
            const overdue = isOverdue(a);
            const ctx = context(a);
            return (
              <li key={a.id} className="group flex items-start gap-3 px-3 py-2">
                <div className="pt-0.5">
                  <Checkbox
                    checked={!!a.doneAt}
                    onChange={() => toggleDone(a)}
                    disabled={!canWrite}
                    aria-label={
                      a.doneAt ? t('crm.activityList.markPending') : t('crm.activityList.markDone')
                    }
                  />
                </div>
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => canWrite && setDraft(a)}
                  disabled={!canWrite}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="neutral">{t(ACTIVITY_TYPE_LABEL[a.type])}</Badge>
                    <span
                      className={cn(
                        'text-sm font-medium text-fg-default',
                        a.doneAt && 'line-through text-fg-subtle',
                      )}
                    >
                      {a.subject}
                    </span>
                  </div>
                  {(ctx || a.body) && (
                    <div className="mt-0.5 text-xs text-fg-muted truncate">
                      {[ctx, a.body].filter(Boolean).join(' — ')}
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {(a.dueAt || a.doneAt) && (
                    <span
                      className={cn(
                        'text-xs tabular-nums',
                        overdue ? 'text-danger-fg font-semibold' : 'text-fg-muted',
                      )}
                    >
                      {fmt.date(a.doneAt ?? a.dueAt)}
                    </span>
                  )}
                  {canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(a)}
                      title={t('crm.common.delete')}
                      aria-label={t('crm.activityList.deleteTitle')}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ActivityForm
        draft={draft}
        askPartner={askPartner}
        onClose={() => setDraft(null)}
        onSaved={refresh}
      />
    </div>
  );
};
