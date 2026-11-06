import React, { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, FormGrid, Input, Select, Spinner, Textarea, useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useCurrentTab, useTabs } from '@/context/TabsContext';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/i18n/I18nContext';
import { notifyDocChange } from '@/utils/dataRefresh';
import { DeliveryReturnLines } from '../components/documents/DeliveryReturnLines';
import { DocumentFormLayout } from '../components/form/DocumentFormLayout';
import { buildFormSteps } from '../domain/formSteps';
import { useDeliveryReturn } from '../hooks/useDeliveryReturn';

const PERMISSION_PATH = '/sales/delivery-notes';

/**
 * El cliente trae lo que se llevó de un albarán sin facturar, todo o una parte. Con muchas líneas
 * una ventana se queda corta: va en su pantalla, con los mismos pasos que cualquier documento.
 */
export const DeliveryReturnCreate: React.FC = () => {
  const { id = '' } = useParams();
  const { t, locale } = useI18n();
  const toast = useToast();
  const { flags } = useTheme();
  const { user } = useAuth();
  const { openTab } = useTabs();
  const currentTab = useCurrentTab();
  const ret = useDeliveryReturn(id, flags.enforceWarehouseZones);
  const { data, form } = ret;

  const code = data?.note.code;
  useEffect(() => {
    if (code) currentTab.rename(t('doc.deliveryReturn.tabTitle', { code }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const steps = useMemo(
    () =>
      buildFormSteps({ fiscal: 'none' }).map((step) =>
        step.id === 'header' ? { ...step, label: t('doc.deliveryReturn.stepHeader') } : step,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );

  const privileged = user?.role === 'SUPERUSER' || user?.role === 'ADMIN';
  const canWrite = privileged || !!user?.permissions?.[PERMISSION_PATH]?.write;

  const openNote = () => openTab(`${PERMISSION_PATH}/${id}`);

  const create = async () => {
    try {
      const result = await ret.submit();
      notifyDocChange('SDN');
      toast.success(t('doc.deliveryReturn.done', { code: result.code }));
      openNote();
      currentTab.close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('doc.deliveryReturn.error'));
    }
  };

  const notice = (tone: 'danger' | 'info' | 'warning', text: string) => (
    <div className="p-4 space-y-4">
      <Alert tone={tone}>{text}</Alert>
      <Button variant="secondary" onClick={openNote}>
        {t('doc.deliveryReturn.openNote')}
      </Button>
    </div>
  );

  if (ret.failed) return notice('danger', t('doc.deliveryReturn.loadError'));
  if (!data || !ret.status) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (data.problem) return notice('warning', t(`doc.deliveryReturn.blocked.${data.problem}`));
  if (data.lines.length === 0) return notice('info', t('doc.deliveryReturn.nothingLeft'));

  const options = (items: Array<{ id: string; name: string }>) =>
    items.map((item) => ({ value: item.id, label: item.name }));
  const zones = ret.zonesOf(form.warehouseId);

  return (
    <DocumentFormLayout
      title={t('doc.deliveryReturn.title', { code: code ?? '' })}
      subtitle={t('doc.deliveryReturn.intro')}
      submitLabel={t('doc.deliveryReturn.submit')}
      onSubmit={create}
      isSubmitting={ret.saving}
      canSubmit={canWrite}
      steps={steps}
      status={ret.status}
      totals={
        <div className="space-y-3">
          <p className="text-sm font-semibold text-fg-default">
            {t('doc.deliveryReturn.summary', { picked: ret.picked, total: data.lines.length })}
          </p>
          <Alert tone="warning">{t('doc.deliveryReturn.reviewNote')}</Alert>
        </div>
      }
      sections={{
        header: (
          <div className="space-y-4">
            <FormGrid columns={2}>
              <Input
                label={t('doc.partner.customer')}
                value={data.note.partnerName ?? ''}
                disabled
              />
              <Input label={t('doc.deliveryReturn.note')} value={data.note.code} disabled />
              <Select
                label={t('doc.deliveryReturn.warehouse')}
                required
                value={form.warehouseId}
                onChange={(warehouseId) => ret.set({ warehouseId, zoneId: '' })}
                options={options(ret.warehouses)}
              />
              {zones.length > 0 && (
                <Select
                  label={t('doc.deliveryReturn.zone')}
                  value={form.zoneId}
                  onChange={(zoneId) => ret.set({ zoneId })}
                  options={options(zones)}
                />
              )}
            </FormGrid>
            <Textarea
              label={t('doc.deliveryReturn.reason')}
              required
              rows={2}
              value={form.reason}
              onChange={(event) => ret.set({ reason: event.target.value })}
            />
          </div>
        ),
        lines: <DeliveryReturnLines ret={ret} />,
      }}
    />
  );
};

export default DeliveryReturnCreate;
