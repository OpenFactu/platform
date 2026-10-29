import React from 'react';
import { PageHeader } from '@openfactu/ui';
import { Contact as ContactIcon } from 'lucide-react';
import { ContactsTable } from '../components/ContactsTable';

export const Contacts: React.FC = () => {
  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Contactos"
        subtitle="Las personas con las que tratas en cada cliente o proveedor"
        icon={<ContactIcon size={18} />}
        size="sm"
      />
      <ContactsTable standalone />
    </div>
  );
};

export default Contacts;
