import { useEffect, useState } from 'react';
import { Button, Card, Input, Select, usePopup } from '@openfactu/ui';
import { timeclockManagementApi as api, type Reader } from '../api/timeclockManagementApi';
import type { Kiosk } from '../domain/kiosk';
import { ReaderUsbSetup } from './ReaderUsbSetup';
import { ReaderFirmwareUpdate } from './ReaderFirmwareUpdate';
export function TimeclockDevices({
  kiosks,
  canWrite,
  tenantId,
}: {
  kiosks: Kiosk[];
  canWrite: boolean;
  tenantId: string;
}) {
  const [rows, setRows] = useState<Reader[]>([]);
  const [editing, setEditing] = useState<Partial<Reader> | null>(null);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState<Reader | null>(null);
  const [provisioning, setProvisioning] = useState<(Reader & { token?: string }) | null>(null);
  const popup = usePopup();
  useEffect(() => {
    let active = true;
    void api
      .readers()
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [tenantId]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      setRows(await api.readers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el lector.');
    } finally {
      setBusy(false);
    }
  };
  const reveal = (row: Reader & { token: string }) => {
    if (row.mode === 'paired') {
      setSecret('');
      setProvisioning(row);
      return;
    }
    setSecret(
      JSON.stringify(
        { baseUrl: window.location.origin, tenantId, deviceId: row.id, deviceToken: row.token },
        null,
        2,
      ),
    );
  };
  return (
    <Card className="p-5 space-y-4">
      {updating && canWrite && (
        <ReaderFirmwareUpdate
          key={updating.id}
          reader={updating}
          onClose={() => setUpdating(null)}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Lectores de tarjetas</h2>
          <p className="text-sm text-fg-muted">
            Conecta un lector a un kiosco o úsalo como terminal independiente.
          </p>
        </div>
        {canWrite && (
          <Button
            type="button"
            disabled={!!provisioning || !!updating}
            onClick={() => {
              setSecret('');
              setEditing({ name: '', mode: 'paired', kioskId: '', isActive: true });
            }}
          >
            Nuevo lector
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {provisioning && canWrite && (
        <ReaderUsbSetup
          key={provisioning.id}
          reader={provisioning}
          tenantId={tenantId}
          initialToken={provisioning.token}
          onClose={() => setProvisioning(null)}
          onConnected={() => void run(async () => {})}
        />
      )}
      {editing && (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (editing.id) await api.updateReader(editing.id, editing);
              else reveal(await api.createReader(editing));
              setEditing(null);
            });
          }}
        >
          <Input
            label="Nombre"
            required
            value={editing.name || ''}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <Input
            label="Ubicación"
            value={editing.location || ''}
            onChange={(e) => setEditing({ ...editing, location: e.target.value })}
          />
          <Select
            label="Funcionamiento"
            value={editing.mode || 'paired'}
            onChange={(v) => setEditing({ ...editing, mode: v as Reader['mode'], kioskId: null })}
            options={[
              { value: 'paired', label: 'Vinculado a kiosco' },
              { value: 'standalone', label: 'Independiente' },
            ]}
          />
          {editing.mode === 'paired' ? (
            <Select
              label="Kiosco"
              value={editing.kioskId || ''}
              onChange={(v) => setEditing({ ...editing, kioskId: v })}
              options={[
                { value: '', label: 'Selecciona un kiosco' },
                ...kiosks.filter((k) => k.isActive).map((k) => ({ value: k.id, label: k.name })),
              ]}
            />
          ) : (
            <div role="note" className="self-center space-y-1 text-sm">
              <p className="font-medium text-fg-body">Requiere elegir la acción en el lector</p>
              <p className="text-fg-muted">
                El dispositivo debe permitir seleccionar entrada, salida o pausa, por ejemplo, con
                botones o una pantalla. Pasar la tarjeta no alterna automáticamente entre entrada y
                salida.
              </p>
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy || !canWrite || !!provisioning}>
              Guardar lector
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {secret && (
        <div className="space-y-3 rounded-lg border border-border-subtle p-4">
          <p className="text-sm">
            Guarda esta configuración en el lector. El token solo se muestra ahora.
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{secret}</pre>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard
                .writeText(secret)
                .catch(() => setError('No se pudo copiar. Selecciona la configuración y cópiala.'));
            }}
          >
            Copiar configuración
          </Button>
          <Button type="button" variant="secondary" onClick={() => setSecret('')}>
            Ocultar
          </Button>
        </div>
      )}
      <ul className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <p className="font-semibold">
                {row.name} {!row.isActive && '· Desactivado'}
              </p>
              <p className="text-sm text-fg-muted">
                {row.mode === 'standalone'
                  ? 'Independiente'
                  : `Kiosco: ${kiosks.find((k) => k.id === row.kioskId)?.name || 'Sin vincular'}`}
              </p>
              <p className="text-xs text-fg-muted">
                {row.lastSeenAt
                  ? `Último contacto: ${new Date(row.lastSeenAt).toLocaleString('es-ES')}`
                  : 'Todavía no ha conectado'}
              </p>
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !!provisioning || !!updating}
                  onClick={() => setUpdating(row)}
                >
                  Actualizar firmware
                </Button>
                {row.mode === 'paired' && row.isActive && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || !!provisioning || !!updating}
                    onClick={() => setProvisioning(row)}
                  >
                    Configurar por USB
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !!provisioning || !!updating}
                  onClick={() => setEditing(row)}
                >
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !!provisioning || !!updating}
                  onClick={() =>
                    void run(() => api.updateReader(row.id, { isActive: !row.isActive }))
                  }
                >
                  {row.isActive ? 'Desactivar' : 'Activar'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !!provisioning || !!updating}
                  onClick={async () => {
                    if (
                      await popup.confirm({
                        title: 'Cambiar token del lector',
                        message: 'Tendrás que configurar el lector con el nuevo token.',
                      })
                    )
                      void run(async () => reveal(await api.rotateReader(row.id)));
                  }}
                >
                  Cambiar token
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!rows.length && (
        <p className="text-sm text-fg-muted">Todavía no hay lectores configurados.</p>
      )}
    </Card>
  );
}
