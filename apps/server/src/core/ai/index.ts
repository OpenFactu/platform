/**
 * Fundación del proveedor de IA (Fase 0) sobre el Vercel AI SDK.
 *
 * `AI_PROVIDERS` es el registro que hace el sistema extensible: añadir un
 * proveedor nuevo = una entrada más (label + factory del paquete @ai-sdk
 * correspondiente). `getLanguageModel(config)` resuelve la entrada activa y
 * devuelve un `LanguageModel` listo para `generateText`/`streamText`, sea
 * cloud (Anthropic, OpenAI, Google), un endpoint OpenAI-compatible arbitrario
 * o un backend local (Ollama/vLLM).
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { wrapLanguageModel, extractReasoningMiddleware, type LanguageModel } from 'ai';

/** Tipo concreto que acepta wrapLanguageModel — LanguageModel también admite un string (id), que nuestras factories nunca devuelven. */
type ConcreteLanguageModel = Parameters<typeof wrapLanguageModel>[0]['model'];
import { getConfigSection } from '../config/systemConfigSection';
import { AI_DEFAULTS, AiConfig, AiProviderId } from './types';

export interface AiProviderDef {
  id: AiProviderId;
  label: string;
  needsApiKey: boolean;
  needsBaseUrl: boolean;
  defaultModel: string;
  /** Construye el LanguageModel. `apiKey` llega ya resuelta (config o env). */
  create(modelId: string, apiKey: string, cfg: AiConfig): LanguageModel;
  /**
   * Modelos que ofrece el proveedor AHORA MISMO, preguntándoselo a él.
   *
   * Deliberadamente no hay lista escrita a mano: un catálogo horneado en el
   * código envejece con cada release del proveedor y acaba ofreciendo modelos
   * retirados mientras oculta los nuevos. Lo que no se puede preguntar (un
   * endpoint OpenAI-compatible que no implemente /v1/models) se queda sin
   * lista y la UI cae al campo de texto.
   */
  listModels?(apiKey: string, cfg: AiConfig): Promise<AiModelOption[]>;
}

/** Una entrada del desplegable de modelos. */
export interface AiModelOption {
  id: string;
  label: string;
  /** Detalle secundario (fecha, ventana de contexto…) si el proveedor lo da. */
  note?: string;
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

/**
 * Lo que devuelve `/v1/models` de OpenAI incluye embeddings, voz e imagen,
 * que no valen para `generateText`. Se filtran por nombre porque la API no
 * marca de ninguna otra forma para qué sirve cada uno.
 */
const NO_SIRVEN_PARA_CHAT =
  /(embedding|moderation|tts|whisper|transcribe|speech|audio|dall-e|image|sora|realtime)/i;

/** Listado para todo lo OpenAI-compatible (custom, Ollama, vLLM). */
async function openAICompatibleModels(apiKey: string, cfg: AiConfig): Promise<AiModelOption[]> {
  const baseUrl = (cfg.baseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Falta la base URL');
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const data = await fetchJson(`${baseUrl}/v1/models`, headers);
  return (Array.isArray(data?.data) ? data.data : [])
    .map((m: any) => ({ id: String(m?.id || ''), label: String(m?.id || '') }))
    .filter((m: AiModelOption) => m.id);
}

/**
 * Ventana de contexto de Ollama (num_ctx): verificado a mano contra Ollama
 * 0.32.1 que la capa de compatibilidad OpenAI (`/v1/chat/completions`, lo que
 * usa este SDK) IGNORA `options.num_ctx` puesto en el body de cada request —
 * probado con curl directo al endpoint, `context_length` en `/api/ps` no
 * cambiaba. La única forma real de ampliarla es hornearla en el propio
 * modelo: `POST /api/ai/local/models/apply-context` (Ajustes → Empresa → IA)
 * crea un modelo Ollama derivado con `PARAMETER num_ctx <n>` vía `/api/create`
 * y lo deja seleccionado — sin eso no hay atajo por request.
 */

/** Factory compartida para todo lo OpenAI-compatible (custom, Ollama, vLLM). */
function openAICompatible(modelId: string, apiKey: string, cfg: AiConfig): LanguageModel {
  const baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  return createOpenAICompatible({
    name: cfg.provider === 'local' ? cfg.localBackend : 'custom',
    baseURL: `${baseUrl}/v1`,
    apiKey: apiKey || 'not-needed', // Ollama/vLLM locales no exigen key
  })(modelId);
}

export const AI_PROVIDERS: Record<AiProviderId, AiProviderDef> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'claude-sonnet-5',
    create: (modelId, apiKey) => createAnthropic({ apiKey })(modelId),
    listModels: async (apiKey) => {
      const data = await fetchJson('https://api.anthropic.com/v1/models?limit=1000', {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      });
      return (Array.isArray(data?.data) ? data.data : []).map((m: any) => ({
        id: String(m?.id || ''),
        label: String(m?.display_name || m?.id || ''),
        note: m?.created_at ? String(m.created_at).slice(0, 10) : undefined,
      }));
    },
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (GPT)',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'gpt-5.1',
    create: (modelId, apiKey) => createOpenAI({ apiKey })(modelId),
    listModels: async (apiKey) => {
      const data = await fetchJson('https://api.openai.com/v1/models', {
        Authorization: `Bearer ${apiKey}`,
      });
      return (Array.isArray(data?.data) ? data.data : [])
        .map((m: any) => String(m?.id || ''))
        .filter((id: string) => id && !NO_SIRVEN_PARA_CHAT.test(id))
        .sort()
        .map((id: string) => ({ id, label: id }));
    },
  },
  google: {
    id: 'google',
    label: 'Google (Gemini)',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'gemini-2.5-flash',
    create: (modelId, apiKey) => createGoogleGenerativeAI({ apiKey })(modelId),
    listModels: async (apiKey) => {
      const data = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
      );
      return (
        (Array.isArray(data?.models) ? data.models : [])
          // Gemini publica en el mismo listado los modelos de embeddings; solo
          // sirven los que declaran `generateContent`.
          .filter((m: any) => (m?.supportedGenerationMethods || []).includes('generateContent'))
          .map((m: any) => {
            const id = String(m?.name || '').replace(/^models\//, '');
            return {
              id,
              label: String(m?.displayName || id),
              note: m?.inputTokenLimit ? `${Math.round(m.inputTokenLimit / 1000)}k ctx` : undefined,
            };
          })
          .filter((m: AiModelOption) => m.id)
      );
    },
  },
  custom: {
    id: 'custom',
    label: 'Endpoint OpenAI-compatible',
    // A diferencia de 'local' (Ollama/vLLM autoalojados, normalmente sin
    // key), esto es para endpoints OpenAI-compatibles ALOJADOS (DeepSeek,
    // Groq, Together, Fireworks...) que casi siempre exigen un token.
    needsApiKey: true,
    needsBaseUrl: true,
    defaultModel: '',
    create: openAICompatible,
    listModels: openAICompatibleModels,
  },
  local: {
    id: 'local',
    label: 'Local (Ollama / vLLM)',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultModel: '',
    create: openAICompatible,
    listModels: openAICompatibleModels,
  },
};

/** Lee la config de IA del tenant (sección `ai_*` de systemConfigs). */
export async function getAiConfig(db: any): Promise<AiConfig> {
  return getConfigSection(db, 'ai', AI_DEFAULTS);
}

/**
 * Resuelve el LanguageModel del proveedor activo. Lanza errores legibles si
 * falta algo (la UI los muestra tal cual en el botón "Probar").
 */
export function getLanguageModel(config: AiConfig): LanguageModel {
  const def = AI_PROVIDERS[config.provider];
  if (!def) {
    throw new Error(`Proveedor de IA desconocido: ${config.provider}`);
  }
  const apiKey = config.apiKey || process.env.AI_API_KEY || '';
  if (def.needsApiKey && !apiKey) {
    throw new Error(
      `Falta la API key de ${def.label}. Configúrala en Ajustes → Empresa → IA (o AI_API_KEY en el .env).`,
    );
  }
  if (def.needsBaseUrl && !config.baseUrl) {
    throw new Error(`Falta la base URL de ${def.label}. Configúrala en Ajustes → Empresa → IA.`);
  }
  const modelId = config.model || def.defaultModel;
  if (!modelId) {
    throw new Error(`Falta el modelo de ${def.label}. Configúralo en Ajustes → Empresa → IA.`);
  }
  const model = def.create(modelId, apiKey, config) as ConcreteLanguageModel;
  // Muchos modelos "razonadores" (Qwen3, DeepSeek-R1...) escriben su
  // razonamiento como texto plano envuelto en <think>...</think> cuando se
  // sirven por una API OpenAI-compatible (Ollama/vLLM) — sin esto, ese texto
  // se cuela tal cual en la respuesta en vez de mostrarse como "pensando".
  // Si el modelo no usa esa etiqueta, el middleware no hace nada (no-op).
  return wrapLanguageModel({
    model,
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  }) as LanguageModel;
}

/**
 * Modelos del proveedor activo, para el selector de Ajustes → IA.
 *
 * Nunca lanza: si falta la key, el endpoint no responde o el proveedor no
 * publica catálogo, devuelve la lista vacía con el motivo escrito, y la UI
 * deja escribir el id a mano. Un desplegable que revienta la pantalla cuando
 * el proveedor está caído sería peor que el campo de texto que sustituye.
 */
const CACHE_MODELOS_MS = 5 * 60 * 1000;
const cacheModelos = new Map<string, { at: number; models: AiModelOption[] }>();

export async function listProviderModels(
  cfg: AiConfig,
  opts: { force?: boolean } = {},
): Promise<{ models: AiModelOption[]; error?: string }> {
  const def = AI_PROVIDERS[cfg.provider];
  if (!def) return { models: [], error: `Proveedor de IA desconocido: ${cfg.provider}` };

  const apiKey = cfg.apiKey || process.env.AI_API_KEY || '';
  if (def.needsApiKey && !apiKey) {
    return { models: [], error: `Guarda antes la API key de ${def.label} para ver sus modelos.` };
  }
  if (def.needsBaseUrl && !cfg.baseUrl) {
    return { models: [], error: `Guarda antes la base URL de ${def.label} para ver sus modelos.` };
  }
  if (!def.listModels) {
    return { models: [], error: `${def.label} no publica un listado de modelos.` };
  }

  // La key entra en la clave por su cola: dos tenants del mismo proveedor con
  // keys distintas ven catálogos distintos (organizaciones y fine-tunes).
  const clave = `${cfg.provider}|${cfg.baseUrl}|${apiKey.slice(-6)}`;
  const cacheado = cacheModelos.get(clave);
  if (cacheado && !opts.force && Date.now() - cacheado.at < CACHE_MODELOS_MS) {
    return { models: cacheado.models };
  }

  try {
    const models = await def.listModels(apiKey, cfg);
    cacheModelos.set(clave, { at: Date.now(), models });
    return { models };
  } catch (e: any) {
    // Con lista vieja en mano se devuelve esa: mejor un catálogo de hace unos
    // minutos que dejar al usuario sin opciones porque hubo un timeout.
    return {
      models: cacheado?.models || [],
      error: e?.message || 'No se pudo consultar el catálogo del proveedor',
    };
  }
}

/** Versión serializable del registro (sin factories) para la UI. */
export function listProviders() {
  return Object.values(AI_PROVIDERS).map(
    ({ id, label, needsApiKey, needsBaseUrl, defaultModel }) => ({
      id,
      label,
      needsApiKey,
      needsBaseUrl,
      defaultModel,
    }),
  );
}
