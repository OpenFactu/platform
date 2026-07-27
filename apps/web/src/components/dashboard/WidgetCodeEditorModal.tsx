/**
 * Editor de código (Monaco) para widgets de dashboard tipo "componente React",
 * escrito directamente desde la web (sin plugin en disco). Mismo layout que
 * `SqlEditorModal` del diseñador de plantillas, pero para TSX: incluye un
 * botón "Probar" que compila el código en el server (esbuild) sin guardarlo,
 * para detectar errores de sintaxis antes de persistir.
 *
 * El armazón es el `Modal` del paquete: su `size="screen"` + `fullHeight` son
 * justo las medidas que este diálogo tenía a mano (min(96vw,1100px) por
 * min(92vh,760px)), y `noBodyPadding` deja que el editor ocupe todo el cuerpo.
 */
import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Modal, Button } from '@openfactu/ui';
import Editor from '@monaco-editor/react';
import { useTheme } from '../../context/ThemeContext';

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
      {/* Usa los tokens del tema (text-fg-muted, bg-bg-card…), no la paleta
          fija de Tailwind: así el widget sigue al branding de la empresa. */}
      <p className="text-sm text-fg-muted">
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

export const WidgetCodeEditorModal: React.FC<Props> = ({ open, initialCode, onSave, onClose }) => {
  const { branding } = useTheme();
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
      setTestResult(res.data);
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message || 'Error de red' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Componente del widget"
      subtitle="Disponible: react, @openfactu/ui, lucide-react, @openfactu/widget-api (solo GET)."
      size="screen"
      fullHeight
      noBodyPadding
      closeOnOverlayClick
      footer={
        <div className="flex items-center gap-2 w-full">
          <Button type="button" variant="accent" size="sm" onClick={runTest} isLoading={testing}>
            {testing ? 'Compilando…' : '▶ Probar'}
          </Button>
          {testResult?.ok && <span className="text-xs text-success-fg">✓ Compila bien</span>}
          {testResult && !testResult.ok && (
            <span className="text-xs text-danger-fg truncate" title={testResult.error}>
              ⚠ {testResult.error}
            </span>
          )}
          <div className="flex-1" />
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onSave(value);
              onClose();
            }}
          >
            Guardar código
          </Button>
        </div>
      }
    >
      {/* El tema de Monaco es su propio registro, no Tailwind: se elige según el
          modo del tenant para que no salga un editor oscuro sobre tema claro. */}
      <Editor
        height="100%"
        language="typescript"
        theme={branding.themeMode === 'dark' ? 'vs-dark' : 'light'}
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
    </Modal>
  );
};
