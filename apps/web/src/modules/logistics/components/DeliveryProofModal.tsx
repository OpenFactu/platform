import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Input, Textarea, useToast } from '@openfactu/ui';
import { Camera, Eraser, CheckCircle2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se llama con los datos de PoD; el padre hace el PATCH al stop + shipment. */
  onConfirm: (pod: {
    recipientName: string;
    recipientDocument: string;
    signatureImage: string | null;
    photoImage: string | null;
    podNotes: string;
  }) => Promise<void> | void;
  stopLabel?: string;
}

/**
 * Modal de prueba de entrega. Requisito mínimo: o firma o DNI/NIF.
 * Foto opcional pero recomendada.
 */
export const DeliveryProofModal: React.FC<Props> = ({ open, onClose, onConfirm, stopLabel }) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStrokes = useRef(false);

  const reset = () => {
    setName('');
    setDoc('');
    setNotes('');
    setPhoto(null);
    setSignature(null);
    hasStrokes.current = false;
    clearCanvas();
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // Rellenamos de BLANCO (no clearRect → transparente). Así el PNG
    // resultante siempre tiene fondo blanco y se ve igual en clientes de
    // email en modo claro u oscuro.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    hasStrokes.current = false;
    setSignature(null);
  };

  // Al abrir el modal, pintar de blanco el canvas para que no empiece
  // transparente.
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
      }, 50);
    }
  }, [open]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    const p = point(e);
    if (!p) return;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    const p = point(e);
    if (!p) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasStrokes.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasStrokes.current && canvasRef.current) {
      setSignature(canvasRef.current.toDataURL('image/png'));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Redimensionar a máx 1280px lado largo para que el data URL sea manejable.
    const bmp = await createImageBitmap(f);
    const max = 1280;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    setPhoto(c.toDataURL('image/jpeg', 0.82));
  };

  const submit = async () => {
    const hasSignature = !!signature;
    const hasDoc = doc.trim().length > 0;
    if (!hasSignature && !hasDoc) {
      setShowValidation(true);
      toast.error('Introduce el DNI/NIF o una firma');
      return;
    }
    setShowValidation(false);
    setSubmitting(true);
    try {
      await onConfirm({
        recipientName: name.trim(),
        recipientDocument: doc.trim(),
        signatureImage: signature,
        photoImage: photo,
        podNotes: notes.trim(),
      });
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Prueba de entrega"
      subtitle={stopLabel || 'Datos del receptor'}
      maxWidth="md"
    >
      <div className="relative">
        <div className="space-y-3 pb-20">
          {showValidation && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-300 text-rose-800 dark:text-rose-200 text-xs px-3 py-2">
              <b>Falta prueba de entrega.</b> Escribe el DNI/NIF del receptor
              <b> o </b>captura su firma abajo.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Nombre receptor"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="—"
            />
            {/* El requisito es "firma O DNI", así que el error no cuelga de un
                `required` nativo: se marca el campo con `status` cuando la
                validación de `submit` falla. */}
            <Input
              label={
                <>DNI / NIF {showValidation && <span className="text-danger">(requerido)</span>}</>
              }
              value={doc}
              onChange={(e) => {
                setDoc(e.target.value.toUpperCase());
                if (showValidation) setShowValidation(false);
              }}
              placeholder="12345678A"
              status={showValidation ? 'error' : undefined}
              showStatusIcon={false}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Firma {showValidation && <span className="text-rose-500">(requerida)</span>}
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={clearCanvas}>
                <Eraser size={12} /> Borrar
              </Button>
            </div>
            <div
              className={
                // Fondo BLANCO siempre (incluso en dark mode) porque la firma se
                // dibuja en negro — si el contenedor es oscuro no se ve ni al
                // firmar ni después en el email adjunto.
                'rounded-lg border-2 border-dashed bg-white touch-none ' +
                (showValidation ? 'border-rose-400' : 'border-slate-300 dark:border-slate-700')
              }
            >
              <canvas
                ref={canvasRef}
                width={640}
                height={220}
                className="w-full h-40 cursor-crosshair bg-white rounded-lg"
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerLeave={end}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Foto de la entrega
            </label>
            {photo ? (
              <div className="relative">
                <img
                  src={photo}
                  alt="Entrega"
                  className="w-full max-h-56 object-contain rounded-lg border border-slate-200 dark:border-slate-700"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2"
                >
                  Quitar
                </Button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 w-full h-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 cursor-pointer active:bg-slate-100 dark:active:bg-slate-800">
                <Camera size={18} className="text-slate-500" />
                <span className="text-sm text-slate-600 dark:text-slate-300">Hacer foto</span>
                {/* Captura con la cámara del móvil: <input type="file"> oculto
                    disparado por el <label>. No se sustituye por FileDropzone —
                    `capture="environment"` es lo que abre la cámara. */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={onFile}
                />
              </label>
            )}
          </div>

          <Textarea
            label="Observaciones"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Opcional: incidencias, portería, etc."
          />
        </div>
        <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.08)]">
          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full !bg-emerald-500 hover:!bg-emerald-600"
          >
            <CheckCircle2 size={18} className="mr-1" />
            {submitting ? 'Confirmando…' : 'Confirmar entrega'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
