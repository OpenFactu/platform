import { t } from '@/i18n/i18n';
import type { FieldGroup } from '../components/canvas/fieldRegistry';

/**
 * Nombre legible de un campo. El catálogo del paquete habla en rutas (`doc.taxTotal`),
 * que no le dicen nada a quien monta una plantilla. Lo que no esté traducido, como las
 * columnas de una consulta o un campo a medida, sale con el texto de reserva.
 */
export function fieldName(path: string, fallback?: string): string {
  // Una línea llega como ruta relativa (`quantity`) o desde el lienzo (`lines.0.quantity`).
  const relative = path.replace(/^lines\.0\./, '');
  const key = `templates.fieldNames.${relative.replace(/\./g, '_')}`;
  const name = t(key);
  if (name !== key) return name;
  return fallback || relative.split('.').pop() || path;
}

/** Título del grupo de campos en el panel. */
export function fieldGroupName(group: FieldGroup): string {
  const key = `templates.fieldGroups.${group.group}`;
  const name = t(key);
  return name === key ? group.label : name;
}
