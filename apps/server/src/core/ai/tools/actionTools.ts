/**
 * Tools de ACCIÓN del chat de IA (Fase 3) — con confirmación obligatoria.
 *
 * Cada acción lleva `needsApproval: true`: el AI SDK detiene el stream con un
 * `tool-approval-request`, la UI del chat muestra la tarjeta de confirmación
 * (Confirmar/Rechazar) y `execute` SOLO corre si el usuario aprueba. Nada se
 * ejecuta sin click explícito.
 *
 * Acciones actuales:
 *  - `create_document` (Fase 3, generalizada): CUALQUIERA de los 6 tipos de
 *    documento (SINV/PINV/SO/PO/SDN/PDN) EN BORRADOR vía FactuApi/
 *    DocumentEngine (misma lógica de negocio, validaciones y auditoría que
 *    la UI) — contabilizarlo/procesarlo sigue siendo un paso manual. Los 6
 *    tipos comparten el mismo shape de campos (ver DiDocument en FactuApi),
 *    así que es UNA tool con `docType` en vez de 6 casi idénticas.
 *  - `propose_dashboard_widget` (Fase 5): widget declarativo (kpi/bar/table)
 *    respaldado por una consulta de solo lectura — se valida y prueba ANTES
 *    de pedir confirmación, así el usuario ve el resultado real, no una
 *    promesa, antes de aprobarlo.
 *  - `create_document_template`: guarda un formato/plantilla PDF nuevo para
 *    un tipo de documento — ver preview_document_template en
 *    documentTemplateTools.ts para la vista previa (sin confirmación) que
 *    debe llamarse antes.
 */

import { tool } from 'ai';
import { z } from 'zod';
import crypto from 'crypto';
import { FactuApi } from '../../plugins/FactuApi';
import { ClientFactory } from '../../tenant/ClientFactory';
import { DocumentRegistry } from '../../documents/DocumentRegistry';
import * as schema from '../../../db/schema';
import { CHART_TYPES, resolveQueryWidget, validateWidgetQuery } from '../declarativeWidget';
import { buildVisualTemplate, type DocType } from '@openfactu/pdf';
import { sandboxQuery, type ChatToolContext } from './util';
import {
  TEMPLATE_DOC_TYPE_IDS,
  visualOptionsInputSchema,
  mergeVisualOptions,
  type VisualOptionsInput,
} from './documentTemplateTools';
import { buildErpActionTools } from './erpEntityTools';

const DOCUMENT_DOC_TYPE_IDS = TEMPLATE_DOC_TYPE_IDS; // mismos 6 tipos: SINV/PINV/SO/PO/SDN/PDN

export function buildActionTools(ctx: ChatToolContext) {
  return {
    // Interlocutores, traslados de stock, entrada de mercancía, empleados —
    // NO son DocType (ver comentario de cabecera en erpEntityTools.ts).
    ...buildErpActionTools(ctx),

    create_document: tool({
      description: [
        'Crea un documento EN BORRADOR: factura de venta (SINV), factura de compra (PINV), pedido de venta (SO), pedido de compra (PO), albarán de venta (SDN) o albarán de compra (PDN) — elige docType. No contabiliza, no mueve stock ni genera asientos — eso requiere un paso manual posterior en la aplicación.',
        'Antes de llamarla: resuelve el partnerId con search_partners (el CLIENTE para SINV/SO/SDN, el PROVEEDOR para PINV/PO/PDN — mismo campo partnerId en ambos casos) y los itemId con search_items, y muestra al usuario qué vas a crear.',
        'Si no indicas precio en una línea, se usa el precio base del artículo. Esta acción requiere confirmación explícita del usuario.',
      ].join(' '),
      inputSchema: z.object({
        docType: z
          .enum(DOCUMENT_DOC_TYPE_IDS)
          .describe(
            'SINV=factura venta, PINV=factura compra, SO=pedido venta, PO=pedido compra, SDN=albarán venta, PDN=albarán compra',
          ),
        partnerId: z
          .string()
          .describe('Id del cliente (SINV/SO/SDN) o proveedor (PINV/PO/PDN), de search_partners'),
        date: z.string().optional().describe('Fecha del documento (yyyy-mm-dd); hoy si se omite'),
        lines: z
          .array(
            z.object({
              itemId: z.string().describe('Id del artículo (de search_items)'),
              quantity: z.number().positive(),
              price: z
                .number()
                .nonnegative()
                .optional()
                .describe('Precio unitario; basePrice del artículo si se omite'),
              description: z.string().optional(),
            }),
          )
          .min(1),
      }),
      needsApproval: true,
      execute: async (input: {
        docType: (typeof DOCUMENT_DOC_TYPE_IDS)[number];
        partnerId: string;
        date?: string;
        lines: Array<{ itemId: string; quantity: number; price?: number; description?: string }>;
      }) => {
        const config = DocumentRegistry.get(input.docType);

        // ── Validar partner ──
        const [partner]: any[] = await sandboxQuery(
          ctx,
          'SELECT id, name FROM "BusinessPartner" WHERE id = :id LIMIT 1',
          { id: input.partnerId },
        );
        if (!partner) {
          return {
            ok: false,
            error: config.side === 'sales' ? 'El cliente indicado no existe' : 'El proveedor indicado no existe',
          };
        }

        // ── Defaults de serie y periodo (los mismos que usaría la UI) ──
        const [series]: any[] = await sandboxQuery(
          ctx,
          `SELECT id, prefix FROM "DocumentSeries"
            WHERE "docType" = :docType
            ORDER BY "isDefault" DESC
            LIMIT 1`,
          { docType: input.docType },
        );
        if (!series) {
          return { ok: false, error: `No hay ninguna serie de "${config.label}" configurada` };
        }

        const docDate = input.date || new Date().toISOString().slice(0, 10);
        const [period]: any[] = await sandboxQuery(
          ctx,
          `SELECT id, name FROM "AccountingPeriod"
            WHERE status = 'O'
            ORDER BY (:d BETWEEN "startDate" AND "endDate") DESC, "startDate" DESC
            LIMIT 1`,
          { d: docDate },
        );
        if (!period) return { ok: false, error: 'No hay ningún periodo contable abierto' };

        // ── Resolver artículos (precio base + grupo de impuesto) ──
        const resolvedLines: any[] = [];
        for (const line of input.lines) {
          const [item]: any[] = await sandboxQuery(
            ctx,
            'SELECT id, name, "basePrice", "taxGroupId" FROM "Item" WHERE id = :id LIMIT 1',
            { id: line.itemId },
          );
          if (!item) return { ok: false, error: `El artículo ${line.itemId} no existe` };
          resolvedLines.push({
            itemId: item.id,
            quantity: line.quantity,
            price: line.price ?? Number(item.basePrice ?? 0),
            taxGroupId: item.taxGroupId ?? undefined,
            description: line.description,
          });
        }

        // ── Crear en borrador vía FactuApi (transacción atómica + hooks) —
        //    tx.create(docType) devuelve la subclase correcta (los 6 tipos
        //    comparten el mismo shape de campos, ver actionTools.ts). ──
        const { id, docNum } = await FactuApi.transaction(
          ctx.tenantId,
          ctx.tenantClient,
          ctx.user,
          async (tx) => {
            const doc = tx.create(input.docType);
            doc.partnerId = input.partnerId;
            doc.seriesId = series.id;
            doc.periodId = period.id;
            doc.date = docDate;
            for (const l of resolvedLines) doc.addLine(l);
            return tx.save(doc);
          },
        );

        // Totales calculados por el motor — para que el modelo los comunique.
        const [saved]: any[] = await sandboxQuery(
          ctx,
          `SELECT subtotal, "taxTotal", total FROM "${config.headerPgName}" WHERE id = :id`,
          { id },
        );

        return {
          ok: true,
          id,
          docType: input.docType,
          docTypeLabel: config.label,
          docCode: `${series.prefix ?? ''}${docNum}`,
          docNum,
          status: config.initialStatus,
          partnerName: partner.name,
          date: docDate,
          subtotal: saved?.subtotal,
          taxTotal: saved?.taxTotal,
          total: saved?.total,
          note: `${config.label} creado en borrador. Contabilizarlo/procesarlo sigue siendo un paso manual en la aplicación.`,
        };
      },
    }),

    propose_dashboard_widget: tool({
      description: [
        'Añade un widget al Dashboard (KPI, gráfico de barras o tabla) respaldado por una consulta SQL de solo lectura.',
        'Usa get_schema_info primero si no conoces el esquema. La consulta se prueba antes de pedir confirmación: si falla, corrígela y reintenta tú mismo antes de proponerla al usuario.',
        'kpi: la consulta debe devolver una fila; se muestra su primera columna numérica (o "valueField" si lo indicas).',
        'bar: usa xField (categoría) e yField (valor numérico); si no los indicas, se usan las 2 primeras columnas.',
        'table: se muestran todas las columnas de las primeras filas (máx. 50).',
        'Esta acción requiere confirmación explícita del usuario.',
      ].join(' '),
      inputSchema: z.object({
        title: z.string().describe('Título del widget'),
        subtitle: z.string().optional(),
        chartType: z.enum(CHART_TYPES),
        sql: z.string().describe('Consulta SELECT de solo lectura'),
        xField: z.string().optional(),
        yField: z.string().optional(),
        valueField: z.string().optional(),
        size: z.enum(['sm', 'md', 'lg', 'full']).optional(),
      }),
      needsApproval: true,
      execute: async (input: {
        title: string;
        subtitle?: string;
        chartType: (typeof CHART_TYPES)[number];
        sql: string;
        xField?: string;
        yField?: string;
        valueField?: string;
        size?: 'sm' | 'md' | 'lg' | 'full';
      }) => {
        const invalid = validateWidgetQuery(input.sql);
        if (invalid) return { ok: false, error: invalid };

        const queryConfig = {
          chartType: input.chartType,
          sql: input.sql,
          xField: input.xField,
          yField: input.yField,
          valueField: input.valueField,
        };
        // Se ejecuta ANTES de guardar: si la query falla o no devuelve filas,
        // no se crea el widget — el modelo puede corregirla y reintentar.
        const preview = await resolveQueryWidget(ctx, queryConfig);
        if ('error' in preview) return { ok: false, error: preview.error };

        const id = crypto.randomUUID();
        const publicDb = ClientFactory.getClient('public');
        await publicDb.insert(schema.userDashboardWidgets).values({
          id,
          tenantId: ctx.tenantId,
          title: input.title,
          subtitle: input.subtitle || null,
          kind: 'query',
          queryConfig,
          size: input.size || 'md',
          displayOrder: 100,
          createdBy: ctx.user.id,
        });

        return {
          ok: true,
          id,
          title: input.title,
          chartType: input.chartType,
          preview,
          note: 'Widget añadido al Dashboard.',
        };
      },
    }),

    create_document_template: tool({
      description:
        'Guarda una plantilla de documento NUEVA (factura, pedido, albarán...) — cambia cómo se ven los documentos futuros de ese tipo que la usen (no se activa como predeterminada automáticamente). Llama SIEMPRE primero a preview_document_template con las MISMAS visualOptions para que el usuario vea el resultado antes de pedir esto. Esta acción requiere confirmación explícita del usuario.',
      inputSchema: z.object({
        docType: z.enum(TEMPLATE_DOC_TYPE_IDS),
        name: z.string().describe('Nombre de la plantilla'),
        visualOptions: visualOptionsInputSchema
          .optional()
          .describe('Las mismas opciones usadas en preview_document_template'),
      }),
      needsApproval: true,
      execute: async (input: {
        docType: (typeof TEMPLATE_DOC_TYPE_IDS)[number];
        name: string;
        visualOptions?: VisualOptionsInput;
      }) => {
        const id = crypto.randomUUID();
        const opts = mergeVisualOptions(input.visualOptions);
        const html = buildVisualTemplate(input.docType as DocType, opts);
        await ctx.tenantClient.insert(schema.documentTemplates).values({
          id,
          docType: input.docType,
          name: input.name,
          html,
          isDefault: false,
          legacyHtml: false,
        });
        return {
          ok: true,
          id,
          name: input.name,
          docType: input.docType,
          note: 'Plantilla guardada — totalmente editable desde el modo Visual del diseñador (Ajustes → Plantillas de documento). No se activa como predeterminada automáticamente.',
        };
      },
    }),
  };
}
