import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { PageHeader } from '@openfactu/ui';
import { Contact as ContactIcon } from 'lucide-react';
import { ContactsTable } from '../components/ContactsTable';

export const Contacts: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title={t('crm.nav.contacts')}
        subtitle={t('crm.contacts.subtitle')}
        icon={<ContactIcon size={18} />}
        size="sm"
      />
      <ContactsTable standalone />
    </div>
  );
};

export default Contacts;
