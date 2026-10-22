import { useEffect, useState } from 'react';
import { Badge, Button, Card, Input, usePopup } from '@openfactu/ui';
import { CreditCard, Download, Plus, QrCode } from 'lucide-react';
import { timeclockManagementApi as api, type Credential } from '../api/timeclockManagementApi';
import { ReadCardButton } from './ReadCardButton';

export function EmployeeCredentials({
  employeeId,
  canWrite,
}: {
  employeeId: string;
  canWrite: boolean;
}) {
  return <CredentialPanel key={employeeId} employeeId={employeeId} canWrite={canWrite} />;
}
function CredentialPanel({ employeeId, canWrite }: { employeeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<Credential[]>([]);
  const [uid, setUid] = useState('');
  const [label, setLabel] = useState('Tarjeta principal');
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [readingCard, setReadingCard] = useState(false);
  const popup = usePopup();
  useEffect(() => {
    let active = true;
    void api
      .credentials(employeeId)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [employeeId]);
  const activeQr = rows.find((r) => r.kind === 'qr' && !r.revokedAt);
  const cards = rows.filter((r) => r.kind === 'rfid');
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
      setRows(await api.credentials(employeeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };
  const issueQr = async () => {
    if (
      activeQr &&
      !(await popup.confirm({
        title: 'Regenerar QR',
        message: 'El QR anterior dejará de funcionar. Entrega el nuevo al empleado.',
        confirmLabel: 'Regenerar',
      }))
    )
      return;
    void run(async () => {
      await api.issue({ employeeId, kind: 'qr', label: 'QR personal' });
      setQr('');
      setQr((await api.qr(employeeId)).qrDataUrl);
    });
  };
  const revoke = async (row: Credential) => {
    if (
      !(await popup.confirm({
        title: row.kind === 'qr' ? 'Desactivar QR' : 'Desactivar tarjeta',
        message: `${row.label} dejará de servir para identificarse en el kiosco.`,
        confirmLabel: 'Desactivar',
      }))
    )
      return;
    void run(async () => {
      await api.revoke(row.id);
      if (row.kind === 'qr') setQr('');
    });
  };
  return (
    <Card
      title="Identificación para fichar"
      subtitle="QR personal y tarjetas que el empleado puede utilizar en el kiosco."
    >
      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-fg-muted" role="status">
          Cargando credenciales…
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section
            className="space-y-4 lg:border-r lg:border-border-subtle lg:pr-6"
            aria-label="QR personal"
          >
            <div className="flex items-center gap-2">
              <QrCode size={18} className="text-fg-muted" />
              <h3 className="font-semibold text-sm">QR personal</h3>
              <Badge variant={activeQr ? 'success' : 'neutral'}>
                {activeQr ? 'Activo' : 'Sin QR'}
              </Badge>
            </div>
            {qr ? (
              <div className="space-y-3">
                <div className="w-48 h-48 bg-white border border-border-subtle">
                  <img src={qr} width={192} height={192} alt="QR personal de fichaje" />
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <a
                    className="inline-flex items-center gap-1 underline"
                    href={qr}
                    download="qr-fichaje.png"
                  >
                    <Download size={14} />
                    Descargar
                  </a>
                  <button type="button" className="underline" onClick={() => setQr('')}>
                    Ocultar
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-fg-muted leading-relaxed">
                {activeQr
                  ? 'El empleado puede mostrarlo desde su móvil o llevarlo impreso.'
                  : 'Crea un QR para que el empleado se identifique ante la cámara del kiosco.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {activeQr && !qr && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(async () => setQr((await api.qr(employeeId)).qrDataUrl))}
                >
                  Mostrar QR
                </Button>
              )}
              {canWrite && (
                <Button
                  type="button"
                  variant={activeQr ? 'ghost' : 'primary'}
                  disabled={busy}
                  onClick={() => void issueQr()}
                >
                  {activeQr ? 'Regenerar' : 'Crear QR'}
                </Button>
              )}
              {canWrite && activeQr && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void revoke(activeQr)}
                >
                  Desactivar
                </Button>
              )}
            </div>
          </section>
          <section className="min-w-0 space-y-4" aria-label="Tarjetas RFID">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-fg-muted" />
                <h3 className="font-semibold text-sm">Tarjetas</h3>
                <span className="text-xs text-fg-muted">
                  {cards.filter((c) => !c.revokedAt).length} activas
                </span>
              </div>
              {canWrite && !assigning && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setAssigning(true)}
                  className="gap-1"
                >
                  <Plus size={14} />
                  Asignar tarjeta
                </Button>
              )}
            </div>
            {cards.length ? (
              <ul className="divide-y divide-border-subtle">
                {cards.map((row) => (
                  <li
                    key={row.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm break-words">{row.label}</p>
                      <p className="text-xs text-fg-muted mt-1">
                        {row.revokedAt
                          ? 'Desactivada'
                          : 'Asignada el ' + new Date(row.createdAt).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    {canWrite && !row.revokedAt && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void revoke(row)}
                      >
                        Desactivar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted py-2">
                Todavía no tiene ninguna tarjeta asignada.
              </p>
            )}
            {canWrite && assigning && (
              <form
                className="border-t border-border-subtle pt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (readingCard) return;
                  void run(async () => {
                    await api.issue({ employeeId, kind: 'rfid', uid, label });
                    setUid('');
                    setAssigning(false);
                  });
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Identificador de la tarjeta (UID)"
                    value={uid}
                    onChange={(e) => setUid(e.target.value)}
                    placeholder="04A1B2C3"
                    required
                    disabled={busy || readingCard}
                  />
                  <Input
                    label="Nombre de la tarjeta"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    required
                  />
                </div>
                <ReadCardButton disabled={busy} onRead={setUid} onReadingChange={setReadingCard} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={busy || readingCard || !uid.trim() || !label.trim()}
                  >
                    {busy ? 'Guardando…' : 'Guardar tarjeta'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setAssigning(false);
                      setUid('');
                      setReadingCard(false);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </Card>
  );
}
