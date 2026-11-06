import React from 'react';
import { PageHeader } from '@openfactu/ui';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { TwoFactorSettings } from '../components/TwoFactorSettings';
import { AuthHistoryCard } from '../security/AuthHistoryCard';
import { LinkedAccountsCard } from '../security/LinkedAccountsCard';
import { PasskeysCard } from '../security/PasskeysCard';
import { SessionsCard } from '../security/SessionsCard';

/** «Seguridad» de la cuenta: segundo paso y sesiones abiertas. */
export const AccountSecurity: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title={t('auth.security.title')}
        subtitle={t('auth.security.subtitle')}
        icon={<ShieldCheck size={18} />}
        size="lg"
      />
      <TwoFactorSettings />
      <PasskeysCard />
      <LinkedAccountsCard />
      <SessionsCard />
      <AuthHistoryCard />
    </div>
  );
};
