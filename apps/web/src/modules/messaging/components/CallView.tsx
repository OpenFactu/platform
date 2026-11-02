import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Columns2,
  Grid2x2,
  LayoutPanelTop,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Pin,
  PinOff,
  Send,
  Settings2,
  UserPlus,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { Avatar, Button, DropdownMenu, Input } from '@openfactu/ui';
import { formatTime } from '@/i18n/format';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nContext';
import { callClient, type CallClient, type CallSnapshot } from '../api/callClient';
import {
  CALL_QUALITIES,
  gridColumns,
  streamId,
  type CallLayout,
  type CallTile,
} from '../domain/call';
import { useCallView } from '../hooks/useCallView';
import { StreamAudio, StreamVideo } from './CallMedia';
import { InviteGuestsModal } from './InviteGuestsModal';

const LAYOUTS: { id: CallLayout; icon: React.ReactNode }[] = [
  { id: 'grid', icon: <Grid2x2 size={16} /> },
  { id: 'speaker', icon: <LayoutPanelTop size={16} /> },
  { id: 'sidebar', icon: <Columns2 size={16} /> },
];

const Tile: React.FC<{
  tile: CallTile;
  snapshot: CallSnapshot;
  talking: boolean;
  featured?: boolean;
  isPinned: boolean;
  onPin?: () => void;
  className?: string;
}> = ({ tile, snapshot, talking, featured, isPinned, onPin, className = '' }) => {
  const { t } = useI18n();
  const name = tile.name || t('messaging.unknownUser');
  const stream = tile.isMe
    ? tile.source === 'screen'
      ? snapshot.screenStream
      : snapshot.localStream
    : snapshot.remote[streamId(tile.peerId, tile.source)];
  const shown = tile.guest ? t('messaging.calls.guestName', { name }) : name;
  const label = tile.source === 'screen' ? t('messaging.calls.screenOf', { name: shown }) : shown;
  const pinLabel = t(isPinned ? 'messaging.calls.unpin' : 'messaging.calls.pin');
  return (
    <div
      className={`group relative flex min-h-0 items-center justify-center overflow-hidden rounded-lg bg-black ${talking ? 'ring-2 ring-accent' : ''} ${featured ? 'col-span-full' : ''} ${className}`}
    >
      {tile.hasVideo && stream ? (
        <StreamVideo
          stream={stream}
          mirrored={tile.isMe && tile.source === 'cam'}
          contain={tile.source === 'screen'}
        />
      ) : (
        <Avatar name={name} size="lg" />
      )}
      <span className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1 truncate rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {!tile.mic && tile.source === 'cam' && (
          <MicOff size={12} aria-label={t('messaging.calls.muted')} />
        )}
        {label}
      </span>
      {onPin && (
        <button
          type="button"
          aria-label={pinLabel}
          title={pinLabel}
          aria-pressed={isPinned}
          onClick={onPin}
          className={`absolute right-2 top-2 rounded bg-black/60 p-1.5 text-white ${isPinned ? '' : 'opacity-0 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100'}`}
        >
          {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
      )}
    </div>
  );
};

/** El chat de la llamada: lo ven los que están dentro, invitados incluidos, y se
 * va al colgar. No es el de la conversación, cuyo historial un invitado no debe ver. */
const CallChat: React.FC<{
  client: CallClient;
  snapshot: CallSnapshot;
  onClose: () => void;
  overlay: boolean;
}> = ({ client, snapshot, onClose, overlay }) => {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const lines = snapshot.chat;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    client.sendChat(text);
    setText('');
  };
  return (
    <aside
      aria-label={t('messaging.calls.chat')}
      className={`flex min-h-0 flex-col border-l border-border-default bg-bg-card ${overlay ? 'absolute inset-0 z-10' : 'w-80 shrink-0'}`}
    >
      <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
        <span className="text-sm font-semibold text-fg-default">{t('messaging.calls.chat')}</span>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {lines.length === 0 && (
          <p className="text-sm text-fg-muted">{t('messaging.calls.chatHint')}</p>
        )}
        {lines.map((line) => (
          <div key={line.id} className="min-w-0 text-sm">
            <p className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold text-fg-default">
                {line.peerId === snapshot.myPeerId ? t('messaging.calls.you') : line.name}
              </span>
              <span className="shrink-0 text-xs text-fg-subtle">
                {formatTime(line.at, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
            <p className="whitespace-pre-wrap break-words text-fg-body">{line.text}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-border-default p-2" onSubmit={send}>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('messaging.calls.chatPlaceholder')}
          aria-label={t('messaging.calls.chatPlaceholder')}
          maxLength={2000}
          containerClassName="min-w-0 flex-1"
        />
        <Button
          type="submit"
          aria-label={t('messaging.calls.chatSend')}
          title={t('messaging.calls.chatSend')}
          disabled={!text.trim()}
        >
          <Send size={16} />
        </Button>
      </form>
    </aside>
  );
};

/** Invitados que esperan: solo lo ve el equipo que está dentro. */
const Lobby: React.FC<{ client: CallClient; snapshot: CallSnapshot }> = ({ client, snapshot }) => {
  const { t } = useI18n();
  if (snapshot.lobby.length === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-col gap-2 border-b border-border-default bg-bg-card px-3 py-2"
    >
      {snapshot.lobby.map((guest) => (
        <div key={guest.guestId} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm text-fg-default">
            {t('messaging.guest.wantsIn', { name: guest.name })}
          </span>
          <span className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => client.decideGuest(guest.guestId, false)}
            >
              {t('messaging.guest.reject')}
            </Button>
            <Button size="sm" onClick={() => client.decideGuest(guest.guestId, true)}>
              {t('messaging.guest.admit')}
            </Button>
          </span>
        </div>
      ))}
    </div>
  );
};

/** La llamada: a toda pantalla o en una ventana flotante mientras se trabaja. */
export const CallView: React.FC<{
  snapshot: CallSnapshot;
  client?: CallClient;
  /** Un invitado sin cuenta: ni invita, ni deja pasar, ni minimiza (no hay ERP debajo). */
  guest?: boolean;
  meId?: string;
  meName: string;
}> = ({ snapshot, client = callClient, guest = false, meId = 'me', meName }) => {
  const { t } = useI18n();
  const mobile = useIsMobile();
  const view = useCallView(client, snapshot, { id: meId, name: meName });
  const [inviting, setInviting] = useState(false);
  const { main, rest } = view.arranged;
  const canShare = !mobile && 'getDisplayMedia' in navigator.mediaDevices;

  const audios = Object.entries(snapshot.remote)
    .filter(([key]) => key.endsWith('mic'))
    .map(([key, stream]) => <StreamAudio key={key} stream={stream} />);

  const tile = (item: CallTile, opts: { className?: string; featured?: boolean } = {}) => (
    <Tile
      key={item.key}
      tile={item}
      snapshot={snapshot}
      talking={item.source === 'cam' && view.talking.has(item.peerId)}
      isPinned={view.pinned === item.key}
      onPin={view.mini ? undefined : () => view.togglePin(item.key)}
      {...opts}
    />
  );

  const hasScreen = rest[0]?.source === 'screen';
  const stage = view.mini ? (
    <div className="grid min-h-0 flex-1 p-2">{view.tiles[0] && tile(view.tiles[0])}</div>
  ) : main ? (
    <div
      className={`flex min-h-0 flex-1 gap-2 p-2 ${view.layout === 'sidebar' && !mobile ? 'flex-row' : 'flex-col'}`}
    >
      {tile(main, { className: 'min-w-0 flex-1' })}
      {rest.length > 0 && (
        <div
          className={
            view.layout === 'sidebar' && !mobile
              ? 'flex w-56 shrink-0 flex-col gap-2 overflow-y-auto'
              : 'flex h-28 shrink-0 gap-2 overflow-x-auto'
          }
        >
          {rest.map((item) =>
            tile(item, {
              className:
                view.layout === 'sidebar' && !mobile
                  ? 'aspect-video w-full shrink-0'
                  : 'aspect-video h-full shrink-0',
            }),
          )}
        </div>
      )}
    </div>
  ) : (
    <div
      className="grid min-h-0 flex-1 gap-2 p-2"
      style={{
        gridTemplateColumns: `repeat(${mobile ? 1 : gridColumns(hasScreen ? rest.length - 1 : rest.length)}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(0, 1fr)',
      }}
    >
      {rest.map((item) => tile(item, { featured: item.source === 'screen' }))}
    </div>
  );

  const settings = [
    ...LAYOUTS.map(({ id, icon }, i) => ({
      label: t(`messaging.calls.layouts.${id}`),
      icon,
      separatorBefore: i === 0 ? false : undefined,
      description: view.layout === id ? t('messaging.calls.current') : undefined,
      onClick: () => view.setLayout(id),
    })),
    ...CALL_QUALITIES.map((q, i) => ({
      label: t(`messaging.calls.quality.${q}`),
      separatorBefore: i === 0,
      description: snapshot.quality === q ? t('messaging.calls.current') : undefined,
      onClick: () => client.setQuality(q),
    })),
  ];

  const miniLabel = t(view.mini ? 'messaging.calls.expand' : 'messaging.calls.minimize');
  const chatLabel = t('messaging.calls.chat');

  return createPortal(
    <div
      role="dialog"
      aria-label={t('messaging.calls.title')}
      className={
        view.mini
          ? 'fixed bottom-4 right-4 z-[60] flex h-56 w-80 flex-col overflow-hidden rounded-lg border border-border-default bg-bg-card shadow-xl'
          : 'fixed inset-0 z-[60] flex flex-col bg-bg-app'
      }
    >
      {audios}
      <div className="flex items-center justify-between gap-2 border-b border-border-default px-3 py-2">
        <span className="truncate text-sm font-semibold text-fg-default">
          {view.connected ? t('messaging.calls.title') : t('messaging.calls.connecting')}
        </span>
        {!guest && (
          <span className="flex items-center gap-1">
            {!view.mini && snapshot.call && (
              <Button size="sm" variant="ghost" onClick={() => setInviting(true)}>
                <UserPlus size={16} />
                {t('messaging.guest.invite')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={miniLabel}
              title={miniLabel}
              onClick={view.toggleMini}
            >
              {view.mini ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </Button>
          </span>
        )}
      </div>
      {!guest && <Lobby client={client} snapshot={snapshot} />}
      <div className="relative flex min-h-0 flex-1">
        {stage}
        {view.chatOpen && !view.mini && (
          <CallChat
            client={client}
            snapshot={snapshot}
            onClose={view.toggleChat}
            overlay={mobile}
          />
        )}
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-border-default p-2">
        <Button
          variant={snapshot.mic ? 'soft' : 'danger'}
          aria-label={t(snapshot.mic ? 'messaging.calls.muteMic' : 'messaging.calls.unmuteMic')}
          title={t(snapshot.mic ? 'messaging.calls.muteMic' : 'messaging.calls.unmuteMic')}
          onClick={() => client.toggleMic()}
        >
          {snapshot.mic ? <Mic size={18} /> : <MicOff size={18} />}
        </Button>
        <Button
          variant={snapshot.cam ? 'soft' : 'danger'}
          aria-label={t(snapshot.cam ? 'messaging.calls.camOff' : 'messaging.calls.camOn')}
          title={t(snapshot.cam ? 'messaging.calls.camOff' : 'messaging.calls.camOn')}
          onClick={() => void client.toggleCam()}
        >
          {snapshot.cam ? <Video size={18} /> : <VideoOff size={18} />}
        </Button>
        {canShare && (
          <Button
            variant={snapshot.screen ? 'primary' : 'soft'}
            aria-label={t(snapshot.screen ? 'messaging.calls.stopShare' : 'messaging.calls.share')}
            title={t(snapshot.screen ? 'messaging.calls.stopShare' : 'messaging.calls.share')}
            onClick={() => void client.toggleScreen()}
          >
            {snapshot.screen ? <MonitorX size={18} /> : <MonitorUp size={18} />}
          </Button>
        )}
        {!view.mini && (
          <>
            <Button
              variant={view.chatOpen ? 'primary' : 'soft'}
              aria-label={chatLabel}
              title={chatLabel}
              onClick={view.toggleChat}
            >
              <MessageSquare size={18} />
              {view.unread > 0 && <span className="text-xs">{view.unread}</span>}
            </Button>
            <DropdownMenu items={settings} aria-label={t('messaging.calls.settings')}>
              <Button variant="soft" title={t('messaging.calls.settings')}>
                <Settings2 size={18} />
              </Button>
            </DropdownMenu>
          </>
        )}
        <Button
          variant="danger"
          aria-label={t('messaging.calls.hangUp')}
          title={t('messaging.calls.hangUp')}
          onClick={() => client.leave()}
        >
          <PhoneOff size={18} />
        </Button>
      </div>
      {inviting && snapshot.call && (
        <InviteGuestsModal
          conversationId={snapshot.call.conversationId}
          callId={snapshot.call.id}
          onClose={() => setInviting(false)}
        />
      )}
    </div>,
    document.body,
  );
};
