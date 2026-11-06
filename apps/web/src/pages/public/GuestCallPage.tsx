import React from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { Button, Card, EmptyState, Input } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { StreamVideo } from '@/modules/messaging/components/CallMedia';
import { CallView } from '@/modules/messaging/components/CallView';
import { useGuestCall } from '@/modules/messaging/hooks/useGuestCall';

/**
 * Página pública de una videollamada, para gente sin cuenta: escribe su nombre,
 * prueba cámara y micro, espera a que le dejen entrar y entra. Sin instalar nada
 * y sin ver nada más de la empresa que la propia llamada.
 */
export const GuestCallPage: React.FC = () => {
  const { token = '' } = useParams();
  const { t } = useI18n();
  const { client, snapshot, step, name, setName, ask } = useGuestCall(token);

  if (step === 'call' && (snapshot.phase === 'connecting' || snapshot.phase === 'connected')) {
    return <CallView snapshot={snapshot} client={client} guest meName={name.trim()} />;
  }

  const end = { rejected: 'rejected', invalid: 'invalid', full: 'full', ended: 'ended' } as const;
  const message = step in end ? end[step as keyof typeof end] : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-app p-4">
      {message ? (
        <EmptyState
          icon={<VideoOff size={28} />}
          title={t(`messaging.guest.${message}.title`)}
          hint={t(`messaging.guest.${message}.hint`)}
        />
      ) : (
        <Card className="w-full max-w-lg">
          <div className="flex flex-col gap-4">
            <h1 className="text-lg font-semibold text-fg-default">
              {t(step === 'waiting' ? 'messaging.guest.waitingTitle' : 'messaging.guest.title')}
            </h1>
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
                  aria-label={t(
                    snapshot.mic ? 'messaging.calls.muteMic' : 'messaging.calls.unmuteMic',
                  )}
                  onClick={() => void client.openDevices(!snapshot.mic, snapshot.cam)}
                >
                  {snapshot.mic ? <Mic size={16} /> : <MicOff size={16} />}
                </Button>
                <Button
                  size="sm"
                  variant={snapshot.cam ? 'soft' : 'danger'}
                  aria-label={t(snapshot.cam ? 'messaging.calls.camOff' : 'messaging.calls.camOn')}
                  onClick={() => void client.openDevices(snapshot.mic, !snapshot.cam)}
                >
                  {snapshot.cam ? <Video size={16} /> : <VideoOff size={16} />}
                </Button>
              </div>
            </div>
            {snapshot.problem && (
              <p role="alert" className="text-sm text-danger-fg">
                {t(`messaging.calls.problems.${snapshot.problem}`)}
              </p>
            )}
            {step === 'waiting' ? (
              <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
                <Loader2 size={16} className="animate-spin" />
                {t('messaging.guest.waitingHint')}
              </p>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim()) ask();
                }}
              >
                <Input
                  label={t('messaging.guest.name')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  autoFocus
                />
                <Button type="submit" disabled={!name.trim()}>
                  {t('messaging.guest.ask')}
                </Button>
              </form>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default GuestCallPage;
