/**
 * Editor de código (Monaco) para widgets de dashboard tipo "componente React",
 * escrito directamente desde la web (sin plugin en disco). Mismo layout que
 * `SqlEditorModal` del diseñador de plantillas, pero para TSX: incluye un
 * botón "Probar" que compila el código en el server (esbuild) sin guardarlo,
 * para detectar errores de sintaxis antes de persistir.
 */
import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';

const DEFAULT_CODE = `// Solo lectura: usa @openfactu/widget-api para llamar endpoints GET.
// No hay acceso a post/put/delete — es un cliente deliberadamente capado.
import React, { useEffect, useState } from 'react';
import { Card, Loader } from '@openfactu/ui';
import { get } from '@openfactu/widget-api';

export default function MyWidget() {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    get('/api/items').then(setItems).catch(() => setItems([]));
  }, []);

  if (items === null) return <Loader />;

  return (
    <div>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {items.length} artículos en catálogo
      </p>
    </div>
  );
}
`;

interface Props {
  open: boolean;
  initialCode: string | null;
  token: string | null;
  onSave: (code: string) => void;
  onClose: () => void;
}

export const WidgetCodeEditorModal: React.FC<Props> = ({
  open,
  initialCode,
  token,
  onSave,
  onClose,
}) => {
  const [value, setValue] = useState(initialCode || DEFAULT_CODE);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialCode || DEFAULT_CODE);
    setTestResult(null);
  }, [open, initialCode]);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await coreApi.raw('POST', '/api/dashboard-widgets/test-compile', { code: value });
      const body = res.data;
      setTestResult(body);
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message || 'Error de red' });
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[min(96vw,1100px)] h-[min(92vh,760px)] rounded-lg shadow-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Componente del widget
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Disponible: react, @openfactu/ui, lucide-react, @openfactu/widget-api (solo GET).
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            language="typescript"
            theme="vs-dark"
            value={value}
            onChange={(v) => setValue(v ?? '')}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
              tabSize: 2,
            }}
          />
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {testing ? 'Compilando…' : '▶ Probar'}
          </button>
          {testResult?.ok && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ Compila bien</span>
          )}
          {testResult && !testResult.ok && (
            <span className="text-xs text-red-500 truncate" title={testResult.error}>
              ⚠ {testResult.error}
            </span>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(value);
              onClose();
            }}
            className="text-xs px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Guardar código
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
