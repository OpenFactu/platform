import React, { useState } from 'react';
import { PageHeader, Switch, Tabs } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { CalendarClock } from 'lucide-react';
import { ActivityList } from '../components/ActivityList';

type Status = 'pending' | 'done';

export const Activities: React.FC = () => {
  const [status, setStatus] = useState<Status>('pending');
  const [onlyMine, setOnlyMine] = useState(true);
  const { user } = useAuth();
  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Actividades"
        subtitle="Llamadas, reuniones y tareas de seguimiento comercial"
        icon={<CalendarClock size={18} />}
        size="sm"
      />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <Tabs
          variant="underline"
          value={status}
          onChange={(k) => setStatus(k as Status)}
          items={[
            { key: 'pending', label: 'Pendientes' },
            { key: 'done', label: 'Hechas' },
          ]}
        />
        <Switch label="Solo las mías" checked={onlyMine} onChange={setOnlyMine} />
      </div>
      <ActivityList filter={{ status, ownerUserId: onlyMine ? user?.id : undefined }} askPartner />
    </div>
  );
};

export default Activities;
