import React from 'react';
import { DescriptionList, Input, Modal, Select, useToast } from '@openfactu/ui';
import { ArrowLeft, ArrowRight, UserPlus } from 'lucide-react';
import { CountrySelect } from '@/components/geo/CountrySelect';
import type { Partner } from '@/modules/partners/domain/partner';
import { PartnerDuplicatesAlert } from '@/modules/partners/components/PartnerDuplicatesAlert';
import {
  QUICK_PARTNER_STEPS,
  useQuickPartnerForm,
  type QuickPartnerInitial,
} from '../hooks/useQuickPartnerForm';

export type { QuickPartnerInitial };

interface Props {
  /** Datos con los que se abre (lo tecleado, o el prospecto); `null` = cerrado. */
  initial: QuickPartnerInitial | null;
  title?: string;
  onClose: () => void;
  /** El cliente creado, o uno que ya existía y se eligió en lugar de duplicarlo. */
  onCreated: (partner: Partner) => void;
}

type Form = ReturnType<typeof useQuickPartnerForm>;

const CompanyStep: React.FC<{ f: Form }> = ({ f }) => {
  const { draft, errors, country } = f;
  return (
    <div className="space-y-4">
      <Input
        label="Nombre o razón social"
        value={draft.name}
        onChange={(e) => f.set({ name: e.target.value })}
        onBlur={() => f.blur('name')}
        error={errors.name}
        required
        autoFocus
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CountrySelect
          label="País"
          value={draft.countryCode}
          onChange={(countryCode) => f.set({ countryCode })}
        />
        <Input
          label={
            <>
              {country?.taxIdLabel || 'NIF'}
              {country?.taxIdExample && (
                <span className="ml-2 font-normal text-fg-subtle">ej.: {country.taxIdExample}</span>
              )}
            </>
          }
          value={draft.nif}
          onChange={(e) => f.set({ nif: e.target.value.toUpperCase() })}
          onBlur={() => f.blur('nif')}
          error={errors.nif}
          status={draft.nif && !errors.nif && !f.duplicates.length ? 'success' : 'default'}
          helperText="Opcional ahora; hace falta para facturarle."
          autoComplete="off"
        />
        {f.groupOptions.length > 1 && (
          <Select
            label="Grupo"
            options={f.groupOptions}
            value={draft.groupId}
            onChange={(groupId) => f.set({ groupId })}
          />
        )}
      </div>
    </div>
  );
};

const ContactStep: React.FC<{ f: Form }> = ({ f }) => {
  const { draft, errors, country } = f;
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Opcional: si los tienes, el correo sirve para mandarle presupuestos y facturas.
      </p>
      <Input
        label="Correo"
        type="email"
        inputMode="email"
        value={draft.email}
        onChange={(e) => f.set({ email: e.target.value })}
        onBlur={() => f.blur('email')}
        error={errors.email}
        autoComplete="email"
        autoFocus
      />
      <Input
        label="Teléfono"
        type="tel"
        inputMode="tel"
        prefix={country?.phonePrefix || undefined}
        value={draft.phone}
        onChange={(e) => f.set({ phone: e.target.value })}
        onBlur={() => f.blur('phone')}
        error={errors.phone}
        autoComplete="tel"
      />
    </div>
  );
};

const ReviewStep: React.FC<{ f: Form }> = ({ f }) => {
  const { draft, country } = f;
  const group = f.groupOptions.find((g) => g.value === draft.groupId);
  return (
    <div className="space-y-4">
      <DescriptionList
        variant="surface"
        columns={2}
        items={[
          { key: 'name', label: 'Nombre', value: draft.name.trim(), fullWidth: true },
          { key: 'country', label: 'País', value: country?.name ?? draft.countryCode },
          { key: 'nif', label: country?.taxIdLabel || 'NIF', value: draft.nif || null, mono: true },
          { key: 'email', label: 'Correo', value: draft.email || null },
          {
            key: 'phone',
            label: 'Teléfono',
            value: draft.phone ? `${country?.phonePrefix ?? ''} ${draft.phone}`.trim() : null,
          },
          ...(group ? [{ key: 'group', label: 'Grupo', value: group.label }] : []),
        ]}
        emptyValue={<span className="text-fg-subtle">—</span>}
      />
      <p className="text-xs text-fg-muted">
        Dirección, forma de pago y el resto de la ficha se completan luego en Interlocutores.
      </p>
    </div>
  );
};

/**
 * Alta rápida de un cliente sin salir del CRM, como asistente de tres pasos:
 * empresa (nombre, país y NIF), contacto (correo y teléfono) y revisión.
 * Cada paso se valida antes de seguir y, si ya hay un cliente con el mismo
 * NIF, correo o nombre, lo avisa y deja usar ese en lugar de duplicarlo.
 *
 * Solo se ofrecen grupos de cliente con prefijo: el código del interlocutor es
 * obligatorio y el servidor solo lo genera a partir de ese prefijo.
 */
export const QuickPartnerModal: React.FC<Props> = ({
  initial,
  title = 'Nuevo cliente',
  onClose,
  onCreated,
}) => {
  const toast = useToast();
  const f = useQuickPartnerForm(initial);

  const finish = (partner: Partner, existed: boolean) => {
    toast.success(existed ? `Usando el cliente ${partner.name}` : `Cliente ${partner.name} creado`);
    onCreated(partner);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.isLast) {
      f.next();
      return;
    }
    const partner = await f.create();
    if (partner) finish(partner, false);
  };

  return (
    <Modal
      isOpen={initial !== null}
      onClose={onClose}
      title={title}
      subtitle="Lo básico para seguir; el resto de la ficha se completa en Interlocutores"
      size="md"
      steps={QUICK_PARTNER_STEPS.map(({ key, label }, i) => ({
        key,
        label,
        optional: i === 1,
      }))}
      currentStep={f.step}
      onStepChange={f.goTo}
      onSubmit={submit}
      primaryAction={
        f.isLast
          ? {
              label: 'Crear cliente',
              type: 'submit',
              icon: <UserPlus size={14} />,
              isLoading: f.saving,
            }
          : { label: 'Siguiente', type: 'submit', icon: <ArrowRight size={14} /> }
      }
      secondaryAction={
        f.step > 0
          ? { label: 'Atrás', variant: 'secondary', icon: <ArrowLeft size={14} />, onClick: f.back }
          : undefined
      }
      error={f.serverError ?? f.errors.groupId}
    >
      <div className="space-y-4">
        <PartnerDuplicatesAlert duplicates={f.duplicates} onUse={(p) => finish(p, true)} />
        {f.step === 0 && <CompanyStep f={f} />}
        {f.step === 1 && <ContactStep f={f} />}
        {f.step === 2 && <ReviewStep f={f} />}
      </div>
    </Modal>
  );
};
