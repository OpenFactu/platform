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
import {
  sandboxQuery,
  isAdminRole,
  hasModuleAccess,
  DOC_TYPE_PERMISSION_PATH,
  type ChatToolContext,
} from './util';
import { buildActionTools } from './actionTools';
import { buildFileGenTools } from './fileGenTools';
import { buildDocumentTemplateTools } from './documentTemplateTools';
import { buildErpReadTools } from './erpEntityTools';
import { buildDriverTools } from './driverTools';
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
        // Los 6 tipos comparten una sola tool (no se pueden omitir por
        // separado como search_partners/search_items) — se comprueba el
        // permiso de módulo por docType en cada llamada.
        if (!hasModuleAccess(ctx, DOC_TYPE_PERMISSION_PATH[input.docType])) {
          return { error: 'No tienes permiso para ver documentos de este tipo' };
        }
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
        if (!hasModuleAccess(ctx, DOC_TYPE_PERMISSION_PATH[docType])) {
          return { error: 'No tienes permiso para ver documentos de este tipo' };
        }
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

    ask_user_question: tool({
      description: [
        'Pregunta algo al usuario en una tarjeta interactiva, en vez de en texto plano — con opciones para elegir (options), un campo de texto libre (allowFreeText), o ambos. Úsala cuando falte un dato necesario para completar lo que pide: con opciones si hay un conjunto acotado de candidatos razonable (p.ej. "¿qué almacén?", "¿cuál de estos 3 clientes con nombre parecido?"), con allowFreeText si es un dato abierto (nombre, email, un importe...). Si necesitas ambas cosas en la misma pregunta (p.ej. sugerir 2-3 valores frecuentes pero dejar escribir otro), pasa las dos.',
        'FLUJOS GUIADOS PASO A PASO: si el usuario te pide que le vayas pidiendo los datos de algo (p.ej. "dame de alta un cliente preguntándome uno a uno") usa ESTA tool para CADA campo, uno por llamada — incluidos los de texto libre (con allowFreeText), no los preguntes en texto normal a mitad de un flujo guiado, rompe la sensación de guía. Indica siempre `step` con el progreso (current/total y, si quieres, un title fijo como "Alta de cliente") para que el usuario vea en qué paso está. Antes de empezar, repasa mentalmente TODOS los campos obligatorios de la entidad que vas a crear para fijar el `total` correcto y no te dejes ninguno a mitad del flujo — si luego necesitas uno extra, está bien ajustar el total en el siguiente paso. Al terminar el último paso, llama a la tool de creación real (create_partner, create_employee…) con todo lo recogido; no la llames a mitad del flujo.',
        'Se renderiza como una tarjeta — al pulsar una opción, confirmar varias (multiSelect) o enviar el texto libre, esa respuesta se envía como el siguiente mensaje del usuario y la conversación sigue con normalidad. No es una confirmación de acción ni toca datos: solo recoge la respuesta. No la uses para confirmar una acción — para eso ya existe needsApproval en las tools de creación (create_partner, create_document…).',
      ].join(' '),
      inputSchema: z.object({
        question: z.string().describe('La pregunta a mostrar, corta y concreta'),
        options: z
          .array(
            z.object({
              label: z.string().describe('Texto corto del botón (lo que se envía si se elige)'),
              description: z.string().optional().describe('Aclaración opcional bajo la etiqueta'),
            }),
          )
          .min(2)
          .max(6)
          .optional()
          .describe(
            'Entre 2 y 6 opciones. Omite este campo (deja solo allowFreeText) si la respuesta es abierta y no hay candidatos que ofrecer.',
          ),
        multiSelect: z.boolean().optional().describe('Permite elegir varias opciones a la vez'),
        allowFreeText: z
          .boolean()
          .optional()
          .describe(
            'Añade un campo de texto libre para que el usuario escriba su propia respuesta — obligatorio si no das `options` (preguntas abiertas: nombre, email, importe...)',
          ),
        freeTextPlaceholder: z
          .string()
          .optional()
          .describe('Placeholder del campo de texto libre, si allowFreeText'),
        step: z
          .object({
            current: z.number().int().min(1).describe('Número de este paso, empezando en 1'),
            total: z.number().int().min(1).describe('Total de pasos previstos en el flujo'),
            title: z
              .string()
              .optional()
              .describe('Título fijo del flujo guiado, p.ej. "Alta de cliente"'),
          })
          .optional()
          .describe(
            'Solo si esta pregunta forma parte de un flujo guiado paso a paso — muestra "Paso X de Y" con barra de progreso. Omite en preguntas sueltas.',
          ),
      }),
      execute: async (input: {
        question: string;
        options?: Array<{ label: string; description?: string }>;
        multiSelect?: boolean;
        allowFreeText?: boolean;
        freeTextPlaceholder?: string;
        step?: { current: number; total: number; title?: string };
      }) => {
        // Sin lógica de servidor — es una directiva de UI. El front la
        // renderiza como tarjeta de opciones/texto libre (AskUserQuestionCard);
        // al responder, el texto se envía como el siguiente mensaje del
        // usuario, igual que si lo hubiera escrito él.
        const hasOptions = Array.isArray(input.options) && input.options.length >= 2;
        return {
          question: input.question,
          options: input.options || [],
          multiSelect: Boolean(input.multiSelect),
          // Fallback de seguridad: si el modelo no dio opciones válidas NI
          // pidió texto libre, forzamos texto libre para que la tarjeta
          // siempre tenga una forma de responder.
          allowFreeText: Boolean(input.allowFreeText) || !hasOptions,
          freeTextPlaceholder: input.freeTextPlaceholder,
          step: input.step,
        };
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

    // Rutas propias del conductor — sin gate de módulo, el alcance se
    // resuelve server-side desde ctx.user.id (ver driverTools.ts). Sin esto,
    // un rol DRIVER (deny-by-default en módulos) se queda sin ninguna tool.
    ...buildDriverTools(ctx),
  };

  // Tools de un único módulo — se omiten del todo (no solo fallan al
  // ejecutarse) si el usuario no tiene permiso de lectura sobre ese path.
  if (hasModuleAccess(ctx, '/partners')) {
    tools.search_partners = tool({
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
    });
  }

  if (hasModuleAccess(ctx, '/items')) {
    tools.search_items = tool({
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
    });
  }

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
