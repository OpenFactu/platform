/**
 * Chat interno del asistente de IA.
 *
 * La interfaz es el espacio de trabajo de `@openfactu/ui/ai`: historial,
 * conversación, compositor, confirmaciones de herramientas y razonamiento los
 * pinta la librería. Esta página solo la conecta con lo de Keirost:
 *
 * - La sesión (`useChat`, modelo, conversación guardada) vive en
 *   `AiChatContext`, montado a nivel de App, para que el turno en curso no se
 *   aborte al cambiar de pestaña.
 * - `useKeiroChat` + `KeiroChatBody` son lo común con el panel flotante:
 *   `toAIMessages` traduce los mensajes del SDK y las partes propias de Keirost
 *   (widgets, descargas, vista previa PDF, preguntas guiadas, documentos
 *   adjuntos, pie con tokens) las registra `registerKeiroParts`.
 */

import React, { useEffect, useState } from 'react';
import { Button } from '@openfactu/ui';
import { AIWorkspace } from '@openfactu/ui/ai';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useTabs, useCurrentTab } from '@/context/TabsContext';
import { ASSISTANT_NAME } from '../domain/constants';
import { useConversationList } from '../hooks/useConversationList';
import { useKeiroChat } from '../hooks/useKeiroChat';
import { DropOverlay } from '../components/DropOverlay';
import { KeiroChatBody } from '../components/KeiroChatBody';
import { KEIRO_LABELS } from '../domain/keiroLabels';
import { registerKeiroParts } from '../components/keiroParts';

registerKeiroParts();

/** Sugerencias iniciales del estado vacío. */
const HERO_SUGGESTIONS = [
  { id: 'facturas', label: '¿Cuáles son las últimas facturas de venta?' },
  { id: 'clientes', label: '¿Qué clientes tenemos dados de alta?' },
  { id: 'articulo', label: 'Busca el artículo con más líneas vendidas este año' },
  { id: 'widget', label: 'Añade un widget de ventas mensuales al Dashboard' },
  { id: 'stock', label: '¿Qué artículos tienen poco stock?' },
  { id: 'excel', label: 'Genera un Excel con el listado de proveedores' },
];

export const AiChat: React.FC = () => {
  const chat = useKeiroChat();
  const { composer, drop, setChatVisible, refreshModels, conversationId } = chat;

  // Le dice al provider si ESTA pestaña (del sistema de pestañas interno,
  // no del navegador) es la que se está viendo ahora mismo — así el aviso de
  // "ya respondió" solo salta cuando el usuario no está mirando el chat.
  const { activeTabId } = useTabs();
  const { id: tabId } = useCurrentTab();
  useEffect(() => {
    const visible = activeTabId === tabId;
    setChatVisible(visible);
    // Al volver a esta pestaña, refresca el proveedor/modelo activo (si
    // cambiaste de proveedor en Ajustes → IA mientras estabas en otra).
    if (visible) void refreshModels();
    return () => setChatVisible(false);
  }, [activeTabId, tabId, setChatVisible, refreshModels]);

  const [fullscreen, setFullscreen] = useState(false);
  const history = useConversationList(conversationId);

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 bg-bg-muted flex animate-in fade-in duration-200'
          : 'h-full flex animate-in fade-in duration-500'
      }
    >
      <div className="relative flex-1 min-w-0 min-h-0" {...drop.dropZoneProps}>
        <DropOverlay visible={drop.dragOver} acceptImages={chat.supportsImages} />
        <AIWorkspace
          className="h-full"
          labels={KEIRO_LABELS}
          title={ASSISTANT_NAME}
          header={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              className="ml-auto text-fg-subtle hover:text-accent"
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </Button>
          }
          state={{
            conversations: history.conversations,
            conversationId: conversationId ?? undefined,
            messages: chat.aiMessages,
            draft: chat.draft,
            models: [],
            modelId: chat.modelId,
            run: chat.run,
            artifacts: [],
            historyLoading: history.loading,
          }}
          actions={{
            onDraftChange: chat.onDraftChange,
            onSubmit: (d) => composer.send(d.text),
            onStop: chat.stop,
            onRetry: chat.retry,
            onSelectConversation: (id) => void chat.loadConversation(id),
            onNewConversation: () => {
              chat.newConversation();
              composer.resetDraft();
            },
            onDeleteConversation: (id) => void history.remove(id),
            onFiles: (files) => composer.addDropped(files),
            onApproveTool: chat.approveTool,
            onRejectTool: chat.rejectTool,
          }}
        >
          <KeiroChatBody chat={chat} suggestions={HERO_SUGGESTIONS} />
        </AIWorkspace>
      </div>
    </div>
  );
};
