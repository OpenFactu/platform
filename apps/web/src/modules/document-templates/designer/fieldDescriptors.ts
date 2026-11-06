import { t } from '@/i18n/i18n';
import type { LinesTableColumn } from '../components/canvas/types';
import {
  getFieldGroupsForFieldElement,
  getLineFieldGroup,
  inferDefaultFormat,
  type FieldDef,
  type FieldGroup,
} from '../components/canvas/fieldRegistry';
import { genId } from './elements';
import { fieldGroupName, fieldName } from './fieldNames';
import type { FieldDescriptor } from './types';

/** Etiqueta corta y capitalizada a partir de un path (último segmento). */
export function shortLabel(path: string): string {
  const seg = (path.split('.').pop() ?? path).replace(/_/g, ' ');
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

/** Adivina un formato de columna a partir del nombre (heurística ES/EN). */
export function guessColumnFormat(
  name: string,
): 'currency' | 'date' | 'number' | 'percent' | 'address' | undefined {
  const n = name.toLowerCase();
  if (/(price|precio|total|amount|importe|subtotal|valor|coste|\bcost\b)/.test(n))
    return 'currency';
  if (/(date|fecha|expiry|caducidad|created|updated|vencimiento)/.test(n)) return 'date';
  if (/(qty|cantidad|quantity|stock|units|unidades|count|num|cant)/.test(n)) return 'number';
  return undefined;
}

/** Construye las columnas de una tabla a partir de los nombres de columna de una query. */
export function columnsFromQueryCols(cols: string[]): LinesTableColumn[] {
  return cols.map((c) => ({
    id: genId('col'),
    label: shortLabel(c),
    path: c,
    widthPct: Math.round(100 / Math.max(cols.length, 1)),
    align: 'left',
    format: guessColumnFormat(c),
  }));
}

/**
 * Construye los campos arrastrables según el tipo de documento:
 *  - Las columnas de las consultas van primero en cualquier tipo: es lo que se acaba de
 *    pedir (relativas para tablas, absolutas para el lienzo).
 *  - FREE/LABEL → además, sus params.
 *  - Tabla propia → sus campos y los de la empresa: no tiene tercero ni líneas.
 *  - Documento normal → campos de documento (lienzo) + campos de línea (tabla).
 */
export function buildFieldDescriptors(args: {
  isFreeOrLabel: boolean;
  queryColumns: Record<string, string[]>;
  paramKeys: string[];
  pluginGroup: FieldGroup | null;
  linePluginFields: FieldDef[];
  userDocGroups: FieldGroup[] | null;
}): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  for (const [name, cols] of Object.entries(args.queryColumns)) {
    for (const c of cols) {
      out.push({
        key: `q-${name}-${c}`,
        label: shortLabel(c),
        group: t('templates.designer.fields.queryGroup', { name }),
        canvasPath: `queries.${name}.0.${c}`,
        linePath: c,
        lineSource: `query:${name}`,
        format: guessColumnFormat(c),
      });
    }
  }
  if (args.userDocGroups) {
    for (const g of args.userDocGroups) {
      for (const f of g.fields) {
        out.push({
          key: `d-${g.label}-${f.path}`,
          label: f.path.startsWith('doc.fields.')
            ? f.description
            : fieldName(f.path, f.description),
          group: fieldGroupName(g),
          canvasPath: f.path,
          format: inferDefaultFormat(f),
        });
      }
    }
    return out;
  }
  if (args.isFreeOrLabel) {
    for (const k of args.paramKeys) {
      out.push({
        key: `p-${k}`,
        label: k,
        group: t('templates.designer.fields.params'),
        canvasPath: `params.${k}`,
      });
    }
    return out;
  }
  const docGroups = args.pluginGroup
    ? [...getFieldGroupsForFieldElement('docHeader'), args.pluginGroup]
    : getFieldGroupsForFieldElement('docHeader');
  for (const g of docGroups) {
    for (const f of g.fields) {
      out.push({
        key: `d-${g.label}-${f.path}`,
        label: fieldName(f.path, f.description),
        group: fieldGroupName(g),
        canvasPath: f.path,
        format: inferDefaultFormat(f),
      });
    }
  }
  const baseLine = getLineFieldGroup();
  const lineFields = baseLine
    ? [...baseLine.fields, ...args.linePluginFields]
    : args.linePluginFields;
  for (const f of lineFields) {
    out.push({
      key: `l-${f.path}`,
      label: fieldName(f.path, f.description),
      group: t('templates.designer.fields.lines'),
      canvasPath: `lines.0.${f.path}`,
      linePath: f.path,
      format: inferDefaultFormat(f),
    });
  }
  return out;
}
