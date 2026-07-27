import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Button, Card, Loader, PageHeader, useToast } from '@openfactu/ui';
import { ArrowLeft, Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { PluginFieldsSection } from '@/components/plugin-fields';

export const UserTableDetail: React.FC = () => {
  const { name, id } = useParams();
  const location = useLocation();
  const isNew = !id || location.pathname.endsWith('/new');
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const toast = useToast();

  const tblName = name?.startsWith('pt_') ? name : `pt_${name}`;

  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  useEffect(() => {
    if (isNew || !id || !user?.tenantId) return;
    setLoading(true);
    coreApi
      .get(`/api/user-tables/${tblName}/rows/${id}`)
      .then((d) => setValues(d || {}))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, id, tblName, user?.tenantId]);

  const setField = (key: string, v: any) => setValues((prev) => ({ ...prev, [key]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const url = isNew
        ? `/api/user-tables/${tblName}/rows`
        : `/api/user-tables/${tblName}/rows/${id}`;
      const res = await coreApi.raw(isNew ? 'POST' : 'PATCH', url, values);
      const data = res.data;
      if (!res.ok) {
        toast.error(data?.error || 'Error al guardar');
        return;
      }
      toast.success(isNew ? 'Registro creado' : 'Cambios guardados');
      openTab(`/u/${name}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={isNew ? 'Nuevo registro' : 'Editar registro'}
        size="sm"
        divider
        className="pb-4"
        breadcrumbs={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openTab(`/u/${name}`)}
            title="Volver"
            className="w-fit"
          >
            <ArrowLeft size={14} />
          </Button>
        }
        actions={
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save size={14} />
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        }
      />

      <Card bodyClassName="p-6">
        <PluginFieldsSection
          tableName={tblName!}
          values={values}
          onChange={setField}
          surface="form"
          header={false}
        />
      </Card>
    </div>
  );
};

export default UserTableDetail;
