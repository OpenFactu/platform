/**
 * Plantilla Excel de un objeto: la hoja que el usuario descarga, rellena y
 * vuelve a subir.
 *
 * Lleva una fila de ejemplo a propósito. Una plantilla con solo cabeceras
 * deja demasiadas preguntas sin responder —¿el país va como "España" o como
 * "ES"?, ¿la fecha con barras?— y esas preguntas se acaban respondiendo mal y
 * apareciendo como cien filas rechazadas. La fila de ejemplo se reconoce y se
 * descarta al importar (ver `EXAMPLE_MARKER`).
 *
 * La hoja "Instrucciones" documenta cada columna: si es obligatoria, de qué
 * tipo es y, en las de referencia, contra qué se busca.
 */

import * as XLSX from 'xlsx';
import type { ImportObjectConfig, ImportFieldDef } from './ImportRegistry';

/**
 * La primera columna de la fila de ejemplo empieza por esto para poder
 * ignorarla si el usuario no la borra. Es visible a propósito: si se colara
 * en la importación, mejor que el registro creado se llame algo que cante.
 */
export const EXAMPLE_MARKER = '(ejemplo, borra esta fila)';

function requiredLabel(field: ImportFieldDef): string {
  if (field.required === true) return 'Sí';
  if (field.required === 'onInsert') return 'Solo al crear';
  return 'No';
}

function typeLabel(field: ImportFieldDef): string {
  switch (field.type) {
    case 'number':
      return 'Número';
    case 'boolean':
      return 'Sí / No';
    case 'date':
      return 'Fecha (dd/mm/aaaa)';
    case 'enum':
      return `Uno de: ${(field.enumValues || []).join(', ')}`;
    case 'ref':
      return `Referencia a ${field.ref?.label || 'otro registro'}`;
    default:
      return 'Texto';
  }
}

function helpFor(field: ImportFieldDef): string {
  const parts: string[] = [];
  if (field.help) parts.push(field.help);
  if (field.type === 'ref' && field.ref) {
    parts.push(`Se busca por ${field.ref.matchBy.join(' o ')}.`);
  }
  return parts.join(' ');
}

/**
 * Una hoja de datos. `groupColumn` antepone la columna que empareja cabeceras
 * con líneas: va en LAS DOS hojas y con el mismo nombre, porque es lo único
 * que las une. No se mapea a ningún campo — solo enlaza.
 */
function dataSheet(
  fields: ImportFieldDef[],
  withExample: boolean,
  groupColumn?: string,
): XLSX.WorkSheet {
  const headers = [...(groupColumn ? [groupColumn] : []), ...fields.map((f) => f.label)];
  const rows: any[][] = [headers];

  if (withExample) {
    const values = fields.map((f) => f.example || '');
    const example = groupColumn ? ['DOC-1', ...values] : values;
    example[0] = `${EXAMPLE_MARKER} ${example[0] || ''}`.trim();
    rows.push(example);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  // Anchos legibles: sin esto todas las columnas salen a 8 caracteres y las
  // cabeceras aparecen cortadas.
  const examples = [...(groupColumn ? [''] : []), ...fields.map((f) => f.example || '')];
  sheet['!cols'] = headers.map((h, i) => ({
    wch: Math.min(40, Math.max(14, h.length + 2, String(examples[i] || '').length + 2)),
  }));
  return sheet;
}

function instructionsSheet(config: ImportObjectConfig): XLSX.WorkSheet {
  const rows: any[][] = [
    [`Importación de ${config.label}`],
    [config.description || ''],
    [],
    ['Rellena la hoja "Datos". Borra la fila de ejemplo antes de subir el fichero.'],
    ['Las columnas que no vayas a usar puedes dejarlas vacías o borrarlas enteras.'],
    ['Una celda vacía no modifica nada: al crear se aplica el valor por defecto y al'],
    ['actualizar se deja como estaba.'],
  ];

  if (config.lines) {
    rows.push(
      [],
      [`Las líneas van en la hoja "${config.lines.label}" de este mismo fichero.`],
      [`La columna "${config.lines.groupBy}" está en las dos hojas y es lo que las une:`, ''],
      ['escribe el mismo valor en la cabecera y en todas sus líneas. No se importa,'],
      ['solo empareja.'],
    );
  }

  rows.push([], ['Columna', '¿Obligatoria?', 'Tipo', 'Ejemplo', 'Notas']);

  const push = (fields: ImportFieldDef[], prefix = '') => {
    for (const f of fields) {
      rows.push([prefix + f.label, requiredLabel(f), typeLabel(f), f.example || '', helpFor(f)]);
    }
  };

  push(config.fields);
  if (config.lines) {
    rows.push([]);
    rows.push([`Hoja "${config.lines.label}"`]);
    rows.push(['Columna', '¿Obligatoria?', 'Tipo', 'Ejemplo', 'Notas']);
    push(config.lines.fields);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 30 }, { wch: 22 }, { wch: 60 }];
  return sheet;
}

export function buildTemplateWorkbook(config: ImportObjectConfig): Buffer {
  const book = XLSX.utils.book_new();
  const groupColumn = config.lines?.groupBy;

  XLSX.utils.book_append_sheet(book, dataSheet(config.fields, true, groupColumn), 'Datos');
  if (config.lines) {
    XLSX.utils.book_append_sheet(
      book,
      dataSheet(config.lines.fields, true, groupColumn),
      config.lines.label.slice(0, 31),
    );
  }
  XLSX.utils.book_append_sheet(book, instructionsSheet(config), 'Instrucciones');

  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

/** ¿Es la fila de ejemplo que la plantilla trae de fábrica? */
export function isExampleRow(row: Record<string, any>): boolean {
  return Object.values(row).some((v) => typeof v === 'string' && v.startsWith(EXAMPLE_MARKER));
}
