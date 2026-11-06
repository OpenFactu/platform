import React, { useEffect, useState } from 'react';
import { CheckCircle2, TriangleAlert, Video } from 'lucide-react';
import { Card } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { rtClient } from '../api/rtClient';
import type { RtcClientConfig } from '../domain/call';

/**
 * Para el administrador: con qué dirección se está ofreciendo el vídeo. Cada
 * instalación es distinta (ver `docs/videollamadas.md`) y es lo primero que hay
 * que mirar si las llamadas no conectan.
 */
export const CallDiagnostics: React.FC = () => {
  const { t } = useI18n();
  const [config, setConfig] = useState<RtcClientConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    rtClient
      .request<RtcClientConfig>('GET', '/rtc/config')
      .then((found) => {
        if (!cancelled) setConfig(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!config) return null;
  const secure = window.isSecureContext;
  const lines = [
    { ok: config.available, text: t(`messaging.calls.diag.${config.available ? 'up' : 'down'}`) },
    { ok: secure, text: t(`messaging.calls.diag.${secure ? 'https' : 'noHttps'}`) },
    {
      ok: config.publicIpConfigured,
      text: t(`messaging.calls.diag.${config.publicIpConfigured ? 'publicIp' : 'localIp'}`, {
        address: config.advertised ?? '—',
      }),
    },
    { ok: config.turn, text: t(`messaging.calls.diag.${config.turn ? 'turn' : 'noTurn'}`) },
  ];

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-accent">
          <Video size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="font-semibold text-fg-default">{t('messaging.calls.diag.title')}</h2>
          <ul className="flex flex-col gap-1 text-sm text-fg-body">
            {lines.map((line) => (
              <li key={line.text} className="flex items-start gap-2">
                <span className={`mt-0.5 ${line.ok ? 'text-success-fg' : 'text-warning-fg'}`}>
                  {line.ok ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
                </span>
                {line.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
};
