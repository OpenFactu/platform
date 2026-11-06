/** Un botón por proveedor de acceso único que ofrece el servidor. */
import React from 'react';
import { Alert, Button } from '@openfactu/ui';
import { ProviderLogo } from '@/components/login/ProviderLogo';
import { useI18n } from '@/i18n/I18nContext';
import type { LoginMethods } from './loginApi';

interface Props {
  providers: LoginMethods['sso'];
  busyId: string | null;
  disabled?: boolean;
  error?: string;
  onStart: (provider: LoginMethods['sso'][number]) => void;
}

export const LoginSsoButtons: React.FC<Props> = ({
  providers,
  busyId,
  disabled,
  error,
  onStart,
}) => {
  const { t } = useI18n();
  if (providers.length === 0) return null;
  return (
    <div className="space-y-3">
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      {providers.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="secondary"
          size="lg"
          className="w-full min-w-0 gap-2"
          isLoading={busyId === p.id}
          disabled={disabled || busyId !== null}
          onClick={() => onStart(p)}
        >
          {busyId !== p.id && <ProviderLogo kind={p.kind} />}
          <span className="truncate">{t('auth.sso.continueWith', { provider: p.name })}</span>
        </Button>
      ))}
    </div>
  );
};
