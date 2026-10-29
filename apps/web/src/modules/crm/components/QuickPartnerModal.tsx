import React from 'react';
import { Alert, Button, Input, Modal, Select, useToast } from '@openfactu/ui';
import { CountrySelect } from '@/components/geo/CountrySelect';
import type { Partner } from '@/modules/partners/domain/partner';
import { useQuickPartnerForm, type QuickPartnerInitial } from '../hooks/useQuickPartnerForm';

export type { QuickPartnerInitial };

interface Props {
  /** Datos con los que se abre (lo tecleado, o el prospecto); `null` = cerrado. */
  initial: QuickPartnerInitial | null;
  title?: string;
  onClose: () => void;
  /** El cliente creado, o uno que ya existía y se eligió en lugar de duplicarlo. */
  onCreated: (partner: Partner) => void;
}

const REASON = { nif: 'el mismo NIF', email: 'el mismo correo', name: 'el mismo nombre' } as const;

/**
 * Alta rápida de un cliente sin salir del CRM: lo justo para poder seguir
 * (nombre y, si se tienen, país, NIF, correo y teléfono), validado campo a
 * campo. Si ya hay un cliente con el mismo NIF, correo o nombre, lo avisa y
 * deja usar ese en lugar de crear un duplicado. El resto de la ficha se
 * completa luego en Interlocutores.
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
  const { draft, errors, country } = f;

  const finish = (partner: Partner, existed: boolean) => {
    toast.success(existed ? `Usando el cliente ${partner.name}` : `Cliente ${partner.name} creado`);
    onCreated(partner);
    onClose();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
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
      onSubmit={save}
      primaryAction={{ label: 'Crear cliente', type: 'submit', isLoading: f.saving }}
      error={f.serverError ?? errors.groupId}
    >
      <div className="space-y-4">
        {f.duplicates.length > 0 && (
          <Alert
            tone={f.duplicates.some((d) => d.reason === 'nif') ? 'danger' : 'warning'}
            title="Puede que este cliente ya exista"
          >
            <ul className="mt-1 space-y-1">
              {f.duplicates.map(({ partner, reason }) => (
                <li key={partner.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <strong>{partner.name}</strong>
                    {partner.code && <span className="text-fg-muted"> · {partner.code}</span>}
                    <span className="text-fg-muted"> — {REASON[reason]}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => finish(partner, true)}
                  >
                    Usar este
                  </Button>
                </li>
              ))}
            </ul>
          </Alert>
        )}

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
                  <span className="ml-2 font-normal text-fg-subtle">
                    ej.: {country.taxIdExample}
                  </span>
                )}
              </>
            }
            value={draft.nif}
            onChange={(e) => f.set({ nif: e.target.value.toUpperCase() })}
            onBlur={() => f.blur('nif')}
            error={errors.nif}
            status={draft.nif && !errors.nif && !f.duplicates.length ? 'success' : 'default'}
            autoComplete="off"
          />
          <Input
            label="Correo"
            type="email"
            inputMode="email"
            value={draft.email}
            onChange={(e) => f.set({ email: e.target.value })}
            onBlur={() => f.blur('email')}
            error={errors.email}
            autoComplete="email"
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
    </Modal>
  );
};
