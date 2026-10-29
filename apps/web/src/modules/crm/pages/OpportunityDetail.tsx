import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Loader, PageHeader, useToast } from '@openfactu/ui';
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
import { FloatingSaveButton } from '@/components/FloatingSaveButton';

/**
 * Ficha de una oportunidad (/crm/opportunities/:id, o /new; `?partnerId=`
 * preselecciona el cliente). Datos, productos, documentos y actividad.
 */
export const OpportunityDetail: React.FC = () => {
  const { opportunityId = 'new' } = useParams<{ opportunityId: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
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
      toast.success(isNew ? 'Oportunidad creada' : 'Oportunidad guardada');
      if (isNew) navigate(`/crm/opportunities/${id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  const handleQuote = async () => {
    try {
      if (detail.linesDirty) await detail.save();
      const quote = await detail.createQuote();
      toast.success(`Presupuesto ${quote.docNum} creado`);
      navigate(`/sales/quotes/${quote.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el presupuesto');
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
        Oportunidad no encontrada.
        <div className="mt-4">
          <Button variant="secondary" onClick={back}>
            <ArrowLeft size={14} /> Volver a oportunidades
          </Button>
        </div>
      </div>
    );
  }

  const stage = stages.find((s) => s.id === form.stageId);
  const hasItemLines = detail.lines.some((l) => l.itemId);

  return (
    <form
      // pb-24: hueco para que el botón flotante no tape el final de la ficha.
      className="p-4 pb-24 max-md:pb-36 space-y-6 animate-in fade-in duration-500"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <PageHeader
        size="md"
        breadcrumbs={
          <Button type="button" variant="ghost" size="sm" onClick={back} className="w-fit gap-1">
            <ArrowLeft size={12} /> Oportunidades
          </Button>
        }
        title={
          <>
            {form.title || (isNew ? 'Nueva oportunidad' : '')}
            {(stage || isProspect) && (
              <span className="flex flex-wrap items-center gap-2">
                {stage && <Badge variant={STAGE_KIND_VARIANT[stage.kind]}>{stage.name}</Badge>}
                {isProspect && <Badge variant="warning">Prospecto</Badge>}
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
          isProspect &&
          canWrite &&
          canCreatePartner && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setConverting({
                  name: form.prospectCompany || form.prospectName || '',
                  email: form.prospectEmail,
                  phone: form.prospectPhone,
                })
              }
            >
              <UserPlus size={14} /> Convertir en cliente
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card title="Datos">
          <OpportunityFields
            form={form}
            set={detail.set}
            stages={stages}
            settings={settings}
            amountFromLines={detail.lines.length > 0}
            disabled={!canWrite}
          />
        </Card>
        <div className="space-y-6">
          <Card
            title="Documentos"
            subtitle="Presupuestos, pedidos y facturas de esta oportunidad."
            headerAction={
              !isNew &&
              canQuote && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleQuote}
                  disabled={!hasItemLines || detail.saving}
                  title={hasItemLines ? undefined : 'Añade productos con artículo'}
                >
                  <FileSignature size={14} /> Crear presupuesto
                </Button>
              )
            }
          >
            {isNew ? (
              <p className="text-sm text-fg-muted">Guarda la oportunidad para presupuestarla.</p>
            ) : (
              <OpportunityDocuments documents={detail.documents} />
            )}
          </Card>
          {!isNew && (
            // Los formularios de actividad viven en modales (portal) y su submit
            // sintético subiría hasta el <form> de la ficha.
            <div onSubmit={(e) => e.stopPropagation()}>
              <Card title="Actividad">
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
          title="Productos de interés"
          subtitle="El precio sale de la tarifa del cliente. El importe de la oportunidad es su suma."
          className="xl:col-span-2"
          noPadding
        >
          <OpportunityLinesEditor
            lines={detail.lines}
            onAdd={detail.addLine}
            onChange={detail.updateLine}
            onRemove={detail.removeLine}
            disabled={!canWrite}
          />
        </Card>
      </div>

      {/* Modal en portal: su submit no debe llegar al <form> de la ficha. */}
      <div onSubmit={(e) => e.stopPropagation()}>
        <QuickPartnerModal
          initial={converting}
          title="Convertir en cliente"
          onClose={() => setConverting(null)}
          onCreated={async (partner) => {
            try {
              await detail.convertToClient(partner.id);
              toast.success('El prospecto ya es cliente');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'No se pudo enlazar el cliente');
            }
          }}
        />
      </div>

      {canWrite && (
        <FloatingSaveButton
          isNew={isNew}
          label={isNew ? 'Crear oportunidad' : 'Guardar'}
          saving={detail.saving}
        />
      )}
    </form>
  );
};

export default OpportunityDetail;
