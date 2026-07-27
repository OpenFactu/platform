/**
 * Tab "IA" en Ajustes → Empresa.
 *
 * Config del proveedor de IA (Fase 0): selector de proveedor (registro servido
 * por el backend — Anthropic, OpenAI, Google, endpoint OpenAI-compatible o
 * local Ollama/vLLM), API key enmascarada (nunca vuelve en claro), botón
 * "Probar" que hace un generateText() real, y gestor de modelos locales:
 * instalados en Ollama (con badge de tool-calling), catálogo curado y buscador
 * de GGUF en Hugging Face, con descarga mostrando progreso en vivo.
 */

import { apiClient } from '@/shared/http';
import { coreApi } from '@/shared/api';
import React, { useEffect, useRef, useState } from 'react';
import {
  Card,
  Button,
  Input,
  PasswordInput,
  Checkbox,
  Badge,
  Select,
  SearchableSelect,
  Modal,
  useToast,
} from '@openfactu/ui';
import {
  Bot,
  Plug,
  Download,
  Trash2,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Gauge,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface AiProviderDTO {
  id: string;
  label: string;
  needsApiKey: boolean;
  needsBaseUrl: boolean;
  defaultModel: string;
}

interface AiConfigDTO {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  localBackend: 'ollama' | 'vllm';
  contextWindow: number;
  supportsImages: boolean;
  apiKeySet: boolean;
}

const EMPTY: AiConfigDTO = {
  enabled: false,
  provider: 'anthropic',
  model: '',
  baseUrl: 'http://localhost:11434',
  localBackend: 'ollama',
  contextWindow: 8192,
  supportsImages: false,
  apiKeySet: false,
};

interface InstalledModel {
  name: string;
  sizeBytes: number;
  modifiedAt: string | null;
  toolCalling: boolean;
}

interface CatalogEntry {
  id: string;
  label: string;
  sizeGb: number;
  notes: string;
  /** Ventana de contexto NATIVA del modelo (no la que Ollama usa por defecto). */
  contextLength: number;
}

interface LocalModelsDTO {
  reachable: boolean;
  models: InstalledModel[];
  /** Modelos cargados en memoria ahora mismo y si están en GPU o CPU. */
  runtime?: Array<{ model: string; gpu: boolean; vramBytes: number }>;
  catalog: CatalogEntry[];
}

interface HfResult {
  id: string;
  downloads: number;
  likes: number;
  pullName: string;
}

interface DownloadState {
  status: string;
  pct: number; // 0-100; -1 = indeterminado (sin total todavía)
  completedMb: number;
  totalMb: number;
  failed?: boolean;
}

const fmtGb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/**
 * "Imagen" del modelo — Ollama/HF no exponen logos, así que en vez de un
 * icono genérico se pinta un avatar de color estable por familia (qwen,
 * llama, gemma...), con fallback por hash para familias no catalogadas (p.ej.
 * resultados de Hugging Face). Da identidad visual sin inventar logos.
 */
const FAMILY_COLORS: Record<string, string> = {
  qwen: 'bg-violet-500',
  llama: 'bg-blue-500',
  gemma: 'bg-emerald-500',
  granite: 'bg-indigo-500',
  mistral: 'bg-orange-500',
  phi: 'bg-cyan-500',
  deepseek: 'bg-pink-500',
  mixtral: 'bg-fuchsia-500',
  command: 'bg-lime-600',
};
const FALLBACK_PALETTE = [
  'bg-slate-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-sky-500',
];
const familyOf = (name: string) => {
  const base = (name.split('/').pop() || name).toLowerCase();
  return base.match(/^[a-z]+/)?.[0] || base;
};
const familyColor = (name: string) => {
  const fam = familyOf(name);
  const known = Object.keys(FAMILY_COLORS).find((k) => fam.includes(k));
  if (known) return FAMILY_COLORS[known];
  let hash = 0;
  for (let i = 0; i < fam.length; i++) hash = (hash * 31 + fam.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
};
const ModelAvatar: React.FC<{ name: string }> = ({ name }) => (
  <span
    className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-[10px] font-bold shrink-0 ${familyColor(name)}`}
  >
    {familyOf(name).slice(0, 2).toUpperCase()}
  </span>
);

/** Escala fija de num_ctx — un slider libre entre 512 y 131072 no tiene sentido
 * (valores raros a mitad de camino); con presets el usuario solo elige "cuánto
 * más grande", que es lo que de verdad importa. */
const CONTEXT_PRESETS = [2048, 4096, 8192, 16384, 32768, 65536, 131072];
const fmtCtx = (n: number) => (n >= 1024 ? `${Math.round(n / 1024)}K` : `${n}`);
const closestPresetIndex = (n: number) =>
  CONTEXT_PRESETS.reduce(
    (best, p, i) => (Math.abs(p - n) < Math.abs(CONTEXT_PRESETS[best] - n) ? i : best),
    0,
  );

export const AiSettingsTab: React.FC = () => {
  const { token } = useAuth();
  const toast = useToast();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [providers, setProviders] = useState<AiProviderDTO[]>([]);
  const [cfg, setCfg] = useState<AiConfigDTO>(EMPTY);
  const [newApiKey, setNewApiKey] = useState(''); // solo si el usuario la escribe
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  // ── Modelos locales ──
  const [local, setLocal] = useState<LocalModelsDTO | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [hfQuery, setHfQuery] = useState('');
  const [hfResults, setHfResults] = useState<HfResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const abortRef = useRef<Record<string, AbortController>>({});
  const [applyingContext, setApplyingContext] = useState(false);
  const [hfModalOpen, setHfModalOpen] = useState(false);
  const [hasSearchedHf, setHasSearchedHf] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [provRes, cfgRes] = await Promise.all([
          coreApi.raw('GET', '/api/ai/providers'),
          coreApi.raw('GET', '/api/ai/config'),
        ]);
        if (!provRes.ok || !cfgRes.ok) throw new Error('No se pudo cargar la configuración de IA');
        setProviders(provRes.data);
        setCfg({ ...EMPTY, ...cfgRes.data });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeProvider = providers.find((p) => p.id === cfg.provider);

  const loadLocalModels = async () => {
    setLoadingLocal(true);
    try {
      const res = await coreApi.raw('GET', '/api/ai/local/models');
      if (!res.ok) throw new Error('No se pudo consultar los modelos locales');
      setLocal(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingLocal(false);
    }
  };

  useEffect(() => {
    if (cfg.provider !== 'local' || loading) return;
    (async () => {
      await loadLocalModels();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.provider, loading]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        enabled: cfg.enabled,
        provider: cfg.provider,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        localBackend: cfg.localBackend,
        contextWindow: cfg.contextWindow,
        supportsImages: cfg.supportsImages,
      };
      if (newApiKey) payload.apiKey = newApiKey;
      const res = await coreApi.raw('PUT', '/api/ai/config', payload);
      if (!res.ok) throw new Error(res.data.error || 'Error');
      setCfg({ ...EMPTY, ...res.data });
      setNewApiKey('');
      toast.success('Configuración guardada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data: any = await coreApi.post('/api/ai/test', {});
      if (data.ok) {
        setTestResult({ ok: true, detail: `${data.model} (${data.ms} ms): ${data.text}` });
        toast.success('El proveedor de IA responde');
      } else {
        setTestResult({ ok: false, detail: data.error || 'Error desconocido' });
        toast.error(`Fallo: ${data.error}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      setTestResult({ ok: false, detail: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const searchHf = async () => {
    if (!hfQuery.trim()) return;
    setSearching(true);
    try {
      const res = await coreApi.raw(
        'GET',
        `/api/ai/local/models/search?q=${encodeURIComponent(hfQuery)}`,
      );
      const data = res.data;
      if (!res.ok) throw new Error(data.error || 'Error al buscar');
      setHfResults(data.results || []);
      setHasSearchedHf(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSearching(false);
    }
  };

  /** Descarga con progreso: lee el stream NDJSON que el server proxya de Ollama. */
  const startDownload = async (name: string) => {
    const controller = new AbortController();
    abortRef.current[name] = controller;
    setDownloads((d) => ({
      ...d,
      [name]: { status: 'iniciando…', pct: -1, completedMb: 0, totalMb: 0 },
    }));
    try {
      const res = await apiClient.postStream(
        '/api/ai/local/models/pull',
        { name },
        {
          signal: controller.signal,
        },
      );
      if (!res.body) throw new Error('Sin cuerpo de respuesta');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: { status?: string; total?: number; completed?: number; error?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.error) throw new Error(evt.error);
          const total = evt.total || 0;
          const completed = evt.completed || 0;
          setDownloads((d) => ({
            ...d,
            [name]: {
              status: evt.status || '…',
              pct: total > 0 ? Math.round((completed / total) * 100) : -1,
              completedMb: completed / 1024 ** 2,
              totalMb: total / 1024 ** 2,
            },
          }));
        }
      }
      setDownloads((d) => {
        const rest = { ...d };
        delete rest[name];
        return rest;
      });
      toast.success(`Modelo ${name} descargado`);
      void loadLocalModels();
    } catch (e) {
      if (controller.signal.aborted) {
        setDownloads((d) => {
          const rest = { ...d };
          delete rest[name];
          return rest;
        });
        toast.info(`Descarga de ${name} cancelada`);
      } else {
        const msg = e instanceof Error ? e.message : 'Error';
        setDownloads((d) => ({
          ...d,
          [name]: {
            ...(d[name] || { pct: -1, completedMb: 0, totalMb: 0 }),
            status: msg,
            failed: true,
          },
        }));
        toast.error(`Fallo al descargar ${name}: ${msg}`);
      }
    } finally {
      delete abortRef.current[name];
    }
  };

  const cancelDownload = (name: string) => abortRef.current[name]?.abort();

  /**
   * Ollama ignora num_ctx puesto en cada request — la única forma real de
   * ampliar el contexto es un modelo derivado con esa ventana horneada
   * (ver comentario en core/ai/index.ts). Esto lo crea y lo deja
   * seleccionado + guardado, sin pasos manuales por terminal.
   */
  const applyContext = async () => {
    if (!cfg.model) {
      toast.error('Elige o escribe primero un modelo base');
      return;
    }
    setApplyingContext(true);
    try {
      const res = await coreApi.raw('POST', '/api/ai/local/models/apply-context', {
        baseModel: cfg.model,
        contextWindow: cfg.contextWindow,
      });
      const data = res.data;
      if (!res.ok) throw new Error(data.error || 'Error al aplicar la ventana de contexto');

      const putRes = await coreApi.raw('PUT', '/api/ai/config', {
        enabled: cfg.enabled,
        provider: cfg.provider,
        model: data.modelName,
        baseUrl: cfg.baseUrl,
        localBackend: cfg.localBackend,
        contextWindow: cfg.contextWindow,
        supportsImages: cfg.supportsImages,
      });
      if (putRes.ok) setCfg({ ...EMPTY, ...putRes.data });
      toast.success(`Modelo creado y seleccionado: ${data.modelName}`);
      void loadLocalModels();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setApplyingContext(false);
    }
  };

  const removeModel = async (name: string) => {
    try {
      const res = await coreApi.raw(
        'DELETE',
        `/api/ai/local/models?name=${encodeURIComponent(name)}`,
      );
      const data = res.data;
      if (!res.ok) throw new Error(data.error || 'Error al borrar');
      toast.success(`Modelo ${name} eliminado`);
      void loadLocalModels();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  if (loading) return <p className="text-sm text-slate-400 italic">Cargando…</p>;

  const isLocal = cfg.provider === 'local';
  const installedNames = new Set(local?.models.map((m) => m.name) || []);

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-fg-body">
            <Bot size={18} />
            <h2 className="text-lg font-bold">Proveedor de IA</h2>
          </div>

          {/* Checkbox y no Switch: el flag se persiste con «Guardar», no al marcarlo. */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} />
            <span>Activar el asistente de IA en este tenant</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Proveedor">
              <SearchableSelect
                options={providers.map((p) => ({ value: p.id, label: p.label }))}
                value={cfg.provider}
                onChange={(provider) => {
                  setCfg({ ...cfg, provider, model: '' });
                  setTestResult(null);
                }}
              />
            </Field>
            <Field label="Modelo" hint={activeProvider?.defaultModel ? undefined : 'obligatorio'}>
              <Input
                value={cfg.model}
                onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
                placeholder={activeProvider?.defaultModel || 'id del modelo'}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {activeProvider?.needsApiKey !== false && (
              <Field label="API key" hint={cfg.apiKeySet ? 'guardada' : undefined}>
                {/* Sin showStrength ni generator: la key la emite el proveedor. */}
                <PasswordInput
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder={cfg.apiKeySet ? '•••••••• (dejar vacío = no cambiar)' : 'API key'}
                />
              </Field>
            )}
            {activeProvider?.needsBaseUrl && (
              <Field label="Base URL">
                <Input
                  value={cfg.baseUrl}
                  onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                />
              </Field>
            )}
            {isLocal && (
              <Field label="Backend local">
                {/* Dos opciones fijas: Select, no SearchableSelect. */}
                <Select
                  ariaLabel="Backend local"
                  options={[
                    { value: 'ollama', label: 'Ollama' },
                    { value: 'vllm', label: 'vLLM' },
                  ]}
                  value={cfg.localBackend}
                  onChange={(localBackend) =>
                    setCfg({ ...cfg, localBackend: localBackend as 'ollama' | 'vllm' })
                  }
                />
              </Field>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={cfg.supportsImages}
              onChange={(v) => setCfg({ ...cfg, supportsImages: v })}
            />
            <span>El modelo elegido acepta imágenes (visión)</span>
          </label>
          <p className="text-xs text-slate-500 -mt-2">
            No se puede detectar automáticamente por el nombre del modelo. Actívalo solo si sabes
            que este modelo soporta visión (p.ej. Claude, GPT-4o/5, Gemini, o un modelo local con
            vision) — controla si el chat ofrece adjuntar imágenes.
          </p>

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button onClick={test} variant="secondary" disabled={testing}>
              <span className="inline-flex items-center gap-2">
                <Plug size={14} />
                {testing ? 'Probando…' : 'Probar'}
              </span>
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            "Probar" usa la configuración <strong>guardada</strong> — guarda antes de probar.
          </p>
          {testResult && (
            <div
              className={`text-xs p-2 rounded-md flex items-start gap-2 ${
                testResult.ok
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
              }`}
            >
              {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <span className="break-all">{testResult.detail}</span>
            </div>
          )}
        </div>
      </Card>

      {isLocal && cfg.localBackend === 'vllm' && (
        <Card>
          <div className="p-5 space-y-2">
            <h2 className="text-lg font-bold text-fg-body">Modelos (vLLM)</h2>
            <p className="text-xs text-slate-500">
              vLLM carga su modelo desde Hugging Face al arrancar el contenedor (repo id +
              HF_TOKEN); no se descargan modelos en caliente. Usa el buscador para localizar el repo
              id y configúralo como modelo arriba.
            </p>
          </div>
        </Card>
      )}

      {isLocal && cfg.localBackend === 'ollama' && (
        <Card>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-fg-body">Modelos locales (Ollama)</h2>
              <Button variant="secondary" onClick={loadLocalModels} disabled={loadingLocal}>
                <span className="inline-flex items-center gap-2">
                  <RefreshCw size={14} className={loadingLocal ? 'animate-spin' : ''} />
                  Actualizar
                </span>
              </Button>
            </div>

            {local && !local.reachable && (
              <div className="text-xs p-2 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                Ollama no está disponible en {cfg.baseUrl}. Arranca Ollama (o ajusta la Base URL) y
                pulsa Actualizar. Las descargas necesitan Ollama en marcha.
              </div>
            )}

            {local && local.reachable && (
              <div className="text-xs p-2 rounded-md bg-bg-muted text-fg-body space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500">
                    Motor de ejecución
                  </span>
                  {(local.runtime?.length ?? 0) === 0 && (
                    <span className="italic text-slate-400">
                      ningún modelo cargado ahora — se detecta GPU/CPU al usar uno
                    </span>
                  )}
                  {local.runtime?.map((r) => (
                    <Badge key={r.model} variant={r.gpu ? 'success' : 'warning'}>
                      {r.model}: {r.gpu ? 'GPU' : 'CPU'}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  GPU o CPU se decide al arrancar el contenedor de Ollama:{' '}
                  <code className="font-mono">npm run dev:ai:gpu</code> (NVIDIA) o{' '}
                  <code className="font-mono">npm run dev:ai</code> (CPU). Con el Ollama nativo de
                  Windows, la GPU se usa automáticamente.
                </p>
              </div>
            )}

            {local && local.reachable && (
              <div className="rounded-lg border border-border-default bg-bg-muted p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-fg-body font-bold text-sm">
                    <span className="p-1.5 rounded-md bg-accent/10 text-accent">
                      <Gauge size={14} />
                    </span>
                    Ventana de contexto
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-accent/10 text-accent">
                    {fmtCtx(cfg.contextWindow)} tokens
                  </span>
                </div>

                <div className="px-1">
                  <input
                    type="range"
                    min={0}
                    max={CONTEXT_PRESETS.length - 1}
                    step={1}
                    value={closestPresetIndex(cfg.contextWindow)}
                    onChange={(e) =>
                      setCfg({ ...cfg, contextWindow: CONTEXT_PRESETS[Number(e.target.value)] })
                    }
                    className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 appearance-none cursor-pointer accent-accent
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-md
                      [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                      dark:[&::-webkit-slider-thumb]:border-slate-900
                      [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
                      [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white
                      dark:[&::-moz-range-thumb]:border-slate-900 [&::-moz-range-thumb]:cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
                    {CONTEXT_PRESETS.map((p) => (
                      <span key={p}>{fmtCtx(p)}</span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Ollama no admite ampliar el contexto en caliente ni por request — esto crea una
                    copia de <code className="font-mono">{cfg.model || 'tu modelo'}</code> con esta
                    ventana ya fijada y la deja seleccionada. Casi instantáneo: reutiliza las capas
                    ya descargadas.
                  </p>
                  <Button onClick={applyContext} disabled={applyingContext || !cfg.model}>
                    {applyingContext ? 'Creando…' : 'Aplicar'}
                  </Button>
                </div>
              </div>
            )}

            {local && local.reachable && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  Instalados
                  {local.models.length > 0 && (
                    <span className="text-slate-400 font-normal normal-case">
                      ({local.models.length})
                    </span>
                  )}
                </h3>
                {local.models.length === 0 && (
                  <p className="text-xs text-slate-400 italic">Ningún modelo instalado todavía.</p>
                )}
                {local.models.map((m) => (
                  <div
                    key={m.name}
                    className={`flex items-center gap-3 text-sm rounded-lg px-3 py-2.5 transition-colors ${
                      cfg.model === m.name
                        ? 'border border-accent/40 bg-accent/5'
                        : 'border border-border-default hover:bg-bg-hover'
                    }`}
                  >
                    <ModelAvatar name={m.name} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium break-all">{m.name}</div>
                      <div className="text-[11px] text-slate-400">{fmtGb(m.sizeBytes)}</div>
                    </div>
                    <Badge variant={m.toolCalling ? 'success' : 'neutral'}>
                      {m.toolCalling ? 'tool-calling' : 'sin tools'}
                    </Badge>
                    <Button
                      variant="secondary"
                      onClick={() => setCfg({ ...cfg, model: m.name })}
                      disabled={cfg.model === m.name}
                    >
                      {cfg.model === m.name ? 'En uso' : 'Usar'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      title="Eliminar modelo"
                      onClick={() => removeModel(m.name)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {local && local.catalog.filter((c) => !installedNames.has(c.id)).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Sugerencias (compatibles con tool-calling)
                </h3>
                <div className="space-y-2">
                  {local.catalog
                    .filter((c) => !installedNames.has(c.id))
                    .map((c) => (
                      <ModelRow
                        key={c.id}
                        id={c.id}
                        title={c.label}
                        description={c.notes}
                        sizeGb={c.sizeGb}
                        contextLength={c.contextLength}
                        download={downloads[c.id]}
                        reachable={local.reachable}
                        onDownload={() => startDownload(c.id)}
                        onCancel={() => cancelDownload(c.id)}
                      />
                    ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-border-default">
              <Button
                variant="secondary"
                onClick={() => setHfModalOpen(true)}
                className="w-full justify-center"
              >
                <span className="inline-flex items-center gap-2">
                  <Search size={14} />
                  Buscar en Hugging Face (GGUF)
                </span>
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal
        isOpen={hfModalOpen}
        onClose={() => setHfModalOpen(false)}
        title="Buscar en Hugging Face"
        subtitle="Cualquier resultado GGUF es descargable directamente en Ollama."
        maxWidth="lg"
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={hfQuery}
              onChange={(e) => setHfQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void searchHf();
              }}
              placeholder="p.ej. qwen 7b instruct"
              leftIcon={<Search size={14} />}
              className="flex-1"
              autoFocus
            />
            <Button variant="secondary" onClick={searchHf} disabled={searching || !hfQuery.trim()}>
              {searching ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
          {hfResults.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
              {hfResults.map((r) => (
                <ModelRow
                  key={r.pullName}
                  id={r.id}
                  title={r.id}
                  description={`${r.downloads.toLocaleString()} descargas · ${r.likes} likes`}
                  pullName={r.pullName}
                  download={downloads[r.pullName]}
                  reachable={Boolean(local?.reachable)}
                  onDownload={() => startDownload(r.pullName)}
                  onCancel={() => cancelDownload(r.pullName)}
                />
              ))}
            </div>
          )}
          {!searching && hasSearchedHf && hfResults.length === 0 && (
            <p className="text-xs text-slate-400 italic">Sin resultados para "{hfQuery}".</p>
          )}
        </div>
      </Modal>
    </div>
  );
};

/** Fila de modelo descargable, con avatar por familia, badges de tamaño/contexto y barra de progreso mientras baja. */
const ModelRow: React.FC<{
  id: string;
  title: string;
  description?: string;
  sizeGb?: number;
  contextLength?: number;
  pullName?: string;
  download?: DownloadState;
  reachable: boolean;
  onDownload: () => void;
  onCancel: () => void;
}> = ({
  id,
  title,
  description,
  sizeGb,
  contextLength,
  pullName,
  download,
  reachable,
  onDownload,
  onCancel,
}) => (
  <div className="rounded-lg border border-border-default hover:border-accent/30 hover:bg-accent/[0.03] transition-colors px-3 py-2.5 space-y-2">
    <div className="flex items-center gap-3 text-sm">
      <ModelAvatar name={id} />
      <div className="flex-1 min-w-0">
        <div className="font-medium break-all">{title}</div>
        {description && <div className="text-[11px] text-slate-400 break-all">{description}</div>}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {sizeGb !== undefined && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-muted text-fg-muted">
              ~{sizeGb} GB
            </span>
          )}
          {contextLength !== undefined && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
              {fmtCtx(contextLength)} contexto
            </span>
          )}
        </div>
        {pullName && <code className="text-[10px] text-fg-subtle break-all">{pullName}</code>}
      </div>
      {download && !download.failed ? (
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      ) : (
        <Button variant="secondary" onClick={onDownload} disabled={!reachable}>
          <span className="inline-flex items-center gap-2">
            <Download size={14} />
            Descargar
          </span>
        </Button>
      )}
    </div>
    {download && <DownloadProgressBar state={download} />}
  </div>
);

/**
 * Barra de progreso local — @openfactu/ui no exporta ProgressBar, así que este
 * mini componente es la excepción justificada (ver CLAUDE.md).
 */
const DownloadProgressBar: React.FC<{ state: DownloadState }> = ({ state }) => (
  <div className="space-y-1">
    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          state.failed ? 'bg-rose-500' : 'bg-teal-500'
        } ${state.pct < 0 && !state.failed ? 'w-full animate-pulse' : ''}`}
        style={state.pct >= 0 ? { width: `${state.pct}%` } : undefined}
      />
    </div>
    <div className="text-[11px] text-slate-500 flex justify-between gap-2">
      <span className="break-all">{state.status}</span>
      {state.totalMb > 0 && (
        <span className="whitespace-nowrap">
          {state.pct}% · {Math.round(state.completedMb)} / {Math.round(state.totalMb)} MB
        </span>
      )}
    </div>
  </div>
);

/** Mismo wrapper de campo que usan el resto de tabs de Ajustes. */
const Field: React.FC<{
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, hint, className, children }) => (
  <div className={`flex flex-col gap-1 ${className || ''}`}>
    <div className="h-4 flex items-center gap-2">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider leading-none">
        {label}
      </span>
      {hint && (
        <span className="text-[10px] font-normal text-emerald-600 leading-none">({hint})</span>
      )}
    </div>
    {children}
  </div>
);
