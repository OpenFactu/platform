import React, { useEffect, useMemo, useState } from 'react';
import { Input, Modal, Select, useToast } from '@openfactu/ui';
import { partnerGroupsApi, partnersApi } from '@/modules/partners/api';
import type { Partner, PartnerGroup } from '@/modules/partners/domain/partner';

interface Props {
  /** Nombre tecleado en el selector; `null` = cerrado. */
  initialName: string | null;
  onClose: () => void;
  onCreated: (partner: Partner) => void;
}

/**
 * Alta rápida de un cliente sin salir del CRM: lo justo para poder seguir
 * (nombre y, si se tienen, NIF, correo y teléfono). El resto de la ficha se
 * completa luego en Interlocutores.
 *
 * Solo se ofrecen grupos de cliente con prefijo: el código del interlocutor es
 * obligatorio y el servidor solo lo genera a partir de ese prefijo.
 */
export const QuickPartnerModal: React.FC<Props> = ({ initialName, onClose, onCreated }) => {
  const toast = useToast();
  const [groups, setGroups] = useState<PartnerGroup[]>([]);
  const [form, setForm] = useState({ name: '', nif: '', email: '', phone: '', groupId: '' });
  const [saving, setSaving] = useState(false);

  const [seen, setSeen] = useState<string | null>(null);
  if (initialName !== seen) {
    setSeen(initialName);
    if (initialName !== null)
      setForm((f) => ({ ...f, name: initialName, nif: '', email: '', phone: '' }));
  }

  const open = initialName !== null;
  useEffect(() => {
    if (!open) return;
    partnerGroupsApi
      .list()
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [open]);

  const groupOptions = useMemo(
    () =>
      groups
        .filter((g) => g.isCustomer && g.codePrefix)
        .map((g) => ({ value: g.id, label: g.name })),
    [groups],
  );
  const groupId = form.groupId || groupOptions[0]?.value || '';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!groupId) {
      toast.error(
        'No hay ningún grupo de clientes con prefijo de código. Créalo en Interlocutores → Grupos.',
      );
      return;
    }
    setSaving(true);
    try {
      const partner = await partnersApi.create({
        name: form.name.trim(),
        nif: form.nif.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        groupId,
        countryCode: 'ES',
      });
      toast.success(`Cliente ${partner.name} creado`);
      onCreated(partner);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Nuevo cliente"
      subtitle="Lo básico para seguir; el resto de la ficha se completa en Interlocutores"
      size="md"
      onSubmit={save}
      primaryAction={{ label: 'Crear cliente', type: 'submit', isLoading: saving }}
    >
      <div className="space-y-4">
        <Input
          label="Nombre"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          autoFocus
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="NIF"
            value={form.nif}
            onChange={(e) => setForm({ ...form, nif: e.target.value })}
          />
          {groupOptions.length > 1 && (
            <Select
              label="Grupo"
              options={groupOptions}
              value={groupId}
              onChange={(v) => setForm({ ...form, groupId: v })}
            />
          )}
          <Input
            label="Correo"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Teléfono"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
};
