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
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (GPT)',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'gpt-5.1',
    create: (modelId, apiKey) => createOpenAI({ apiKey })(modelId),
  },
  google: {
    id: 'google',
    label: 'Google (Gemini)',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'gemini-2.5-flash',
    create: (modelId, apiKey) => createGoogleGenerativeAI({ apiKey })(modelId),
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
  },
  local: {
    id: 'local',
    label: 'Local (Ollama / vLLM)',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultModel: '',
    create: openAICompatible,
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
