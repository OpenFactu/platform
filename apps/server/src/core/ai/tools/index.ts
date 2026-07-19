/**
 * ToolRegistry del chat de IA.
 *
 * Tools de LECTURA (Fase 2): se ejecutan a través del sandbox SQL de
 * plantillas (`runTemplateQueries`: transacción READ ONLY + statement_timeout
 * + límite de filas + placeholders escapados + search_path acotado al schema
 * del tenant), con el `tenantClient` del usuario logueado — nunca un cliente
 * global. El scope es el del usuario real:
 *  - Tools estructuradas (búsquedas y documentos): cualquier usuario del tenant.
 *  - `list_tables`/`get_table_columns`/`run_read_query` (SQL libre de lectura):
 *    solo ADMIN/SUPERUSER, igual que el diseñador de plantillas.
 *
 * `list_tables`/`get_table_columns` van separadas (en vez de un único
 * "esquema completo") a propósito: este proyecto tiene 100+ tablas — volcarlas
 * todas de golpe son ~20k tokens en cada turno, suficiente para saturar el
 * contexto de un modelo local pequeño (Ollama por defecto usa una ventana de
 * contexto muy corta) y descarrilar el tool-calling. Con tablas listadas por
 * nombre primero, el modelo pide columnas SOLO de las 2-3 tablas relevantes.
 *
 * Tools de ACCIÓN (Fase 3): en `actionTools.ts`, todas con
 * `needsApproval: true` — el SDK detiene el stream y no ejecuta nada hasta que
 * el usuario confirma en la UI del chat.
 *
 * `buildChatTools` acepta `options` para desacoplar qué se incluye del rol del
 * usuario: el chat interno (JWT) sigue derivándolo de `ctx.user.role` por
 * defecto, pero el servidor MCP (Fase 4, tokens de API con scopes) decide
 * explícitamente por scope y NUNCA activa `includeActions` — los clientes MCP
 * externos no tienen la UI de confirmación del chat.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { DocumentRegistry } from '../../documents/DocumentRegistry';
import { validateQuery } from '../../documents/templateQueries';
import { fetchTenantTableNames, fetchTenantTableColumns } from '../../documents/schemaInfo';
import { transpileSource } from '../../../plugins/transpiler';
import { sandboxQuery, isAdminRole, type ChatToolContext } from './util';
import { buildActionTools } from './actionTools';
import { buildFileGenTools } from './fileGenTools';
import { buildDocumentTemplateTools } from './documentTemplateTools';
import { buildErpReadTools } from './erpEntityTools';
import { AiToolRegistry } from '../AiToolRegistry';

export type { ChatToolContext } from './util';

const DOC_TYPE_IDS = ['SINV', 'PINV', 'SO', 'PO', 'SDN', 'PDN'] as const;

/** Poda las filas de un header de documento a un subconjunto útil y estable. */
function pruneDocRow(row: any, statusLabels: Record<string, string>) {
  const keep = [
    'id',
    'docNum',
    'date',
    'status',
    'subtotal',
    'taxTotal',
    'total',
    'paymentStatus',
    'amountPaid',
    'dueDate',
    'notes',
    'partnerId',
    'partnerName',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (row[k] !== undefined) out[k] = row[k];
  if (typeof row.status === 'string' && statusLabels[row.status]) {
    out.statusLabel = statusLabels[row.status];
  }
  return out;
}

export interface BuildChatToolsOptions {
  /** Incluye get_schema_info y run_read_query (SQL de lectura libre). Por defecto: isAdmin. */
  includeSqlTools?: boolean;
  /** Incluye tools de acción (needsApproval). Por defecto: isAdmin. NUNCA true desde MCP. */
  includeActions?: boolean;
}

export function buildChatTools(ctx: ChatToolContext, options: BuildChatToolsOptions = {}) {
  const isAdmin = isAdminRole(ctx.user.role);
  const includeSqlTools = options.includeSqlTools ?? isAdmin;
  const includeActions = options.includeActions ?? isAdmin;

  const tools: Record<string, any> = {
    search_partners: tool({
      description:
        'Busca interlocutores (clientes y proveedores) por nombre, código o NIF. Devuelve hasta 20.',
      inputSchema: z.object({
        query: z.string().describe('Texto a buscar en nombre, código o NIF'),
      }),
      execute: async ({ query }: { query: string }) =>
        sandboxQuery(
          ctx,
          `SELECT id, code, name, nif, email, phone
             FROM "BusinessPartner"
            WHERE name ILIKE :q OR code ILIKE :q OR nif ILIKE :q
            ORDER BY name
            LIMIT 20`,
          { q: `%${query}%` },
        ),
    }),

    search_items: tool({
      description:
        'Busca artículos del catálogo por nombre, código o código de barras. Devuelve hasta 20.',
      inputSchema: z.object({
        query: z.string().describe('Texto a buscar en nombre, código o barcode'),
      }),
      execute: async ({ query }: { query: string }) =>
        sandboxQuery(
          ctx,
          `SELECT id, code, barcode, name, description, kind
             FROM "Item"
            WHERE name ILIKE :q OR code ILIKE :q OR barcode ILIKE :q
            ORDER BY name
            LIMIT 20`,
          { q: `%${query}%` },
        ),
    }),

    list_documents: tool({
      description:
        'Lista documentos de un tipo (SINV=factura venta, PINV=factura compra, SO=pedido venta, PO=pedido compra, SDN=albarán venta, PDN=albarán compra), con filtros opcionales. Ordenados por fecha descendente.',
      inputSchema: z.object({
        docType: z.enum(DOC_TYPE_IDS),
        status: z.string().optional().describe('Código de estado exacto (p.ej. D, P, C)'),
        partnerId: z.string().optional(),
        dateFrom: z.string().optional().describe('ISO yyyy-mm-dd'),
        dateTo: z.string().optional().describe('ISO yyyy-mm-dd'),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input: {
        docType: (typeof DOC_TYPE_IDS)[number];
        status?: string;
        partnerId?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
      }) => {
        const config = DocumentRegistry.get(input.docType as any);
        if (!config) throw new Error(`Tipo de documento desconocido: ${input.docType}`);
        const conds: string[] = [];
        const params: Record<string, unknown> = {};
        if (input.status) {
          conds.push('h.status = :status');
          params.status = input.status;
        }
        if (input.partnerId) {
          conds.push('h."partnerId" = :pid');
          params.pid = input.partnerId;
        }
        if (input.dateFrom) {
          conds.push('h.date >= :dfrom');
          params.dfrom = input.dateFrom;
        }
        if (input.dateTo) {
          conds.push('h.date <= :dto');
          params.dto = input.dateTo;
        }
        const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
        const rows = await sandboxQuery(
          ctx,
          `SELECT h.*, p.name AS "partnerName"
             FROM "${config.headerPgName}" h
             LEFT JOIN "BusinessPartner" p ON p.id = h."partnerId"
            ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
            ORDER BY h.date DESC
            LIMIT ${limit}`,
          params,
        );
        return rows.map((r) => pruneDocRow(r, config.statusLabels));
      },
    }),

    get_document: tool({
      description:
        'Devuelve un documento concreto (cabecera + líneas) por su id. Usa list_documents o search antes si solo tienes un número o nombre.',
      inputSchema: z.object({
        docType: z.enum(DOC_TYPE_IDS),
        id: z.string().describe('Id del documento'),
      }),
      execute: async ({ docType, id }: { docType: (typeof DOC_TYPE_IDS)[number]; id: string }) => {
        const config = DocumentRegistry.get(docType as any);
        if (!config) throw new Error(`Tipo de documento desconocido: ${docType}`);
        const [header] = await sandboxQuery(
          ctx,
          `SELECT h.*, p.name AS "partnerName"
             FROM "${config.headerPgName}" h
             LEFT JOIN "BusinessPartner" p ON p.id = h."partnerId"
            WHERE h.id = :id
            LIMIT 1`,
          { id },
        );
        if (!header) return { error: 'Documento no encontrado' };
        const lines = await sandboxQuery(
          ctx,
          `SELECT l.*, i.name AS "itemName", i.code AS "itemCode"
             FROM "${config.linePgName}" l
             LEFT JOIN "Item" i ON i.id = l."itemId"
            WHERE l."${config.lineFk}" = :id
            ORDER BY l."lineNum"`,
          { id },
        );
        return { header: pruneDocRow(header, config.statusLabels), lines };
      },
    }),

    render_component: tool({
      description: [
        'Muestra información al usuario como un componente visual React, en vez de (o además de) texto/markdown — úsalo cuando una tabla/gráfico/tarjeta a medida comunique mejor el resultado que markdown plano (p.ej. un ranking con barras, una ficha de artículo con badges). No lo uses para respuestas simples: una frase o una tabla markdown normal van mejor con texto.',
        'Escribe un componente funcional React en TSX con export default. Imports disponibles: "react" (hooks: useState, useEffect, useMemo...), "lucide-react" (iconos), "@openfactu/ui" (Button, Card, Table, Badge, Input...). No hay props: si necesitas mostrar datos que ya obtuviste con otra tool, escríbelos literalmente dentro del código (arrays/objetos hardcodeados), no inventes una API de props.',
        'Si necesitas datos frescos DESDE DENTRO del propio componente (poco habitual — normalmente ya los tienes de otra tool), puedes hacer `import { get } from "@openfactu/widget-api"` y `await get("/api/...")` — SOLO lectura (GET), rutas que empiecen por /api/, con los mismos permisos del usuario actual.',
        'Se renderiza directamente sin pedir confirmación — es solo para MOSTRAR información. Nunca lo uses para acciones (crear/modificar/borrar algo): para eso están create_document y propose_dashboard_widget, que sí piden confirmación.',
      ].join(' '),
      inputSchema: z.object({
        code: z
          .string()
          .describe('Código TSX completo del componente (export default function ...)'),
      }),
      execute: async ({ code }: { code: string }) => {
        try {
          const compiledCode = await transpileSource(code, ctx.apiBase);
          return { ok: true, compiledCode };
        } catch (e: any) {
          return { ok: false, error: e?.message || 'Error al compilar el componente' };
        }
      },
    }),

    // Generación de archivos descargables (Excel/Word/PDF) — no son acciones,
    // no piden confirmación (ver comentario en fileGenTools.ts).
    ...buildFileGenTools(),

    // Vista previa de plantillas de documento — tampoco es una acción, no
    // pide confirmación (el guardado real, create_document_template, sí la
    // pide y vive en actionTools.ts).
    ...buildDocumentTemplateTools(ctx),

    // Lectura para resolver ids de las acciones ERP (create_stock_transfer,
    // create_goods_receipt, create_employee) — sin confirmación.
    ...buildErpReadTools(ctx),
  };

  if (includeSqlTools) {
    tools.list_tables = tool({
      description:
        'Lista los nombres de TODAS las tablas del esquema del tenant (sin columnas — es barato, úsala primero). Después pide las columnas de las 2-4 tablas que realmente necesites con get_table_columns. NO existe una tool que devuelva el esquema completo de golpe: es demasiado grande.',
      inputSchema: z.object({}),
      execute: async () => fetchTenantTableNames(ctx.tenantClient, ctx.tenantSchema),
    });

    tools.get_table_columns = tool({
      description:
        'Devuelve las columnas (nombre y tipo) de las tablas indicadas. Pide solo las que vayas a usar en la query — máximo 6 de una vez.',
      inputSchema: z.object({
        tables: z.array(z.string()).min(1).max(6).describe('Nombres exactos de list_tables'),
      }),
      execute: async ({ tables }: { tables: string[] }) => {
        const info = await fetchTenantTableColumns(ctx.tenantClient, ctx.tenantSchema, tables);
        return info.map(
          (t) => `"${t.name}"(${t.columns.map((c) => `${c.name} ${c.type}`).join(', ')})`,
        );
      },
    });

    tools.run_read_query = tool({
      description:
        'Ejecuta una consulta SQL de SOLO LECTURA (PostgreSQL) sobre la base de datos del tenant y devuelve las filas reales. Una sola sentencia SELECT o WITH; nombres de tabla/columna entre comillas dobles (case-sensitive). Máximo 1000 filas. Usa list_tables/get_table_columns antes si no conoces el esquema exacto.',
      inputSchema: z.object({
        sql: z.string().describe('La consulta SELECT'),
      }),
      execute: async ({ sql: rawSql }: { sql: string }) => {
        const validation = validateQuery(rawSql);
        if (validation) return { error: validation };
        try {
          const rows = await sandboxQuery(ctx, rawSql);
          return { rowCount: rows.length, rows: rows.slice(0, 200) };
        } catch (e: any) {
          let error = e?.message || 'Error al ejecutar la consulta';
          // "relation "salesinvoice" does not exist" casi siempre es un
          // nombre sin comillas dobles (Postgres lo pasa a minúsculas). Pista
          // explícita en vez de dejar que el modelo lo adivine por su cuenta.
          if (/relation ".*" does not exist/i.test(error)) {
            error +=
              ' — Postgres pliega a minúsculas los nombres sin comillas dobles. Usa EXACTAMENTE el nombre (con mayúsculas) que te devolvió list_tables/get_table_columns, entre comillas dobles: "NombreTabla".';
          }
          return { error };
        }
      },
    });
  }

  // Acciones con confirmación (Fase 3) — de momento solo para admins del chat interno.
  if (includeActions) {
    Object.assign(tools, buildActionTools(ctx));
  }

  // Tools aportadas por plugins ("skills") — mismo gate que las de acción del
  // core: una tool de plugin con needsApproval SOLO se incluye si
  // includeActions es true (nunca desde MCP), filtrando por needsApproval en
  // sí, no por el origen (core vs. plugin). Un nombre que choque con una tool
  // ya presente se salta con aviso — el registro no sobrescribe.
  for (const entry of AiToolRegistry.getAll()) {
    if (tools[entry.name]) {
      console.warn(
        `[AiToolRegistry] Tool de plugin "${entry.name}" (${entry.pluginId}) choca con una tool ya existente — se omite.`,
      );
      continue;
    }
    const builtTool = entry.factory(ctx);
    if (builtTool.needsApproval && !includeActions) continue;
    tools[entry.name] = builtTool;
  }

  return tools;
}
