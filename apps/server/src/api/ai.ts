/**
 * Endpoints de IA por tenant (Fase 0 — fundación del proveedor).
 *
 *   GET    /api/ai/providers            — registro de proveedores para la UI
 *   GET    /api/ai/config               — config de IA (API key nunca en claro)
 *   PUT    /api/ai/config               — actualiza la config
 *   POST   /api/ai/test                 — generateText() de prueba contra el proveedor activo
 *   GET    /api/ai/local/models         — modelos instalados en Ollama + catálogo curado
 *   GET    /api/ai/local/models/search  — búsqueda de GGUF en Hugging Face (proxy)
 *   POST   /api/ai/local/models/pull    — descarga un modelo vía Ollama (stream NDJSON de progreso)
 *   POST   /api/ai/local/models/apply-context — crea un modelo derivado con num_ctx fijado
 *   DELETE /api/ai/local/models         — borra un modelo instalado (?name=)
 *
 * Requieren ADMIN o SUPERUSER (la API key es sensible; a diferencia de
 * /api/config, aquí el secreto se enmascara siempre en las respuestas).
 *
 * Excepción — no requieren admin (cualquier usuario del tenant, como /chat):
 *   GET    /api/ai/available-models          — modelos alternativos del proveedor activo (selector del chat)
 *   GET    /api/ai/conversations             — lista de conversaciones guardadas del usuario actual
 *   GET    /api/ai/conversations/:id         — una conversación completa (dueño únicamente)
 *   PUT    /api/ai/conversations/:id         — crea o actualiza (el cliente decide el id)
 *   DELETE /api/ai/conversations/:id         — borra (dueño únicamente)
 *   POST   /api/ai/extract-file              — extrae texto de un Excel/PDF/Word/CSV adjuntado al chat
 */

import { Router } from 'express';
import { Readable } from 'stream';
import { generateText } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import multer from 'multer';
import fs from 'fs';
import { adminMiddleware } from './middleware/adminAuth';
import { getConfigSection, setConfigSection } from '../core/config/systemConfigSection';
import { AI_DEFAULTS, AiConfig } from '../core/ai/types';
import { AI_PROVIDERS, getAiConfig, getLanguageModel, listProviders } from '../core/ai';
import { LOCAL_MODEL_CATALOG } from '../core/ai/localCatalog';
import { streamChat, AiDisabledError } from '../core/ai/chat/chatEngine';
import { extractTextFromFile } from '../core/ai/fileProcessing';
import { resolveEffectivePermissions } from '../core/auth/resolveEffectivePermissions';
import { logAudit } from '../utils/audit';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';

const router = Router();
const uploadChatFile = multer({
  dest: '/tmp/openfactu-ai-chat-file/',
  limits: { fileSize: 15 * 1024 * 1024 },
});

/**
 * POST /chat — chat interno de IA (Fase 2, solo lectura). Va ANTES del
 * adminMiddleware: cualquier usuario autenticado del tenant puede chatear;
 * las tools sensibles (SQL libre) se filtran por rol dentro de buildChatTools.
 * Responde con el UI message stream del Vercel AI SDK (lo consume useChat).
 */
router.post('/chat', async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: 'No autorizado' });
  if (!req.tenantClient || !req.tenantSchema) {
    return res.status(400).json({ error: 'Se requiere tenant' });
  }
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (messages.length === 0) return res.status(400).json({ error: 'messages es obligatorio' });

    // Selector de modelo del chat (opcional): el cliente puede pedir un
    // modelo distinto al guardado en Ajustes → IA para ESTE turno — mismo
    // proveedor/baseUrl/apiKey (los controla el tenant), solo cambia el id de
    // modelo pasado al SDK. Sanity check laxo, no allowlist: el peor caso es
    // un 404 del proveedor, no hay superficie nueva (baseUrl/key no cambian).
    const modelOverride =
      typeof req.body?.model === 'string' && /^[\w.:/-]{1,200}$/.test(req.body.model.trim())
        ? req.body.model.trim()
        : undefined;

    // Solo para saber qué consejo dar si la respuesta se corta por límite de
    // tokens (el de Ollama es distinto al de un proveedor cloud) — barato,
    // ya es una lectura cacheable de systemConfigs.
    const cfgForMeta = await getAiConfig(req.tenantClient);
    const effectiveModel = modelOverride || cfgForMeta.model || AI_PROVIDERS[cfgForMeta.provider]?.defaultModel;

    // Permisos granulares reales del usuario (null = ADMIN/SUPERUSER, acceso
    // total) — sin esto, buildChatTools no puede filtrar qué tools de
    // lectura/escritura mostrarle a un rol restringido (ver hasModuleAccess).
    const effectivePermissions = await resolveEffectivePermissions(
      req.user.id,
      req.tenantId,
      req.user.role,
    );

    const result = await streamChat({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      tenantSchema: req.tenantSchema,
      user: req.user,
      effectivePermissions,
      messages,
      modelOverride,
      // Mismo patrón que dashboardWidgets.ts: el host que el navegador usó
      // para llegar aquí, para que render_component compile imports externos
      // (react, @openfactu/ui...) contra ESTE server, no uno hardcodeado.
      apiBase: `${req.protocol}://${req.get('host')}`,
    });
    result.pipeUIMessageStreamToResponse(res, {
      onError: (e: unknown) => (e instanceof Error ? e.message : 'Error del proveedor de IA'),
      // Adjunta el uso de tokens y el motivo de fin al mensaje — el chat lo
      // muestra como pista de "cuánto contexto se ha usado" (pedido por el
      // usuario) y avisa si la respuesta se cortó por límite de tokens.
      messageMetadata: ({ part }) => {
        if (part.type !== 'finish') return undefined;
        return {
          finishReason: part.finishReason,
          provider: cfgForMeta.provider,
          localBackend: cfgForMeta.localBackend,
          model: effectiveModel,
          usage: {
            inputTokens: part.totalUsage.inputTokens,
            outputTokens: part.totalUsage.outputTokens,
            totalTokens: part.totalUsage.totalTokens,
          },
        };
      },
    });
  } catch (e: any) {
    console.error('[Ai.chat]', e);
    const status = e instanceof AiDisabledError ? 400 : 502;
    if (!res.headersSent) {
      res.status(status).json({ error: e?.message || 'Error en el chat de IA' });
    } else {
      res.end();
    }
  }
});

/**
 * GET /capabilities — igual que /chat, ANTES del gate de admin: cualquier
 * usuario del tenant necesita saber si puede adjuntar imágenes en el chat,
 * sin tener acceso al resto de la config (key, baseUrl...).
 */
router.get('/capabilities', async (req: any, res) => {
  if (!req.tenantClient) return res.json({ enabled: false, supportsImages: false, contextWindow: null });
  try {
    const cfg = await getAiConfig(req.tenantClient);
    res.json({
      enabled: cfg.enabled,
      supportsImages: cfg.supportsImages,
      // Solo tiene sentido mostrarla para local/Ollama — en cloud el contexto
      // real del modelo no lo gestionamos nosotros.
      contextWindow: cfg.provider === 'local' && cfg.localBackend === 'ollama' ? cfg.contextWindow : null,
    });
  } catch {
    res.json({ enabled: false, supportsImages: false, contextWindow: null });
  }
});

/**
 * POST /extract-file — extrae texto de un Excel/PDF/Word/CSV adjuntado al
 * chat. Va ANTES del gate de admin: cualquier usuario del tenant puede
 * adjuntar un documento para que Keiro lo lea, igual que /chat. El texto
 * extraído (nunca el archivo en sí) es lo que viaja como parte del mensaje —
 * funciona igual sea cual sea el proveedor de IA activo, incluso uno local
 * sin soporte nativo de esos formatos.
 */
router.post('/extract-file', uploadChatFile.single('file'), async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: 'No autorizado' });
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo (campo "file")' });
  try {
    const buffer = await fs.promises.readFile(req.file.path);
    const { text, truncated } = await extractTextFromFile(buffer, req.file.originalname);
    res.json({ filename: req.file.originalname, text, truncated });
  } catch (e: any) {
    console.error('[Ai.extractFile]', e);
    res.status(400).json({ error: e?.message || 'No se pudo leer el archivo' });
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
});

/**
 * GET /available-models — igual que /capabilities, ANTES del gate de admin:
 * alimenta el selector de modelo del chat. Para local/Ollama lista los
 * instalados de verdad (proxy a /api/tags); para cloud/custom no gestionamos
 * un catálogo alternativo, así que solo se ofrece el modelo ya configurado
 * (la UI del chat oculta el selector si `options.length <= 1`).
 */
router.get('/available-models', async (req: any, res) => {
  if (!req.tenantClient) return res.json({ provider: 'anthropic', current: '', options: [] });
  try {
    const cfg = await getAiConfig(req.tenantClient);
    const current = cfg.model || AI_PROVIDERS[cfg.provider]?.defaultModel || '';
    if (cfg.provider === 'local' && cfg.localBackend === 'ollama') {
      try {
        const base = (cfg.baseUrl || AI_DEFAULTS.baseUrl).replace(/\/+$/, '');
        const tagsRes = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
        const tags: any = await tagsRes.json();
        const options = (Array.isArray(tags?.models) ? tags.models : []).map((m: any) => m.name);
        // Si el modelo guardado ya no existe de verdad en Ollama (borrado a
        // mano, o una creación de "Ventana de contexto" que falló a medias),
        // no se lo devolvemos como `current` — el chat lo usaría directo y
        // fallaría con "model ... not found" en el primer mensaje. Mejor
        // caer al primero que sí está instalado.
        const safeCurrent = options.includes(current) ? current : options[0] || current;
        return res.json({ provider: cfg.provider, current: safeCurrent, options });
      } catch {
        return res.json({ provider: cfg.provider, current, options: current ? [current] : [] });
      }
    }
    res.json({ provider: cfg.provider, current, options: current ? [current] : [] });
  } catch {
    res.json({ provider: 'anthropic', current: '', options: [] });
  }
});

/** Deriva un título corto del primer mensaje de usuario, si no viene uno explícito. */
function deriveConversationTitle(messages: any[]): string {
  const firstUserText = messages
    .find((m: any) => m.role === 'user')
    ?.parts?.find((p: any) => p.type === 'text')?.text as string | undefined;
  const text = (firstUserText || 'Conversación').trim().replace(/\s+/g, ' ');
  return text.length > 60 ? `${text.slice(0, 60)}…` : text || 'Conversación';
}

/**
 * Conversaciones guardadas del chat. Viven en `public` acotadas por
 * tenantId + userId (ver comentario en db/schema.ts) — cada usuario solo ve
 * y toca las suyas, así que estas rutas van ANTES del gate de admin igual
 * que /chat.
 */
router.get('/conversations', async (req: any, res) => {
  if (!req.user?.id || !req.tenantId) return res.status(401).json({ error: 'No autorizado' });
  try {
    const db = ClientFactory.getClient('public');
    const rows = await db
      .select({
        id: schema.aiConversations.id,
        title: schema.aiConversations.title,
        model: schema.aiConversations.model,
        updatedAt: schema.aiConversations.updatedAt,
      })
      .from(schema.aiConversations)
      .where(
        and(
          eq(schema.aiConversations.tenantId, req.tenantId),
          eq(schema.aiConversations.userId, req.user.id),
        ),
      )
      .orderBy(desc(schema.aiConversations.updatedAt))
      .limit(50);
    res.json(rows);
  } catch (e: any) {
    console.error('[Ai.listConversations]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.get('/conversations/:id', async (req: any, res) => {
  if (!req.user?.id || !req.tenantId) return res.status(401).json({ error: 'No autorizado' });
  try {
    const db = ClientFactory.getClient('public');
    const [row] = await db
      .select()
      .from(schema.aiConversations)
      .where(
        and(
          eq(schema.aiConversations.id, req.params.id),
          eq(schema.aiConversations.tenantId, req.tenantId),
          eq(schema.aiConversations.userId, req.user.id),
        ),
      );
    if (!row) return res.status(404).json({ error: 'Conversación no encontrada' });
    res.json(row);
  } catch (e: any) {
    console.error('[Ai.getConversation]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/** Crea o actualiza — el cliente decide el id (crypto.randomUUID() al primer mensaje). */
router.put('/conversations/:id', async (req: any, res) => {
  if (!req.user?.id || !req.tenantId) return res.status(401).json({ error: 'No autorizado' });
  const { id } = req.params;
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!id || !messages) return res.status(400).json({ error: 'Falta id o messages' });
  try {
    const db = ClientFactory.getClient('public');
    const [existing] = await db
      .select({ userId: schema.aiConversations.userId })
      .from(schema.aiConversations)
      .where(
        and(eq(schema.aiConversations.id, id), eq(schema.aiConversations.tenantId, req.tenantId)),
      );
    if (existing && existing.userId !== req.user.id) {
      return res.status(403).json({ error: 'No es tu conversación' });
    }
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim()
        : deriveConversationTitle(messages);
    const model = typeof req.body?.model === 'string' ? req.body.model : null;

    if (existing) {
      await db
        .update(schema.aiConversations)
        .set({ title, messages, model, updatedAt: new Date() })
        .where(eq(schema.aiConversations.id, id));
    } else {
      await db.insert(schema.aiConversations).values({
        id,
        tenantId: req.tenantId,
        userId: req.user.id,
        title,
        messages,
        model,
      });
    }
    res.json({ ok: true, id, title });
  } catch (e: any) {
    console.error('[Ai.saveConversation]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.delete('/conversations/:id', async (req: any, res) => {
  if (!req.user?.id || !req.tenantId) return res.status(401).json({ error: 'No autorizado' });
  try {
    const db = ClientFactory.getClient('public');
    const [existing] = await db
      .select({ userId: schema.aiConversations.userId })
      .from(schema.aiConversations)
      .where(
        and(
          eq(schema.aiConversations.id, req.params.id),
          eq(schema.aiConversations.tenantId, req.tenantId),
        ),
      );
    if (!existing) return res.status(404).json({ error: 'Conversación no encontrada' });
    if (existing.userId !== req.user.id) {
      return res.status(403).json({ error: 'No es tu conversación' });
    }
    await db.delete(schema.aiConversations).where(eq(schema.aiConversations.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Ai.deleteConversation]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.use(adminMiddleware);

function requireTenant(req: any, res: any, next: any) {
  if (!req.tenantClient) {
    return res.status(400).json({ error: 'Se requiere tenant para la configuración de IA' });
  }
  next();
}
router.use(requireTenant);

/** Nunca devolvemos la key: solo el flag de si hay una guardada. */
function redactApiKey(cfg: AiConfig): Omit<AiConfig, 'apiKey'> & { apiKeySet: boolean } {
  const { apiKey, ...rest } = cfg;
  return { ...rest, apiKeySet: Boolean(apiKey) };
}

router.get('/providers', (_req, res) => {
  res.json(listProviders());
});

router.get('/config', async (req: any, res) => {
  try {
    const cfg = await getAiConfig(req.tenantClient);
    res.json(redactApiKey(cfg));
  } catch (e: any) {
    console.error('[Ai.getConfig]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

router.put('/config', async (req: any, res) => {
  try {
    const patch = { ...req.body };
    // Si el cliente no escribe una key nueva, no machacamos la guardada.
    // Para limpiarla explícitamente, la UI manda `"clearApiKey": true`.
    if (patch.clearApiKey === true) patch.apiKey = '';
    else if (!patch.apiKey) delete patch.apiKey;
    delete patch.clearApiKey;
    delete patch.apiKeySet;

    const before = await getConfigSection(req.tenantClient, 'ai', AI_DEFAULTS);
    const after = await setConfigSection(req.tenantClient, 'ai', AI_DEFAULTS, patch);
    res.json(redactApiKey(after));
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'AiConfig',
      entityId: 'ai',
      action: 'UPDATE',
      // La key jamás va al audit log — solo el resto de la config.
      oldValue: redactApiKey(before),
      newValue: redactApiKey(after),
    });
  } catch (e: any) {
    console.error('[Ai.putConfig]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/**
 * Criterio de hecho de la Fase 0: una llamada real a generateText() contra el
 * proveedor configurado. Acepta un `prompt` opcional en el body.
 */
router.post('/test', async (req: any, res) => {
  try {
    const cfg = await getAiConfig(req.tenantClient);
    const model = getLanguageModel(cfg);
    const modelId = cfg.model || AI_PROVIDERS[cfg.provider]?.defaultModel || '';
    const prompt =
      typeof req.body?.prompt === 'string' && req.body.prompt.trim()
        ? req.body.prompt.trim()
        : 'Responde con una sola frase corta confirmando que la conexión funciona.';

    const start = Date.now();
    const result = await generateText({ model, prompt });
    res.json({
      ok: true,
      provider: cfg.provider,
      model: modelId,
      text: result.text,
      ms: Date.now() - start,
    });
  } catch (e: any) {
    console.error('[Ai.test]', e);
    // Errores de config (key/modelo faltante) o del proveedor — legibles para la UI
    res.status(502).json({ ok: false, error: e?.message || 'Error al llamar al proveedor de IA' });
  }
});

// ─────────────────────────── Modelos locales (Ollama) ───────────────────────────

/** Base URL del backend local según la config del tenant (sin barra final). */
async function localBaseUrl(db: any): Promise<string> {
  const cfg = await getAiConfig(db);
  return (cfg.baseUrl || AI_DEFAULTS.baseUrl).replace(/\/+$/, '');
}

/**
 * Instalados en Ollama + catálogo curado. Si Ollama no responde, degradamos a
 * `{ reachable: false, catalog }` sin 500 para que la UI lo muestre como aviso.
 */
router.get('/local/models', async (req: any, res) => {
  const base = await localBaseUrl(req.tenantClient).catch(() => AI_DEFAULTS.baseUrl);
  try {
    const tagsRes = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!tagsRes.ok) throw new Error(`Ollama respondió ${tagsRes.status}`);
    const tags: any = await tagsRes.json();
    const installed = Array.isArray(tags?.models) ? tags.models : [];

    // La compatibilidad tool-calling la reporta el propio Ollama (/api/show).
    const models = await Promise.all(
      installed.map(async (m: any) => {
        let toolCalling = false;
        try {
          const showRes = await fetch(`${base}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: m.name, name: m.name }),
            signal: AbortSignal.timeout(3000),
          });
          const info: any = await showRes.json();
          toolCalling = Array.isArray(info?.capabilities) && info.capabilities.includes('tools');
        } catch {
          /* sin dato de capabilities — lo dejamos en false */
        }
        return {
          name: m.name,
          sizeBytes: m.size ?? 0,
          modifiedAt: m.modified_at ?? null,
          toolCalling,
        };
      }),
    );

    // Runtime: modelos cargados ahora mismo y si están en GPU o CPU. Ollama
    // reparte capas a VRAM cuando hay GPU — `size_vram > 0` = usando GPU.
    // (GPU/CPU se decide al ARRANCAR el contenedor: dev:ai vs dev:ai:gpu.)
    let runtime: Array<{ model: string; gpu: boolean; vramBytes: number }> = [];
    try {
      const psRes = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(3000) });
      const ps: any = await psRes.json();
      runtime = (Array.isArray(ps?.models) ? ps.models : []).map((m: any) => ({
        model: m.name,
        vramBytes: m.size_vram ?? 0,
        gpu: (m.size_vram ?? 0) > 0,
      }));
    } catch {
      /* sin dato de runtime */
    }

    res.json({ reachable: true, models, runtime, catalog: LOCAL_MODEL_CATALOG });
  } catch {
    res.json({ reachable: false, models: [], runtime: [], catalog: LOCAL_MODEL_CATALOG });
  }
});

// Cache simple del proxy a Hugging Face (la lista pública cambia poco).
const hfCache = new Map<string, { ts: number; data: any }>();
const HF_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Búsqueda de modelos GGUF en la API pública de Hugging Face. Cualquier
 * resultado es descargable en Ollama con el nombre `hf.co/<repo>`.
 */
router.get('/local/models/search', async (req: any, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ results: [] });
  const cached = hfCache.get(q);
  if (cached && Date.now() - cached.ts < HF_CACHE_TTL_MS) {
    return res.json({ results: cached.data });
  }
  try {
    const url =
      'https://huggingface.co/api/models?search=' +
      encodeURIComponent(q) +
      '&filter=gguf&sort=downloads&limit=20';
    const hfRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!hfRes.ok) throw new Error(`Hugging Face respondió ${hfRes.status}`);
    const data: any = await hfRes.json();
    const results = (Array.isArray(data) ? data : []).map((m: any) => ({
      id: m.id,
      downloads: m.downloads ?? 0,
      likes: m.likes ?? 0,
      pullName: `hf.co/${m.id}`,
    }));
    hfCache.set(q, { ts: Date.now(), data: results });
    res.json({ results });
  } catch (e: any) {
    console.error('[Ai.hfSearch]', e);
    res.status(502).json({ error: e?.message || 'Error al buscar en Hugging Face' });
  }
});

/**
 * Descarga un modelo vía Ollama re-emitiendo su stream NDJSON de progreso
 * ({ status, digest, total, completed }) para la barra de progreso de la UI.
 * Si el cliente cancela (AbortController en el navegador), cortamos el proxy.
 */
router.post('/local/models/pull', async (req: any, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre del modelo' });

  const base = await localBaseUrl(req.tenantClient).catch(() => AI_DEFAULTS.baseUrl);
  const upstreamAbort = new AbortController();
  req.on('close', () => upstreamAbort.abort());

  try {
    const pullRes = await fetch(`${base}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, name, stream: true }),
      signal: upstreamAbort.signal,
    });
    if (!pullRes.ok || !pullRes.body) {
      const detail = await pullRes.text().catch(() => '');
      return res
        .status(502)
        .json({ error: `Ollama respondió ${pullRes.status}${detail ? `: ${detail}` : ''}` });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    (res as any).flushHeaders?.();

    const nodeStream = Readable.fromWeb(pullRes.body as any);
    nodeStream.pipe(res);
    nodeStream.on('error', () => res.end());
  } catch (e: any) {
    if (upstreamAbort.signal.aborted) return; // el cliente canceló — no es un error
    console.error('[Ai.pull]', e);
    if (!res.headersSent) {
      res.status(502).json({ error: e?.message || 'No se pudo conectar con Ollama' });
    } else {
      res.end();
    }
  }
});

/**
 * Ollama ignora `num_ctx` puesto en cada request vía su capa OpenAI-compatible
 * (ver comentario en core/ai/index.ts) — la única forma real de ampliar el
 * contexto es hornearlo en el propio modelo. Este endpoint crea un modelo
 * Ollama derivado del base (`FROM <base>` + `PARAMETER num_ctx <n>`) vía
 * `/api/create` y devuelve su nombre para que la UI lo deje seleccionado
 * como modelo activo — casi instantáneo porque reutiliza las capas del base
 * ya descargado, no vuelve a bajar nada.
 */
router.post('/local/models/apply-context', async (req: any, res) => {
  const rawBaseModel = String(req.body?.baseModel || '').trim();
  const contextWindow = Number(req.body?.contextWindow);
  if (!rawBaseModel) return res.status(400).json({ error: 'Falta el modelo base' });
  if (!Number.isInteger(contextWindow) || contextWindow < 512 || contextWindow > 131072) {
    return res.status(400).json({ error: 'Ventana de contexto inválida (512-131072)' });
  }

  // El "modelo base" que llega puede ser ya un derivado nuestro (el usuario
  // aplicó esto antes, y el selector ahora muestra "...-ctx4096" como
  // activo) — quitamos ese sufijo para derivar SIEMPRE del modelo original,
  // si no cada aplicación sucesiva encadena otro "-ctxN" al nombre
  // ("...-ctx4096-ctx8192-...") en vez de simplemente reemplazarlo.
  const baseModel = rawBaseModel.replace(/-ctx\d+$/, '');

  const base = await localBaseUrl(req.tenantClient).catch(() => AI_DEFAULTS.baseUrl);
  const colonIdx = baseModel.indexOf(':');
  const derivedName =
    colonIdx === -1
      ? `${baseModel}:ctx${contextWindow}`
      : `${baseModel.slice(0, colonIdx)}:${baseModel.slice(colonIdx + 1)}-ctx${contextWindow}`;

  const createAttempt = (body: unknown) =>
    fetch(`${base}/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

  // Ollama puede responder 200 con `{ error: "..." }` en el cuerpo — con
  // stream:false suele ser un único JSON, pero por si acaso nos quedamos con
  // la última línea no vacía (NDJSON). Un simple `res.ok` NO basta para saber
  // si el modelo se creó de verdad (visto en producción: la UI se quedaba con
  // un modelo "creado" que Ollama nunca llegó a materializar).
  const parseCreateError = async (r: Response): Promise<string | null> => {
    const text = await r.text().catch(() => '');
    if (!r.ok) return `Ollama respondió ${r.status}${text ? `: ${text}` : ''}`;
    const last = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    if (!last) return null;
    try {
      const parsed = JSON.parse(last);
      return parsed?.error ? String(parsed.error) : null;
    } catch {
      return null;
    }
  };

  const verifyExists = async (name: string): Promise<boolean> => {
    try {
      const showRes = await fetch(`${base}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name, name }),
        signal: AbortSignal.timeout(5000),
      });
      if (!showRes.ok) return false;
      const info: any = await showRes.json().catch(() => null);
      return Boolean(info && !info.error);
    } catch {
      return false;
    }
  };

  try {
    // Formato moderno de /api/create (Ollama reciente): estructurado, sin Modelfile a mano.
    let err = await parseCreateError(
      await createAttempt({
        model: derivedName,
        from: baseModel,
        parameters: { num_ctx: contextWindow },
        stream: false,
      }),
    );
    if (err) {
      // Fallback al formato clásico (Modelfile como texto) por si el Ollama del usuario es más viejo.
      err = await parseCreateError(
        await createAttempt({
          name: derivedName,
          modelfile: `FROM ${baseModel}\nPARAMETER num_ctx ${contextWindow}`,
          stream: false,
        }),
      );
    }
    if (err) return res.status(502).json({ error: err });

    // Confirmamos que el modelo derivado existe de verdad antes de decirle a
    // la UI que ya puede seleccionarlo — si no, queda "activo" un modelo
    // fantasma y el chat falla con "model ... not found" en el primer mensaje.
    if (!(await verifyExists(derivedName))) {
      return res
        .status(502)
        .json({ error: `Ollama no confirmó la creación de ${derivedName}. Prueba de nuevo.` });
    }
    res.json({ ok: true, modelName: derivedName });
  } catch (e: any) {
    console.error('[Ai.applyContext]', e);
    res
      .status(502)
      .json({ error: e?.message || 'No se pudo crear el modelo con esa ventana de contexto' });
  }
});

/** Borra un modelo instalado. El nombre va en query (puede contener `/` y `:`). */
router.delete('/local/models', async (req: any, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre del modelo' });
  const base = await localBaseUrl(req.tenantClient).catch(() => AI_DEFAULTS.baseUrl);
  try {
    const delRes = await fetch(`${base}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, name }),
      signal: AbortSignal.timeout(5000),
    });
    if (!delRes.ok) {
      const detail = await delRes.text().catch(() => '');
      return res.status(502).json({ error: `Ollama respondió ${delRes.status}: ${detail}` });
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Ai.delete]', e);
    res.status(502).json({ error: e?.message || 'No se pudo conectar con Ollama' });
  }
});

export default router;
