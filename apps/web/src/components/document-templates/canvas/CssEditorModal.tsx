import React, { useEffect, useState } from 'react';
import { Modal, Button } from '@openfactu/ui';
import { AdvancedEditor } from '../AdvancedEditor';

interface CssEditorModalProps {
  open: boolean;
  value: string;
  onChange: (css: string) => void;
  onClose: () => void;
  title?: string;
  /** Texto de ayuda mostrado encima del editor. */
  helpText?: string;
}

/**
 * Editor de CSS en un modal, reutilizando el editor Monaco (`AdvancedEditor`)
 * en modo `css`. Mantiene un borrador local y solo confirma con `onChange` al
 * pulsar "Guardar" — así cancelar descarta los cambios.
 *
 * Se usa tanto para la hoja de estilos global del documento como para el
 * "CSS propio" de un elemento.
 */
export const CssEditorModal: React.FC<CssEditorModalProps> = ({
  open,
  value,
  onChange,
  onClose,
  title = 'CSS personalizado',
  helpText,
}) => {
  const [draft, setDraft] = useState(value);

  // Re-sincroniza el borrador cada vez que se (re)abre el modal.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open) return null;

  const save = () => {
    onChange(draft);
    onClose();
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={title} maxWidth="3xl">
      <div className="flex flex-col gap-3">
        {helpText && <p className="text-xs text-slate-500 dark:text-slate-400">{helpText}</p>}
        <div className="h-[60vh] rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
          <AdvancedEditor value={draft} onChange={setDraft} language="css" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
};
