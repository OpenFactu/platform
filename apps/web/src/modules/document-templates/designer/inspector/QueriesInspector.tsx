import React, { useState } from 'react';
import { Button, ColorInput, Input, NumberInput, Select, Textarea } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import type { CanvasLayout, ParamDef } from '../../components/canvas/types';
import { extractPlaceholders } from '../../components/canvas/params';
import { SqlEditorModal } from '../../components/SqlEditorModal';
import { templatesApi } from '../../api';
import { Section, Toggle } from './controls';

export const QueriesInspector: React.FC<{
  queries: CanvasLayout['queries'];
  testParams: Record<string, unknown>;
  paramsSchema?: ParamDef[];
  docType?: string;
  onChange: (q: CanvasLayout['queries']) => void;
  onTestParamsChange: (p: Record<string, unknown>) => void;
}> = ({ queries, testParams, paramsSchema, docType, onChange, onTestParamsChange }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  const list = queries ?? [];

  if (!isAdmin && list.length === 0) {
    // Para roles no admin ocultamos la sección salvo que la plantilla ya traiga
    // consultas (en ese caso se ve en modo lectura para dar contexto).
    return null;
  }

  const setList = (next: NonNullable<CanvasLayout['queries']>) => {
    onChange(next.length === 0 ? undefined : next);
  };
  const updateAt = (idx: number, patch: Partial<{ name: string; sql: string }>) => {
    setList(list.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };
  const removeAt = (idx: number) => setList(list.filter((_, i) => i !== idx));
  const add = () =>
    setList([...list, { name: `consulta${list.length + 1}`, sql: 'SELECT 1 AS valor' }]);

  return (
    <Section title={t('templates.designer.queries.title')}>
      {!isAdmin && (
        <div className="text-[11px] text-warning">{t('templates.designer.queries.readOnly')}</div>
      )}
      <div className="text-[11px] text-fg-muted leading-snug">
        {t('templates.designer.queries.hint1')}{' '}
        <code className="px-1 rounded bg-bg-muted">
          queries.{t('templates.designer.queries.nameUpper')}
        </code>
        . {t('templates.designer.queries.hint2')} <code>SELECT</code> / <code>WITH</code>.
        Placeholders: <code>:docId</code>, <code>:partnerId</code>, <code>:companyId</code>,{' '}
        <code>:tenantId</code>.
      </div>
      {list.map((q, idx) => (
        <QueryEditor
          key={idx}
          query={q}
          testParams={testParams}
          docType={docType}
          readOnly={!isAdmin}
          onChange={(p) => updateAt(idx, p)}
          onRemove={() => removeAt(idx)}
        />
      ))}
      {isAdmin && (
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          + {t('templates.designer.queries.add')}
        </Button>
      )}
      {list.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <div className="text-[11px] font-bold text-fg-body mb-2">
            {t('templates.designer.queries.testParams')}
          </div>
          <div className="text-[10px] text-fg-subtle mb-2">
            {t('templates.designer.queries.testParamsHint1')} <code>:xxx</code>{' '}
            {t('templates.designer.queries.testParamsHint2')}
          </div>
          <TestParamsEditor
            queries={queries}
            value={testParams}
            onChange={onTestParamsChange}
            readOnly={!isAdmin}
            labels={Object.fromEntries(
              (paramsSchema ?? []).filter((p) => p.label).map((p) => [p.name, p.label as string]),
            )}
          />
        </div>
      )}
    </Section>
  );
};

export const QueryEditor: React.FC<{
  query: { name: string; sql: string };
  testParams: Record<string, unknown>;
  docType?: string;
  readOnly: boolean;
  onChange: (p: Partial<{ name: string; sql: string }>) => void;
  onRemove: () => void;
}> = ({ query, testParams, docType, readOnly, onChange, onRemove }) => {
  const { t } = useI18n();
  const [result, setResult] = useState<
    | { ok: true; rows: unknown[]; rowCount: number; truncated: boolean }
    | { ok: false; error: string }
    | null
  >(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const body: any = await templatesApi.testQuery({
        name: query.name,
        sql: query.sql,
        sampleDocType: docType,
        params: testParams,
      });
      if (body?.ok === false) {
        setResult({ ok: false, error: body.error || t('templates.designer.queries.queryError') });
      } else {
        setResult({
          ok: true,
          rows: body.rows ?? [],
          rowCount: body.rowCount ?? 0,
          truncated: body.truncated ?? false,
        });
      }
    } catch (e) {
      setResult({
        ok: false,
        error:
          (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('templates.designer.queries.networkError'),
      });
    } finally {
      setTesting(false);
    }
  };

  const [editorOpen, setEditorOpen] = useState(false);
  const lineCount = (query.sql.match(/\n/g)?.length ?? 0) + 1;
  const preview = query.sql.split('\n').slice(0, 3).join('\n');
  return (
    <div className="p-2 rounded border border-border-subtle bg-bg-muted space-y-1.5">
      <div className="flex items-center gap-1">
        <Input
          inputSize="sm"
          className="font-mono"
          containerClassName="flex-1 min-w-0"
          value={query.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={readOnly}
          placeholder={t('templates.designer.queries.namePlaceholder')}
        />
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={onRemove}
            title={t('templates.designer.queries.remove')}
          >
            ✕
          </Button>
        )}
      </div>
      <div
        onClick={() => !readOnly && setEditorOpen(true)}
        className={`p-2 rounded bg-bg-card border border-border-subtle font-mono text-[11px] leading-snug whitespace-pre overflow-hidden text-fg-body ${
          !readOnly ? 'cursor-pointer hover:border-blue-400' : ''
        }`}
        title={
          readOnly
            ? t('templates.designer.queries.readOnlyShort')
            : t('templates.designer.queries.clickToOpen')
        }
      >
        {preview || <span className="text-fg-subtle italic">SELECT * FROM …</span>}
        {lineCount > 3 && (
          <div className="text-[10px] text-fg-subtle">
            {t('templates.designer.queries.moreLines', { count: lineCount - 3 })}
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditorOpen(true)}>
            ✎ {t('templates.designer.queries.sqlEditor')}
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={runTest} disabled={testing}>
            {testing
              ? t('templates.designer.queries.testing')
              : t('templates.designer.queries.test')}
          </Button>
          {result && result.ok && (
            <span className="text-[11px] text-success">
              {t('templates.designer.queries.rows', { count: result.rowCount ?? 0 })}
              {result.truncated ? t('templates.designer.queries.truncated') : ''}
            </span>
          )}
          {result && result.ok === false && (
            <span className="text-[11px] text-danger" title={result.error}>
              ⚠ {result.error.slice(0, 60)}
            </span>
          )}
        </div>
      )}
      <SqlEditorModal
        open={editorOpen}
        title={t('templates.designer.queries.editorTitle', { name: query.name })}
        queryName={query.name}
        docType={docType}
        initialSql={query.sql}
        onSave={(v) => onChange({ sql: v })}
        onClose={() => setEditorOpen(false)}
      />
      {result && result.ok && result.rows.length > 0 && (
        <div className="max-h-40 overflow-auto border border-border-subtle rounded bg-bg-card">
          <table className="w-full text-[10px] font-mono">
            <thead className="bg-bg-muted sticky top-0">
              <tr>
                {Object.keys((result.rows[0] as Record<string, unknown>) ?? {}).map((k) => (
                  <th key={k} className="px-1.5 py-1 text-left font-semibold">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 20).map((row, i) => (
                <tr key={i} className="border-t border-border-subtle">
                  {Object.values(row as Record<string, unknown>).map((v, j) => (
                    <td key={j} className="px-1.5 py-1 truncate max-w-[120px]">
                      {v == null ? (
                        <span className="text-fg-subtle italic">null</span>
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
  );
};

/**
 * Editor de "Parámetros de prueba" DIRIGIDO POR PLACEHOLDERS: muestra un campo de
 * valor por cada placeholder `:nombre` detectado en las queries (∪ las claves ya
 * presentes en `value`). El nombre NO se edita (es etiqueta), por lo que la key de
 * React es estable y no se pierde el foco al teclear. Estos valores los usan tanto
 * el botón "Probar" como la preview 👁.
 */
export const TestParamsEditor: React.FC<{
  queries: CanvasLayout['queries'];
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  readOnly: boolean;
  labels?: Record<string, string>;
}> = ({ queries, value, onChange, readOnly, labels }) => {
  const { t } = useI18n();
  const detected = extractPlaceholders(queries);
  // Unión de los placeholders detectados y las claves ya guardadas (para no
  // perder valores de un placeholder que se quitó temporalmente de la query).
  const names = Array.from(new Set([...detected, ...Object.keys(value)]));

  const setVal = (name: string, v: string) => onChange({ ...value, [name]: v });
  const remove = (name: string) => {
    const next = { ...value };
    delete next[name];
    onChange(next);
  };

  if (names.length === 0) {
    return (
      <div className="text-[10px] text-fg-subtle italic">
        {t('templates.designer.testParams.none')} <code>:xxx</code>
        {t('templates.designer.testParams.noneSuffix')}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {names.map((name) => {
        const isDetected = detected.includes(name);
        return (
          <div key={name} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[10px] text-fg-muted" title={`:${name}`}>
              {labels?.[name] ?? name}
            </span>
            <Input
              inputSize="sm"
              className="font-mono"
              containerClassName="flex-1 min-w-0"
              value={String(value[name] ?? '')}
              onChange={(e) => setVal(name, e.target.value)}
              disabled={readOnly}
              placeholder={t('templates.designer.testParams.valuePlaceholder')}
            />
            {!readOnly && !isDetected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger"
                title={t('templates.designer.testParams.removeOrphan')}
                onClick={() => remove(name)}
              >
                ✕
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------- ParamsSchemaInspector: metadata de los parámetros de entrada ----------
// Define cómo se pide cada placeholder de las queries al GENERAR el documento
// (etiqueta, tipo de campo, obligatorio, valor por defecto). Solo admin.

export const ParamsSchemaInspector: React.FC<{
  queries: CanvasLayout['queries'];
  schema: ParamDef[] | undefined;
  onChange: (s: ParamDef[] | undefined) => void;
}> = ({ queries, schema, onChange }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  const detected = extractPlaceholders(queries);
  if (!isAdmin || detected.length === 0) return null;

  const byName = new Map((schema ?? []).map((p) => [p.name, p]));
  const update = (name: string, patch: Partial<ParamDef>) => {
    // Reconstruimos el schema con todos los placeholders detectados, aplicando
    // el patch al que cambia y conservando la metadata del resto.
    const next = detected.map((n) => {
      const base = byName.get(n) ?? { name: n };
      return n === name ? { ...base, ...patch, name: n } : base;
    });
    onChange(next);
  };

  return (
    <Section title={t('templates.designer.paramsSchema.title')}>
      <p className="text-[11px] text-fg-muted leading-snug">
        {t('templates.designer.paramsSchema.hint1')}{' '}
        <strong>{t('templates.designer.paramsSchema.hintGenerate')}</strong>{' '}
        {t('templates.designer.paramsSchema.hint2')}
      </p>
      {detected.map((name) => {
        const p = byName.get(name) ?? { name };
        return (
          <div
            key={name}
            className="p-2 rounded border border-border-subtle bg-bg-muted space-y-1.5"
          >
            <div className="font-mono text-[11px] text-fg-muted">:{name}</div>
            <Input
              inputSize="sm"
              value={p.label ?? ''}
              onChange={(e) => update(name, { label: e.target.value || undefined })}
              placeholder={t('templates.designer.paramsSchema.labelPlaceholder')}
            />
            <div className="grid grid-cols-2 gap-1">
              <Select
                options={[
                  { value: 'text', label: t('templates.designer.opt.text') },
                  { value: 'number', label: t('templates.designer.opt.number') },
                  { value: 'date', label: t('templates.designer.opt.date') },
                  { value: 'select', label: t('templates.designer.opt.select') },
                  { value: 'multiselect', label: t('templates.designer.opt.multiselect') },
                ]}
                value={p.type ?? 'text'}
                onChange={(v) => update(name, { type: v as ParamDef['type'] })}
                className="text-xs"
                ariaLabel={t('templates.designer.common.option')}
              />
              <Toggle
                label={t('templates.designer.paramsSchema.required')}
                checked={!!p.required}
                onChange={(required) => update(name, { required })}
              />
            </div>
            <Input
              inputSize="sm"
              value={p.default ?? ''}
              onChange={(e) => update(name, { default: e.target.value || undefined })}
              placeholder={t('templates.designer.paramsSchema.defaultPlaceholder')}
            />
            {(p.type === 'select' || p.type === 'multiselect') && (
              <>
                <Input
                  inputSize="sm"
                  value={(p.options ?? []).join(', ')}
                  onChange={(e) =>
                    update(name, {
                      options: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={t('templates.designer.paramsSchema.optionsPlaceholder')}
                />
                <Textarea
                  value={p.optionsQuery ?? ''}
                  onChange={(e) => update(name, { optionsQuery: e.target.value || undefined })}
                  placeholder={t('templates.designer.paramsSchema.optionsQueryPlaceholder')}
                  rows={2}
                  className="text-[11px] font-mono"
                />
                <div className="text-[10px] text-fg-subtle leading-snug">
                  {t('templates.designer.paramsSchema.optionsQueryHint1')} <code>value</code>{' '}
                  {t('templates.designer.paramsSchema.optionsQueryHintAnd')} <code>label</code> (
                  {t('templates.designer.paramsSchema.eg')}{' '}
                  <code>SELECT id AS value, name AS label FROM "Warehouse" ORDER BY name</code>).
                </div>
              </>
            )}
          </div>
        );
      })}
    </Section>
  );
};
