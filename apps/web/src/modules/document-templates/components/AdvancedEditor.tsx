import React, { Suspense, lazy, forwardRef, useImperativeHandle, useRef } from 'react';
import { Loader } from '@openfactu/ui';

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.default })),
);

export interface AdvancedEditorHandle {
  /** Inserta texto en la posición del cursor (o reemplaza la selección actual). */
  insertText: (text: string) => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Lenguaje Monaco. Default `'html'`. Usa `'css'` para el editor de estilos. */
  language?: string;
}

export const AdvancedEditor = forwardRef<AdvancedEditorHandle, Props>(
  ({ value, onChange, language = 'html' }, ref) => {
    const editorRef = useRef<any>(null);

    useImperativeHandle(
      ref,
      () => ({
        insertText: (text: string) => {
          const editor = editorRef.current;
          if (!editor) return;
          const selection = editor.getSelection();
          const id = { major: 1, minor: 1 };
          const op = { identifier: id, range: selection, text, forceMoveMarkers: true };
          editor.executeEdits('field-explorer-insert', [op]);
          editor.focus();
        },
      }),
      [],
    );

    return (
      <div className="w-full h-full overflow-hidden">
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
              <Loader />
            </div>
          }
        >
          <MonacoEditor
            height="100%"
            width="100%"
            defaultLanguage={language}
            language={language}
            value={value}
            onChange={(v) => onChange(v || '')}
            onMount={(editor) => {
              editorRef.current = editor;
            }}
            theme="vs"
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        </Suspense>
      </div>
    );
  },
);

AdvancedEditor.displayName = 'AdvancedEditor';
