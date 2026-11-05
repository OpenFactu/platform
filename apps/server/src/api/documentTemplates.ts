import { Router } from 'express';
import { getRequestLocale, tr } from '../i18n';
import crypto from 'crypto';
import fs from 'fs';
import { eq, and, asc, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import {
  PdfRenderer,
  PdfHandlebars as Handlebars,
  buildVisualTemplate,
  extractMetaFromHtml,
  type DocType,
} from '@openfactu/pdf';
import { MigrationManager } from '../core/tenant/MigrationManager';
import { PdfPayloadBuilder } from '../core/documents/PdfPayloadBuilder';
import { UserDocTypes, isTemplateDocType, isUserDocType } from '../core/documents/UserDocTypes';
import { isFactoryTemplateEdit } from '../core/documents/templateFactory';
import { renderTemplatePieces } from '../core/documents/templatePieces';
import {
  runTemplateQueries,
  validateQuery,
  type TemplateQuery,
} from '../core/documents/templateQueries';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getAiConfig, getLanguageModel } from '../core/ai';
import { fetchSchemaInfo, schemaInfoToCompactText } from '../core/documents/schemaInfo';
import {
  visualOptionsInputSchema,
  mergeVisualOptions,
  VISUAL_OPTIONS_PROMPT_GUIDE,
} from '../core/documents/visualTemplateOptions';
import { logAudit } from '../utils/audit';

/**
 * Solo ciertos roles pueden guardar/ejecutar consultas SQL libres.
 * Adjuntar SQL en una plantilla da acceso de lectura a todo el schema del
 * tenant, por eso se restringe a ADMIN/SUPERUSER.
 */
function isAdminUser(req: any): boolean {
  const role = req.user?.role;
  return role === 'ADMIN' || role === 'SUPERUSER';
}

/**
 * Registra en el Handlebars de @openfactu/pdf los helpers que usan las plantillas
 * del diseñador y que el paquete no trae.
 */
let canvasHelpersRegistered = false;
export function registerCanvasHelpers() {
  if (canvasHelpersRegistered) return;
  canvasHelpersRegistered = true;

  // Nota: los helpers `barcode` y `qrCode` los registra @openfactu/pdf (>=0.1.3)
  // dentro de PdfRenderer.registerHelpers(); resuelven symbology 'auto' con
  // detección EAN/UPC y fallback a code128. Aquí registramos SOLO los helpers que
  // el paquete no trae, para mantener una única fuente de verdad.

  // Comparadores extra usados por el elemento condicional del diseñador.
  // `eq` y `gt` ya los registra @openfactu/pdf; añadimos `neq` y `lt`.
  Handlebars.registerHelper('neq', (a: unknown, b: unknown) => a !== b);
  Handlebars.registerHelper('lt', (a: unknown, b: unknown) => Number(a) < Number(b));

  // Agregados sobre una colección (lo usa el elemento "Resumen" del diseñador).
  // Se invocan como subexpresión: {{formatCurrency (sum lines "lineTotal")}} o {{count lines}}.
  const getByPath = (obj: any, path?: string): unknown => {
    if (!path) return obj;
    return String(path)
      .split('.')
      .reduce((acc: any, k) => (acc == null ? acc : acc[k]), obj);
  };
  const toNumbers = (arr: unknown, path?: string): number[] =>
    (Array.isArray(arr) ? arr : [])
      .map((item) => Number(getByPath(item, path)))
      .filter((n) => Number.isFinite(n));
  Handlebars.registerHelper('count', (arr: unknown) => (Array.isArray(arr) ? arr.length : 0));
  Handlebars.registerHelper('sum', (arr: unknown, path?: string) =>
    toNumbers(arr, typeof path === 'string' ? path : undefined).reduce((a, b) => a + b, 0),
  );
  Handlebars.registerHelper('avg', (arr: unknown, path?: string) => {
    const ns = toNumbers(arr, typeof path === 'string' ? path : undefined);
    return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
  });
  Handlebars.registerHelper('min', (arr: unknown, path?: string) => {
    const ns = toNumbers(arr, typeof path === 'string' ? path : undefined);
    return ns.length ? Math.min(...ns) : 0;
  });
  Handlebars.registerHelper('max', (arr: unknown, path?: string) => {
    const ns = toNumbers(arr, typeof path === 'string' ? path : undefined);
    return ns.length ? Math.max(...ns) : 0;
  });

  // Fecha actual del render (lo usa el elemento "Fecha" en modo solo-fecha).
  Handlebars.registerHelper('today', () => new Date().toLocaleDateString('es-ES'));

  // Formatea una dirección estructurada (PartnerAddressObject) como texto
  // multilínea. Si el valor no es objeto (null, string ya formateada...), se
  // devuelve tal cual para no romper plantillas antiguas.
  Handlebars.registerHelper('formatAddress', (value: any) => {
    if (!value) return '';
    if (typeof value === 'string') return new Handlebars.SafeString(escapeHtmlSafe(value));
    if (typeof value !== 'object') return String(value);
    const street = value.street ?? '';
    const city = value.city ?? '';
    const state = value.state ?? '';
    const zip = value.zipCode ?? '';
    const country = value.country ?? '';
    const line2 = [zip, city].filter(Boolean).join(' ');
    const line3 = [state, country].filter(Boolean).join(', ');
    const lines = [street, line2, line3].filter((s) => s && String(s).trim().length > 0);
    return new Handlebars.SafeString(lines.map(escapeHtmlSafe).join('<br/>'));
  });
}

function escapeHtmlSafe(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const router = Router();

/** True si la plantilla es de tipo "libre" — sin payload de documento (FREE o LABEL). */
const isFreeDocType = (t: any): boolean => t === 'FREE' || t === 'LABEL';

/**
 * Los datos con los que se prueba una plantilla: el documento pedido, el último de ese
 * tipo o unos inventados. Probarla nunca debe dar 500 por falta o fallo de esos datos.
 * Para las plantillas FREE no hay payload de documento, solo `queries`.
 */
async function samplePayload(req: any, docType: string, sampleDocId?: string): Promise<any> {
  if (isFreeDocType(docType)) return {};
  const locale = getRequestLocale(req);
  if (isUserDocType(docType)) {
    const id =
      sampleDocId ?? (await PdfPayloadBuilder.findLatestSampleId(docType, req.tenantClient));
    return PdfPayloadBuilder.buildUserDocument(
      docType,
      id,
      req.tenantClient,
      locale,
      req.tenantId,
      req.user?.role,
    );
  }
  try {
    if (sampleDocId) {
      return await PdfPayloadBuilder.build(
        docType,
        sampleDocId,
        req.tenantClient,
        locale,
        req.tenantId,
      );
    }
    const latestId = req.tenantClient
      ? await PdfPayloadBuilder.findLatestSampleId(docType, req.tenantClient).catch(() => null)
      : null;
    return latestId
      ? await PdfPayloadBuilder.build(
          docType,
          latestId,
          req.tenantClient,
          locale,
          req.tenantId,
        ).catch(() => PdfPayloadBuilder.fixture(docType))
      : PdfPayloadBuilder.fixture(docType);
  } catch (err) {
    console.warn('[DocumentTemplates] preview payload fallback to fixture:', err);
    return PdfPayloadBuilder.fixture(docType);
  }
}

/**
 * Datos de prueba más el resultado de las consultas SQL de la plantilla, bajo
 * `queries.<name>`. Las consultas solo las lanza un admin: de otro rol se ignoran. Para
 * FREE aceptamos `params` arbitrarios (`:itemId`, `:lote`, ...) como contexto de prueba.
 */
async function templateContext(
  req: any,
  docType: string,
  options: { sampleDocId?: string; queries?: unknown; params?: unknown },
): Promise<any> {
  const payload = await samplePayload(req, docType, options.sampleDocId);
  const safeQueries: TemplateQuery[] =
    Array.isArray(options.queries) && isAdminUser(req) ? options.queries : [];
  const extraParams = (
    options.params && typeof options.params === 'object' ? options.params : {}
  ) as Record<string, unknown>;
  const queryResults = await runTemplateQueries(req.tenantClient, safeQueries, {
    docId: payload?.doc?.id ?? options.sampleDocId ?? null,
    partnerId: payload?.partner?.id ?? null,
    companyId: payload?.company?.id ?? null,
    tenantId: req.tenantId ?? null,
    ...extraParams,
  } as any);
  if (queryResults.errors.length > 0) {
    console.warn(
      '[DocumentTemplates] preview queries with errors:',
      JSON.stringify(queryResults.errors),
    );
  }
  return {
    ...payload,
    params: extraParams,
    queries: queryResults.byName,
    generatedAt: payload?.generatedAt ?? new Date().toLocaleString('es-ES'),
  };
}

// GET / — lista (opcional filtro por ?docType=SINV)
router.get('/', async (req: any, res) => {
  try {
    const { docType } = req.query;
    // Una tabla propia de tipo documento tiene su plantilla estándar desde el primer momento.
    const userTypes = await UserDocTypes.ensureTemplates(req.tenantId, req.tenantClient);
    const userDocTypes = new Set(userTypes.map((t) => t.docType));
    const where = docType ? eq(schema.documentTemplates.docType, String(docType)) : undefined;
    const query = req.tenantClient
      .select({
        id: schema.documentTemplates.id,
        docType: schema.documentTemplates.docType,
        name: schema.documentTemplates.name,
        isDefault: schema.documentTemplates.isDefault,
        isFactoryDefault: schema.documentTemplates.isFactoryDefault,
        updatedAt: schema.documentTemplates.updatedAt,
        // Con qué se editó: el lienzo, el formulario visual o el HTML a mano. Una plantilla
        // de HTML libre también usa `canvasLayout`, pero solo para guardar sus consultas.
        editor: sql<string>`CASE WHEN "canvasLayout"->>'version' = '1' OR ("docType" = 'LABEL' AND "canvasLayout" IS NULL) THEN 'designer' WHEN "html" LIKE '%OPENFACTU-META:%' THEN 'visual' ELSE 'html' END`,
      })
      .from(schema.documentTemplates);
    const rows = where
      ? await query
          .where(where)
          .orderBy(asc(schema.documentTemplates.docType), asc(schema.documentTemplates.name))
      : await query.orderBy(
          asc(schema.documentTemplates.docType),
          asc(schema.documentTemplates.name),
        );
    // Si la tabla dejó de ser de tipo documento, sus plantillas se quedan sin tipo.
    res.json(rows.filter((r: any) => !isUserDocType(r.docType) || userDocTypes.has(r.docType)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /user-doc-types — tablas propias de tipo documento de esta empresa. DEBE ir
// antes de `/:id`, igual que `/schema-info`.
router.get('/user-doc-types', async (req: any, res) => {
  try {
    res.json(await UserDocTypes.list(req.tenantId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /schema-info — admin-only: devuelve la lista de tablas y columnas del
// esquema del tenant activo. DEBE ir antes de `/:id` para que Express no la
// capture como un id.
router.get('/schema-info', async (req: any, res) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ error: 'Solo disponible para administradores' });
    }
    res.json({ tables: await fetchSchemaInfo(req.tenantClient) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /:id — detalle (incluye html)
router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'No encontrada' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST / — crear
router.post('/', async (req: any, res) => {
  try {
    const { docType, name, html, isDefault, canvasLayout, legacyHtml } = req.body;
    if (!(await isTemplateDocType(req.tenantId, docType))) {
      return res.status(400).json({ error: 'docType inválido' });
    }
    if (!name || !html) return res.status(400).json({ error: 'name y html son obligatorios' });

    const id = crypto.randomUUID();
    await req.tenantClient.transaction(async (tx: any) => {
      if (isDefault) {
        await tx
          .update(schema.documentTemplates)
          .set({ isDefault: false })
          .where(eq(schema.documentTemplates.docType, docType));
      }
      await tx.insert(schema.documentTemplates).values({
        id,
        docType,
        name,
        html,
        isDefault: !!isDefault,
        ...(canvasLayout ? { canvasLayout } : {}),
        ...(typeof legacyHtml === 'boolean' ? { legacyHtml } : {}),
      });
    });
    PdfRenderer.invalidateCache();
    res.json({ id });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'DocumentTemplate',
      entityId: id,
      action: 'CREATE',
      newValue: { docType, name, isDefault: !!isDefault },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /:id — actualizar
router.put('/:id', async (req: any, res) => {
  try {
    const { name, html, isDefault, canvasLayout, legacyHtml } = req.body;
    await req.tenantClient.transaction(async (tx: any) => {
      const [existing] = await tx
        .select()
        .from(schema.documentTemplates)
        .where(eq(schema.documentTemplates.id, req.params.id));
      if (!existing) throw new Error('No encontrada');

      // Admin-only: solo los admins pueden modificar el bloque `queries` del
      // layout. Para no-admins, sobrescribimos las queries entrantes con las
      // que ya había en BD — así pueden seguir guardando cambios de maquetado
      // sobre plantillas que contienen SQL sin toparse con un 403.
      if (canvasLayout && !isAdminUser(req)) {
        const existingQueries = (existing.canvasLayout as any)?.queries;
        canvasLayout.queries = existingQueries;
      }

      if (isDefault && !existing.isDefault) {
        await tx
          .update(schema.documentTemplates)
          .set({ isDefault: false })
          .where(eq(schema.documentTemplates.docType, existing.docType));
      }

      const updates: any = { updatedAt: new Date() };
      if (typeof name === 'string') updates.name = name;
      if (typeof html === 'string') updates.html = html;
      if (typeof isDefault === 'boolean') updates.isDefault = isDefault;
      if (canvasLayout !== undefined) updates.canvasLayout = canvasLayout;
      if (typeof legacyHtml === 'boolean') updates.legacyHtml = legacyHtml;
      // La estándar se regenera sola: al editarla pasa a ser de la empresa, y el sistema
      // crea otra limpia. Si no, el cambio se perdería al reiniciar.
      if (isFactoryTemplateEdit(existing, { html, canvasLayout })) {
        updates.isFactoryDefault = false;
        // Con el mismo nombre no se distinguirían de la estándar nueva.
        if ((updates.name ?? existing.name) === existing.name) {
          updates.name = tr(getRequestLocale(req), '{0} (editada)', { 0: existing.name });
        }
      }

      await tx
        .update(schema.documentTemplates)
        .set(updates)
        .where(eq(schema.documentTemplates.id, req.params.id));
    });
    PdfRenderer.invalidateCache();
    res.json({ ok: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'DocumentTemplate',
      entityId: req.params.id,
      action: 'UPDATE',
      newValue: req.body,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /resync-defaults — regenera el HTML de la plantilla "de fábrica"
 * (`isFactoryDefault: true`) de cada tipo, usando el último
 * `getDefaultTemplate()` de @openfactu/pdf. Se usa tras publicar una versión
 * nueva del paquete (cambio de paleta, nuevos bloques, etc.) para que los
 * tenants ya existentes recojan los cambios. Nunca toca plantillas custom,
 * ni siquiera si el usuario la marcó como predeterminada (`isDefault`) — ver
 * comentario en MigrationManager.resyncDefaultTemplates.
 *
 * Sólo ADMIN/SUPERUSER.
 */
router.post('/resync-defaults', async (req: any, res) => {
  if (!isAdminUser(req)) return res.status(403).json({ error: 'Solo admin/superuser' });
  try {
    const schemaName = req.tenantSchema;
    if (!schemaName) return res.status(400).json({ error: 'Tenant schema no resuelto' });
    const count = await MigrationManager.resyncDefaultTemplates(schemaName);
    PdfRenderer.invalidateCache();
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'DocumentTemplate',
      entityId: 'defaults',
      action: 'UPDATE',
      newValue: { resyncedCount: count },
    });
    res.json({ ok: true, count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/set-default
router.post('/:id/set-default', async (req: any, res) => {
  try {
    await req.tenantClient.transaction(async (tx: any) => {
      const [existing] = await tx
        .select()
        .from(schema.documentTemplates)
        .where(eq(schema.documentTemplates.id, req.params.id));
      if (!existing) throw new Error('No encontrada');
      await tx
        .update(schema.documentTemplates)
        .set({ isDefault: false })
        .where(eq(schema.documentTemplates.docType, existing.docType));
      await tx
        .update(schema.documentTemplates)
        .set({ isDefault: true })
        .where(eq(schema.documentTemplates.id, req.params.id));
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient.transaction(async (tx: any) => {
      const [existing] = await tx
        .select()
        .from(schema.documentTemplates)
        .where(eq(schema.documentTemplates.id, req.params.id));
      if (!existing) return;
      await tx
        .delete(schema.documentTemplates)
        .where(eq(schema.documentTemplates.id, req.params.id));
      // Si era default, promover el primer restante del mismo docType
      if (existing.isDefault) {
        const [next] = await tx
          .select()
          .from(schema.documentTemplates)
          .where(eq(schema.documentTemplates.docType, existing.docType))
          .limit(1);
        if (next) {
          await tx
            .update(schema.documentTemplates)
            .set({ isDefault: true })
            .where(eq(schema.documentTemplates.id, next.id));
        }
      }
    });
    PdfRenderer.invalidateCache();
    res.json({ ok: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'DocumentTemplate',
      entityId: req.params.id,
      action: 'DELETE',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /preview — renderiza un PDF sin persistir
router.post('/preview', async (req: any, res) => {
  try {
    const { html, docType, sampleDocId, queries, params } = req.body;
    if (!html) return res.status(400).json({ error: 'html es obligatorio' });
    if (!(await isTemplateDocType(req.tenantId, docType))) {
      return res.status(400).json({ error: 'docType inválido' });
    }
    const enrichedPayload = await templateContext(req, docType, {
      sampleDocId,
      queries,
      params,
    });

    registerCanvasHelpers();
    const meta = extractMetaFromHtml(html);
    const renderOptions = meta ? PdfRenderer.renderOptionsFromVisual(meta) : {};
    // Igual que al imprimir el documento de verdad (renderDocumentPdf).
    if (meta && (meta.showDocQr || meta.showDocBarcode) && enrichedPayload.doc) {
      renderOptions.pageFooter = PdfRenderer.pageFooterFromPayload(
        enrichedPayload,
        meta.footer.text,
      );
    }
    // Invalida cache de plantillas compiladas por si el HTML cambió con nuevos
    // helpers registrados después de una compilación previa.
    PdfRenderer.invalidateCache();
    const buffer = await PdfRenderer.render(html, enrichedPayload, renderOptions);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.end(buffer);
  } catch (e: any) {
    const msg = e?.stack || String(e);
    console.error('[DocumentTemplates] preview error:', msg);
    try {
      fs.appendFileSync(
        '/tmp/openfactu-preview-errors.log',
        `\n[${new Date().toISOString()}]\n${msg}\n`,
      );
    } catch {
      /* ignore */
    }
    res.status(500).json({ error: e?.message || 'Error al renderizar el preview' });
  }
});

// POST /render-elements — el HTML de cada elemento del lienzo, resuelto con los mismos
// datos y helpers que la vista previa: lo que se ve al diseñar es lo que sale en el PDF.
router.post('/render-elements', async (req: any, res) => {
  try {
    const { docType, pieces, sampleDocId, queries, params } = req.body ?? {};
    if (!Array.isArray(pieces) || pieces.some((piece) => typeof piece !== 'string')) {
      return res.status(400).json({ error: 'pieces es obligatorio' });
    }
    if (!(await isTemplateDocType(req.tenantId, docType))) {
      return res.status(400).json({ error: 'docType inválido' });
    }
    // Se pide a cada cambio: las consultas solo se lanzan si algún elemento las usa.
    const usesQueries = pieces.some((piece: string) => piece.includes('queries.'));
    const context = await templateContext(req, docType, {
      sampleDocId,
      queries: usesQueries ? queries : [],
      params,
    });
    registerCanvasHelpers();
    res.json({ html: renderTemplatePieces(pieces, context) });
  } catch (e: any) {
    console.error('[DocumentTemplates] render-elements error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al pintar los elementos' });
  }
});

// POST /:id/render-free — renderiza una plantilla de tipo FREE (sin payload
// de documento) ejecutando sus consultas SQL con los `params` recibidos como
// placeholders y devolviendo el PDF inline. Útil para etiquetas de artículos
// y otros impresos que no parten de un documento existente.
router.post('/:id/render-free', async (req: any, res) => {
  try {
    const [tpl] = await req.tenantClient
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.id, req.params.id));
    if (!tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!isFreeDocType(tpl.docType)) {
      return res.status(400).json({
        error: 'Sólo plantillas de tipo FREE o LABEL pueden renderizarse con render-free',
      });
    }
    if (!tpl.html) {
      return res.status(400).json({ error: 'La plantilla no tiene html' });
    }

    const params = (req.body?.params ?? {}) as Record<string, unknown>;
    const copies = Math.max(1, Math.min(200, Number(req.body?.copies ?? 1) || 1));

    // Las queries de la plantilla viven en canvasLayout.queries (FREE solo
    // tiene sentido si las define un admin). En cualquier caso ejecutamos las
    // queries con el contexto plano `params` permitiendo placeholders
    // arbitrarios (:itemId, :lote, :foo) además de los estándar.
    const layoutQueries: TemplateQuery[] = ((tpl.canvasLayout as any)?.queries ??
      []) as TemplateQuery[];
    const queryResults = await runTemplateQueries(req.tenantClient, layoutQueries, {
      // Mapeo flexible: cualquier clave de `params` sirve de placeholder.
      // Mantenemos las claves estándar para retrocompatibilidad si la query
      // las usa (`:docId`, `:partnerId`, `:companyId`, `:tenantId`).
      docId: (params.docId as string) ?? null,
      partnerId: (params.partnerId as string) ?? null,
      companyId: (params.companyId as string) ?? null,
      tenantId: req.tenantId ?? null,
      ...params,
    } as any);

    const enrichedPayload: any = {
      params,
      queries: queryResults.byName,
      // Fecha de generación para el elemento "Fecha" (FREE no trae documento).
      generatedAt: new Date().toLocaleString('es-ES'),
    };

    // Logueamos en consola y en una cabecera de respuesta cualquier error de
    // query — útil para depurar etiquetas que salen en blanco por una columna
    // inexistente, un placeholder mal escrito o una migración pendiente.
    if (queryResults.errors.length > 0) {
      console.warn(
        '[DocumentTemplates] render-free query errors:',
        JSON.stringify(queryResults.errors),
      );
      res.setHeader(
        'X-Render-Free-Errors',
        Buffer.from(JSON.stringify(queryResults.errors)).toString('base64'),
      );
    }
    // Diagnóstico extra: también incluimos qué nombres de query devolvieron
    // filas y cuántas — visible en DevTools → Network.
    res.setHeader(
      'X-Render-Free-Counts',
      Object.entries(queryResults.byName)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : 0}`)
        .join(';') || 'none',
    );

    registerCanvasHelpers();
    const meta = extractMetaFromHtml(tpl.html);
    const renderOptions = meta ? PdfRenderer.renderOptionsFromVisual(meta) : {};

    // Si se piden N copias, repetimos el cuerpo del HTML compilado tantas
    // veces como copias separando con un salto de página, para que cada
    // etiqueta salga en su propia página.
    let html = tpl.html;
    if (copies > 1) {
      // Heurística: insertamos una página adicional duplicando el contenido
      // entre <body>...</body> con un page-break entre copias. Si no hay
      // <body>, repetimos el html completo.
      const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
      if (bodyMatch) {
        const inner = bodyMatch[1];
        const sep = '<div style="page-break-after:always"></div>';
        const repeated = Array.from({ length: copies }, () => inner).join(sep);
        html = html.replace(bodyMatch[0], `<body>${repeated}</body>`);
      } else {
        const sep = '<div style="page-break-after:always"></div>';
        html = Array.from({ length: copies }, () => tpl.html).join(sep);
      }
    }

    PdfRenderer.invalidateCache();
    const buffer = await PdfRenderer.render(html, enrichedPayload, renderOptions);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="etiqueta.pdf"');
    res.end(buffer);
  } catch (e: any) {
    console.error('[DocumentTemplates] render-free error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al renderizar' });
  }
});

// POST /test-query — admin-only: ejecuta una única query contra el tenant
// activo y devuelve las primeras filas para validar su sintaxis/resultado
// desde el diseñador.
router.post('/test-query', async (req: any, res) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ error: 'Solo disponible para administradores' });
    }
    const { name, sql: rawSql, sampleDocId, sampleDocType, params } = req.body ?? {};
    if (typeof rawSql !== 'string' || !rawSql.trim()) {
      return res.status(400).json({ error: 'sql es obligatorio' });
    }
    const validation = validateQuery(rawSql);
    if (validation) return res.status(400).json({ error: validation });

    // Intentamos construir un payload de ejemplo para obtener ids que alimenten
    // los placeholders (:docId, :partnerId, :companyId). Si no hay sample, se
    // ejecuta con nulls — útil para queries que no dependan de contexto.
    let ctxPayload: any = null;
    try {
      if (sampleDocType && (await isTemplateDocType(req.tenantId, sampleDocType))) {
        ctxPayload = await samplePayload(req, sampleDocType, sampleDocId);
      }
    } catch {
      /* sin contexto */
    }

    const result = await runTemplateQueries(
      req.tenantClient,
      [{ name: name || 'test', sql: rawSql }],
      {
        docId: ctxPayload?.doc?.id ?? sampleDocId ?? null,
        partnerId: ctxPayload?.partner?.id ?? null,
        companyId: ctxPayload?.company?.id ?? null,
        tenantId: req.tenantId ?? null,
        ...(params && typeof params === 'object' ? params : {}),
      },
    );
    const key = Object.keys(result.byName)[0];
    if (!key) {
      return res.json({ ok: false, error: result.errors[0]?.error || 'Error desconocido' });
    }
    const rows = result.byName[key];
    res.json({
      ok: true,
      rows: rows.slice(0, 50),
      rowCount: rows.length,
      columns: result.columns[key] ?? [],
      truncated: rows.length >= 1000,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Genera una plantilla de un tipo de documento ESTÁNDAR sin que el modelo
 * escriba una sola línea de HTML: elige `visualOptions` y el HTML lo construye
 * `buildVisualTemplate`, exactamente la misma función que el modo Visual del
 * diseñador y que las tools del chat (`preview_document_template`).
 *
 * El porqué está en core/ai/tools/documentTemplateTools.ts: una plantilla de
 * HTML libre se guarda sin meta, y en cuanto alguien la abre en modo Visual
 * para tocar un detalle el HTML se regenera desde cero y el diseño se pierde.
 * Generando con `buildVisualTemplate`, el HTML lleva el meta incrustado
 * (`serializeMeta`), el diseñador reconstruye las `VisualOptions` exactas y la
 * plantilla queda editable sin riesgo.
 */
async function generateVisualTemplate(opts: {
  model: any;
  docType: DocType;
  description: string;
  currentVisualOptions?: unknown;
  feedback?: string;
}) {
  const system = [
    'Eres un experto en diseño de plantillas de documento del ERP Keirost (se renderizan a PDF con Puppeteer).',
    'NO escribes HTML: describes el diseño eligiendo opciones, y el sistema construye el HTML a partir de ellas. Así la plantilla queda editable después en el modo Visual del diseñador.',
    `Tipo de documento: ${opts.docType}.`,
    '',
    VISUAL_OPTIONS_PROMPT_GUIDE,
    '',
    // Ver la nota del generador FREE/LABEL más abajo: el literal "JSON" es
    // obligatorio para los proveedores OpenAI-compatible con response_format.
    'Responde SOLO con un objeto JSON con los campos pedidos: visualOptions y notes (explicación breve en español de las decisiones de diseño).',
  ].join('\n');

  const userParts: string[] = [`Descripción de la plantilla pedida:\n${opts.description.trim()}`];
  if (opts.currentVisualOptions) {
    userParts.push(
      'Opciones actuales (ajústalas en lugar de partir de cero):\n' +
        JSON.stringify(opts.currentVisualOptions, null, 1),
    );
    if (opts.feedback?.trim()) userParts.push(`Cambios solicitados:\n${opts.feedback.trim()}`);
  }

  const generation = await generateObject({
    model: opts.model,
    schema: z.object({
      visualOptions: visualOptionsInputSchema,
      notes: z.string().optional(),
    }),
    system,
    prompt: userParts.join('\n\n'),
    abortSignal: AbortSignal.timeout(180_000),
  });

  const merged = mergeVisualOptions(generation.object.visualOptions);
  const visualOptions = isUserDocType(opts.docType)
    ? { ...merged, layout: 'record' as const }
    : merged;
  return {
    html: buildVisualTemplate(opts.docType, visualOptions),
    visualOptions,
    notes: generation.object.notes ?? '',
  };
}

/**
 * POST /generate — admin-only: generador de plantillas con IA (Fase 1).
 *
 * El admin describe la plantilla en lenguaje natural y el modelo (configurado
 * en Ajustes → IA) devuelve una plantilla, por DOS caminos distintos según el
 * tipo — el mismo criterio que usa el diseñador para decidir si ofrece modo
 * Visual:
 *
 *  - Tipos estándar (SINV/PO/...): el modelo elige `visualOptions` y el HTML
 *    lo genera `buildVisualTemplate` (ver `generateVisualTemplate` arriba). Sin
 *    queries — en producción `renderDocumentPdf` no las ejecuta para estos
 *    tipos. La respuesta incluye `visualOptions` para poder iterar sobre ellas.
 *  - FREE/LABEL: no hay payload de documento ni modo Visual que valga, así que
 *    el modelo sí escribe HTML libre y los datos salen exclusivamente de
 *    consultas SQL de lectura (mismo sandbox que el diseñador: validateQuery +
 *    transacción READ ONLY), con el esquema del tenant como contexto.
 *
 * En el camino FREE/LABEL las queries propuestas se validan con `validateQuery`;
 * si alguna falla se hace UNA pasada de reparación con los errores y, si
 * persisten, se devuelven como `warnings` para que el admin las revise.
 *
 * Body: { docType, description, feedback?, currentVisualOptions? (estándar),
 * currentHtml? + currentQueries? (FREE/LABEL) } — los `current*` + feedback son
 * el modo "ajustar una generación anterior".
 */
router.post('/generate', async (req: any, res) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ error: 'Solo disponible para administradores' });
    }
    const { docType, description, currentHtml, currentQueries, currentVisualOptions, feedback } =
      req.body ?? {};
    if (!(await isTemplateDocType(req.tenantId, docType))) {
      return res.status(400).json({ error: 'docType inválido' });
    }
    if (typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'description es obligatoria' });
    }

    const aiConfig = await getAiConfig(req.tenantClient);
    if (!aiConfig.enabled) {
      return res.status(400).json({
        error: 'El asistente de IA está desactivado. Actívalo en Ajustes → Empresa → IA.',
      });
    }
    const model = getLanguageModel(aiConfig);
    const start = Date.now();

    const auditGeneration = (extra: Record<string, unknown>) =>
      logAudit({
        tenantClient: req.tenantClient,
        tenantId: req.tenantId || '',
        userId: req.user?.id,
        entityType: 'DocumentTemplate',
        entityId: 'generate',
        action: 'CREATE',
        newValue: { docType, description: description.slice(0, 500), ...extra },
      });

    // ── Tipos estándar: opciones visuales, sin HTML escrito por el modelo ──
    if (!isFreeDocType(docType)) {
      const visual = await generateVisualTemplate({
        model,
        docType,
        description,
        currentVisualOptions,
        feedback,
      });
      res.json({
        html: visual.html,
        visualOptions: visual.visualOptions,
        queries: [],
        notes: visual.notes,
        warnings: [],
        provider: aiConfig.provider,
        ms: Date.now() - start,
      });
      auditGeneration({ mode: 'visual' });
      return;
    }

    // ── FREE/LABEL: HTML libre + consultas SQL ──
    const compact = schemaInfoToCompactText(await fetchSchemaInfo(req.tenantClient));
    const dataContext = [
      'No hay payload de documento: los datos salen EXCLUSIVAMENTE de consultas SQL que tú defines.',
      'Cada query { name, sql } se ejecuta al renderizar y sus filas quedan disponibles en el HTML como `{{queries.<name>}}` (array de objetos, itera con {{#each}}).',
      'Reglas SQL obligatorias: PostgreSQL; UNA sola sentencia SELECT (o WITH ... SELECT); prohibidas palabras de escritura/DDL; nombres de tabla y columna SIEMPRE entre comillas dobles (son case-sensitive, p.ej. "Item", "docCode").',
      'Placeholders: `:nombre` se sustituye por un literal escapado. Estándar: :docId, :partnerId, :companyId, :tenantId. Puedes usar params propios (p.ej. :itemId) — el usuario los rellena al generar el documento y también están en el HTML como {{params.<nombre>}}.',
      '',
      'Esquema del tenant (tabla(columna tipo, ...)):',
      compact,
    ].join('\n');

    const system = [
      'Eres un experto en plantillas de documentos del ERP Keirost. Generas plantillas HTML con Handlebars que se renderizan a PDF (A4, Puppeteer).',
      '',
      'Reglas del HTML:',
      '- Documento HTML completo (<!DOCTYPE html> ... </html>) con el CSS en un <style> interno. Sin recursos externos (ni fuentes remotas, ni imágenes por URL externa); usa font-family del sistema.',
      '- Sintaxis Handlebars: {{campo}}, {{#each coleccion}}...{{/each}}, {{#if}}...{{/if}}.',
      '- Helpers disponibles: formatCurrency, formatDate, eq, gt, neq, lt, count, sum, avg, min, max, today, formatAddress, barcode, qrCode. Los agregados se usan como subexpresión: {{formatCurrency (sum lines "lineTotal")}}.',
      '- Diseño profesional y limpio, pensado para imprimir: tipografía legible, tablas con cabecera, totales destacados.',
      `- Tipo de documento: ${docType}.`,
      '',
      dataContext,
      '',
      // El literal "objeto JSON" es a propósito, no solo descriptivo: varios
      // proveedores OpenAI-compatible (DeepSeek incluido) exigen que la
      // palabra "json" aparezca en el prompt para aceptar
      // response_format=json_object — sin ella rechazan la request entera
      // con "Prompt must contain the word 'json'...", antes de llegar
      // siquiera a generar nada.
      'Responde SOLO con un objeto JSON con los campos pedidos: html (la plantilla completa), queries (array, puede ser vacío) y notes (explicación breve en español de qué hace la plantilla y qué params espera, si aplica).',
    ].join('\n');

    const userParts: string[] = [`Descripción de la plantilla pedida:\n${description.trim()}`];
    if (typeof currentHtml === 'string' && currentHtml.trim()) {
      userParts.push(
        'Plantilla actual (ajústala en lugar de partir de cero):\n' + currentHtml,
        Array.isArray(currentQueries) && currentQueries.length
          ? 'Queries actuales:\n' + JSON.stringify(currentQueries, null, 1)
          : 'Queries actuales: ninguna.',
      );
      if (typeof feedback === 'string' && feedback.trim()) {
        userParts.push(`Cambios solicitados:\n${feedback.trim()}`);
      }
    }

    const resultSchema = z.object({
      html: z.string(),
      queries: z.array(z.object({ name: z.string(), sql: z.string() })),
      notes: z.string().optional(),
    });

    const generation = await generateObject({
      model,
      schema: resultSchema,
      system,
      prompt: userParts.join('\n\n'),
      abortSignal: AbortSignal.timeout(180_000),
    });
    let { html, queries, notes } = generation.object;

    // ── Validación de queries + una pasada de reparación ──
    const validate = (qs: Array<{ name: string; sql: string }>) =>
      qs
        .map((q) => ({ name: q.name, error: validateQuery(q.sql) }))
        .filter((r): r is { name: string; error: string } => r.error !== null);

    let warnings = validate(queries);
    if (warnings.length > 0) {
      try {
        const repair = await generateObject({
          model,
          schema: resultSchema,
          system,
          prompt: [
            userParts.join('\n\n'),
            'Tu propuesta anterior:\n' + JSON.stringify({ html, queries }, null, 1),
            'Estas queries NO pasan la validación del sandbox — corrígelas y devuelve el objeto completo de nuevo:\n' +
              warnings.map((w) => `- ${w.name}: ${w.error}`).join('\n'),
          ].join('\n\n'),
          abortSignal: AbortSignal.timeout(180_000),
        });
        html = repair.object.html;
        queries = repair.object.queries;
        notes = repair.object.notes ?? notes;
        warnings = validate(queries);
      } catch {
        /* si la reparación falla, devolvemos la 1ª propuesta con sus warnings */
      }
    }

    res.json({
      html,
      queries,
      notes: notes ?? '',
      warnings,
      provider: aiConfig.provider,
      ms: Date.now() - start,
    });
    auditGeneration({ mode: 'html', warnings: warnings.length });
  } catch (e: any) {
    console.error('[DocumentTemplates.generate]', e);
    res.status(502).json({ error: e?.message || 'Error al generar la plantilla con IA' });
  }
});

// POST /:id/param-options — opciones (value/label) de un parámetro de tipo lista
// cuya fuente es una consulta (`optionsQuery` definida por un admin en la
// plantilla). Disponible para cualquier usuario del tenant (solo lectura): no
// ejecuta SQL arbitrario del cliente, solo la consulta guardada en la plantilla.
router.post('/:id/param-options', async (req: any, res) => {
  try {
    const paramName = String(req.body?.param ?? '');
    if (!paramName) return res.status(400).json({ error: 'param es obligatorio' });
    const [tpl] = await req.tenantClient
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.id, req.params.id));
    if (!tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const schemaDefs: any[] = (tpl.canvasLayout as any)?.paramsSchema ?? [];
    const def = schemaDefs.find((p) => p?.name === paramName);
    const sqlText = def?.optionsQuery;
    if (!sqlText || typeof sqlText !== 'string') return res.json({ options: [] });

    const validation = validateQuery(sqlText);
    if (validation) return res.status(400).json({ error: validation });

    const result = await runTemplateQueries(req.tenantClient, [{ name: 'opts', sql: sqlText }], {
      docId: null,
      partnerId: null,
      companyId: null,
      tenantId: req.tenantId ?? null,
    } as any);
    if (result.errors.length > 0) {
      return res.json({ options: [], error: result.errors[0]?.error });
    }
    const rows = (result.byName['opts'] ?? []) as Record<string, unknown>[];
    // Convención: columnas `value` y `label`. Si faltan, 1ª col = value, 2ª = label.
    const options = rows.map((r) => {
      const keys = Object.keys(r);
      const value = r.value !== undefined ? r.value : r[keys[0]];
      const label = r.label !== undefined ? r.label : (r[keys[1]] ?? value);
      return { value: String(value ?? ''), label: String(label ?? '') };
    });
    res.json({ options });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
