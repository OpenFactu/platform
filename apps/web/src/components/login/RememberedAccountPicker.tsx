import React from 'react';
import { Avatar, Button, List, ListItem } from '@openfactu/ui';
import { UserPlus, X } from 'lucide-react';
import type { RememberedAccount } from './rememberedAccounts';
import { useI18n } from '@/i18n/I18nContext';

/**
 * «Continuar como…»: las cuentas que ya entraron en este navegador. Al elegir
 * una se rellenan usuario y empresa; la contraseña se sigue pidiendo.
 */
export const RememberedAccountPicker: React.FC<{
  accounts: RememberedAccount[];
  onPick: (account: RememberedAccount) => void;
  onForget: (account: RememberedAccount) => void;
  onOtherAccount: () => void;
}> = ({ accounts, onPick, onForget, onOtherAccount }) => {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      {/* ListItem enseña sus acciones solo al pasar el ratón; en pantallas
        táctiles la X de «olvidar» sería invisible, así que allí siempre se ve. */}
      <List
        aria-label={t('app.login.rememberedAccounts')}
        className="[@media(hover:none)]:[&_.opacity-0]:opacity-100"
      >
        {accounts.map((a) => (
          <ListItem
            key={`${a.login}|${a.tenantId}`}
            avatar={<Avatar src={a.avatarUrl ?? undefined} name={a.name} size="sm" />}
            title={a.name}
            subtitle={[a.tenantName, a.login !== a.name ? a.login : null]
              .filter(Boolean)
              .join(' · ')}
            onClick={() => onPick(a)}
            actions={[
              {
                key: 'forget',
                icon: <X size={14} />,
                label: t('app.login.forgetAccount', { name: a.name }),
                onClick: (e) => {
                  e.stopPropagation();
                  onForget(a);
                },
              },
            ]}
          />
        ))}
      </List>
      <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={onOtherAccount}>
        <UserPlus size={14} /> {t('app.login.useOtherAccount')}
      </Button>
    </div>
  );
};
