import React from 'react';
import {
  Badge,
  Button,
  DescriptionList,
  EmptyState,
  List,
  Modal,
  SegmentedControl,
  Spinner,
} from '@openfactu/ui';
import { MessageSquareWarning } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { useAppReports } from '../hooks/useAppReports';
import { useCanEditLogistics } from '../hooks/useCanEditLogistics';

const CONTEXT_KEYS = ['path', 'screen', 'locale', 'online', 'userAgent', 'routeId'];

/** Lo que los conductores cuentan sobre la aplicación, para quien pueda arreglarlo. */
export const AppReportsTab: React.FC = () => {
  const { t } = useI18n();
  const fmt = useFormat();
  const canWrite = useCanEditLogistics();
  const reports = useAppReports();
  const { opened } = reports;

  const contextValue = (value: unknown) =>
    typeof value === 'boolean'
      ? t(value ? 'logistics.appReports.yes' : 'logistics.appReports.no')
      : String(value ?? '');

  return (
    <div className="space-y-3">
      <SegmentedControl<string>
        size="sm"
        aria-label={t('logistics.hub.tabs.appReports')}
        value={reports.onlyOpen ? 'open' : 'all'}
        onChange={(value) => reports.setOnlyOpen(value === 'open')}
        options={[
          { value: 'open', label: t('logistics.appReports.filterOpen') },
          { value: 'all', label: t('logistics.appReports.filterAll') },
        ]}
      />

      {reports.loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : reports.visible.length === 0 ? (
        <EmptyState
          icon={<MessageSquareWarning size={24} />}
          title={t('logistics.appReports.empty')}
        />
      ) : (
        <List
          variant="cards"
          items={reports.visible.map((report) => ({
            id: report.id,
            title: report.message,
            subtitle: `${report.userName || t('logistics.appReports.unknownUser')} · ${fmt.date(report.createdAt)}`,
            badge: (
              <Badge variant={report.status === 'open' ? 'warning' : 'success'}>
                {report.status === 'open'
                  ? t('logistics.appReports.statusOpen')
                  : t('logistics.appReports.statusResolved')}
              </Badge>
            ),
            meta: t(`logistics.appReports.category.${report.category}`),
            onClick: () => reports.open(report),
          }))}
        />
      )}

      <Modal
        isOpen={!!opened}
        onClose={reports.close}
        title={t('logistics.appReports.details')}
        maxWidth="md"
        footer={
          opened && canWrite ? (
            <div className="flex w-full justify-end gap-2 p-3">
              <Button
                variant={opened.status === 'open' ? 'primary' : 'secondary'}
                onClick={() =>
                  reports.setStatus(opened.id, opened.status === 'open' ? 'resolved' : 'open')
                }
              >
                {opened.status === 'open'
                  ? t('logistics.appReports.resolve')
                  : t('logistics.appReports.reopen')}
              </Button>
            </div>
          ) : undefined
        }
      >
        {opened && (
          <div className="space-y-4 py-1">
            <p className="whitespace-pre-wrap text-sm text-fg-body">{opened.message}</p>
            {opened.photo && (
              <img
                src={opened.photo}
                alt=""
                className="max-h-96 w-full rounded-lg border border-border-default object-contain"
              />
            )}
            <DescriptionList
              columns={1}
              items={CONTEXT_KEYS.filter((key) => opened.context?.[key] != null).map((key) => ({
                key,
                label: t(`logistics.appReports.context.${key}`),
                value: contextValue(opened.context[key]),
              }))}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};
