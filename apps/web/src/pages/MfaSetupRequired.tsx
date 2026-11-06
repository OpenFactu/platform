import React from 'react';
import { Alert, Button } from '@openfactu/ui';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { useMfaSetup } from '@/shared/auth/useMfaSetup';
import { PasskeysCard } from '@/modules/settings/security/PasskeysCard';
import { TwoFactorSettings } from '@/modules/settings/components/TwoFactorSettings';

/**
 * Pantalla completa (sin el menú del ERP) para una sesión restringida: la empresa exige un
 * segundo factor y el usuario aún no lo tiene. Solo deja darlo de alta o cerrar sesión.
 */
export const MfaSetupRequired: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { check, checking, stillRestricted, logout } = useMfaSetup();

  return (
    <div className="min-h-screen w-full bg-bg-app flex items-start sm:items-center justify-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-lg bg-bg-muted text-fg-default flex items-center justify-center">
            <ShieldCheck size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-fg-default tracking-tight">
              {t('auth.mfaSetup.title')}
            </h1>
            <p className="text-sm text-fg-muted mt-1">
              {user?.tenantName
                ? t('auth.mfaSetup.bodyCompany', { company: user.tenantName })
                : t('auth.mfaSetup.body')}
            </p>
          </div>
        </div>

        <TwoFactorSettings onEnabled={check} />

        {/* Añadir la primera passkey también cumple la exigencia: el servidor levanta la restricción. */}
        <PasskeysCard title={t('auth.mfaSetup.passkeyTitle')} onAdded={check} />

        {stillRestricted && (
          <Alert tone="warning" role="alert">
            {t('auth.mfaSetup.checkError')}
          </Alert>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={logout}
            className="flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> {t('auth.mfaSetup.logout')}
          </Button>
          <Button onClick={check} disabled={checking}>
            {t('auth.mfaSetup.continue')}
          </Button>
        </div>
      </div>
    </div>
  );
};
