/**
 * Endpoints para movimientos internos de stock:
 *   /api/transfer-notes     — traspasos entre almacenes
 *   /api/goods-receipts     — entradas (recepciones internas)
 *   /api/goods-issues       — salidas (bajas, scrap, ajustes)
 *
 * Cada uno comparte el mismo contrato REST:
 *   GET       /            listar
 *   GET       /:id         detalle (incluye líneas)
 *   POST      /            crear (body: { …cabecera, lines: [] })
 *   PATCH     /:id         editar cabecera
 *   DELETE    /:id         borrar (cascade)
 *   POST      /:id/post    confirmar → aplica efectos de stock
 *
 * Los traspasos tienen además `/:id/send` y `/:id/receive` (dos transiciones).
 */

import { Router } from 'express';
import { and, asc, desc, eq, gt, inArray, or } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../db/schema';
import {
  postTransferSent,
  postTransferReceived,
  postReceipt,
  postIssue,
} from '../core/stock/StockPoster';

function nowIso() {
  return new Date();
}

function genCode(prefix: string) {
  return `${prefix}-${Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, '0')}`;
}

/**
 * Valida las líneas contra `items.manageBy` y la existencia/unicidad
 * de series según el contexto del documento:
 *
 *   - manageBy='B' → `batchNum` obligatorio.
 *   - manageBy='S' → `batchNum` obligatorio, qty=1, y además:
 *       * en `transfer` / `issue`              → el serial DEBE existir en
 *         `itemSerials` (sólo mueves lo que tienes).
 *       * en `receipt` con `type='return'`     → el serial DEBE existir (vuelve).
 *       * en `receipt` con `type='internal'`
 *         o `type='adjustment'`                → el serial NO debe existir
 *                                                (se alta nuevo, único global).
 *
 * Devuelve el map `itemId → manageBy`.
 */
async function validateBatchesForLines(
  tenantClient: any,
  lines: Array<{ itemId: string; batchNum?: string | null; quantity: number }>,
  context: { kind: 'transfer' | 'receipt' | 'issue'; type?: string | null } = {
    kind: 'transfer',
  },
): Promise<Map<string, string>> {
  const ids = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const rows = await tenantClient
    .select({
      id: schema.items.id,
      code: schema.items.code,
      name: schema.items.name,
      manageBy: schema.items.manageBy,
    })
    .from(schema.items)
    .where(inArray(schema.items.id, ids));

  const manageMap = new Map<string, string>(rows.map((r: any) => [r.id, r.manageBy || 'N']));
  const itemLabel = new Map<string, string>(rows.map((r: any) => [r.id, `${r.code} · ${r.name}`]));

  // ── Validación estructural ────────────────────────────────────────────
  for (const l of lines) {
    const m = manageMap.get(l.itemId) || 'N';
    if (m === 'B' && !l.batchNum?.trim()) {
      throw new Error(
        `El artículo ${itemLabel.get(l.itemId) || l.itemId} se gestiona por lotes — rellena el nº de lote.`,
      );
    }
    if (m === 'S') {
      if (!l.batchNum?.trim()) {
        throw new Error(
          `El artículo ${itemLabel.get(l.itemId) || l.itemId} se gestiona por número de serie — rellena la serie.`,
        );
      }
      if (Number(l.quantity) !== 1) {
        throw new Error(
          `El artículo ${itemLabel.get(l.itemId) || l.itemId} es por serie: cada línea debe tener cantidad 1 (una línea por serial).`,
        );
      }
    }
  }

  // ── Validación de existencia/unicidad de series ───────────────────────
  const serialLines = lines.filter((l) => manageMap.get(l.itemId) === 'S' && l.batchNum);
  if (serialLines.length > 0) {
    const serialNums = [...new Set(serialLines.map((l) => l.batchNum!.trim()))];
    const existing = await tenantClient
      .select({
        serialNum: schema.itemSerials.serialNum,
        itemId: schema.itemSerials.itemId,
      })
      .from(schema.itemSerials)
      .where(inArray(schema.itemSerials.serialNum, serialNums));
    const existsMap = new Map<string, string>(existing.map((r: any) => [r.serialNum, r.itemId]));

    // Decide si el contexto ESPERA que exista o que NO exista.
    const isCreatingSerial =
      context.kind === 'receipt' &&
      (context.type === 'internal' || context.type === 'adjustment' || !context.type);

    for (const l of serialLines) {
      const serial = l.batchNum!.trim();
      const owner = existsMap.get(serial);
      const label = itemLabel.get(l.itemId) || l.itemId;

      if (isCreatingSerial) {
        if (owner) {
          throw new Error(
            `La serie "${serial}" ya existe — no puedes darla de alta otra vez (${label}).`,
          );
        }
      } else {
        // transfer / issue / receipt return
        if (!owner) {
          throw new Error(
            `La serie "${serial}" no existe en el sistema — sólo puedes mover/sacar series registradas (${label}).`,
          );
        }
        if (owner !== l.itemId) {
          throw new Error(`La serie "${serial}" pertenece a otro artículo, no a ${label}.`);
        }
      }
    }
  }

  return manageMap;
}

// ── BARCODE LOOKUP (compartido) ──────────────────────────────────────────
/**
 * Resuelve un código leído por el escáner a un Item. Busca coincidencia
 * exacta por `code` o `barcode`. Devuelve 404 si no se encuentra.
 */
export const stockLookupRouter = Router();

/**
 * Devuelve los números de serie conocidos de un artículo — para el
 * SearchableSelect cuando `manageBy='S'`.
 */
/**
 * Zonas con stock > 0 de un artículo en un almacén concreto — para filtrar
 * el selector de zona origen en salidas y traspasos (solo puedes sacar de
 * donde hay existencias). Cada entrada trae la cantidad disponible.
 */
stockLookupRouter.get('/items/:id/zones-with-stock', async (req: any, res) => {
  try {
    const warehouseId = (req.query.warehouseId as string | undefined)?.trim();
    if (!warehouseId) return res.status(400).json({ error: 'warehouseId requerido' });
    const rows = await req.tenantClient
      .select({
        zoneId: schema.itemZoneStocks.zoneId,
        stock: schema.itemZoneStocks.stock,
      })
      .from(schema.itemZoneStocks)
      .where(
        and(
          eq(schema.itemZoneStocks.itemId, req.params.id),
          eq(schema.itemZoneStocks.warehouseId, warehouseId),
          gt(schema.itemZoneStocks.stock, 0),
        ),
      );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

stockLookupRouter.get('/items/:id/serials', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        id: schema.itemSerials.id,
        serialNum: schema.itemSerials.serialNum,
      })
      .from(schema.itemSerials)
      .where(eq(schema.itemSerials.itemId, req.params.id))
      .orderBy(asc(schema.itemSerials.serialNum));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Devuelve los lotes conocidos de un artículo (para sugerir en el formulario
 * de líneas). Ordena por fecha de caducidad ascendente — los que caducan
 * antes primero, patrón FEFO para decidir cuál usar al hacer una salida.
 */
stockLookupRouter.get('/items/:id/batches', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select({
        id: schema.itemBatches.id,
        batchNum: schema.itemBatches.batchNum,
        quantity: schema.itemBatches.quantity,
        expiryDate: schema.itemBatches.expiryDate,
      })
      .from(schema.itemBatches)
      .where(eq(schema.itemBatches.itemId, req.params.id))
      .orderBy(asc(schema.itemBatches.expiryDate));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

stockLookupRouter.get('/items/by-barcode/:code', async (req: any, res) => {
  try {
    const code = (req.params.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Código vacío' });
    const [row] = await req.tenantClient
      .select({
        id: schema.items.id,
        code: schema.items.code,
        barcode: schema.items.barcode,
        name: schema.items.name,
        uomId: schema.items.uomId,
        defaultWarehouseId: schema.items.defaultWarehouseId,
        defaultZoneId: schema.items.defaultZoneId,
      })
      .from(schema.items)
      .where(or(eq(schema.items.code, code), eq(schema.items.barcode, code)))
      .limit(1);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── TRASPASOS ────────────────────────────────────────────────────────────
export const transferNotesRouter = Router();

transferNotesRouter.get('/', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.transferNotes)
      .orderBy(desc(schema.transferNotes.createdAt))
      .limit(500);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

transferNotesRouter.get('/:id', async (req: any, res) => {
  try {
    const [header] = await req.tenantClient
      .select()
      .from(schema.transferNotes)
      .where(eq(schema.transferNotes.id, req.params.id));
    if (!header) return res.status(404).json({ error: 'No encontrado' });
    const lines = await req.tenantClient
      .select()
      .from(schema.transferNoteLines)
      .where(eq(schema.transferNoteLines.transferId, req.params.id))
      .orderBy(asc(schema.transferNoteLines.lineNum));
    res.json({ ...header, lines });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

transferNotesRouter.post('/', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.fromWarehouseId || !body.toWarehouseId) {
      return res.status(400).json({ error: 'Almacén origen y destino son obligatorios' });
    }
    if (body.fromWarehouseId === body.toWarehouseId) {
      return res.status(400).json({ error: 'Origen y destino no pueden ser el mismo almacén' });
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return res.status(400).json({ error: 'Añade al menos una línea' });
    }
    const incomingLines = Array.isArray(body.lines) ? body.lines : [];
    await validateBatchesForLines(
      req.tenantClient,
      incomingLines
        .filter((l: any) => l.itemId && l.quantity)
        .map((l: any) => ({
          itemId: l.itemId,
          batchNum: l.batchNum,
          quantity: Number(l.quantity),
        })),
      { kind: 'transfer' },
    );

    const id = crypto.randomUUID();
    const code = body.code || genCode('TR');
    await req.tenantClient.insert(schema.transferNotes).values({
      id,
      code,
      fromWarehouseId: body.fromWarehouseId,
      toWarehouseId: body.toWarehouseId,
      date: body.date ? new Date(body.date) : nowIso(),
      status: 'draft',
      notes: body.notes || null,
      createdByUserId: req.user?.id || null,
    });
    const lines = Array.isArray(body.lines) ? body.lines : [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.itemId || !l.quantity) continue;
      await req.tenantClient.insert(schema.transferNoteLines).values({
        id: crypto.randomUUID(),
        transferId: id,
        lineNum: i + 1,
        itemId: l.itemId,
        quantity: Number(l.quantity),
        fromZoneId: l.fromZoneId || null,
        toZoneId: l.toZoneId || null,
        batchNum: l.batchNum || null,
        uomId: l.uomId || null,
        notes: l.notes || null,
      });
    }
    res.json({ id, code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

transferNotesRouter.post('/:id/send', async (req: any, res) => {
  try {
    const [doc] = await req.tenantClient
      .select()
      .from(schema.transferNotes)
      .where(eq(schema.transferNotes.id, req.params.id));
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    if (doc.status !== 'draft') {
      return res.status(400).json({ error: `No se puede enviar desde "${doc.status}"` });
    }
    await postTransferSent(req.tenantClient, req.params.id);
    await req.tenantClient
      .update(schema.transferNotes)
      .set({ status: 'sent', sentAt: nowIso(), updatedAt: nowIso() })
      .where(eq(schema.transferNotes.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

transferNotesRouter.post('/:id/receive', async (req: any, res) => {
  try {
    const [doc] = await req.tenantClient
      .select()
      .from(schema.transferNotes)
      .where(eq(schema.transferNotes.id, req.params.id));
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    if (doc.status !== 'sent') {
      return res.status(400).json({ error: `No se puede recibir desde "${doc.status}"` });
    }
    await postTransferReceived(req.tenantClient, req.params.id);
    await req.tenantClient
      .update(schema.transferNotes)
      .set({ status: 'received', receivedAt: nowIso(), updatedAt: nowIso() })
      .where(eq(schema.transferNotes.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

transferNotesRouter.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.transferNotes)
      .where(eq(schema.transferNotes.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── ENTRADAS ─────────────────────────────────────────────────────────────
export const goodsReceiptsRouter = Router();

goodsReceiptsRouter.get('/', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.goodsReceipts)
    .orderBy(desc(schema.goodsReceipts.createdAt))
    .limit(500);
  res.json(rows);
});

goodsReceiptsRouter.get('/:id', async (req: any, res) => {
  const [header] = await req.tenantClient
    .select()
    .from(schema.goodsReceipts)
    .where(eq(schema.goodsReceipts.id, req.params.id));
  if (!header) return res.status(404).json({ error: 'No encontrado' });
  const lines = await req.tenantClient
    .select()
    .from(schema.goodsReceiptLines)
    .where(eq(schema.goodsReceiptLines.receiptId, req.params.id))
    .orderBy(asc(schema.goodsReceiptLines.lineNum));
  res.json({ ...header, lines });
});

goodsReceiptsRouter.post('/', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.warehouseId) {
      return res.status(400).json({ error: 'Almacén es obligatorio' });
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return res.status(400).json({ error: 'Añade al menos una línea' });
    }
    const allowedTypes = ['internal', 'return', 'adjustment'];
    if (body.type && !allowedTypes.includes(body.type)) {
      return res.status(400).json({ error: `Motivo inválido: ${body.type}` });
    }
    const incomingLines = Array.isArray(body.lines) ? body.lines : [];
    await validateBatchesForLines(
      req.tenantClient,
      incomingLines
        .filter((l: any) => l.itemId && l.quantity)
        .map((l: any) => ({
          itemId: l.itemId,
          batchNum: l.batchNum,
          quantity: Number(l.quantity),
        })),
      { kind: 'receipt', type: body.type || 'internal' },
    );

    const id = crypto.randomUUID();
    const code = body.code || genCode('ENT');
    await req.tenantClient.insert(schema.goodsReceipts).values({
      id,
      code,
      warehouseId: body.warehouseId,
      date: body.date ? new Date(body.date) : nowIso(),
      type: body.type || 'internal',
      status: 'draft',
      notes: body.notes || null,
      createdByUserId: req.user?.id || null,
    });
    const lines = Array.isArray(body.lines) ? body.lines : [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.itemId || !l.quantity) continue;
      await req.tenantClient.insert(schema.goodsReceiptLines).values({
        id: crypto.randomUUID(),
        receiptId: id,
        lineNum: i + 1,
        itemId: l.itemId,
        quantity: Number(l.quantity),
        zoneId: l.zoneId || null,
        batchNum: l.batchNum || null,
        uomId: l.uomId || null,
        notes: l.notes || null,
      });
    }
    res.json({ id, code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

goodsReceiptsRouter.post('/:id/post', async (req: any, res) => {
  try {
    const [doc] = await req.tenantClient
      .select()
      .from(schema.goodsReceipts)
      .where(eq(schema.goodsReceipts.id, req.params.id));
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    if (doc.status !== 'draft') {
      return res.status(400).json({ error: `Ya posteado (status: ${doc.status})` });
    }
    await postReceipt(req.tenantClient, req.params.id);
    await req.tenantClient
      .update(schema.goodsReceipts)
      .set({ status: 'posted', postedAt: nowIso(), updatedAt: nowIso() })
      .where(eq(schema.goodsReceipts.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

goodsReceiptsRouter.delete('/:id', async (req: any, res) => {
  await req.tenantClient
    .delete(schema.goodsReceipts)
    .where(eq(schema.goodsReceipts.id, req.params.id));
  res.json({ ok: true });
});

// ── SALIDAS ──────────────────────────────────────────────────────────────
export const goodsIssuesRouter = Router();

goodsIssuesRouter.get('/', async (req: any, res) => {
  const rows = await req.tenantClient
    .select()
    .from(schema.goodsIssues)
    .orderBy(desc(schema.goodsIssues.createdAt))
    .limit(500);
  res.json(rows);
});

goodsIssuesRouter.get('/:id', async (req: any, res) => {
  const [header] = await req.tenantClient
    .select()
    .from(schema.goodsIssues)
    .where(eq(schema.goodsIssues.id, req.params.id));
  if (!header) return res.status(404).json({ error: 'No encontrado' });
  const lines = await req.tenantClient
    .select()
    .from(schema.goodsIssueLines)
    .where(eq(schema.goodsIssueLines.issueId, req.params.id))
    .orderBy(asc(schema.goodsIssueLines.lineNum));
  res.json({ ...header, lines });
});

goodsIssuesRouter.post('/', async (req: any, res) => {
  try {
    const body = req.body || {};
    if (!body.warehouseId) {
      return res.status(400).json({ error: 'Almacén es obligatorio' });
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return res.status(400).json({ error: 'Añade al menos una línea' });
    }
    const allowedTypes = ['internal', 'scrap', 'adjustment'];
    if (body.type && !allowedTypes.includes(body.type)) {
      return res.status(400).json({ error: `Motivo inválido: ${body.type}` });
    }
    const incomingLines = Array.isArray(body.lines) ? body.lines : [];
    await validateBatchesForLines(
      req.tenantClient,
      incomingLines
        .filter((l: any) => l.itemId && l.quantity)
        .map((l: any) => ({
          itemId: l.itemId,
          batchNum: l.batchNum,
          quantity: Number(l.quantity),
        })),
      { kind: 'issue' },
    );

    const id = crypto.randomUUID();
    const code = body.code || genCode('SAL');
    await req.tenantClient.insert(schema.goodsIssues).values({
      id,
      code,
      warehouseId: body.warehouseId,
      date: body.date ? new Date(body.date) : nowIso(),
      type: body.type || 'internal',
      status: 'draft',
      notes: body.notes || null,
      createdByUserId: req.user?.id || null,
    });
    const lines = Array.isArray(body.lines) ? body.lines : [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.itemId || !l.quantity) continue;
      await req.tenantClient.insert(schema.goodsIssueLines).values({
        id: crypto.randomUUID(),
        issueId: id,
        lineNum: i + 1,
        itemId: l.itemId,
        quantity: Number(l.quantity),
        zoneId: l.zoneId || null,
        batchNum: l.batchNum || null,
        uomId: l.uomId || null,
        notes: l.notes || null,
      });
    }
    res.json({ id, code });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

goodsIssuesRouter.post('/:id/post', async (req: any, res) => {
  try {
    const [doc] = await req.tenantClient
      .select()
      .from(schema.goodsIssues)
      .where(eq(schema.goodsIssues.id, req.params.id));
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    if (doc.status !== 'draft') {
      return res.status(400).json({ error: `Ya posteado (status: ${doc.status})` });
    }
    await postIssue(req.tenantClient, req.params.id);
    await req.tenantClient
      .update(schema.goodsIssues)
      .set({ status: 'posted', postedAt: nowIso(), updatedAt: nowIso() })
      .where(eq(schema.goodsIssues.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

goodsIssuesRouter.delete('/:id', async (req: any, res) => {
  await req.tenantClient.delete(schema.goodsIssues).where(eq(schema.goodsIssues.id, req.params.id));
  res.json({ ok: true });
});
