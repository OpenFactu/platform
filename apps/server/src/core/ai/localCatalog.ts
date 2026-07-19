/**
 * Catálogo curado de modelos locales (sugerencias rápidas de descarga).
 *
 * Ollama NO tiene API pública para listar su biblioteca (solo la página HTML
 * ollama.com/search?c=tools — ver issue ollama/ollama#10693), así que esta
 * lista se mantiene a mano a partir de la categoría "Tools" (modelos con
 * soporte de tool-calling, que es lo que exigirán las fases de chat).
 *
 * Es solo un punto de partida: la UI también permite buscar cualquier GGUF en
 * Hugging Face y descargarlo vía `hf.co/<user>/<repo>:<quant>`. La
 * compatibilidad tool-calling REAL de un modelo instalado la reporta el propio
 * Ollama (`POST /api/show` → capabilities).
 */

export interface LocalModelSuggestion {
  /** Tag de Ollama con el que se hace el pull (p.ej. 'qwen3.5:9b'). */
  id: string;
  label: string;
  /** Tamaño aproximado de la descarga en GB. */
  sizeGb: number;
  notes: string;
  /**
   * Ventana de contexto NATIVA del modelo (la que soporta su arquitectura),
   * no la que Ollama usa por defecto al servirlo (esa suele ser más corta —
   * ver "Ventana de contexto" en Ajustes → IA para ampliarla de verdad).
   * Informativa, tomada de la ficha pública de cada modelo.
   */
  contextLength: number;
}

export const LOCAL_MODEL_CATALOG: LocalModelSuggestion[] = [
  {
    id: 'qwen3.5:4b',
    label: 'Qwen 3.5 (4B)',
    sizeGb: 2.6,
    notes: 'Ligero; buen tool-calling para su tamaño. Ideal para probar en CPU.',
    contextLength: 32768,
  },
  {
    id: 'qwen3.5:9b',
    label: 'Qwen 3.5 (9B)',
    sizeGb: 5.5,
    notes: 'Equilibrio calidad/velocidad recomendado con GPU de 8-12 GB.',
    contextLength: 32768,
  },
  {
    id: 'granite4.1:8b',
    label: 'IBM Granite 4.1 (8B)',
    sizeGb: 5.0,
    notes: 'Orientado a empresa, tool-calling sólido.',
    contextLength: 131072,
  },
  {
    id: 'gemma4:12b',
    label: 'Google Gemma 4 (12B)',
    sizeGb: 8.0,
    notes: 'Buena calidad general; requiere GPU de 12 GB o más.',
    contextLength: 131072,
  },
  {
    id: 'qwen3.5:27b',
    label: 'Qwen 3.5 (27B)',
    sizeGb: 17.0,
    notes: 'Calidad alta; requiere GPU de 24 GB o más.',
    contextLength: 32768,
  },
];
