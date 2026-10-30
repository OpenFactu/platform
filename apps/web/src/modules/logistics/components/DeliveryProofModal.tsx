import React, { useRef, useState } from 'react';
import {
  Modal,
  Button,
  Input,
  SignaturePad,
  Textarea,
  useToast,
  type SignaturePadHandle,
} from '@openfactu/ui';
import { Camera, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

/** Tinta de la firma: oscura siempre, porque el área es blanca también en modo oscuro. */
const SIGNATURE_INK = '#0f172a';

/**
 * El PNG de `SignaturePad` sale con fondo transparente. Se aplana sobre blanco
 * para que la firma se vea igual en clientes de correo en modo claro u oscuro.
 */
function onWhite(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

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
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const padRef = useRef<SignaturePadHandle>(null);

  const reset = () => {
    setName('');
    setDoc('');
    setNotes('');
    setPhoto(null);
    setSignature(null);
    padRef.current?.clear();
  };

  // Cada trazo, deshacer o borrar: se guarda la firma ya aplanada sobre blanco.
  const onSignatureChange = async (strokes: unknown[]) => {
    if (!strokes.length || !padRef.current) {
      setSignature(null);
      return;
    }
    setSignature(await onWhite(padRef.current.toDataURL('image/png')));
    if (showValidation) setShowValidation(false);
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
      toast.error(t('logistics.pod.validationToast'));
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
      title={t('logistics.pod.title')}
      subtitle={stopLabel || t('logistics.pod.subtitle')}
      maxWidth="md"
    >
      <div className="relative">
        <div className="space-y-3 pb-20">
          {showValidation && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-300 text-rose-800 dark:text-rose-200 text-xs px-3 py-2">
              <b>{t('logistics.pod.missingTitle')}</b> {t('logistics.pod.missingBefore')}
              <b> {t('logistics.pod.missingOr')} </b>
              {t('logistics.pod.missingAfter')}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              label={t('logistics.pod.recipientName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="—"
            />
            {/* El requisito es "firma O DNI", así que el error no cuelga de un
                `required` nativo: se marca el campo con `status` cuando la
                validación de `submit` falla. */}
            <Input
              label={
                <>
                  {t('logistics.pod.document')}{' '}
                  {showValidation && (
                    <span className="text-danger">{t('logistics.pod.required')}</span>
                  )}
                </>
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

          {/* SignaturePad de @openfactu/ui: trazo con presión, deshacer y borrar.
              El área se fuerza a blanco (también en oscuro) porque la tinta es
              oscura y la firma acaba en un email. */}
          <div style={{ ['--bg-card' as string]: '#ffffff' }}>
            <SignaturePad
              ref={padRef}
              label={t('logistics.pod.signature')}
              color={SIGNATURE_INK}
              height={160}
              hint={t('logistics.pod.signatureHint')}
              error={showValidation ? t('logistics.pod.signatureError') : undefined}
              onChange={(strokes) => void onSignatureChange(strokes)}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              {t('logistics.pod.photo')}
            </label>
            {photo ? (
              <div className="relative">
                <img
                  src={photo}
                  alt={t('logistics.pod.photoAlt')}
                  className="w-full max-h-56 object-contain rounded-lg border border-border-default"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPhoto(null)}
                  className="absolute top-2 right-2"
                >
                  {t('logistics.pod.removePhoto')}
                </Button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 w-full h-20 rounded-lg border-2 border-dashed border-border-strong bg-bg-muted cursor-pointer active:bg-slate-100 dark:active:bg-slate-800">
                <Camera size={18} className="text-slate-500" />
                <span className="text-sm text-fg-body">{t('logistics.pod.takePhoto')}</span>
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
            label={t('logistics.pod.notes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t('logistics.pod.notesPlaceholder')}
          />
        </div>
        <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 border-t border-border-subtle bg-bg-card shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.08)]">
          <Button onClick={submit} disabled={submitting} className="w-full">
            <CheckCircle2 size={18} className="mr-1" />
            {submitting ? t('logistics.pod.confirming') : t('logistics.pod.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
