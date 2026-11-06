import { crudApi } from '@/shared/api';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import { isUserDocType } from '../constants';
import type { FieldDef, FieldGroup } from './fieldRegistry';

/** Tabla maestra del documento por docType (la que guarda la cabecera). */
const DOC_TABLE: Record<string, string> = {
  SINV: 'SalesInvoice',
  PINV: 'PurchaseInvoice',
  SDN: 'SalesDeliveryNote',
  PDN: 'PurchaseDeliveryNote',
  SO: 'SalesOrder',
  PO: 'PurchaseOrder',
  SQ: 'SalesQuote',
};

/** Tabla de líneas correspondiente. */
const LINE_TABLE: Record<string, string> = {
  SINV: 'SalesInvoiceLine',
  PINV: 'PurchaseInvoiceLine',
  SDN: 'SalesDeliveryNoteLine',
  PDN: 'PurchaseDeliveryNoteLine',
  SO: 'SalesOrderLine',
  PO: 'PurchaseOrderLine',
  SQ: 'SalesQuoteLine',
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
 * - En una tabla propia de tipo documento, sus campos como `doc.fields.<fieldName>`.
 */
export function usePluginFields(
  docType: string | undefined,
  headers: Record<string, string>,
): { pluginGroup: FieldGroup | null; linePluginFields: FieldDef[] } {
  const [pluginGroup, setPluginGroup] = useState<FieldGroup | null>(null);
  const [linePluginFields, setLinePluginFields] = useState<FieldDef[]>([]);
  const { t } = useI18n();

  useEffect(() => {
    if (!docType) return;
    let cancelled = false;
    (async () => {
      try {
        // El listado general solo trae los de plugins activos; los de una tabla propia
        // se piden por su nombre.
        const isUserDoc = isUserDocType(docType);
        const rows = await crudApi.list<PluginFieldRow>(
          isUserDoc ? `/api/plugins/fields/${docType}` : '/api/plugins/fields',
        );
        if (cancelled) return;

        const headerTable = isUserDoc ? docType : DOC_TABLE[docType];
        const lineTable = LINE_TABLE[docType];

        const headerDefs: FieldDef[] = rows
          .filter((r) => r.tableName === headerTable)
          .map((r) => ({
            path: isUserDoc ? `doc.fields.${r.fieldName}` : `doc.pluginData.${r.fieldName}`,
            type: isUserDoc ? 'string' : mapType(r.fieldType),
            description: isUserDoc ? r.label : `${r.label} — plugin ${r.pluginId}`,
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
                label: isUserDoc ? t('templates.fieldExplorer.recordGroup') : 'Plugins',
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
