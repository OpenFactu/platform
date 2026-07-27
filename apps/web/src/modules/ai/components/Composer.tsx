import React from 'react';
import type { FileUIPart } from 'ai';
import { Button, SearchableSelect } from '@openfactu/ui';
import {
  Send,
  Square,
  Paperclip,
  ImageOff,
  FileUp,
  FileText,
  X,
  Loader2,
  Quote,
} from 'lucide-react';
import { AttachmentThumb } from './AttachmentThumb';
import { ContextUsageRing } from './ContextUsageRing';
import { MAX_ATTACHMENTS } from '../domain/constants';
import type { DocumentAttachment } from '../hooks/useComposerState';

export const Composer: React.FC<{
  input: string;
  setInput: (v: string) => void;
  quotedText: string | null;
  clearQuote: () => void;
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
  quotedText,
  clearQuote,
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
              className="relative shrink-0 h-16 w-32 flex flex-col items-center justify-center gap-1 rounded-md border border-border-default bg-bg-muted px-2"
              title={d.filename}
            >
              <FileText size={16} className="text-accent" />
              <span className="text-[10px] text-fg-muted truncate w-full text-center">
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
            <div className="shrink-0 h-16 w-32 flex items-center justify-center rounded-md border border-border-default text-slate-400">
              <Loader2 size={16} className="animate-spin" />
            </div>
          )}
        </div>
      )}
      {quotedText && (
        <div className="flex items-start gap-2 mb-2 pl-3 pr-2 py-2 rounded-lg border-l-4 border-accent bg-accent/5 dark:bg-accent/10 animate-in fade-in slide-in-from-bottom-1 duration-150">
          <Quote size={14} className="text-accent shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-accent">
              Respondiendo a un fragmento
            </div>
            <p className="text-xs text-fg-body line-clamp-2 break-words">{quotedText}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearQuote}
            title="Quitar cita"
            className="shrink-0 text-slate-400 hover:text-rose-500"
          >
            <X size={14} />
          </Button>
        </div>
      )}
      <div
        className={`rounded-xl border bg-bg-card shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 ${
          dragOver ? 'border-accent ring-2 ring-accent/30' : 'border-border-default'
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACHMENTS || busy}
                  title="Adjuntar imagen"
                  className="text-slate-400 hover:text-accent"
                >
                  <Paperclip size={18} />
                </Button>
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => docInputRef.current?.click()}
              disabled={busy || extractingDocs}
              title="Adjuntar Excel, PDF, Word, CSV o TXT"
              className="text-slate-400 hover:text-accent"
            >
              <FileUp size={18} />
            </Button>
            {!supportsImages && (
              <span className="text-fg-subtle" title="Este modelo no admite imágenes">
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
