import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { Alert, Button } from '@openfactu/ui';
import { DUPLICATE_REASON_LABEL, type Duplicate, type PartnerLike } from '../domain/partnerChecks';

/**
 * Aviso de interlocutores que ya existen con el mismo NIF, correo o nombre,
 * con un botón por cada uno para usar (o abrir) ese en lugar de duplicarlo.
 */
export function PartnerDuplicatesAlert<P extends PartnerLike>({
  duplicates,
  onUse,
  useLabel,
}: {
  duplicates: Duplicate<P>[];
  onUse: (partner: P) => void;
  useLabel?: string;
}) {
  const { t } = useI18n();
  if (!duplicates.length) return null;
  return (
    <Alert
      tone={duplicates.some((d) => d.reason === 'nif') ? 'danger' : 'warning'}
      title={t('partners.duplicates.title')}
    >
      <ul className="mt-1 space-y-1">
        {duplicates.map(({ partner, reason }) => (
          <li key={partner.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              <strong>{partner.name}</strong>
              {partner.code && <span className="text-fg-muted"> · {partner.code}</span>}
              <span className="text-fg-muted"> — {t(DUPLICATE_REASON_LABEL[reason])}</span>
            </span>
            <Button type="button" size="sm" variant="secondary" onClick={() => onUse(partner)}>
              {useLabel ?? t('partners.duplicates.use')}
            </Button>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
