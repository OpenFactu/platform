import React, { useState } from 'react';
import { Button, Textarea, useToast } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { driverApi } from '../../api';
import { DriverModal } from './DriverModal';
import { PhotoCapture } from './PhotoCapture';

const CATEGORIES = ['bug', 'idea', 'other'];

interface Props {
  routeId?: string | null;
  onClose: () => void;
}

/**
 * Contar un problema de la propia aplicación, que no tiene que ver con el reparto. Va
 * con lo necesario para reproducirlo, sin que el conductor tenga que saberlo.
 */
export const AppReportModal: React.FC<Props> = ({ routeId, onClose }) => {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      await driverApi.sendAppReport({
        category,
        message: message.trim(),
        photo,
        context: {
          routeId: routeId ?? null,
          path: window.location.pathname,
          userAgent: navigator.userAgent,
          screen: `${window.innerWidth}x${window.innerHeight}`,
          online: navigator.onLine,
          locale,
          at: new Date().toISOString(),
        },
      });
      toast.success(t('logistics.appReports.sent'));
      onClose();
    } catch {
      toast.error(t('logistics.appReports.sendError'));
    } finally {
      setSending(false);
    }
  };

  return (
    <DriverModal
      isOpen
      onClose={onClose}
      title={t('logistics.appReports.newTitle')}
      subtitle={t('logistics.appReports.newHint')}
      footer={
        <div className="flex w-full gap-2">
          <Button size="lg" variant="secondary" onClick={onClose}>
            {t('logistics.common.cancel')}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={!message.trim() || sending}
            onClick={send}
          >
            {t('logistics.appReports.send')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        <div className="space-y-2">
          {CATEGORIES.map((option) => (
            <Button
              key={option}
              size="lg"
              variant={category === option ? 'primary' : 'outline'}
              className="w-full justify-start"
              onClick={() => setCategory(option)}
            >
              {t(`logistics.appReports.category.${option}`)}
            </Button>
          ))}
        </div>
        <Textarea
          label={t('logistics.appReports.message')}
          required
          rows={4}
          placeholder={t('logistics.appReports.messagePlaceholder')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <PhotoCapture
          value={photo}
          onChange={setPhoto}
          camera={false}
          label={t('logistics.appReports.addPhoto')}
        />
      </div>
    </DriverModal>
  );
};
