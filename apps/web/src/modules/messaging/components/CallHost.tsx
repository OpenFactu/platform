import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { Avatar, Button, Modal, Select, useToast } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { callClient, type CallSnapshot } from '../api/callClient';
import { startRingtone } from '../api/ringtone';
import { useMessagingPeople } from '../context/MessagingPeople';
import { StreamVideo } from './CallMedia';
import { CallView } from './CallView';

/** Elegir cámara y micro antes de entrar. */
const CallPreview: React.FC<{ snapshot: CallSnapshot }> = ({ snapshot }) => {
  const { t } = useI18n();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState('');
  const [camId, setCamId] = useState('');
  const hasStream = Boolean(snapshot.localStream);

  // Los nombres de los dispositivos solo se ven con el permiso ya concedido.
  useEffect(() => {
    let cancelled = false;
    void navigator.mediaDevices.enumerateDevices().then((found) => {
      if (!cancelled) setDevices(found);
    });
    return () => {
      cancelled = true;
    };
  }, [hasStream]);

  const options = (kind: MediaDeviceKind) =>
    devices
      .filter((d) => d.kind === kind && d.deviceId)
      .map((d, i) => ({
        value: d.deviceId,
        label: d.label || `${t(`messaging.calls.device.${kind}`)} ${i + 1}`,
      }));
  const reopen = (mic: boolean, cam: boolean, nextMic = micId, nextCam = camId) =>
    void callClient.openDevices(mic, cam, nextMic || undefined, nextCam || undefined);

  const inCall = snapshot.call?.participants.length ?? 0;
  return (
    <Modal
      isOpen
      onClose={() => callClient.leave()}
      title={t('messaging.calls.previewTitle')}
      size="md"
      primaryAction={{
        label: t('messaging.calls.join'),
        onClick: () => void callClient.confirm(),
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black">
          {snapshot.cam && snapshot.localStream?.getVideoTracks().length ? (
            <StreamVideo stream={snapshot.localStream} mirrored />
          ) : (
            <VideoOff size={32} className="text-white/60" />
          )}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-2">
            <Button
              size="sm"
              variant={snapshot.mic ? 'soft' : 'danger'}
              aria-label={t(snapshot.mic ? 'messaging.calls.muteMic' : 'messaging.calls.unmuteMic')}
              onClick={() => reopen(!snapshot.mic, snapshot.cam)}
            >
              {snapshot.mic ? <Mic size={16} /> : <MicOff size={16} />}
            </Button>
            <Button
              size="sm"
              variant={snapshot.cam ? 'soft' : 'danger'}
              aria-label={t(snapshot.cam ? 'messaging.calls.camOff' : 'messaging.calls.camOn')}
              onClick={() => reopen(snapshot.mic, !snapshot.cam)}
            >
              {snapshot.cam ? <Video size={16} /> : <VideoOff size={16} />}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label={t('messaging.calls.mic')}
            value={micId}
            onChange={(v) => {
              setMicId(v);
              reopen(snapshot.mic, snapshot.cam, v, camId);
            }}
            options={options('audioinput')}
            placeholder={t('messaging.calls.defaultDevice')}
          />
          <Select
            label={t('messaging.calls.camera')}
            value={camId}
            onChange={(v) => {
              setCamId(v);
              reopen(snapshot.mic, snapshot.cam, micId, v);
            }}
            options={options('videoinput')}
            placeholder={t('messaging.calls.defaultDevice')}
          />
        </div>
        {snapshot.problem && (
          <p role="alert" className="text-sm text-danger-fg">
            {t(`messaging.calls.problems.${snapshot.problem}`)}
          </p>
        )}
        <p className="text-sm text-fg-muted">
          {inCall > 0
            ? t('messaging.calls.peopleInside', { n: inCall })
            : t('messaging.calls.nobodyInside')}
        </p>
      </div>
    </Modal>
  );
};

/** Una llamada que está sonando. */
const IncomingCall: React.FC<{ snapshot: CallSnapshot }> = ({ snapshot }) => {
  const { t } = useI18n();
  const { membersById } = useMessagingPeople();
  const call = snapshot.ringing;
  const ringing = Boolean(call);
  useEffect(() => (ringing ? startRingtone() : undefined), [ringing]);
  if (!call) return null;
  const name = membersById.get(call.startedBy)?.name ?? t('messaging.unknownUser');
  return createPortal(
    <div
      role="alertdialog"
      aria-label={t('messaging.calls.incoming', { name })}
      className="fixed right-4 top-16 z-[60] flex w-80 flex-col gap-3 rounded-lg border border-border-default bg-bg-card p-4 shadow-xl"
    >
      <div className="flex items-center gap-3">
        <Avatar name={name} size="md" />
        <p className="min-w-0 text-sm font-semibold text-fg-default">
          {t('messaging.calls.incoming', { name })}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => callClient.dismissRinging()}>
          {t('messaging.calls.decline')}
        </Button>
        <Button size="sm" onClick={() => void callClient.callConversation(call.conversationId)}>
          <Video size={14} />
          {t('messaging.calls.accept')}
        </Button>
      </div>
    </div>,
    document.body,
  );
};

/**
 * Todo lo de las llamadas, montado junto al chat: sigue vivo al cambiar de
 * pantalla, porque el estado está en `callClient`.
 */
export const CallHost: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const snapshot = useSyncExternalStore(callClient.subscribe, callClient.getSnapshot);
  const { phase, problem } = snapshot;
  const { meId, membersById } = useMessagingPeople();
  const meName = membersById.get(meId)?.name ?? '';

  useEffect(() => callClient.attach(), []);

  // En la vista previa el problema se ve allí mismo; si no, hay que avisar.
  useEffect(() => {
    if (!problem || phase === 'preview') return;
    toast.error(t(`messaging.calls.problems.${problem}`));
    callClient.dismissProblem();
  }, [problem, phase, toast, t]);

  return (
    <>
      <IncomingCall snapshot={snapshot} />
      {phase === 'preview' && <CallPreview snapshot={snapshot} />}
      {(phase === 'connecting' || phase === 'connected') && (
        <CallView snapshot={snapshot} meId={meId} meName={meName} />
      )}
    </>
  );
};
