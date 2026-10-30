import { useMemo } from 'react';
import type { DocKind, DocSide } from '@openfactu/common';
import { useFormat } from '@/hooks/useFormat';
import { useItemUoms } from '@/hooks/useItemUoms';
import { usePluginLineFields } from '@/hooks/usePluginLineFields';
import { useInternalOrderLineColumn } from '@/hooks/useLineInternalOrderColumn';
import { useI18n } from '@/i18n/I18nContext';
import { buildFormLineColumns } from '../components/documentLineCells';

type BuilderOpts = Parameters<typeof buildFormLineColumns>[0];

/**
 * Columnas de línea del alta de documentos: `buildFormLineColumns` con los
 * campos de plugin de la tabla de líneas y la columna Proyecto editable en
 * lugar de la de solo lectura del builder. Estaba copiado en cada formulario.
 */
export function useFormLineColumns(
  opts: Omit<BuilderOpts, 'fmt' | 'getItemUoms' | 'pluginLineFields'> & {
    kind: DocKind;
    side: DocSide;
    /** Tabla de líneas para los campos de plugin (p. ej. 'SalesInvoiceLine'). */
    pluginTable?: string;
    /** Otro valor que obliga a recalcular (zonas, almacén…). */
    extraDep?: unknown;
  },
) {
  const { t, locale } = useI18n();
  const fmt = useFormat();
  const itemUoms = useItemUoms();
  const { extraDep, pluginTable, ...builderOpts } = opts;
  const pluginLineFields = usePluginLineFields(pluginTable);
  const projectCol = useInternalOrderLineColumn(opts.actions.updateLine);

  return useMemo(() => {
    const base = buildFormLineColumns({
      ...builderOpts,
      fmt,
      getItemUoms: itemUoms.get,
      pluginLineFields,
    });
    // El builder trae su propia columna 'Proyecto' (de solo lectura) cuando
    // hay proyectos: se cambia por la editable, antes de la de acciones.
    const rest = base.slice(0, -1).filter((c) => c.header !== t('doc.lines.project'));
    return [...rest, projectCol, base[base.length - 1]];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opts.state.lines,
    opts.masters.items,
    opts.masters.taxGroups,
    pluginLineFields,
    projectCol,
    extraDep,
    locale,
  ]);
}
