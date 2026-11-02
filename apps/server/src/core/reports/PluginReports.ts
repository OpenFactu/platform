/**
 * Informes aportados por plugins (libros y modelos legales de cada país). El
 * núcleo pone el catálogo, el permiso y el PDF; el plugin solo la consulta.
 */
import { TenantScopedRegistry } from '../plugins/TenantScopedRegistry';

export interface PluginReportColumn {
  key: string;
  label: string;
  format?: 'date' | 'money' | 'percent' | 'integer' | 'text';
  align?: 'left' | 'right' | 'center';
  width?: string;
}

export interface PluginReportSection {
  title?: string;
  columns: PluginReportColumn[];
  rows: Array<Record<string, any>>;
  totals?: { label: string; values: Record<string, number> };
}

export interface PluginReportResult {
  title?: string;
  subtitle?: string;
  orientation?: 'portrait' | 'landscape';
  sections: PluginReportSection[];
}

export interface PluginReportRunContext {
  tenantId: string;
  db: any;
  /** Filtros de la petición: `from` y `to` ya como Date. */
  filters: { from?: Date; to?: Date; [key: string]: any };
  locale: string;
}

export interface PluginReportDefinition {
  id: string;
  title: string;
  description?: string;
  run: (ctx: PluginReportRunContext) => Promise<PluginReportResult> | PluginReportResult;
}

const reports = new TenantScopedRegistry<PluginReportDefinition>();

export const PluginReports = {
  register(pluginId: string, definition: PluginReportDefinition): void {
    if (!definition?.id || typeof definition.run !== 'function') {
      throw new Error(`[Plugin ${pluginId}] reports.register: hacen falta id y run()`);
    }
    reports.add(pluginId, definition);
  },

  activeFor(tenantId: string | undefined): PluginReportDefinition[] {
    return reports.activeFor(tenantId);
  },

  find(tenantId: string | undefined, id: string): PluginReportDefinition | null {
    return reports.activeFor(tenantId).find((r) => r.id === id) ?? null;
  },

  /** Solo para los tests. */
  clear(): void {
    reports.clear();
  },
};
