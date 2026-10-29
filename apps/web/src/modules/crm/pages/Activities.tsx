import React, { useState } from 'react';
import { PageHeader, Tabs } from '@openfactu/ui';
import { CalendarClock } from 'lucide-react';
import { ActivityList } from '../components/ActivityList';

type Status = 'pending' | 'done';

export const Activities: React.FC = () => {
  const [status, setStatus] = useState<Status>('pending');
  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Actividades"
        subtitle="Llamadas, reuniones y tareas de seguimiento comercial"
        icon={<CalendarClock size={18} />}
        size="sm"
      />
      <Tabs
        variant="underline"
        value={status}
        onChange={(k) => setStatus(k as Status)}
        items={[
          { key: 'pending', label: 'Pendientes' },
          { key: 'done', label: 'Hechas' },
        ]}
      />
      <ActivityList filter={{ status }} askPartner />
    </div>
  );
};

export default Activities;
