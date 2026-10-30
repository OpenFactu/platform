/**
 * Editor SQL en modal con Monaco Editor + autocompletado basado en el
 * esquema real del tenant.
 *
 * Se usa desde el inspector de consultas del diseñador de plantillas. El
 * modal carga `/api/document-templates/schema-info` al abrirse y registra un
 * provider de autocompletado con nombres de tablas, columnas y los
 * placeholders reconocidos (`:docId`, `:partnerId`, `:companyId`,
 * `:tenantId`). Incluye botón de "Probar" que llama a `/test-query` y
 * muestra las filas resultantes en una tabla.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SearchInput } from '@openfactu/ui';
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react';
import { templatesApi } from '../api';
import { useI18n } from '@/i18n/I18nContext';

interface SchemaTable {
  schema: string;
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}

interface TestResult {
  ok: boolean;
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
  truncated?: boolean;
  error?: string;
}

interface Props {
  open: boolean;
  title?: string;
  initialSql: string;
  queryName?: string;
  onSave: (sql: string) => void;
  onClose: () => void;
}

// `detail` es una clave i18n: se traduce al registrar el autocompletado.
const PLACEHOLDER_COMPLETIONS = [
  { label: ':docId', detail: 'templates.sql.phDocId' },
  { label: ':partnerId', detail: 'templates.sql.phPartnerId' },
  { label: ':companyId', detail: 'templates.sql.phCompanyId' },
  { label: ':tenantId', detail: 'templates.sql.phTenantId' },
];

const SQL_KEYWORD_SNIPPETS = [
  'SELECT * FROM ${1:tabla} WHERE ${2:condicion}',
  'SELECT ${1:col} FROM ${2:tabla} WHERE id = :docId',
  'WITH ${1:cte} AS (\n  SELECT ${2:col} FROM ${3:tabla}\n)\nSELECT * FROM ${1:cte}',
  'SELECT count(*) AS total FROM ${1:tabla}',
  'SELECT ${1:col}, sum(${2:val}) AS total\nFROM ${3:tabla}\nGROUP BY ${1:col}\nORDER BY total DESC',
];

export const SqlEditorModal: React.FC<Props> = ({
  open,
  title,
  initialSql,
  queryName,
  onSave,
  onClose,
}) => {
  const { t: tr } = useI18n();
  const [value, setValue] = useState(initialSql);
  const [schema, setSchema] = useState<SchemaTable[] | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const schemaRef = useRef<SchemaTable[] | null>(null);
  const disposableRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialSql);
    setTestResult(null);
  }, [open, initialSql]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const body: any = await templatesApi.schemaInfo();
        if (cancelled) return;
        const tables: SchemaTable[] = body.tables ?? [];
        schemaRef.current = tables;
        setSchema(tables);
      } catch (e) {
        if (!cancelled)
          setSchemaError(
            (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
              tr('templates.sql.schemaLoadError'),
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tr]);

  // Limpia el completion provider al cerrar para no dejar entradas acumuladas.
  useEffect(() => {
    return () => {
      disposableRef.current?.dispose();
      disposableRef.current = null;
    };
  }, []);

  const beforeMount: BeforeMount = (monaco) => {
    disposableRef.current?.dispose();
    disposableRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '.', ':', '\n', '\t', ','],
      provideCompletionItems: (model: any, position: any) => {
        const tables = schemaRef.current ?? [];
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const textBefore = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const suggestions: any[] = [];

        // 1) Si la palabra anterior es `tabla.`, sugerimos las columnas de esa tabla.
        const dotMatch = /([a-zA-Z_][a-zA-Z0-9_]*)\.$/.exec(textBefore);
        if (dotMatch) {
          const targetName = dotMatch[1].toLowerCase();
          const target = tables.find((t) => t.name.toLowerCase() === targetName);
          if (target) {
            target.columns.forEach((c) => {
              suggestions.push({
                label: c.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: c.name,
                detail: `${c.type}${c.nullable ? ' · null' : ''}`,
                range,
              });
            });
            return { suggestions };
          }
        }

        // 2) Tablas
        tables.forEach((t) => {
          suggestions.push({
            label: t.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
            detail: tr('templates.sql.tableDetail', { count: t.columns.length }),
            documentation: {
              value: [
                '```',
                ...t.columns.slice(0, 20).map((c) => `${c.name} :: ${c.type}`),
                '```',
              ].join('\n'),
            },
            range,
          });
        });

        // 3) Columnas "globales" (sin prefijo) — útiles al escribir en SELECT
        const seenCols = new Set<string>();
        tables.forEach((t) => {
          t.columns.forEach((c) => {
            if (seenCols.has(c.name)) return;
            seenCols.add(c.name);
            suggestions.push({
              label: c.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: c.name,
              detail: tr('templates.sql.columnDetail', { type: c.type }),
              range,
            });
          });
        });

        // 4) Placeholders
        PLACEHOLDER_COMPLETIONS.forEach((p) => {
          suggestions.push({
            label: p.label,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: p.label,
            detail: tr(p.detail),
            range,
          });
        });

        // 5) Snippets habituales
        SQL_KEYWORD_SNIPPETS.forEach((s, i) => {
          suggestions.push({
            label: `snippet ${i + 1}`,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: tr('templates.sql.snippetDetail'),
            range,
          });
        });

        return { suggestions };
      },
    });
  };

  const onEditorMount: OnMount = (editor, monaco) => {
    editor.addAction({
      id: 'openfactu.format-basic',
      label: tr('templates.sql.formatAction'),
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: () => {
        const text = editor.getValue();
        const formatted = text.replace(
          /\b(select|from|where|and|or|not|in|is|null|as|join|inner|left|right|outer|on|group|by|order|having|limit|offset|union|with|case|when|then|else|end|distinct|exists|count|sum|avg|min|max|coalesce|like|ilike|asc|desc)\b/gi,
          (m: string) => m.toUpperCase(),
        );
        editor.setValue(formatted);
      },
    });
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body: any = await templatesApi.testQuery({ name: queryName || 'test', sql: value });
      if (body?.ok === false) {
        setTestResult({ ok: false, error: body.error || tr('templates.sql.queryError') });
      } else {
        setTestResult({
          ok: true,
          rows: body.rows ?? [],
          rowCount: body.rowCount ?? 0,
          truncated: body.truncated ?? false,
        });
      }
    } catch (e) {
      setTestResult({
        ok: false,
        error:
          (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          tr('templates.sql.networkError'),
      });
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
      <div className="w-[min(96vw,1200px)] h-[min(92vh,800px)] rounded-lg shadow-2xl bg-bg-card border border-border-default flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div>
            <div className="text-sm font-semibold text-fg-body">
              {title ?? tr('templates.sql.defaultTitle')}
            </div>
            <div className="text-[11px] text-fg-muted">
              {schema
                ? tr('templates.sql.schemaLoaded', { count: schema.length })
                : schemaError
                  ? tr('templates.sql.noSchema', { error: schemaError })
                  : tr('templates.sql.loadingSchema')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-fg-body"
            title={tr('templates.sql.closeEsc')}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[1fr_260px]">
          <div className="min-h-0 border-r border-border-default">
            <Editor
              height="100%"
              language="sql"
              theme="vs-dark"
              value={value}
              onChange={(v) => setValue(v ?? '')}
              beforeMount={beforeMount}
              onMount={onEditorMount}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
                tabSize: 2,
                quickSuggestions: { other: true, strings: true, comments: false },
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'on',
              }}
            />
          </div>
          <aside className="min-h-0 overflow-y-auto bg-bg-muted text-xs">
            <SchemaPanel
              schema={schema}
              error={schemaError}
              onInsert={(text) =>
                setValue((v) => (v.endsWith('\n') || v === '' ? v + text : v + ' ' + text))
              }
            />
          </aside>
        </div>

        <div className="border-t border-border-default bg-bg-muted px-4 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {testing ? tr('templates.sql.testing') : tr('templates.sql.test')}
          </button>
          {testResult && testResult.ok && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              ✓ {tr('templates.sql.rows', { count: testResult.rowCount ?? 0 })}
              {testResult.truncated ? tr('templates.sql.truncated') : ''}
            </span>
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
            className="text-xs px-3 py-1.5 rounded border border-border-strong text-fg-body hover:bg-bg-hover"
          >
            {tr('templates.sql.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(value);
              onClose();
            }}
            className="text-xs px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {tr('templates.sql.save')}
          </button>
        </div>

        {testResult && testResult.ok && testResult.rows && testResult.rows.length > 0 && (
          <div className="max-h-52 overflow-auto border-t border-border-default bg-bg-card">
            <table className="w-full text-[11px] font-mono">
              <thead className="bg-bg-muted sticky top-0">
                <tr>
                  {Object.keys(testResult.rows[0]).map((k) => (
                    <th key={k} className="px-2 py-1 text-left font-semibold">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testResult.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-t border-border-subtle">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-2 py-1 truncate max-w-[220px]">
                        {v == null ? (
                          <span className="text-slate-400 italic">null</span>
                        ) : typeof v === 'object' ? (
                          JSON.stringify(v)
                        ) : (
                          String(v)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

const SchemaPanel: React.FC<{
  schema: SchemaTable[] | null;
  error: string | null;
  onInsert: (text: string) => void;
}> = ({ schema, error, onInsert }) => {
  const { t: tr } = useI18n();
  const [filter, setFilter] = useState('');
  if (error) {
    return <div className="p-3 text-red-500">{error}</div>;
  }
  if (!schema) {
    return <div className="p-3 text-slate-500">{tr('templates.sql.loadingSchema')}</div>;
  }
  const filtered = filter
    ? schema.filter(
        (t) =>
          t.name.toLowerCase().includes(filter.toLowerCase()) ||
          t.columns.some((c) => c.name.toLowerCase().includes(filter.toLowerCase())),
      )
    : schema;
  return (
    <div className="p-2 space-y-2">
      <SearchInput
        value={filter}
        onChange={setFilter}
        placeholder={tr('templates.sql.filterPlaceholder')}
        clearable
      />
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {tr('templates.sql.tenantSchema')}
      </div>
      {filtered.map((t) => (
        <details
          key={`${t.schema}.${t.name}`}
          open={!!filter}
          className="rounded bg-bg-card border border-border-default"
        >
          <summary className="cursor-pointer px-2 py-1 font-semibold text-fg-body flex items-center justify-between">
            <span className="truncate" title={`${t.schema}.${t.name}`}>
              {t.name}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onInsert(`SELECT * FROM ${t.name} LIMIT 50`);
              }}
              className="text-[10px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200"
              title={tr('templates.sql.insertSelect')}
            >
              ★
            </button>
          </summary>
          <ul className="px-2 pb-1.5 pt-0.5 space-y-0.5">
            {t.columns.map((c) => (
              <li
                key={c.name}
                onClick={() => onInsert(c.name)}
                className="px-1 py-0.5 rounded hover:bg-bg-hover cursor-pointer flex items-center justify-between gap-2"
                title={c.type}
              >
                <span className="truncate font-mono text-fg-body">{c.name}</span>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">{c.type}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
};
