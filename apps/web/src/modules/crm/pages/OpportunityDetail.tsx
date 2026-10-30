import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Loader, PageHeader, useIsMobile, useToast } from '@openfactu/ui';
import { ArrowLeft, FileSignature, UserPlus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { STAGE_KIND_VARIANT } from '../domain/crm';
import { useCrmSettings, useStages } from '../hooks/useCrmData';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { useOpportunityDetail, validateOpportunity } from '../hooks/useOpportunityDetail';
import { OpportunityFields } from '../components/OpportunityFields';
import { OpportunityLinesEditor } from '../components/OpportunityLinesEditor';
import { OpportunityDocuments } from '../components/OpportunityDocuments';
import { ActivityList } from '../components/ActivityList';
import { QuickPartnerModal, type QuickPartnerInitial } from '../components/QuickPartnerModal';
import { FloatingSaveButton, HeaderSaveButton } from '@/components/FloatingSaveButton';

/**
 * Ficha de una oportunidad (/crm/opportunities/:id, o /new; `?partnerId=`
 * preselecciona el cliente). Datos, productos, documentos y actividad.
 */
export const OpportunityDetail: React.FC = () => {
  const { opportunityId = 'new' } = useParams<{ opportunityId: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  // En móvil guardar (y convertir) van en el botón flotante: la cabecera no lleva acciones.
  const isMobile = useIsMobile();
  const fmt = useFormat();
  const { user } = useAuth();
  const { canWrite } = useCrmPermissions('/crm/opportunities');
  const canQuote =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/sales/quotes']?.write;
  const { stages } = useStages();
  const { settings } = useCrmSettings();
  const detail = useOpportunityDetail(opportunityId, {
    partnerId: search.get('partnerId') ?? undefined,
  });
  const { form, isNew } = detail;
  const [converting, setConverting] = useState<QuickPartnerInitial | null>(null);
  const canCreatePartner =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/partners']?.write;
  const isProspect = !isNew && !form.partnerId;

  const back = () => navigate('/crm/opportunities');

  const handleSave = async () => {
    const error = validateOpportunity(
      { ...form, stageId: form.stageId ?? stages.find((s) => s.kind === 'open')?.id },
      stages,
      settings,
    );
    if (error) {
      toast.error(error);
      return;
    }
    try {
      const id = await detail.save();
      toast.success(isNew ? t('crm.detail.created') : t('crm.detail.saved'));
      if (isNew) navigate(`/crm/opportunities/${id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('crm.errors.saveFailed'));
    }
  };

  const handleQuote = async () => {
    try {
      if (detail.linesDirty) await detail.save();
      const quote = await detail.createQuote();
      toast.success(t('crm.detail.quoteCreated', { num: quote.docNum }));
      navigate(`/sales/quotes/${quote.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('crm.detail.quoteFailed'));
    }
  };

  if (detail.loading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader />
      </div>
    );
  }
  if (detail.notFound) {
    return (
      <div className="p-12 text-center text-fg-muted">
        {t('crm.detail.notFound')}
        <div className="mt-4">
          <Button variant="secondary" onClick={back}>
            <ArrowLeft size={14} /> {t('crm.detail.backToList')}
          </Button>
        </div>
      </div>
    );
  }

  const stage = stages.find((s) => s.id === form.stageId);
  const hasItemLines = detail.lines.some((l) => l.itemId);
  // Ganada o perdida: lo vendido es lo del presupuesto y los productos ya no se tocan.
  const linesLocked = !isNew && !!stage && stage.kind !== 'open';

  const canConvert = isProspect && canWrite && canCreatePartner;
  const convert = () =>
    setConverting({
      name: form.prospectCompany || form.prospectName || '',
      email: form.prospectEmail,
      phone: form.prospectPhone,
    });

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
        breadcrumbs={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={back}
            // En móvil ya está la flecha de volver de la barra superior.
            className="w-fit gap-1 max-md:hidden"
          >
            <ArrowLeft size={12} /> {t('crm.nav.opportunities')}
          </Button>
        }
        title={
          <>
            {form.title || (isNew ? t('crm.opportunity.new') : '')}
            {(stage || isProspect) && (
              <span className="flex flex-wrap items-center gap-2">
                {stage && <Badge variant={STAGE_KIND_VARIANT[stage.kind]}>{stage.name}</Badge>}
                {isProspect && <Badge variant="warning">{t('crm.board.prospect')}</Badge>}
              </span>
            )}
          </>
        }
        subtitle={
          !isNew && (
            <span className="text-sm text-fg-muted">
              {form.partnerName} · {fmt.money(form.amount)}
            </span>
          )
        }
        actions={
          !isMobile && (
            <>
              {canConvert && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={convert}
                  // En móvil va dentro del botón flotante.
                  className="max-md:hidden"
                >
                  <UserPlus size={14} /> {t('crm.detail.convert')}
                </Button>
              )}
              {canWrite && (
                <HeaderSaveButton
                  isNew={isNew}
                  label={isNew ? t('crm.detail.create') : t('crm.common.save')}
                  saving={detail.saving}
                />
              )}
            </>
          )
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card title={t('crm.detail.data')}>
          <OpportunityFields
            form={form}
            set={detail.set}
            stages={stages}
            settings={settings}
            // Abierta: el importe sale de los productos. Ganada: es el del presupuesto aceptado.
            amountFromLines={detail.lines.length > 0 && stage?.kind === 'open'}
            amountHint={stage?.kind === 'won' ? t('crm.detail.amountFromQuote') : undefined}
            disabled={!canWrite}
          />
        </Card>
        <div className="space-y-6">
          <Card
            title={t('crm.detail.documents')}
            subtitle={t('crm.detail.documentsHint')}
            headerAction={
              !isNew &&
              canQuote &&
              stage?.kind === 'open' && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleQuote}
                  disabled={!hasItemLines || detail.saving}
                  title={hasItemLines ? undefined : t('crm.detail.addItemLines')}
                >
                  <FileSignature size={14} /> {t('crm.detail.createQuote')}
                </Button>
              )
            }
          >
            {isNew ? (
              <p className="text-sm text-fg-muted">{t('crm.detail.saveToQuote')}</p>
            ) : (
              <OpportunityDocuments documents={detail.documents} />
            )}
          </Card>
          {!isNew && (
            // Los formularios de actividad viven en modales (portal) y su submit
            // sintético subiría hasta el <form> de la ficha.
            <div onSubmit={(e) => e.stopPropagation()}>
              <Card title={t('crm.detail.activity')}>
                <ActivityList
                  filter={{ opportunityId }}
                  defaults={{ opportunityId, partnerId: form.partnerId }}
                  compact
                />
              </Card>
            </div>
          )}
        </div>
        <Card
          title={t('crm.detail.products')}
          subtitle={linesLocked ? t('crm.detail.linesLocked') : t('crm.detail.linesHint')}
          className="xl:col-span-2"
        >
          <OpportunityLinesEditor
            lines={detail.lines}
            onAdd={detail.addLine}
            onChange={detail.updateLine}
            onRemove={detail.removeLine}
            disabled={!canWrite || linesLocked}
          />
        </Card>
      </div>

      {/* Modal en portal: su submit no debe llegar al <form> de la ficha. */}
      <div onSubmit={(e) => e.stopPropagation()}>
        <QuickPartnerModal
          initial={converting}
          title={t('crm.detail.convert')}
          onClose={() => setConverting(null)}
          onCreated={async (partner) => {
            try {
              await detail.convertToClient(partner.id);
              toast.success(t('crm.detail.converted'));
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t('crm.detail.convertFailed'));
            }
          }}
        />
      </div>

      {canWrite && (
        <FloatingSaveButton
          isNew={isNew}
          label={isNew ? t('crm.detail.create') : t('crm.common.save')}
          saving={detail.saving}
          actions={
            canConvert
              ? [
                  {
                    id: 'convert',
                    label: t('crm.detail.convert'),
                    icon: <UserPlus size={18} />,
                    onClick: convert,
                  },
                ]
              : undefined
          }
        />
      )}
    </form>
  );
};

export default OpportunityDetail;
