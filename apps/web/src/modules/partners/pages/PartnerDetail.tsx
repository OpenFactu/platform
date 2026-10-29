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

/**
 * Ficha completa de un interlocutor (/partners/:partnerId, o /partners/new
 * para el alta). Sustituye al modal con pestañas: secciones apiladas en
 * tarjetas, como la ficha de artículo.
 */
export const PartnerDetail: React.FC = () => {
  const { partnerId = 'new' } = useParams<{ partnerId: string }>();
  const isNew = partnerId === 'new';
  const navigate = useNavigate();
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
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'No se pudo cargar');
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
      toast.success(isNew ? 'Interlocutor creado' : 'Interlocutor guardado');
      if (isNew) {
        navigate(`/partners/${saved.id}`, { replace: true });
      } else {
        const fresh = await partnersApi.get(partnerId);
        setPartner(fresh);
        reset(fresh);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
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
        Interlocutor no encontrado.
        <div className="mt-4">
          <Button variant="secondary" onClick={back}>
            <ArrowLeft size={14} /> Volver a interlocutores
          </Button>
        </div>
      </div>
    );
  }

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
              label={isNew ? 'Crear interlocutor' : 'Guardar'}
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
            <ArrowLeft size={12} /> Interlocutores
          </Button>
        }
        title={
          <>
            {form.data.name || (isNew ? 'Nuevo interlocutor' : partner?.name)}
            {group && (
              <span className="flex flex-wrap items-center gap-2">
                <Badge>{group.name}</Badge>
              </span>
            )}
          </>
        }
        subtitle={
          <span className="font-mono text-xs text-accent font-black uppercase">
            {isNew ? 'El código se asigna al guardar' : form.data.code}
          </span>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card title="General" subtitle="Identificación, grupo, país y tarifa.">
          <PartnerGeneralFields form={form} disabled={disabled} />
        </Card>
        <Card title="Contacto" subtitle="Teléfono, correo y web de la empresa.">
          <PartnerContactFields form={form} disabled={disabled} />
        </Card>
        <Card
          title="Direcciones"
          subtitle="Facturación y envío. Una por defecto de cada tipo."
          className="xl:col-span-2"
          headerAction={
            canWrite &&
            form.addresses.length > 0 && (
              <Button type="button" variant="secondary" size="sm" onClick={form.addAddress}>
                <Plus size={14} /> Nueva dirección
              </Button>
            )
          }
        >
          <PartnerAddressesFields form={form} disabled={disabled} />
        </Card>
        <Card title="Fiscal y banco" subtitle="Valores por defecto al facturar y cuenta bancaria.">
          <PartnerFiscalFields form={form} disabled={disabled} />
        </Card>
        <div className="space-y-6">
          <Card title="Campos personalizados">
            <PluginFieldsPanel
              tableName="BusinessPartner"
              values={form.pluginValues}
              onChange={form.setPluginValue}
              layout="inline"
              title=""
            />
          </Card>
          {!isNew && (
            <Card title="Adjuntos">
              <AttachmentsPanel entityType="BusinessPartner" entityId={partnerId} />
            </Card>
          )}
        </div>
        {!isNew && flags.crmEnabled && (
          // Los formularios del CRM viven en modales (portal), pero el submit
          // sintético de React sube por el árbol y llegaría al <form> de la ficha.
          <div className="xl:col-span-2" onSubmit={(e) => e.stopPropagation()}>
            <Card
              title="Comercial"
              subtitle="Contactos, oportunidades y actividad con este interlocutor."
            >
              <PartnerCrmPanel partnerId={partnerId} />
            </Card>
          </div>
        )}
      </div>

      {canWrite && (
        <FloatingSaveButton
          isNew={isNew}
          label={isNew ? 'Crear interlocutor' : 'Guardar'}
          saving={form.saving}
        />
      )}
    </form>
  );
};

export default PartnerDetail;
