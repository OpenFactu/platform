import React from 'react';
import { Alert, Button, Drawer, FileDropzone, Select, Table } from '@openfactu/ui';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { STATEMENT_FIELDS, type StatementPreview } from '../domain/banking';
import { useStatementImport } from '../hooks/useStatementImport';

type ParsedRow = Extract<StatementPreview, { kind: 'parsed' }>['lines'][number];

interface Props {
  open: boolean;
  bankAccountId: string;
  onClose: () => void;
  onImported: () => void;
}

/** Subir un extracto, ver lo que trae y decir qué columna es cada cosa. */
export const StatementImportDrawer: React.FC<Props> = ({
  open,
  bankAccountId,
  onClose,
  onImported,
}) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const statement = useStatementImport(bankAccountId, onImported);
  const { preview, result } = statement;

  const close = () => {
    statement.reset();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      size="lg"
      title={t('banking.import.title')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            {t(result ? 'banking.common.close' : 'banking.common.cancel')}
          </Button>
          {!result && (
            <Button
              onClick={statement.run}
              disabled={!statement.canImport}
              isLoading={statement.busy}
            >
              {t('banking.import.submit')}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {result ? (
          <>
            <Alert tone="success">
              {t('banking.import.done', { added: result.added, skipped: result.skipped })}
            </Alert>
            {result.rejected.length > 0 && (
              <Alert tone="warning">
                <p className="font-semibold">
                  {t('banking.import.rejected', { count: result.rejected.length })}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {result.rejected.slice(0, 20).map((row) => (
                    <li key={row.row}>{t('banking.import.rejectedRow', row)}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <Button variant="secondary" onClick={statement.reset}>
              {t('banking.import.another')}
            </Button>
          </>
        ) : (
          <>
            <Select
              label={t('banking.import.format')}
              value={statement.format}
              onChange={statement.changeFormat}
              options={statement.formats.map((format) => ({
                value: format.id,
                label: format.label,
              }))}
            />
            <FileDropzone
              onFiles={(files) => (files[0] ? statement.pick(files[0]) : undefined)}
              maxSizeMb={10}
              isUploading={statement.busy && !preview}
              label={statement.file?.name ?? t('banking.import.dropzone')}
              hint={t('banking.import.dropzoneHint')}
            />
            {statement.problem && <Alert tone="danger">{statement.problem}</Alert>}
            {preview?.kind === 'table' && (
              <>
                <p className="text-sm text-fg-muted">
                  {t('banking.import.rows', { count: preview.total })}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {STATEMENT_FIELDS.map((field) => (
                    <Select
                      key={field}
                      label={t(`banking.import.fields.${field}`)}
                      required={field === 'date'}
                      placeholder={t('banking.import.noColumn')}
                      value={statement.mapping[field] ?? ''}
                      onChange={(header) => statement.setColumn(field, header)}
                      options={[
                        { value: '', label: t('banking.import.noColumn') },
                        ...preview.headers.map((header) => ({ value: header, label: header })),
                      ]}
                    />
                  ))}
                </div>
                {statement.missing && (
                  <Alert tone="warning">{t(`banking.import.missing.${statement.missing}`)}</Alert>
                )}
                <Table
                  responsive="scroll"
                  columns={preview.headers.map((header) => ({
                    header,
                    cell: (row: Record<string, unknown>) => String(row[header] ?? ''),
                  }))}
                  data={preview.rows.slice(0, 5)}
                />
              </>
            )}
            {preview?.kind === 'parsed' && (
              <>
                <p className="text-sm text-fg-muted">
                  {t('banking.import.rows', { count: preview.total })}
                </p>
                <Table
                  responsive="scroll"
                  columns={[
                    {
                      header: t('banking.import.fields.date'),
                      cell: (row: ParsedRow) => fmt.date(row.date),
                    },
                    {
                      header: t('banking.import.fields.description'),
                      cell: (row: ParsedRow) => row.description ?? '—',
                    },
                    {
                      header: t('banking.import.fields.amount'),
                      align: 'right' as const,
                      cell: (row: ParsedRow) => fmt.money(row.amount),
                    },
                  ]}
                  data={preview.lines.slice(0, 5)}
                />
              </>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
};
