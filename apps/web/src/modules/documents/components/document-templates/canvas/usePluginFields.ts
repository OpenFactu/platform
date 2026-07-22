import { crudApi } from '@/shared/api';
import { useEffect, useState } from 'react';
import type { FieldDef, FieldGroup } from './fieldRegistry';

/** Tabla maestra del documento por docType (la que guarda la cabecera). */
const DOC_TABLE: Record<string, string> = {
  SINV: 'SalesInvoice',
  PINV: 'PurchaseInvoice',
  SDN: 'SalesDeliveryNote',
  PDN: 'PurchaseDeliveryNote',
  SO: 'SalesOrder',
  PO: 'PurchaseOrder',
};

/** Tabla de líneas correspondiente. */
const LINE_TABLE: Record<string, string> = {
  SINV: 'SalesInvoiceLine',
  PINV: 'PurchaseInvoiceLine',
  SDN: 'SalesDeliveryNoteLine',
  PDN: 'PurchaseDeliveryNoteLine',
  SO: 'SalesOrderLine',
  PO: 'PurchaseOrderLine',
};

interface PluginFieldRow {
  id: string;
  pluginId: string;
  tableName: string;
  fieldName: string;
  fieldType: 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'JSONB';
  label: string;
}

function mapType(t: PluginFieldRow['fieldType']): FieldDef['type'] {
  switch (t) {
    case 'INTEGER':
    case 'DECIMAL':
      return 'number';
    case 'BOOLEAN':
      return 'boolean';
    case 'JSONB':
      return 'object';
    default:
      return 'string';
  }
}

/**
 * Descarga los campos registrados por plugins activos y los convierte en
 * FieldDefs adicionales para el FieldPicker:
 *
 * - Campos sobre la tabla de cabecera del docType actual se agrupan bajo
 *   "Plugins" como `doc.pluginData.<fieldName>`.
 * - Campos sobre la tabla de líneas del docType actual se añaden al grupo
 *   `lines` existente como `pluginData.<fieldName>` (path relativo a la
 *   iteración `{{#each lines}}`).
 */
export function usePluginFields(
  docType: string | undefined,
  headers: Record<string, string>,
): { pluginGroup: FieldGroup | null; linePluginFields: FieldDef[] } {
  const [pluginGroup, setPluginGroup] = useState<FieldGroup | null>(null);
  const [linePluginFields, setLinePluginFields] = useState<FieldDef[]>([]);

  useEffect(() => {
    if (!docType) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await crudApi.list<PluginFieldRow>('/api/plugins/fields');
        if (cancelled) return;

        const headerTable = DOC_TABLE[docType];
        const lineTable = LINE_TABLE[docType];

        const headerDefs: FieldDef[] = rows
          .filter((r) => r.tableName === headerTable)
          .map((r) => ({
            path: `doc.pluginData.${r.fieldName}`,
            type: mapType(r.fieldType),
            description: `${r.label} — plugin ${r.pluginId}`,
          }));

        const lineDefs: FieldDef[] = rows
          .filter((r) => r.tableName === lineTable)
          .map((r) => ({
            path: `pluginData.${r.fieldName}`,
            type: mapType(r.fieldType),
            description: `${r.label} — plugin ${r.pluginId}`,
          }));

        setPluginGroup(
          headerDefs.length > 0
            ? {
                group: 'doc' as const,
                label: 'Plugins',
                icon: 'FileText',
                fields: headerDefs,
              }
            : null,
        );
        setLinePluginFields(lineDefs);
      } catch {
        /* silencio: el FieldPicker sigue funcionando sin plugin fields */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);

  return { pluginGroup, linePluginFields };
}
