/**
 * Tipos de la fundación de IA (Fase 0).
 *
 * La config es agnóstica del proveedor: gracias al Vercel AI SDK cualquier
 * proveedor (Anthropic, OpenAI, Google, un endpoint OpenAI-compatible o un
 * backend local Ollama/vLLM) se resuelve con los mismos campos genéricos.
 * Se persiste por tenant en `systemConfigs` con prefijo `ai_*` (mismo patrón
 * que branding/flags — ver systemConfigSection.ts).
 */

export type AiProviderId = 'anthropic' | 'openai' | 'google' | 'custom' | 'local';

export interface AiConfig {
  /** Master switch del asistente de IA. */
  enabled: boolean;
  /** Proveedor activo (entrada del registro AI_PROVIDERS). */
  provider: AiProviderId;
  /** Secreto genérico del proveedor; '' = fallback a process.env.AI_API_KEY. */
  apiKey: string;
  /** Id de modelo del proveedor elegido; '' = defaultModel del proveedor. */
  model: string;
  /** Base URL para 'custom' (endpoint OpenAI-compatible) y 'local'. */
  baseUrl: string;
  /** Backend local cuando provider = 'local'. */
  localBackend: 'ollama' | 'vllm';
  /**
   * Ventana de contexto (num_ctx) que se aplicó la última vez que se creó un
   * modelo Ollama derivado desde Ajustes → IA (ver POST
   * /api/ai/local/models/apply-context) — Ollama ignora `num_ctx` en tiempo
   * de request vía su capa OpenAI-compatible, así que la única forma real de
   * ampliarlo es hornearlo en un modelo derivado. Solo relevante si
   * provider = 'local' y localBackend = 'ollama'.
   */
  contextWindow: number;
  /**
   * El modelo elegido acepta imágenes (visión). No se puede detectar de forma
   * fiable a partir del nombre del modelo/proveedor, así que lo marca el
   * admin a mano — controla si el chat ofrece adjuntar imágenes.
   */
  supportsImages: boolean;
}

export const AI_DEFAULTS: AiConfig = {
  enabled: false,
  provider: 'anthropic',
  apiKey: '',
  model: '',
  baseUrl: 'http://localhost:11434',
  localBackend: 'ollama',
  contextWindow: 8192,
  supportsImages: false,
};
