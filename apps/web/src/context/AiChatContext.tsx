import { coreApi } from '@/shared/api';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type FileUIPart,
} from 'ai';
import { useToast } from '@openfactu/ui';
import { useAuth } from './AuthContext';
import { ASSISTANT_NAME } from '../pages/AiChat/constants';

interface AvailableModelsDTO {
  provider: string;
  current: string;
  options: string[];
}

type ChatState = ReturnType<typeof useChat>;

interface AiChatContextValue {
  chat: ChatState;
  status: ChatState['status'];
  busy: boolean;
  supportsImages: boolean;
  contextWindow: number | null;
  availableModels: AvailableModelsDTO;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  conversationId: string | null;
  messageTimings: Record<string, number>;
  headers: Record<string, string>;
  send: (text: string, files?: FileUIPart[]) => void;
  loadConversation: (id: string) => Promise<void>;
  newConversation: () => void;
  setChatVisible: (visible: boolean) => void;
  refreshModels: () => Promise<void>;
}

const AiChatContext = createContext<AiChatContextValue | null>(null);

/**
 * Dueño único de la sesión de chat de IA — vive montado a nivel de App (no
 * dentro de una pestaña), así el turno en curso nunca se aborta al cambiar de
 * pestaña ni al salir de la ventana MRU de pestañas montadas (ver
 * TabsHost.MAX_MOUNTED_TABS). La página AiChat (dentro de una pestaña) solo
 * consume este contexto y reporta si es la pestaña visible ahora mismo, para
 * que el aviso de "ya respondió" solo salte cuando el usuario no está mirando.
 */
export const AiChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [supportsImages, setSupportsImages] = useState(false);
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModelsDTO>({
    provider: '',
    current: '',
    options: [],
  });
  const [selectedModel, setSelectedModel] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messageTimings, setMessageTimings] = useState<Record<string, number>>({});
  const isChatVisibleRef = useRef(false);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  // Referencia al proveedor conocido — para detectar cuando cambió (p.ej. el
  // admin pasó de Ollama a DeepSeek en Ajustes → IA) y así invalidar
  // `selectedModel`: un id de modelo de OTRO proveedor causa que el endpoint
  // nuevo lo rechace directamente ("model X not found").
  const knownProviderRef = useRef<string | null>(null);

  const refreshModels = useCallback(async () => {
    if (!user?.tenantId) return;
    try {
      const r = await coreApi.get<any>('/api/ai/available-models');
      const d: AvailableModelsDTO = r.ok
        ? r.data
        : { provider: '', current: '', options: [] };
      setAvailableModels(d);
      const providerChanged =
        knownProviderRef.current !== null && knownProviderRef.current !== d.provider;
      knownProviderRef.current = d.provider;
      setSelectedModel((prev) => {
        if (providerChanged) return d.current || '';
        // Si el modelo elegido ya no está entre las opciones válidas (p.ej.
        // se borró, o venía de una conversación guardada con otro proveedor),
        // no seguimos mandándolo — se cae al "current" del proveedor activo.
        if (prev && d.options.length > 0 && !d.options.includes(prev)) return d.current || '';
        return prev || d.current || '';
      });
    } catch {
      /* noop — el chat sigue funcionando sin override de modelo */
    }
  }, [headers, user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId) return;
    coreApi
      .get<any>('/api/ai/capabilities')
      .then((d) => {
        setSupportsImages(Boolean(d?.supportsImages));
        setContextWindow(typeof d?.contextWindow === 'number' ? d.contextWindow : null);
      })
      .catch(() => setSupportsImages(false));
    void refreshModels();
  }, [headers, user?.tenantId, refreshModels]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        headers,
        body: { model: selectedModel || undefined },
      }),
    [headers, selectedModel],
  );

  const chat = useChat({
    transport,
    // Tras responder todas las confirmaciones pendientes, reenvía solo la
    // conversación para que el backend ejecute (o no) y el modelo continúe.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const { messages, status, setMessages } = chat;
  const busy = status === 'submitted' || status === 'streaming';

  const turnStartRef = useRef<number | null>(null);
  const prevStatusRef = useRef(status);

  /** Guarda (crea si hace falta) la conversación actual — falla en silencio. */
  const saveConversation = async () => {
    const id = conversationId || crypto.randomUUID();
    if (!conversationId) setConversationId(id);
    try {
      await coreApi.raw('PUT', `/api/ai/conversations/${id}`, {
          messages,
          model: selectedModel || availableModels.current || undefined,
        });
    } catch {
      /* sin conexión o error del server — no interrumpe el chat */
    }
  };

  useEffect(() => {
    const justFinished = prevStatusRef.current !== 'ready' && status === 'ready';
    if (justFinished && turnStartRef.current !== null) {
      const elapsedMs = performance.now() - turnStartRef.current;
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant) {
        setMessageTimings((prev) => ({ ...prev, [lastAssistant.id]: elapsedMs }));
      }
      turnStartRef.current = null;
    }
    if (justFinished && messages.length > 0) {
      void saveConversation();
      // El provider vive fuera del ciclo de montaje de las pestañas, así que
      // el turno sigue corriendo aunque el usuario haya cambiado de pestaña —
      // sin este aviso, no se enteraría de que ya terminó de responder.
      if (!isChatVisibleRef.current) {
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
        const text = lastAssistant?.parts.find((p) => p.type === 'text')?.text || '';
        const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
        toast.info(`${ASSISTANT_NAME} ha terminado de responder${preview ? `: "${preview}"` : ''}`);
      }
    }
    prevStatusRef.current = status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages]);

  const send = (text: string, files?: FileUIPart[]) => {
    const t = text.trim();
    if ((!t && (!files || files.length === 0)) || busy) return;
    turnStartRef.current = performance.now();
    void chat.sendMessage({ text: t, files });
  };

  const loadConversation = async (id: string) => {
    try {
      const res = await coreApi.raw('GET', `/api/ai/conversations/${id}`);
      if (!res.ok) return;
      const data = res.data;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setConversationId(data.id);
      // Solo aplicamos el modelo guardado si sigue siendo válido para el
      // proveedor ACTIVO ahora mismo — una conversación vieja pudo guardarse
      // con un modelo de un proveedor que ya no está configurado.
      if (data.model && (availableModels.options.length === 0 || availableModels.options.includes(data.model))) {
        setSelectedModel(data.model);
      }
    } catch {
      /* noop */
    }
  };

  const newConversation = () => {
    setMessages([]);
    setConversationId(null);
  };

  const setChatVisible = useCallback((visible: boolean) => {
    isChatVisibleRef.current = visible;
  }, []);

  const value: AiChatContextValue = {
    chat,
    status,
    busy,
    supportsImages,
    contextWindow,
    availableModels,
    selectedModel,
    setSelectedModel,
    conversationId,
    messageTimings,
    headers,
    send,
    loadConversation,
    newConversation,
    setChatVisible,
    refreshModels,
  };

  return <AiChatContext.Provider value={value}>{children}</AiChatContext.Provider>;
};

export const useAiChatContext = (): AiChatContextValue => {
  const ctx = useContext(AiChatContext);
  if (!ctx) throw new Error('useAiChatContext must be used within AiChatProvider');
  return ctx;
};
