/**
 * Botón flotante + panel lateral para acceder a Keiro desde cualquier
 * pantalla de la app, sin tener que abrir su pestaña dedicada. Reutiliza
 * `AiChatContext` (misma sesión de chat que la pestaña /ai/chat — un solo
 * turno en curso a la vez) y `useKeiroChat` + `KeiroChatBody`, que pintan la
 * conversación y el compositor con @openfactu/ui/ai igual que la página.
 *
 * El panel es no modal a propósito (no un `Drawer`): el asistente se consulta
 * mientras se sigue trabajando en la pantalla de al lado.
 *
 * Se oculta a sí mismo cuando la pestaña activa YA es /ai/chat — mostrar el
 * lanzador ahí sería redundante con la página que ya está abierta.
 *
 * Solo se muestra en desktop (`md:` y superior). En móvil choca con la barra
 * inferior (`MobileBottomNav`, que también es fixed) y con su botón central
 * de escaneo — y Keiro ya es accesible desde ahí vía Menú, así que el
 * lanzador flotante es redundante en pantallas pequeñas.
 *
 * En desktop la bolita se puede arrastrar a cualquiera de las 4 esquinas
 * (arrastre real, no solo click) — al soltar, se ancla a la esquina más
 * cercana y esa elección se recuerda entre sesiones (localStorage).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@openfactu/ui';
import { Bot, Maximize2, Sparkles, X } from 'lucide-react';
import { useTabs } from '@/context/TabsContext';
import { ASSISTANT_NAME } from '../domain/constants';
import { useKeiroChat } from '../hooks/useKeiroChat';
import { DropOverlay } from './DropOverlay';
import { KeiroChatBody } from './KeiroChatBody';
import { registerKeiroParts } from './keiroParts';

registerKeiroParts();

type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
const CORNER_STORAGE_KEY = 'keirost:chatBubbleCorner';
// Anclajes con hueco para no tapar el layout fijo de MainLayout.tsx: el riel
// de iconos (60px) a la izquierda y la cabecera (56px, h-14) arriba. Abajo y
// a la derecha no hay nada fijo en desktop, así que ahí sí vale el margen
// normal de 24px (right-6/bottom-6).
const CORNER_CLASSES: Record<Corner, string> = {
  'bottom-right': 'bottom-6 right-6',
  'bottom-left': 'bottom-6 left-[76px]',
  'top-right': 'top-[70px] right-6',
  'top-left': 'top-[70px] left-[76px]',
};
/** Umbral en px para distinguir un click de un arrastre. */
const DRAG_THRESHOLD = 8;

function loadCorner(): Corner {
  try {
    const v = localStorage.getItem(CORNER_STORAGE_KEY);
    if (v && v in CORNER_CLASSES) return v as Corner;
  } catch {
    /* localStorage puede fallar en modo privado — usamos el default */
  }
  return 'bottom-right';
}

export const ChatLauncherPanel: React.FC = () => {
  const { tabs, activeTabId, openTab } = useTabs();
  const chat = useKeiroChat();
  const { drop, setChatVisible } = chat;

  const [open, setOpen] = useState(false);
  const [corner, setCorner] = useState<Corner>(loadCorner);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, dragging: false };

    const handleMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.dragging = true;
      // Durante el arrastre, el botón sigue al cursor libremente; al soltar
      // se limpian estos estilos inline y vuelve a las clases de la esquina.
      const btn = btnRef.current;
      if (btn) {
        btn.style.left = `${ev.clientX - 28}px`;
        btn.style.top = `${ev.clientY - 28}px`;
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
      }
    };

    const handleUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      const drag = dragRef.current;
      dragRef.current = null;
      const btn = btnRef.current;
      if (btn) {
        btn.style.left = '';
        btn.style.top = '';
        btn.style.right = '';
        btn.style.bottom = '';
      }
      if (!drag?.dragging) {
        // Click normal (sin arrastre significativo) → abrir el chat.
        setOpen(true);
        return;
      }
      // Arrastre real → anclar a la esquina más cercana al soltar.
      const next: Corner = `${ev.clientY > window.innerHeight / 2 ? 'bottom' : 'top'}-${
        ev.clientX > window.innerWidth / 2 ? 'right' : 'left'
      }`;
      setCorner(next);
      try {
        localStorage.setItem(CORNER_STORAGE_KEY, next);
      } catch {
        /* no crítico si no se puede persistir */
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const onChatTab = Boolean(activeTab?.path?.startsWith('/ai/chat'));

  useEffect(() => {
    // La pestaña dedicada gestiona su propia visibilidad — si está activa,
    // no la pisamos desde aquí (el panel ni siquiera se muestra en ese caso).
    if (onChatTab) return;
    setChatVisible(open);
    return () => setChatVisible(false);
  }, [open, onChatTab, setChatVisible]);

  if (onChatTab) return null;

  return (
    <>
      {!open && (
        <button
          ref={btnRef}
          type="button"
          onPointerDown={handlePointerDown}
          className={`k-ai-glow hidden md:flex fixed ${CORNER_CLASSES[corner]} z-40 w-14 h-14 rounded-full bg-accent text-accent-fg shadow-lg hover:scale-105 active:scale-95 transition-transform items-center justify-center cursor-grab active:cursor-grabbing`}
          style={{ touchAction: 'none' }}
          title={`Abrir ${ASSISTANT_NAME} (arrastra para mover)`}
        >
          <Bot size={26} />
          <Sparkles
            size={14}
            className="absolute -top-1 -right-1 text-amber-300 fill-amber-300/40 animate-pulse"
          />
        </button>
      )}

      {open && (
        <div
          className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] h-full flex flex-col bg-bg-card sm:border-l border-border-default shadow-k-overlay animate-in fade-in slide-in-from-right duration-300 overflow-hidden"
          {...drop.dropZoneProps}
        >
          <DropOverlay visible={drop.dragOver} acceptImages={chat.supportsImages} />
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
            <div className="flex items-center gap-2 font-bold">
              <Bot size={18} className="text-accent" />
              <span>{ASSISTANT_NAME}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  openTab('/ai/chat');
                  setOpen(false);
                }}
                title="Abrir a pantalla completa"
                className="text-fg-subtle hover:text-accent"
              >
                <Maximize2 size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                title="Cerrar"
                className="text-fg-subtle hover:text-danger-fg"
              >
                <X size={16} />
              </Button>
            </div>
          </div>
          <div className="ai-workspace-chat">
            <KeiroChatBody chat={chat} />
          </div>
        </div>
      )}
    </>
  );
};
