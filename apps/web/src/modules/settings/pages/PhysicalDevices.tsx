import { useEffect, useState } from 'react';
import { PageHeader } from '@openfactu/ui';
import { Usb } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { kiosksApi } from '@/modules/hr/api';
import type { Kiosk } from '@/modules/hr/domain/kiosk';
import { TimeclockDevices } from '@/modules/hr/components/TimeclockDevices';

export function PhysicalDevices() {
  const { user } = useAuth();
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
        if (active) setError('No se pudieron cargar los kioscos de esta empresa.');
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
        title="Dispositivos físicos"
        subtitle="Configura los lectores de tarjetas por USB y vincúlalos a una pantalla de fichaje."
        icon={<Usb size={18} />}
        size="lg"
      />
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando dispositivos…</p>
      ) : (
        !error && (
          <>
            {!kiosks.some((k) => k.isActive) && (
              <p className="text-sm text-fg-muted">
                Crea primero un kiosco activo en Recursos Humanos → Kioskos de fichaje. Después
                podrás vincular el lector a su pantalla.
              </p>
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
