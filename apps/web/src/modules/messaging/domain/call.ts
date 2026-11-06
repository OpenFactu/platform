/**
 * Videollamadas: lo que la web sabe de ellas, sin React ni WebRTC.
 *
 * Cada pista que llega trae por id de stream `<participante><mic|cam|screen>`.
 */

export interface CallParticipant {
  peerId: number;
  userId: string;
  name: string;
  guest: boolean;
  mic: boolean;
  cam: boolean;
  screen: boolean;
}

/** Una línea del chat de la llamada: no se guarda, se va al colgar. */
export interface CallChatLine {
  id: number;
  peerId: number;
  name: string;
  text: string;
  at: string;
}

export interface WaitingGuest {
  guestId: number;
  name: string;
}

export interface CallState {
  id: string;
  conversationId: string;
  meetingId: string | null;
  startedBy: string;
  startedAt: string;
  participants: CallParticipant[];
}

export interface RtcClientConfig {
  available: boolean;
  iceServers: RTCIceServer[];
  advertised: string | null;
  turn: boolean;
  publicIpConfigured: boolean;
  maxPeers: number;
}

export type CallSource = 'mic' | 'cam' | 'screen';

export function parseStreamId(id: string): { peerId: number; source: CallSource } | null {
  const match = /^(\d+)(mic|cam|screen)$/.exec(id);
  return match ? { peerId: Number(match[1]), source: match[2] as CallSource } : null;
}

export const streamId = (peerId: number, source: CallSource) => `${peerId}${source}`;

/** Lo que pasó si no se pudo entrar o se cayó: cada caso con su mensaje. */
export type CallProblem =
  | 'insecure'
  | 'permission'
  | 'no_device'
  | 'device_busy'
  | 'connection_failed'
  | 'connection_lost'
  | 'call_full'
  | 'call_not_found'
  | 'calls_required'
  | 'video_unavailable'
  | 'generic';

const SERVER_PROBLEMS = new Set<string>([
  'call_full',
  'call_not_found',
  'calls_required',
  'video_unavailable',
]);

export function problemFromServer(code: string): CallProblem {
  return SERVER_PROBLEMS.has(code) ? (code as CallProblem) : 'generic';
}

export function problemFromMedia(err: unknown): CallProblem {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no_device';
  if (name === 'NotReadableError' || name === 'AbortError') return 'device_busy';
  return 'generic';
}

/** Un recuadro de la llamada. */
export interface CallTile {
  key: string;
  peerId: number;
  userId: string;
  name: string;
  guest: boolean;
  source: 'cam' | 'screen';
  isMe: boolean;
  mic: boolean;
  /** Hay imagen que pintar; si no, su inicial. */
  hasVideo: boolean;
}

/**
 * Los recuadros: una pantalla compartida va la primera y ocupa el centro; el
 * resto, en el orden en que entraron.
 */
export function callTiles(call: CallState, myPeerId: number | null): CallTile[] {
  const tiles: CallTile[] = [];
  for (const p of call.participants) {
    const isMe = p.peerId === myPeerId;
    if (p.screen) {
      tiles.push({
        key: `${p.peerId}screen`,
        peerId: p.peerId,
        userId: p.userId,
        name: p.name,
        guest: p.guest,
        source: 'screen',
        isMe,
        mic: p.mic,
        hasVideo: true,
      });
    }
    tiles.push({
      key: `${p.peerId}cam`,
      peerId: p.peerId,
      userId: p.userId,
      name: p.name,
      guest: p.guest,
      source: 'cam',
      isMe,
      mic: p.mic,
      hasVideo: p.cam,
    });
  }
  return tiles.sort((a, b) => Number(b.source === 'screen') - Number(a.source === 'screen'));
}

export type CallLayout = 'grid' | 'speaker' | 'sidebar';

export const CALL_QUALITIES = ['auto', 'medium', 'low'] as const;
export type CallQuality = (typeof CALL_QUALITIES)[number];

/** Qué capas de la cámara se envían con cada calidad. */
export function activeLayers(quality: CallQuality): Set<string> {
  if (quality === 'low') return new Set(['l']);
  if (quality === 'medium') return new Set(['l', 'm']);
  return new Set(['l', 'm', 'h']);
}

/**
 * Qué va en grande y qué alrededor. Lo fijado manda en cualquier disposición; si
 * no, en la rejilla no hay centro, y en las otras va la pantalla compartida o
 * quien habla.
 */
export function arrangeTiles(
  tiles: CallTile[],
  layout: CallLayout,
  pinned: string | null,
  speaker: number | null,
): { main: CallTile | null; rest: CallTile[] } {
  const fixed = tiles.find((t) => t.key === pinned);
  const main =
    fixed ??
    (layout === 'grid'
      ? undefined
      : (tiles.find((t) => t.source === 'screen') ??
        tiles.find((t) => t.peerId === speaker && t.source === 'cam') ??
        tiles.find((t) => !t.isMe) ??
        tiles[0]));
  if (!main) return { main: null, rest: tiles };
  return { main, rest: tiles.filter((t) => t !== main) };
}

/** Columnas de la rejilla según cuántos recuadros hay. */
export function gridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

/** "5 min", "1 h 05 min" o "menos de 1 min", según lo que duró. */
export function callDuration(
  seconds: number,
  t: (key: string, v?: Record<string, string | number>) => string,
): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t('messaging.calls.lessThanMinute');
  if (minutes < 60) return t('messaging.calls.minutes', { n: minutes });
  const rest = String(minutes % 60).padStart(2, '0');
  return t('messaging.calls.hours', { h: Math.floor(minutes / 60), m: rest });
}
