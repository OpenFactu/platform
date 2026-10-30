import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Table, Card, PageHeader } from '@openfactu/ui';
import { PluginComponentLoader } from '@/components/plugins/PluginComponentLoader';
import { useI18n } from '@/i18n/I18nContext';

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
  const { t } = useI18n();
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
          <Table responsive="scroll" columns={config.columns} data={data} isLoading={loading} />
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
      <Card title={t('plugins.view.renderError')}>
        <p className="text-rose-500">{t('plugins.view.unsupportedType', { type })}</p>
      </Card>
    </div>
  );
};
