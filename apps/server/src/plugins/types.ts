import { HookManager } from '../core/plugins/HookManager';
import { Express } from 'express';
import { MigrationEngine } from '../core/plugins/MigrationEngine';
import { FactuApi, FactuApiTransaction } from '../core/plugins/FactuApi';
import type { ICarrierAdapter } from '../core/carriers/ICarrierAdapter';
import { ClientFactory } from '../core/tenant/ClientFactory';
import type { ChatToolContext } from '../core/ai/tools';
import * as schema from '../db/schema';

export type HookHandler = (context: any) => Promise<void> | void;

/** Cliente Drizzle devuelto por ClientFactory (mismo tipo para 'public' y para un tenant). */
export type PluginDrizzleClient = ReturnType<typeof ClientFactory.getClient>;

/** Widget de dashboard que un plugin registra programáticamente desde init(). */
export interface PluginDashboardWidgetInput {
  id: string;
  title: string;
  subtitle?: string;
  /** Ruta relativa al componente ESM del plugin, ej. "ui/MyWidget.tsx". */
  component: string;
  /** Tamaño en la grid de 4 columnas: sm=1, md=2, lg=3, full=4. Default: md. */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Orden sugerido (menor = antes). Default: 100. */
  order?: number;
}

export interface PluginContext {
  app: Express;
  migration: {
    addCustomField: typeof MigrationEngine.addCustomField;
    createTable: typeof MigrationEngine.createPluginTable;
  };
  hooks: {
    register: typeof HookManager.register;
  };
  documents: {
    onBeforeCreate: (tableName: string, handler: HookHandler) => void;
    onAfterCreate: (tableName: string, handler: HookHandler) => void;
    /**
     * Registrar un tipo de documento nuevo (estilo object-type): hereda gratis
     * el flujo genérico completo — API CRUD (`/api/documents/{docType}`),
     * numeración por serie, cancelación, stock según `stockAction`, PDF con
     * plantilla por defecto, hooks/eventos (`{eventPrefix}.beforeCreate` /
     * `.afterCreate`), grafo de trazabilidad y página genérica de UI
     * (`/documents/{docType}`).
     *
     * Las tablas (cabecera y líneas) las crea el propio plugin — normalmente
     * con `migration.createTable` — y se referencian en la config vía
     * `schemaTable`/`lineSchemaTable` (objetos pgTable de drizzle-orm
     * construidos por el plugin) más `headerPgName`/`linePgName`.
     *
     * Validaciones: `docType` obligatorio y sin colisionar con un tipo ya
     * registrado; tablas de cabecera/líneas presentes.
     *
     * Limitación conocida: el seeding de la plantilla PDF por defecto corre
     * en el arranque (syncAllTenants), que puede preceder a la carga del
     * plugin — la plantilla del tipo nuevo aparece al siguiente reinicio.
     */
    register: (config: import('../core/documents/DocumentRegistry').DocumentTypeConfig) => void;
  };
  /** FactuAPI — crea documentos programáticamente con toda la lógica de negocio. */
  factuApi: typeof FactuApi;
  /**
   * Registrar adapters de transportista desde un plugin. El `id` del
   * adapter es la clave única que aparecerá en el desplegable de
   * "Ajustes → Transportistas → Integración".
   */
  carriers: {
    register: (adapter: ICarrierAdapter) => void;
  };
  /**
   * Acceso directo a la base de datos, sin necesidad de registrar un hook.
   * `forTenant` es la única vía para datos de un tenant — siempre resuelve
   * el schema físico a través de la tabla Tenant, nunca acepta un nombre de
   * schema arbitrario (evitando fugas entre tenants).
   */
  db: {
    /** Cliente Drizzle del schema 'public' (Tenant, GlobalUser, PluginField, ...). */
    public: PluginDrizzleClient;
    /** Resuelve tenantId → schema del tenant → cliente Drizzle. */
    forTenant: (tenantId: string) => Promise<PluginDrizzleClient>;
    /** Módulo de schema tipado, para construir queries Drizzle en vez de SQL crudo. */
    schema: typeof schema;
  };
  /** Registro programático de UI, alternativa a declarar todo en manifest.json. */
  widgets: {
    /** Registra (o actualiza, por id) un widget de dashboard para este plugin. */
    registerDashboard: (widget: PluginDashboardWidgetInput) => void;
  };
  /**
   * Registra tools de chat de IA (Keiro) propias del plugin — "skills" sin
   * tocar el core, igual que hooks/carriers/widgets. La factory recibe el
   * mismo `ChatToolContext` por-request que las tools del core (tenant,
   * usuario) y debe devolver el resultado de `tool({...})` del paquete
   * `ai`. Si `name` ya existe (core u otro plugin), el registro se ignora
   * con un aviso — nunca sobreescribe una tool ya presente. Tipado `any` de
   * vuelta a propósito: `ReturnType<typeof tool>` no sirve aquí porque
   * `tool()` es genérico/sobrecargado — TS infiere el retorno más amplio de
   * la firma, que rechaza cualquier `tool({...})` con un `inputSchema`
   * concreto (probado: falla al tipar el ejemplo en
   * examples/factuapi-demo-plugin.ts). El runtime SÍ valida la forma real.
   */
  aiTools: {
    register: (name: string, factory: (ctx: ChatToolContext) => any) => void;
  };
}

export type PluginInit = (context: PluginContext) => void | Promise<void>;
