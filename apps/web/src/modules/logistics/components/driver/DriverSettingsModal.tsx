import React from 'react';
import { Alert, Button, Switch } from '@openfactu/ui';
import { ArrowLeft, LogOut, MessageSquareWarning } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PersonalThemeCard } from '@/modules/settings/components/PersonalThemeCard';
import { useFullscreen } from '../../hooks/useFullscreen';
import { DriverModal } from './DriverModal';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Solo con una ruta en marcha hay ubicación que compartir. */
  gps?: { tracking: boolean; onToggle: () => void };
  onReport: () => void;
  /** Volver al ERP; quien solo es conductor no tiene adónde. */
  onExit?: () => void;
}

/** Lo que el conductor puede cambiar sin pasar por el perfil del ERP. */
export const DriverSettingsModal: React.FC<Props> = ({ open, onClose, gps, onReport, onExit }) => {
  const { t } = useI18n();
  const { logout } = useAuth();
  const fullscreen = useFullscreen();

  return (
    <DriverModal
      isOpen={open}
      onClose={onClose}
      title={t('logistics.driver.settings')}
    >
      <div className="space-y-5 py-1">
        <PersonalThemeCard />

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg-default">
            {t('logistics.driver.settingsModal.language')}
          </h3>
          <LanguageSwitcher fullWidth />
        </section>

        {gps && (
          <Switch
            checked={gps.tracking}
            onChange={gps.onToggle}
            label={t('logistics.driver.settingsModal.shareLocation')}
          />
        )}

        <section className="space-y-2">
          <Switch
            checked={fullscreen.active}
            disabled={!fullscreen.supported}
            onChange={fullscreen.toggle}
            label={t('logistics.driver.settingsModal.fullscreen')}
          />
          <Alert tone="neutral">{t('logistics.driver.settingsModal.installHint')}</Alert>
        </section>

        <div className="space-y-2">
          <Button size="lg" variant="secondary" className="w-full" onClick={onReport}>
            <MessageSquareWarning size={18} /> {t('logistics.appReports.newTitle')}
          </Button>
          {onExit && (
            <Button size="lg" variant="secondary" className="w-full" onClick={onExit}>
              <ArrowLeft size={18} /> {t('logistics.driver.settingsModal.backToErp')}
            </Button>
          )}
          <Button size="lg" variant="outline" className="w-full" onClick={logout}>
            <LogOut size={18} /> {t('logistics.driverLayout.logout')}
          </Button>
        </div>
      </div>
    </DriverModal>
  );
};
