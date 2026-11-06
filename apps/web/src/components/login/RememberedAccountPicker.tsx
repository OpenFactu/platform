import React from 'react';
import { Avatar, List, ListItem } from '@openfactu/ui';
import { UserPlus } from 'lucide-react';
import type { RememberedAccount } from './rememberedAccounts';
import { useI18n } from '@/i18n/I18nContext';

/**
 * «Continuar como…»: las cuentas que ya entraron en este navegador. Al elegir
 * una se rellenan usuario y empresa; la contraseña se sigue pidiendo.
 */
export const RememberedAccountPicker: React.FC<{
  accounts: RememberedAccount[];
  onPick: (account: RememberedAccount) => void;
  onOtherAccount: () => void;
}> = ({ accounts, onPick, onOtherAccount }) => {
  const { t } = useI18n();
  return (
    <div>
      <List aria-label={t('app.login.rememberedAccounts')}>
        {accounts.map((a) => (
          <ListItem
            key={`${a.login}|${a.tenantId}`}
            avatar={<Avatar src={a.avatarUrl ?? undefined} name={a.name} size="sm" />}
            title={a.name}
            subtitle={[a.tenantName, a.login !== a.name ? a.login : null]
              .filter(Boolean)
              .join(' · ')}
            onClick={() => onPick(a)}
          />
        ))}
        {/* Otra cuenta es una fila más, no un botón suelto: se elige igual que las demás. */}
        <ListItem
          avatar={
            <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-border-strong text-fg-muted">
              <UserPlus size={15} />
            </span>
          }
          title={t('app.login.useOtherAccount')}
          onClick={onOtherAccount}
        />
      </List>
    </div>
  );
};
