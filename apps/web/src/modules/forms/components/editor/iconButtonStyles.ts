/** Botón de solo icono sin caja: lo usan `IconButton` y el «⋮» del menú de la pregunta. */
export const iconButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-xs border-transparent bg-transparent p-0 text-fg-muted hover:bg-bg-hover hover:text-fg-default';

/** Abre el selector de archivos del sistema sin dejar un <input> en el DOM. */
export function pickFile(accept: string, onFile: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  };
  input.click();
}
