import { useEffect, useRef, useState } from 'react';
import { convertFileListToFileUIParts, type FileUIPart } from 'ai';
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_MB } from './constants';

export interface DocumentAttachment {
  filename: string;
  text: string;
  truncated: boolean;
}

const MAX_DOCUMENTS = 3;
const MAX_DOCUMENT_MB = 15;

/**
 * Estado de "borrador" del compositor (texto, adjuntos de imagen, documentos
 * leídos, autoresize) — separado de `AiChatContext` a propósito: es
 * aceptable perderlo si se cierra la pestaña o el panel flotante, a
 * diferencia de la conversación en sí. Compartido entre la página dedicada
 * (AiChat/index.tsx) y el lanzador flotante (ChatLauncherPanel).
 *
 * Los documentos (Excel/PDF/Word/CSV) NO viajan como archivo al modelo — se
 * suben a `/api/ai/extract-file`, que devuelve el texto ya extraído en el
 * server, y ESE texto es lo que se concatena al mensaje. Así funciona con
 * cualquier proveedor de IA (incluido un modelo local sin soporte nativo de
 * esos formatos), a diferencia de las imágenes (`attachments`, FileUIPart de
 * verdad) que sí requieren un modelo con visión.
 */
export function useComposerState(
  send: (text: string, files?: FileUIPart[]) => void,
  headers: Record<string, string>,
) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const [documents, setDocuments] = useState<DocumentAttachment[]>([]);
  const [extractingDocs, setExtractingDocs] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize del textarea (crece con el contenido hasta un máximo).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) return;
    const tooBig = Array.from(files).some((f) => f.size > MAX_ATTACHMENT_MB * 1024 * 1024);
    if (tooBig) {
      alert(`Cada imagen debe pesar menos de ${MAX_ATTACHMENT_MB} MB`);
      return;
    }
    const parts = await convertFileListToFileUIParts(files);
    const images = parts.filter((p) => p.mediaType?.startsWith('image')).slice(0, room);
    setAttachments((prev) => [...prev, ...images]);
  };

  const addDocuments = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_DOCUMENTS - documents.length;
    if (room <= 0) {
      alert(`Máximo ${MAX_DOCUMENTS} documentos por mensaje`);
      return;
    }
    const list = Array.from(files).slice(0, room);
    const tooBig = list.some((f) => f.size > MAX_DOCUMENT_MB * 1024 * 1024);
    if (tooBig) {
      alert(`Cada documento debe pesar menos de ${MAX_DOCUMENT_MB} MB`);
      return;
    }
    setExtractingDocs(true);
    try {
      for (const file of list) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/ai/extract-file', {
          method: 'POST',
          headers,
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `No se pudo leer ${file.name}`);
        setDocuments((prev) => [
          ...prev,
          { filename: data.filename, text: data.text, truncated: Boolean(data.truncated) },
        ]);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al leer el documento');
    } finally {
      setExtractingDocs(false);
    }
  };

  const resetDraft = () => {
    setInput('');
    setAttachments([]);
    setDocuments([]);
  };

  const submit = (text: string) => {
    const documentBlocks = documents
      .map(
        (d) =>
          `\n\n--- Documento adjunto: ${d.filename}${d.truncated ? ' (truncado)' : ''} ---\n${d.text}`,
      )
      .join('');
    send(text + documentBlocks, attachments.length > 0 ? attachments : undefined);
    resetDraft();
  };

  /** Antepone el texto seleccionado (citado) al borrador actual y enfoca el
   * textarea — usado por SelectionToolbar cuando el usuario elige "Preguntar
   * sobre esto" sobre una porción de una respuesta de Keiro. */
  const quoteText = (text: string) => {
    setInput((prev) => `> ${text.replace(/\n/g, '\n> ')}\n\n${prev}`);
    textareaRef.current?.focus();
  };

  return {
    input,
    setInput,
    attachments,
    removeAttachment: (i: number) => setAttachments((prev) => prev.filter((_, j) => j !== i)),
    documents,
    removeDocument: (i: number) => setDocuments((prev) => prev.filter((_, j) => j !== i)),
    extractingDocs,
    dragOver,
    setDragOver,
    textareaRef,
    fileInputRef,
    docInputRef,
    addFiles: (files: FileList | null) => void addFiles(files),
    addDocuments: (files: FileList | null) => void addDocuments(files),
    send: submit,
    resetDraft,
    quoteText,
  };
}
