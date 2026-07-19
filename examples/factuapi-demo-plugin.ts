import { tool } from 'ai';
import { z } from 'zod';
import { ne } from 'drizzle-orm';
import { PluginContext } from '../apps/server/src/plugins/types';
import { FactuApiTransaction } from '../apps/server/src/core/plugins/FactuApi';
import type { ChatToolContext } from '../apps/server/src/core/ai/tools';
import * as schema from '../apps/server/src/db/schema';

// ════════════════════════════════════════════════════════════════
//  PLUGIN: factuapi-demo
//  Demuestra TODAS las capacidades de FactuAPI:
//    1. IDs pre-asignados (conocer el ID antes de guardar)
//    2. Transacciones atómicas (todo o nada)
//    3. Consultas a la BD del tenant
//    4. Hooks de documentos
//    5. Rutas REST personalizadas
//    6. Tool de chat de IA ("skill") registrada por el plugin
// ════════════════════════════════════════════════════════════════

export const init = async ({ app, hooks, documents, factuApi, aiTools }: PluginContext) => {
  console.log('[FactuAPI Demo] Inicializando...');

  // ─────────────────────────────────────────────────────────────
  //  EJEMPLO 1: IDs pre-asignados
  //  El ID existe desde que se instancia el documento.
  //  Útil para referenciar documentos entre sí antes de guardar.
  // ─────────────────────────────────────────────────────────────

  app.post('/api/plugins/demo/id-preview', async (req: any, res) => {
    try {
      const invoice = factuApi.salesInvoice();
      const deliveryNote = factuApi.salesDeliveryNote();

      // Los IDs ya existen — no necesitamos guardar primero
      res.json({
        message: 'IDs generados antes de save()',
        invoiceId: invoice.id,
        deliveryNoteId: deliveryNote.id,
        note: 'Estos IDs se pueden usar como referencia FK en otros documentos',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  EJEMPLO 2: Transacción atómica — Albarán + Factura
  //  Si la factura falla, el albarán tampoco se crea.
  // ─────────────────────────────────────────────────────────────

  app.post('/api/plugins/demo/albaran-to-invoice', async (req: any, res) => {
    try {
      const { partnerId, seriesIdSDN, seriesIdSINV, periodId, lines } = req.body;

      const result = await factuApi.transaction(
        req.tenantId,
        req.tenantClient,
        req.user,
        async (tx: FactuApiTransaction) => {
          // ── 1. Crear albarán de venta ──
          const albaran = tx.salesDeliveryNote();
          albaran.partnerId = partnerId;
          albaran.seriesId = seriesIdSDN;
          albaran.periodId = periodId;

          for (const line of lines) {
            albaran.addLine({
              itemId: line.itemId,
              quantity: line.quantity,
              price: line.price,
              taxGroupId: line.taxGroupId,
              warehouseId: line.warehouseId,
            });
          }

          const sdnResult = await tx.save(albaran);

          // ── 2. Crear factura de venta referenciando al albarán ──
          const factura = tx.salesInvoice();
          factura.partnerId = partnerId;
          factura.seriesId = seriesIdSINV;
          factura.periodId = periodId;

          for (const line of lines) {
            factura.addLine({
              itemId: line.itemId,
              quantity: line.quantity,
              price: line.price,
              taxGroupId: line.taxGroupId,
              // Referencia al albarán — el ID ya existía antes de save()
              baseType: 'SDN',
              baseId: albaran.id,
            });
          }

          const sinvResult = await tx.save(factura);

          // Si algo falla aquí → rollback de AMBOS documentos
          return {
            deliveryNote: { id: albaran.id, docNum: sdnResult.docNum },
            invoice: { id: factura.id, docNum: sinvResult.docNum },
          };
        },
      );

      res.json({
        message: 'Albarán y factura creados atómicamente',
        ...result,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message,
        note: 'Si hubo error, ambos documentos hicieron rollback',
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  EJEMPLO 3: Consultas a la BD del tenant (sin transacción)
  //  Usar connect() para leer datos antes de operar.
  // ─────────────────────────────────────────────────────────────

  app.get('/api/plugins/demo/tenant-info', async (req: any, res) => {
    try {
      const api = factuApi.connect(req.tenantId, req.tenantClient, req.user);

      // Consultas helper integradas
      const series = await api.getSeries('SINV');
      const periods = await api.getOpenPeriods();

      // También puedes hacer queries directos con api.db
      const [itemCount] = await api.db
        .select({ count: schema.items.id })
        .from(schema.items);

      const [partnerCount] = await api.db
        .select({ count: schema.businessPartners.id })
        .from(schema.businessPartners);

      res.json({
        tenantId: req.tenantId,
        salesInvoiceSeries: series,
        openPeriods: periods,
        stats: {
          items: itemCount?.count ? 'has items' : 'empty',
          partners: partnerCount?.count ? 'has partners' : 'empty',
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  EJEMPLO 4: Transacción con validación previa
  //  Leer datos del tenant dentro de la misma tx para validar.
  // ─────────────────────────────────────────────────────────────

  app.post('/api/plugins/demo/validated-invoice', async (req: any, res) => {
    try {
      const { partnerId, seriesId, periodId, lines } = req.body;

      const result = await factuApi.transaction(
        req.tenantId,
        req.tenantClient,
        req.user,
        async (tx: FactuApiTransaction) => {
          // Validar que el partner existe y está activo
          const partner = await tx.getPartner(partnerId);
          if (!partner) {
            throw new Error(`Partner ${partnerId} no encontrado`);
          }

          // Validar que todos los items existen
          for (const line of lines) {
            const item = await tx.getItem(line.itemId);
            if (!item) {
              throw new Error(`Item ${line.itemId} no encontrado`);
            }
          }

          // Validar que hay periodos abiertos
          const openPeriods = await tx.getOpenPeriods();
          if (openPeriods.length === 0) {
            throw new Error('No hay periodos contables abiertos');
          }

          // Todo validado — crear la factura
          const invoice = tx.salesInvoice();
          invoice.partnerId = partnerId;
          invoice.seriesId = seriesId;
          invoice.periodId = periodId;

          for (const line of lines) {
            invoice.addLine({
              itemId: line.itemId,
              quantity: line.quantity,
              price: line.price,
              taxGroupId: line.taxGroupId,
            });
          }

          return tx.save(invoice);
        },
      );

      res.json({ message: 'Factura creada con validación completa', ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  EJEMPLO 5: Hook — Validar límite de crédito antes de crear
  // ─────────────────────────────────────────────────────────────

  documents.onBeforeCreate('SalesInvoice', async (ctx: any) => {
    if (!ctx.data?.partnerId || !ctx.db) return;

    const api = factuApi.connect(ctx.tenantId, ctx.db, ctx.user);
    const partner = await api.getPartner(ctx.data.partnerId);

    // Ejemplo: si el partner tiene notas que dicen "BLOQUEADO", rechazar
    if (partner?.notes?.includes('BLOQUEADO')) {
      throw new Error(`Partner ${partner.name} está bloqueado. No se puede facturar.`);
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  EJEMPLO 6: Pedido → Albarán → Factura en una sola tx
  //  Flujo completo de negocio: 3 documentos enlazados.
  // ─────────────────────────────────────────────────────────────

  app.post('/api/plugins/demo/full-flow', async (req: any, res) => {
    try {
      const {
        partnerId,
        seriesIdSO, seriesIdSDN, seriesIdSINV,
        periodId, lines,
      } = req.body;

      const result = await factuApi.transaction(
        req.tenantId,
        req.tenantClient,
        req.user,
        async (tx: FactuApiTransaction) => {
          // ── 1. Pedido de venta ──
          const order = tx.salesOrder();
          order.partnerId = partnerId;
          order.seriesId = seriesIdSO;
          order.periodId = periodId;
          for (const l of lines) {
            order.addLine({
              itemId: l.itemId,
              quantity: l.quantity,
              price: l.price,
              taxGroupId: l.taxGroupId,
            });
          }
          const soResult = await tx.save(order);

          // ── 2. Albarán referenciando al pedido ──
          const delivery = tx.salesDeliveryNote();
          delivery.partnerId = partnerId;
          delivery.seriesId = seriesIdSDN;
          delivery.periodId = periodId;
          delivery.orderId = order.id; // referencia directa al pedido
          for (const l of lines) {
            delivery.addLine({
              itemId: l.itemId,
              quantity: l.quantity,
              price: l.price,
              taxGroupId: l.taxGroupId,
              warehouseId: l.warehouseId,
              baseType: 'SO',
              baseId: order.id,
            });
          }
          const sdnResult = await tx.save(delivery);

          // ── 3. Factura referenciando al albarán ──
          const invoice = tx.salesInvoice();
          invoice.partnerId = partnerId;
          invoice.seriesId = seriesIdSINV;
          invoice.periodId = periodId;
          for (const l of lines) {
            invoice.addLine({
              itemId: l.itemId,
              quantity: l.quantity,
              price: l.price,
              taxGroupId: l.taxGroupId,
              baseType: 'SDN',
              baseId: delivery.id,
            });
          }
          const sinvResult = await tx.save(invoice);

          return {
            order:        { id: order.id,    docNum: soResult.docNum },
            deliveryNote: { id: delivery.id, docNum: sdnResult.docNum },
            invoice:      { id: invoice.id,  docNum: sinvResult.docNum },
          };
        },
      );

      res.json({
        message: 'Flujo completo: Pedido → Albarán → Factura (atómico)',
        ...result,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message,
        note: 'Error en cualquier paso → rollback de los 3 documentos',
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  EJEMPLO 7: Tool de chat de IA ("skill") — sin tocar el core.
  //  aiTools.register(name, factory) recibe una FACTORY porque el
  //  ChatToolContext (tenant/usuario) cambia en cada mensaje del chat —
  //  igual que las tools del propio core (ver tools/index.ts).
  // ─────────────────────────────────────────────────────────────

  aiTools.register('demo_open_sales_invoices_count', (ctx: ChatToolContext) =>
    tool({
      description:
        'Ejemplo de plugin: cuenta cuántas facturas de venta pendientes de cobro tiene el tenant.',
      inputSchema: z.object({}),
      execute: async () => {
        const api = factuApi.connect(ctx.tenantId, ctx.tenantClient, ctx.user);
        const rows = await ctx.tenantClient
          .select({ id: schema.salesInvoices.id })
          .from(schema.salesInvoices)
          .where(ne(schema.salesInvoices.paymentStatus, 'paid'));
        return { count: rows.length, tenantId: api.tenantId };
      },
    }),
  );

  console.log('[FactuAPI Demo] Rutas registradas:');
  console.log('  GET  /api/plugins/demo/tenant-info');
  console.log('  POST /api/plugins/demo/id-preview');
  console.log('  POST /api/plugins/demo/albaran-to-invoice');
  console.log('  POST /api/plugins/demo/validated-invoice');
  console.log('  POST /api/plugins/demo/full-flow');
  console.log('  POST /api/plugins/demo/external-app');
};
