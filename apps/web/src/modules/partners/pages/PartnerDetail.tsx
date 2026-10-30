import { useI18n } from '@/i18n/I18nContext';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Loader, PageHeader, useIsMobile, useToast } from '@openfactu/ui';
import { ArrowLeft, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { PartnerCrmPanel } from '@/modules/crm/components/PartnerCrmPanel';
import { partnersApi } from '../api';
import type { Partner } from '../domain/partner';
import { usePartnerForm } from '../hooks/usePartnerForm';
import {
  PartnerAddressesFields,
  PartnerContactFields,
  PartnerFiscalFields,
  PartnerGeneralFields,
} from '../components/PartnerSections';
import { FloatingSaveButton, HeaderSaveButton } from '@/components/FloatingSaveButton';
import { PartnerCreateWizard } from '../components/PartnerCreateWizard';

/**
 * Ficha completa de un interlocutor (/partners/:partnerId, o /partners/new
 * para el alta). Sustituye al modal con pestañas: secciones apiladas en
 * tarjetas, como la ficha de artículo.
 */
export const PartnerDetail: React.FC = () => {
  const { partnerId = 'new' } = useParams<{ partnerId: string }>();
  const isNew = partnerId === 'new';
  const navigate = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  // En móvil guardar (y convertir) van en el botón flotante: la cabecera no lleva acciones.
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { flags } = useTheme();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/partners']?.write;

  const form = usePartnerForm();
  const { reset } = form;
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!user?.tenantId) return;
    if (isNew) {
      reset(null);
      return;
    }
    let cancelled = false;
    partnersApi
      .get(partnerId)
      .then((p) => {
        if (cancelled) return;
        setPartner(p);
        reset(p);
      })
      .catch((err) => {
        if (!cancelled)
          toast.error(err instanceof Error ? err.message : t('partners.detail.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, isNew, user?.tenantId, reset]);

  const handleSave = async () => {
    try {
      const saved = await form.submit(isNew ? null : partnerId);
      toast.success(isNew ? t('partners.detail.created') : t('partners.detail.saved'));
      if (isNew) {
        navigate(`/partners/${saved.id}`, { replace: true });
      } else {
        const fresh = await partnersApi.get(partnerId);
        setPartner(fresh);
        reset(fresh);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('partners.detail.saveFailed'));
    }
  };

  const back = () => navigate('/partners');

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader />
      </div>
    );
  }
  if (!isNew && !partner) {
    return (
      <div className="p-12 text-center text-fg-muted">
        {t('partners.detail.notFound')}
        <div className="mt-4">
          <Button variant="secondary" onClick={back}>
            <ArrowLeft size={14} /> {t('partners.detail.backToList')}
          </Button>
        </div>
      </div>
    );
  }

  // El alta va paso a paso; la ficha de uno existente sigue siendo de tarjetas.
  if (isNew && canWrite)
    return <PartnerCreateWizard form={form} onCreate={handleSave} onCancel={back} />;

  const group = form.lookups.groups.find((g) => g.id === form.data.groupId);
  const disabled = !canWrite;

  return (
    <form
      // pb-24: hueco para que el botón flotante no tape el final de la ficha.
      className="p-4 pb-24 max-md:pb-48 space-y-6 animate-in fade-in duration-500"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <PageHeader
        size="md"
        actions={
          canWrite &&
          !isMobile && (
            <HeaderSaveButton
              isNew={isNew}
              label={isNew ? t('partners.wizard.create') : t('partners.common.save')}
              saving={form.saving}
            />
          )
        }
        breadcrumbs={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={back}
            // En móvil ya está la flecha de volver de la barra superior.
            className="w-fit gap-1 max-md:hidden"
          >
            <ArrowLeft size={12} /> {t('partners.nav.label')}
          </Button>
        }
        title={
          <>
            {form.data.name || (isNew ? t('partners.wizard.newTitle') : partner?.name)}
            {group && (
              <span className="flex flex-wrap items-center gap-2">
                <Badge>{group.name}</Badge>
              </span>
            )}
          </>
        }
        subtitle={
          <span className="font-mono text-xs text-accent font-black uppercase">
            {isNew ? t('partners.detail.codeOnSave') : form.data.code}
          </span>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card title={t('partners.detail.general')} subtitle={t('partners.detail.generalHint')}>
          <PartnerGeneralFields form={form} disabled={disabled} />
        </Card>
        <Card
          title={t('partners.wizard.steps.contact')}
          subtitle={t('partners.wizard.steps.contactHint')}
        >
          <PartnerContactFields form={form} disabled={disabled} />
        </Card>
        <Card
          title={t('partners.wizard.steps.addresses')}
          subtitle={t('partners.detail.addressesHint')}
          className="xl:col-span-2"
          headerAction={
            canWrite &&
            form.addresses.length > 0 && (
              <Button type="button" variant="secondary" size="sm" onClick={form.addAddress}>
                <Plus size={14} /> {t('partners.addresses.new')}
              </Button>
            )
          }
        >
          <PartnerAddressesFields form={form} disabled={disabled} />
        </Card>
        <Card
          title={t('partners.wizard.steps.fiscal')}
          subtitle={t('partners.wizard.steps.fiscalHint')}
        >
          <PartnerFiscalFields form={form} disabled={disabled} />
        </Card>
        <div className="space-y-6">
          <Card title={t('partners.common.customFields')}>
            <PluginFieldsPanel
              tableName="BusinessPartner"
              values={form.pluginValues}
              onChange={form.setPluginValue}
              layout="inline"
              title=""
            />
          </Card>
          {!isNew && (
            <Card title={t('partners.detail.attachments')}>
              <AttachmentsPanel entityType="BusinessPartner" entityId={partnerId} />
            </Card>
          )}
        </div>
        {!isNew && flags.crmEnabled && (
          // Los formularios del CRM viven en modales (portal), pero el submit
          // sintético de React sube por el árbol y llegaría al <form> de la ficha.
          <div className="xl:col-span-2" onSubmit={(e) => e.stopPropagation()}>
            <Card title={t('partners.detail.sales')} subtitle={t('partners.detail.salesHint')}>
              <PartnerCrmPanel partnerId={partnerId} />
            </Card>
          </div>
        )}
      </div>

      {canWrite && (
        <FloatingSaveButton
          isNew={isNew}
          label={isNew ? t('partners.wizard.create') : t('partners.common.save')}
          saving={form.saving}
        />
      )}
    </form>
  );
};

export default PartnerDetail;
