import crypto from 'crypto';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { ShopRenderData } from '@openfactu/site-builder/schema';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { FactuApi } from '../plugins/FactuApi';
import { notifyTenant } from '../realtime/notifyTenant';
import type { ResolvedHost } from './renderSite';

/**
 * Ecommerce del módulo Website: datos de la tienda para el render público y
 * checkout sin pago online (el pedido entra como Pedido de venta 'O' y el
 * cobro se gestiona offline). Toda la lógica de defaults que la UI del ERP
 * resuelve en el navegador (serie por defecto, periodo activo, precio
 * efectivo por tarifa) se replica aquí en el server porque el visitante de la
 * web no tiene sesión ni acceso a esos endpoints.
 */

const eurFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/**
 * Catálogo público: artículos marcados "Vender en la web" con su precio
 * BRUTO (base + IVA del grupo de impuestos del artículo) ya formateado.
 */
export async function loadShopData(db: any, checkoutEndpoint: string): Promise<ShopRenderData> {
  const rows = await db
    .select({
      id: schema.items.id,
      name: schema.items.name,
      webDescription: schema.items.webDescription,
      webImages: schema.items.webImages,
      basePrice: schema.items.basePrice,
      categoryId: schema.items.categoryId,
      categoryName: schema.categories.name,
      taxRate: schema.taxGroups.rate,
    })
    .from(schema.items)
    .leftJoin(schema.categories, eq(schema.items.categoryId, schema.categories.id))
    .leftJoin(schema.taxGroups, eq(schema.items.taxGroupId, schema.taxGroups.id))
    .where(eq(schema.items.webVisible, true))
    .orderBy(schema.items.name);

  const products = rows.map((r: any) => {
    const net = Number(r.basePrice) || 0;
    const rate = Number(r.taxRate) || 0;
    const gross = Math.round(net * (1 + rate / 100) * 100) / 100;
    return {
      id: r.id,
      name: r.name,
      description: r.webDescription || undefined,
      priceGross: gross,
      priceLabel: eurFormatter.format(gross),
      images: Array.isArray(r.webImages)
        ? r.webImages.filter((u: any) => typeof u === 'string')
        : [],
      categoryId: r.categoryId || undefined,
      categoryName: r.categoryName || undefined,
    };
  });

  const catMap = new Map<string, string>();
  for (const p of products) {
    if (p.categoryId && p.categoryName) catMap.set(p.categoryId, p.categoryName);
  }

  return {
    products,
    categories: [...catMap.entries()].map(([id, name]) => ({ id, name })),
    checkoutEndpoint,
    currency: 'EUR',
  };
}

/** Paths de fichas de producto publicables (sitemap). */
export async function listWebProductPaths(tenantId: string): Promise<string[]> {
  const db = await ClientFactory.getTenantClient(tenantId);
  const rows = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(eq(schema.items.webVisible, true));
  return rows.map((r: any) => `/p/${r.id}`);
}

// ─── Checkout ────────────────────────────────────────────────────────────

// Rate limit en memoria: máx 5 pedidos/minuto por IP+site (mismo patrón que
// el formulario de contacto).
const checkoutHits = new Map<string, number[]>();
const CHECKOUT_WINDOW_MS = 60_000;
const CHECKOUT_MAX = 5;

function checkoutRateLimited(ip: string, siteId: string): boolean {
  const key = `${ip}:${siteId}`;
  const now = Date.now();
  const hits = (checkoutHits.get(key) ?? []).filter((t) => now - t < CHECKOUT_WINDOW_MS);
  if (hits.length >= CHECKOUT_MAX) return true;
  hits.push(now);
  checkoutHits.set(key, hits);
  if (checkoutHits.size > 5000) {
    for (const [k, v] of checkoutHits) {
      if (v.every((t) => now - t >= CHECKOUT_WINDOW_MS)) checkoutHits.delete(k);
    }
  }
  return false;
}

interface CheckoutLine {
  itemId: string;
  quantity: number;
}

/** Serie automática por defecto para pedidos de venta (isDefault primero). */
async function resolveDefaultSeries(db: any): Promise<any> {
  const rows = await db
    .select()
    .from(schema.documentSeries)
    .where(
      and(eq(schema.documentSeries.docType, 'SO'), eq(schema.documentSeries.numberingMode, 'AUTO')),
    );
  if (rows.length === 0) return null;
  return rows.find((s: any) => s.isDefault) ?? rows[0];
}

/** Periodo contable abierto que contiene la fecha de hoy. */
async function resolveActivePeriod(db: any, now: Date): Promise<any> {
  const rows = await db
    .select()
    .from(schema.accountingPeriods)
    .where(
      and(
        lte(schema.accountingPeriods.startDate, now),
        gte(schema.accountingPeriods.endDate, now),
        eq(schema.accountingPeriods.status, 'O'),
      ),
    );
  return rows[0] ?? null;
}

/** Cliente por email (dedupe case-insensitive) o alta nueva con code WEB-. */
async function resolveOrCreatePartner(
  db: any,
  customer: { name: string; email: string; phone?: string },
): Promise<any> {
  const email = customer.email.trim().toLowerCase();
  const [existing] = await db
    .select()
    .from(schema.businessPartners)
    .where(sql`LOWER(${schema.businessPartners.email}) = ${email}`)
    .limit(1);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const code = `WEB-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 36)
    .toString(36)
    .toUpperCase()}`;
  const [created] = await db
    .insert(schema.businessPartners)
    .values({
      id,
      code,
      name: customer.name.trim().slice(0, 200),
      email: customer.email.trim().slice(0, 200),
      phone: customer.phone?.trim().slice(0, 40) || null,
    })
    .returning();
  return created;
}

/** Precio efectivo SIN IVA: tarifa del partner → ItemPrice, si no basePrice. */
async function resolveEffectivePrices(
  db: any,
  itemRows: any[],
  priceListId: string | null,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  for (const item of itemRows) prices.set(item.id, Number(item.basePrice) || 0);
  if (!priceListId) return prices;
  const listPrices = await db
    .select()
    .from(schema.itemPrices)
    .where(eq(schema.itemPrices.priceListId, priceListId));
  for (const lp of listPrices) {
    if (prices.has(lp.itemId)) prices.set(lp.itemId, Number(lp.price) || 0);
  }
  return prices;
}

/**
 * Procesa un pedido de la tienda pública. Devuelve { status, body } para que
 * las dos rutas (slug y dominio propio) respondan igual.
 */
export async function handleShopCheckout(
  resolved: ResolvedHost,
  reqBody: any,
  ip: string,
): Promise<{ status: number; body: any }> {
  const body = reqBody ?? {};

  // Honeypot relleno → bot: fingimos éxito sin crear nada
  if (body.website) return { status: 200, body: { ok: true } };

  if (checkoutRateLimited(ip, resolved.siteId)) {
    return {
      status: 429,
      body: { ok: false, error: 'Demasiados pedidos seguidos. Espera un momento.' },
    };
  }

  const customer = body.customer ?? {};
  const name = String(customer.name ?? '').trim();
  const email = String(customer.email ?? '').trim();
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 400, body: { ok: false, error: 'Nombre y email válidos son obligatorios.' } };
  }

  const rawLines: CheckoutLine[] = Array.isArray(body.lines) ? body.lines : [];
  const lines = rawLines
    .map((l) => ({
      itemId: String(l?.itemId ?? ''),
      quantity: Math.floor(Number(l?.quantity) || 0),
    }))
    .filter((l) => l.itemId && l.quantity > 0 && l.quantity <= 999)
    .slice(0, 50);
  if (lines.length === 0) {
    return { status: 400, body: { ok: false, error: 'El carrito está vacío.' } };
  }

  const db = await ClientFactory.getTenantClient(resolved.tenantId);

  // Solo artículos realmente publicados en la tienda
  const itemRows = await db.select().from(schema.items).where(eq(schema.items.webVisible, true));
  const itemById = new Map<string, any>(itemRows.map((i: any) => [i.id, i]));
  const validLines = lines.filter((l) => itemById.has(l.itemId));
  if (validLines.length === 0) {
    return {
      status: 400,
      body: { ok: false, error: 'Los productos del carrito ya no están disponibles.' },
    };
  }

  const series = await resolveDefaultSeries(db);
  if (!series) {
    console.error('[Website] Checkout sin serie SO automática configurada');
    return {
      status: 500,
      body: { ok: false, error: 'La tienda no está configurada (falta la serie de pedidos).' },
    };
  }
  const now = new Date();
  const period = await resolveActivePeriod(db, now);
  if (!period) {
    console.error('[Website] Checkout sin periodo contable abierto');
    return { status: 500, body: { ok: false, error: 'La tienda no está disponible ahora mismo.' } };
  }

  const partner = await resolveOrCreatePartner(db, {
    name,
    email,
    phone: String(customer.phone ?? ''),
  });
  const prices = await resolveEffectivePrices(db, itemRows, partner.priceListId ?? null);

  const address = String(customer.address ?? '')
    .trim()
    .slice(0, 300);
  const notes = String(customer.notes ?? '')
    .trim()
    .slice(0, 1000);
  const shipTo = [address, notes ? `Nota: ${notes}` : ''].filter(Boolean).join(' · ') || undefined;

  const order = FactuApi.salesOrder();
  order.partnerId = partner.id;
  order.seriesId = series.id;
  order.periodId = period.id;
  order.date = now;
  // Marca de origen: llega al header vía toCreateRequest → buildHeaderValues
  order.customFields.origin = 'web';
  if (shipTo) order.shipToAddress = shipTo;
  for (const l of validLines) {
    const item = itemById.get(l.itemId);
    order.addLine({
      itemId: l.itemId,
      quantity: l.quantity,
      price: prices.get(l.itemId) ?? 0,
      taxGroupId: item.taxGroupId ?? (null as any),
    });
  }

  // Usuario sintético: el pedido lo crea "la web", no un miembro del tenant
  const webUser = { id: null, role: 'SYSTEM', name: 'Web pública' };
  const result = await order.save(resolved.tenantId, db, webUser);

  const orderCode = `${series.prefix ?? ''}${result.docNum}${series.suffix ?? ''}`;

  notifyTenant({
    tenantId: resolved.tenantId,
    tenantClient: db,
    title: 'Nuevo pedido desde tu web',
    body: `${name} ha hecho un pedido (${orderCode}) con ${validLines.length} línea(s).`,
    level: 'info',
    link: '/sales-orders',
  }).catch(() => {});

  return { status: 200, body: { ok: true, orderCode } };
}
