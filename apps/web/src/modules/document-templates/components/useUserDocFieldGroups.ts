import { useMemo } from 'react';
import { FIELD_SCHEMA, type FieldGroup } from '@openfactu/pdf/browser';
import { usePluginFields } from '@/components/plugin-fields';
import { useI18n } from '@/i18n/I18nContext';
import { isUserDocType } from './constants';

/**
 * Campos que se pueden usar en una plantilla de tabla propia: los suyos y los de la
 * empresa, porque no tiene tercero, líneas ni totales. `null` en los demás tipos.
 */
export function useUserDocFieldGroups(docType?: string): FieldGroup[] | null {
  const { t } = useI18n();
  const isUserDoc = !!docType && isUserDocType(docType);
  const fields = usePluginFields(isUserDoc ? docType : undefined);

  return useMemo(() => {
    if (!isUserDoc) return null;
    const record: FieldGroup = {
      group: 'doc',
      label: t('templates.fieldExplorer.recordGroup'),
      icon: 'FileText',
      fields: [
        {
          path: 'doc.title',
          type: 'string',
          description: t('templates.fieldExplorer.recordTitle'),
        },
        {
          path: 'doc.docCode',
          type: 'string',
          description: t('templates.fieldExplorer.recordCode'),
        },
        { path: 'doc.date', type: 'string', description: t('templates.fieldExplorer.recordDate') },
        {
          path: 'doc.fieldList',
          type: 'array',
          description: t('templates.fieldExplorer.recordFields'),
        },
        ...fields.map((f) => ({
          path: `doc.fields.${f.fieldName}`,
          type: 'string' as const,
          description: f.label,
        })),
      ],
    };
    return [
      record,
      ...FIELD_SCHEMA.filter((g) => g.group === 'company' || g.group === 'generatedAt'),
    ];
  }, [isUserDoc, fields, t]);
}
