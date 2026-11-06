import { useEffect, useMemo, useState } from 'react';
import type { CallClient, CallSnapshot } from '../api/callClient';
import { arrangeTiles, callTiles, type CallLayout, type CallParticipant } from '../domain/call';

const SPEAKERS_EVERY_MS = 600;
const LAYOUT_KEY = 'keirost:callLayout';

function savedLayout(): CallLayout {
  try {
    const value = localStorage.getItem(LAYOUT_KEY);
    return value === 'speaker' || value === 'sidebar' ? value : 'grid';
  } catch {
    return 'grid';
  }
}

/** Lo que decide cómo se ve la llamada: disposición, fijados, quién habla, chat. */
export function useCallView(
  client: CallClient,
  snapshot: CallSnapshot,
  me: { id: string; name: string },
) {
  const [layout, setLayoutState] = useState<CallLayout>(savedLayout);
  const [pinned, setPinned] = useState<string | null>(null);
  const [mini, setMini] = useState(false);
  const [talking, setTalking] = useState<Set<number>>(() => new Set());
  const [lastSpeaker, setLastSpeaker] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [seenLines, setSeenLines] = useState(0);
  const connected = snapshot.phase === 'connected';
  const unread = chatOpen ? 0 : Math.max(0, snapshot.chat.length - seenLines);

  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      void client.speakers().then((found) => {
        setTalking(found);
        // Se queda el último que habló: con cada silencio no debe cambiar el centro.
        const [first] = found;
        if (first !== undefined) setLastSpeaker((prev) => (found.has(prev ?? -1) ? prev : first));
      });
    }, SPEAKERS_EVERY_MS);
    return () => clearInterval(timer);
  }, [connected, client]);

  // Antes de que el servidor confirme, el recuadro propio ya tiene que verse.
  const participants = useMemo<CallParticipant[]>(() => {
    const list = snapshot.call?.participants ?? [];
    if (snapshot.myPeerId !== null && list.some((p) => p.peerId === snapshot.myPeerId)) return list;
    return [
      ...list,
      {
        peerId: snapshot.myPeerId ?? -1,
        userId: me.id,
        name: me.name,
        guest: false,
        mic: snapshot.mic,
        cam: snapshot.cam,
        screen: false,
      },
    ];
  }, [snapshot.call, snapshot.myPeerId, snapshot.mic, snapshot.cam, me.id, me.name]);

  const tiles = useMemo(
    () =>
      snapshot.call ? callTiles({ ...snapshot.call, participants }, snapshot.myPeerId ?? -1) : [],
    [snapshot.call, participants, snapshot.myPeerId],
  );
  const arranged = useMemo(
    () => arrangeTiles(tiles, layout, pinned, lastSpeaker),
    [tiles, layout, pinned, lastSpeaker],
  );

  const setLayout = (next: CallLayout) => {
    setLayoutState(next);
    setPinned(null);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Solo es recordar la preferencia.
    }
  };

  const toggleChat = () => {
    setChatOpen((open) => !open);
    setSeenLines(snapshot.chat.length);
  };

  return {
    layout,
    setLayout,
    pinned,
    togglePin: (key: string) => setPinned((prev) => (prev === key ? null : key)),
    mini,
    toggleMini: () => setMini((v) => !v),
    talking,
    connected,
    tiles,
    arranged,
    chatOpen,
    toggleChat,
    unread,
  };
}
