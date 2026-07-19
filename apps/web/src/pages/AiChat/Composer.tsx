import React from 'react';
import type { FileUIPart } from 'ai';
import { Button, SearchableSelect } from '@openfactu/ui';
import { Send, Square, Paperclip, ImageOff, FileUp, FileText, X, Loader2 } from 'lucide-react';
import { AttachmentThumb } from './AttachmentThumb';
import { ContextUsageRing } from './ContextUsageRing';
import { MAX_ATTACHMENTS } from './constants';
import type { DocumentAttachment } from './useComposerState';

export const Composer: React.FC<{
  input: string;
  setInput: (v: string) => void;
  attachments: FileUIPart[];
  removeAttachment: (i: number) => void;
  documents: DocumentAttachment[];
  removeDocument: (i: number) => void;
  extractingDocs: boolean;
  supportsImages: boolean;
  busy: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  addFiles: (files: FileList | null) => void;
  addDocuments: (files: FileList | null) => void;
  send: (text: string) => void;
  stop: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  docInputRef: React.RefObject<HTMLInputElement>;
  contextUsed: number;
  contextLimit: number;
  contextApprox: boolean;
  modelOptions: string[];
  selectedModel: string;
  onSelectModel: (m: string) => void;
}> = ({
  input,
  setInput,
  attachments,
  removeAttachment,
  documents,
  removeDocument,
  extractingDocs,
  supportsImages,
  busy,
  dragOver,
  setDragOver,
  addFiles,
  addDocuments,
  send,
  stop,
  textareaRef,
  fileInputRef,
  docInputRef,
  contextUsed,
  contextLimit,
  contextApprox,
  modelOptions,
  selectedModel,
  onSelectModel,
}) => {
  const canSend = input.trim() || attachments.length > 0 || documents.length > 0;

  return (
    <div className="pt-4">
      {(attachments.length > 0 || documents.length > 0) && (
        <div className="flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
          {attachments.map((a, i) => (
            <AttachmentThumb key={`img-${i}`} file={a} onRemove={() => removeAttachment(i)} />
          ))}
          {documents.map((d, i) => (
            <div
              key={`doc-${i}`}
              className="relative shrink-0 h-16 w-32 flex flex-col items-center justify-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-2"
              title={d.filename}
            >
              <FileText size={16} className="text-accent" />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate w-full text-center">
                {d.filename}
              </span>
              <button
                type="button"
                onClick={() => removeDocument(i)}
                className="absolute top-1 right-1 bg-slate-900/80 text-white rounded-full p-1 shadow hover:bg-rose-600 transition-colors"
                title="Quitar"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {extractingDocs && (
            <div className="shrink-0 h-16 w-32 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-400">
              <Loader2 size={16} className="animate-spin" />
            </div>
          )}
        </div>
      )}
      <div
        className={`rounded-xl border bg-white dark:bg-slate-800 shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 ${
          dragOver
            ? 'border-accent ring-2 ring-accent/30'
            : 'border-slate-200 dark:border-slate-700'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (supportsImages) addFiles(e.dataTransfer.files);
          else addDocuments(e.dataTransfer.files);
        }}
      >
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent p-3 text-sm focus:outline-none resize-none"
          rows={1}
          style={{ maxHeight: 200 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          onPaste={(e) => {
            if (!supportsImages) return;
            if (e.clipboardData.files.length > 0) addFiles(e.clipboardData.files);
          }}
          placeholder={
            supportsImages
              ? 'Escribe tu pregunta o pega/arrastra una imagen…'
              : 'Escribe tu pregunta…'
          }
          disabled={busy}
        />
        <div className="flex items-center justify-between px-3 pb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ContextUsageRing used={contextUsed} limit={contextLimit} approx={contextApprox} />
            {modelOptions.length > 1 && (
              <div className="w-44">
                <SearchableSelect
                  options={modelOptions.map((m) => ({ value: m, label: m }))}
                  value={selectedModel}
                  onChange={onSelectModel}
                />
              </div>
            )}
            {supportsImages && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACHMENTS || busy}
                  className="p-1.5 rounded-md text-slate-400 hover:text-accent hover:bg-accent/5 disabled:opacity-40"
                  title="Adjuntar imagen"
                >
                  <Paperclip size={18} />
                </button>
              </>
            )}
            <input
              ref={docInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.pdf,.doc,.docx,.csv,.txt,.md,.tsv"
              multiple
              className="hidden"
              onChange={(e) => {
                addDocuments(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              disabled={busy || extractingDocs}
              className="p-1.5 rounded-md text-slate-400 hover:text-accent hover:bg-accent/5 disabled:opacity-40"
              title="Adjuntar Excel, PDF, Word, CSV o TXT"
            >
              <FileUp size={18} />
            </button>
            {!supportsImages && (
              <span
                className="text-slate-300 dark:text-slate-600"
                title="Este modelo no admite imágenes"
              >
                <ImageOff size={13} />
              </span>
            )}
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              Enter enviar · Shift+Enter salto de línea
            </span>
          </div>
          {busy ? (
            <Button variant="secondary" onClick={() => stop()}>
              <span className="inline-flex items-center gap-2">
                <Square size={15} /> Detener
              </span>
            </Button>
          ) : (
            <Button onClick={() => send(input)} disabled={!canSend}>
              <span className="inline-flex items-center gap-2">
                <Send size={15} /> Enviar
              </span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
