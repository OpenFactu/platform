import { useEffect, useState } from 'react';
import { PageHeader, Alert } from '@openfactu/ui';
import { Usb } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { kiosksApi } from '@/modules/hr/api';
import type { Kiosk } from '@/modules/hr/domain/kiosk';
import { TimeclockDevices } from '@/modules/hr/components/TimeclockDevices';

export function PhysicalDevices() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const canWrite =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPERUSER' ||
    !!user?.permissions?.['/hr/kiosks']?.write;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setKiosks([]);
    void kiosksApi
      .list()
      .then((rows) => {
        if (active) setKiosks(rows);
      })
      .catch(() => {
        if (active) setError(t('settings.devices.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.tenantId]);
  return (
    <div className="p-4 space-y-6">
      <PageHeader
        title={t('settings.devices.title')}
        subtitle={t('settings.devices.subtitle')}
        icon={<Usb size={18} />}
        size="lg"
      />
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      {loading ? (
        <p role="status">{t('settings.devices.loading')}</p>
      ) : (
        !error && (
          <>
            {!kiosks.some((k) => k.isActive) && (
              <p className="text-sm text-fg-muted">{t('settings.devices.noActiveKiosk')}</p>
            )}
            <TimeclockDevices
              key={user?.tenantId}
              kiosks={kiosks}
              canWrite={canWrite}
              tenantId={user?.tenantId || ''}
            />
          </>
        )
      )}
    </div>
  );
}
