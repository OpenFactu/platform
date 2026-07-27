import { coreApi } from '@/shared/api';
import { useEffect, useRef, useState } from 'react';
import { convertFileListToFileUIParts, type FileUIPart } from 'ai';
import { useToast } from '@openfactu/ui';
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_MB } from '../domain/constants';
import { classifyFiles, rejectionMessage } from '../domain/droppedFiles';

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
 *
 * @param supportsImages  Si el modelo activo tiene visión. Solo decide si se
 *   ACEPTAN imágenes; nunca a qué vía va un archivo — eso lo decide su tipo
 *   (ver `classifyFiles`).
 */
export function useComposerState(
  send: (text: string, files?: FileUIPart[]) => void,
  headers: Record<string, string>,
  supportsImages = true,
) {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const [documents, setDocuments] = useState<DocumentAttachment[]>([]);
  const [extractingDocs, setExtractingDocs] = useState(false);
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

  const addFiles = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.warning(`Máximo ${MAX_ATTACHMENTS} imágenes por mensaje`);
      return;
    }
    const tooBig = list.filter((f) => f.size > MAX_ATTACHMENT_MB * 1024 * 1024);
    if (tooBig.length > 0) {
      toast.error(`Cada imagen debe pesar menos de ${MAX_ATTACHMENT_MB} MB`);
      return;
    }
    // `convertFileListToFileUIParts` solo acepta un FileList, y al soltar o
    // pegar trabajamos con File[] ya filtrado por tipo — se reconstruye uno
    // vía DataTransfer para seguir usando la conversión del propio SDK en vez
    // de duplicar aquí el formato de FileUIPart.
    const transfer = new DataTransfer();
    for (const file of list.slice(0, room)) transfer.items.add(file);
    const parts = await convertFileListToFileUIParts(transfer.files);
    setAttachments((prev) => [...prev, ...parts]);
    if (list.length > room) toast.warning(`Solo caben ${MAX_ATTACHMENTS} imágenes por mensaje`);
  };

  const addDocuments = async (files: FileList | File[] | null) => {
    const all = Array.from(files ?? []);
    if (all.length === 0) return;
    const room = MAX_DOCUMENTS - documents.length;
    if (room <= 0) {
      toast.warning(`Máximo ${MAX_DOCUMENTS} documentos por mensaje`);
      return;
    }
    const list = all.slice(0, room);
    const tooBig = list.filter((f) => f.size > MAX_DOCUMENT_MB * 1024 * 1024);
    if (tooBig.length > 0) {
      toast.error(`Cada documento debe pesar menos de ${MAX_DOCUMENT_MB} MB`);
      return;
    }
    setExtractingDocs(true);
    try {
      for (const file of list) {
        const formData = new FormData();
        formData.append('file', file);
        const data: any = await coreApi.postForm('/api/ai/extract-file', formData);
        setDocuments((prev) => [
          ...prev,
          { filename: data.filename, text: data.text, truncated: Boolean(data.truncated) },
        ]);
      }
      if (all.length > room) toast.warning(`Solo caben ${MAX_DOCUMENTS} documentos por mensaje`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al leer el documento');
    } finally {
      setExtractingDocs(false);
    }
  };

  /**
   * Entrada única para archivos que llegan en bloque y sin filtrar por el
   * navegador — soltar y pegar. Reparte cada uno por su vía según lo que ES
   * (ver `classifyFiles`) y avisa de lo que no se pueda aceptar, en vez de
   * tragárselo en silencio.
   */
  const addDropped = async (files: FileList | File[] | null) => {
    const {
      images,
      documents: docs,
      rejected,
    } = classifyFiles(files, {
      acceptImages: supportsImages,
    });
    const message = rejectionMessage(rejected);
    if (message) toast.warning(message);
    if (images.length > 0) await addFiles(images);
    if (docs.length > 0) await addDocuments(docs);
  };

  const resetDraft = () => {
    setInput('');
    setQuotedText(null);
    setAttachments([]);
    setDocuments([]);
  };

  const submit = (text: string) => {
    const quoteBlock = quotedText ? `> ${quotedText.replace(/\n/g, '\n> ')}\n\n` : '';
    const documentBlocks = documents
      .map(
        (d) =>
          `\n\n--- Documento adjunto: ${d.filename}${d.truncated ? ' (truncado)' : ''} ---\n${d.text}`,
      )
      .join('');
    send(quoteBlock + text + documentBlocks, attachments.length > 0 ? attachments : undefined);
    resetDraft();
  };

  /** Guarda el fragmento seleccionado como cita "en curso" (tarjeta aparte
   * del textarea, no mezclada con lo que el usuario escribe) y enfoca el
   * textarea — usado por SelectionToolbar cuando el usuario elige "Preguntar
   * sobre esto" sobre una porción de una respuesta de Keiro. Se antepone al
   * mensaje como blockquote solo al enviar (ver `submit`). */
  const quoteText = (text: string) => {
    setQuotedText(text);
    textareaRef.current?.focus();
  };

  const clearQuote = () => setQuotedText(null);

  return {
    input,
    setInput,
    quotedText,
    clearQuote,
    attachments,
    removeAttachment: (i: number) => setAttachments((prev) => prev.filter((_, j) => j !== i)),
    documents,
    removeDocument: (i: number) => setDocuments((prev) => prev.filter((_, j) => j !== i)),
    extractingDocs,
    textareaRef,
    fileInputRef,
    docInputRef,
    addFiles: (files: FileList | File[] | null) => void addFiles(files),
    addDocuments: (files: FileList | File[] | null) => void addDocuments(files),
    addDropped: (files: FileList | File[] | null) => void addDropped(files),
    send: submit,
    resetDraft,
    quoteText,
  };
}
