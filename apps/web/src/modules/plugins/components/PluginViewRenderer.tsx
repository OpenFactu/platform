import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Table, Card, PageHeader } from '@openfactu/ui';
import { PluginComponentLoader } from '@/components/plugins/PluginComponentLoader';

interface PluginViewRendererProps {
  pluginId: string;
  type: string;
  config: any;
  title: string;
}

export const PluginViewRenderer: React.FC<PluginViewRendererProps> = ({
  pluginId,
  type,
  config,
  title,
}) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (config.endpoint) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const result = await coreApi.get(config.endpoint);
          // Algunos endpoints de plugins devuelven un objeto, lo envolvemos en array si es necesario
          setData(Array.isArray(result) ? result : [result]);
        } catch (err) {
          console.error('Error fetching plugin view data', err);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [config.endpoint]);

  if (type === 'table') {
    return (
      <div className="p-8 space-y-6">
        <PageHeader title={title} size="md" />
        <Card>
          <Table columns={config.columns} data={data} isLoading={loading} />
        </Card>
      </div>
    );
  }

  if (type === 'custom') {
    return (
      <div className="p-8 space-y-6">
        <PageHeader title={title} size="md" />
        <PluginComponentLoader
          pluginId={pluginId}
          componentPath={config.component}
          props={config.props}
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <Card title="Error de Renderizado">
        <p className="text-rose-500">El tipo de vista"{type}"no es compatible actualmente.</p>
      </Card>
    </div>
  );
};
