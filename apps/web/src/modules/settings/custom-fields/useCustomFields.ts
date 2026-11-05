import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePopup, useToast } from '@openfactu/ui';
import { coreApi } from '@/shared/api';
import { useAuth } from '@/context/AuthContext';
import { usePlugins } from '@/context/PluginContext';
import { useI18n } from '@/i18n/I18nContext';
import { invalidatePluginFields } from '@/components/plugin-fields';
import { saveBlob } from '@/utils/downloadPdf';
import {
  fieldFormFromRow,
  fieldFormToBody,
  type FieldForm,
  type FieldRow,
  type PackInfo,
  type TableForm,
  type UserTableRow,
} from './fieldForm';

const asArray = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

/** Tablas, campos y packs de la empresa, con todo lo que se puede hacer con ellos. */
export function useCustomFields() {
  const { user } = useAuth();
  const { reloadUserTables } = usePlugins();
  const { t } = useI18n();
  const toast = useToast();
  const popup = usePopup();

  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [allowedTables, setAllowedTables] = useState<string[]>([]);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [tables, setTables] = useState<UserTableRow[]>([]);

  const load = useCallback(async () => {
    const [fieldsRes, allowedRes, packsRes, tablesRes] = await Promise.all([
      coreApi.raw('GET', '/api/custom-fields'),
      coreApi.raw('GET', '/api/custom-fields/allowed-tables'),
      coreApi.raw('GET', '/api/custom-fields/packs'),
      coreApi.raw('GET', '/api/user-tables'),
    ]);
    setFields(asArray<FieldRow>(fieldsRes.data));
    setAllowedTables(asArray<string>(allowedRes.data));
    setPacks(asArray<PackInfo>(packsRes.data));
    setTables(asArray<UserTableRow>(tablesRes.data));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.tenantId) load();
  }, [user?.tenantId, load]);

  const fieldsByTable = useMemo(() => {
    const map = new Map<string, FieldRow[]>();
    for (const field of fields) {
      map.set(field.tableName, [...(map.get(field.tableName) ?? []), field]);
    }
    for (const list of map.values()) list.sort((a, b) => a.displayOrder - b.displayOrder);
    return map;
  }, [fields]);

  /** Tras cambiar campos o tablas, lo que los demás tienen en caché ya no vale. */
  const refresh = async () => {
    invalidatePluginFields();
    await load();
  };

  /** El orden nuevo queda al final de la tabla. */
  const nextOrder = (tableName: string) => {
    const list = fieldsByTable.get(tableName) ?? [];
    return list.length ? list[list.length - 1].displayOrder + 10 : 10;
  };

  const saveField = async (form: FieldForm, isEdit: boolean): Promise<boolean> => {
    const res = await coreApi.raw('POST', '/api/custom-fields', fieldFormToBody(form));
    if (!res.ok) {
      toast.error(res.data?.error || t('settingsFields.saveError'));
      return false;
    }
    toast.success(
      isEdit
        ? t('settingsFields.fieldUpdated')
        : t('settingsFields.fieldCreated', { name: form.label || res.data.fieldName }),
    );
    await refresh();
    return true;
  };

  const removeField = async (row: FieldRow) => {
    const ok = await popup.confirm({
      title: t('settingsFields.deleteFieldTitle'),
      message: t('settingsFields.deleteFieldMessage', { field: row.label, table: row.tableName }),
      tone: 'danger',
      confirmLabel: t('settingsFields.delete'),
    });
    if (!ok) return;
    const res = await coreApi.raw('DELETE', `/api/custom-fields/${row.id}`);
    if (!res.ok) {
      toast.error(res.data?.error || t('settingsFields.deleteError'));
      return;
    }
    toast.success(t('settingsFields.fieldDeleted'));
    await refresh();
  };

  const cloneField = async (row: FieldRow, targetTable: string) => {
    const res = await coreApi.raw('POST', `/api/custom-fields/${row.id}/clone`, { targetTable });
    if (!res.ok) {
      toast.error(res.data?.error || t('settingsFields.cloneError'));
      return;
    }
    toast.success(t('settingsFields.cloned'));
    await refresh();
  };

  /** Guarda el orden nuevo de una tabla: se ve al momento y solo se escribe lo que cambió. */
  const reorderFields = async (tableName: string, next: FieldRow[]) => {
    const ordered = next.map((field, index) => ({ ...field, displayOrder: (index + 1) * 10 }));
    const changed = ordered.filter(
      (field) => field.displayOrder !== fields.find((f) => f.id === field.id)?.displayOrder,
    );
    setFields((prev) => [...prev.filter((f) => f.tableName !== tableName), ...ordered]);
    const results = await Promise.all(
      changed.map((field) =>
        coreApi.raw('POST', '/api/custom-fields', fieldFormToBody(fieldFormFromRow(field))),
      ),
    );
    if (results.some((res) => !res.ok)) {
      toast.error(t('settingsFields.reorderError'));
      await load();
      return;
    }
    invalidatePluginFields();
  };

  /** Devuelve el nombre de la tabla guardada, o `null` si no se pudo. */
  const saveTable = async (form: TableForm, editing: string | null): Promise<string | null> => {
    const res = await coreApi.raw(
      editing ? 'PATCH' : 'POST',
      editing ? `/api/user-tables/${editing}` : '/api/user-tables',
      { ...form, displayField: form.displayField || null },
    );
    if (!res.ok) {
      toast.error(res.data?.error || t('settingsFields.saveTableError'));
      return null;
    }
    toast.success(
      editing
        ? t('settingsFields.tableUpdated')
        : t('settingsFields.tableCreated', { name: form.label || form.name }),
    );
    reloadUserTables();
    await refresh();
    return editing ?? res.data.tableName;
  };

  const removeTable = async (table: UserTableRow): Promise<boolean> => {
    const ok = await popup.confirm({
      title: t('settingsFields.deleteTable'),
      message: t('settingsFields.deleteTableMessage', { name: table.label || table.tableName }),
      tone: 'danger',
      confirmLabel: t('settingsFields.deleteTable'),
    });
    if (!ok) return false;
    const res = await coreApi.raw('DELETE', `/api/user-tables/${table.tableName}`);
    if (!res.ok) {
      toast.error(res.data?.error || t('settingsFields.deleteError'));
      return false;
    }
    toast.success(t('settingsFields.tableDeleted'));
    reloadUserTables();
    await refresh();
    return true;
  };

  const installPack = async (id: string): Promise<boolean> => {
    const res = await coreApi.raw('POST', `/api/custom-fields/packs/${id}/install`);
    if (!res.ok) {
      toast.error(res.data?.error || t('settingsFields.error'));
      return false;
    }
    toast.success(t('settingsFields.packInstalled', { count: res.data.installed }));
    await refresh();
    return true;
  };

  const exportAll = async () => {
    try {
      const { blob } = await coreApi.getBlob('/api/custom-fields/export');
      saveBlob(blob, 'custom-fields.json');
    } catch {
      toast.error(t('settingsFields.exportError'));
    }
  };

  const importFile = async (file: File): Promise<boolean> => {
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      toast.error(t('settingsFields.invalidJson'));
      return false;
    }
    const res = await coreApi.raw('POST', '/api/custom-fields/import', payload);
    if (!res.ok) {
      toast.error(res.data?.error || t('settingsFields.importError'));
      return false;
    }
    toast.success(
      t('settingsFields.imported', { created: res.data.created, skipped: res.data.skipped }),
    );
    await refresh();
    return true;
  };

  return {
    loading,
    fields,
    fieldsByTable,
    allowedTables,
    packs,
    tables,
    nextOrder,
    saveField,
    removeField,
    cloneField,
    reorderFields,
    saveTable,
    removeTable,
    installPack,
    exportAll,
    importFile,
  };
}
