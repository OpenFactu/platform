import React, { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Pagination,
  SearchInput,
  Select,
  Table,
  type TableColumn,
} from '@openfactu/ui';
import { DocKind, DocSide } from '@openfactu/common';
import { useFormat } from '@/hooks/useFormat';
import { useItemUoms } from '@/hooks/useItemUoms';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { usePluginLineFields } from '@/hooks/usePluginLineFields';
import { useI18n } from '@/i18n/I18nContext';
import {
  creditNoteRows,
  lineMatches,
  type CreditNoteRow,
  type InvoiceSide,
} from '../../domain/creditNote';
import type { useCreditNote } from '../../hooks/useCreditNote';
import { buildFormLineColumns } from '../documentLineCells';
import { MobileLineCards } from '../MobileLineCards';

/** Una factura puede traer cientos de líneas: se pagina y, a partir de unas pocas, se busca. */
const PAGE_SIZE = 25;
const SEARCH_FROM = 6;

interface Props {
  side: InvoiceSide;
  invoiceId: string;
  note: ReturnType<typeof useCreditNote>;
  masters: Parameters<typeof buildFormLineColumns>[0]['masters'];
}

/**
 * Las líneas de un abono son las de cualquier documento, las de su factura: artículo,
 * cantidad, precio, impuesto, total y los campos propios, con lo único que se elige
 * editable. Encima, lo que con muchas líneas se hace de una vez.
 */
export const CreditNoteLines: React.FC<Props> = ({ side, invoiceId, note, masters }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const mobile = useIsMobile();
  const itemUoms = useItemUoms();
  const { form, data, bulk } = note;
  const pluginLineFields = usePluginLineFields(
    side === 'sales' ? 'SalesInvoiceLine' : 'PurchaseInvoiceLine',
  );
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const rows = useMemo(
    () => creditNoteRows(data?.lines ?? [], form.drafts, invoiceId),
    [data, form.drafts, invoiceId],
  );
  const found = useMemo(
    () => rows.filter((row) => lineMatches(row.line, query, masters.items)),
    [rows, query, masters.items],
  );
  const pageRows = found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const warehouses = masters.warehouses ?? [];

  const options = (items: Array<{ id: string; name: string }>) =>
    items.map((item) => ({ value: item.id, label: item.name }));

  const extraColumns: TableColumn<CreditNoteRow>[] = [
    {
      header: t('doc.creditNote.colAvailable'),
      width: '8%',
      align: 'right',
      cell: ({ line }) => (
        <span className="tabular-nums text-fg-muted">
          {fmt.quantity(line.available)} / {fmt.quantity(line.invoiced)}
        </span>
      ),
    },
    {
      header: t('doc.creditNote.colReturn'),
      width: '6%',
      align: 'center',
      cell: ({ draft, line }) => (
        <Checkbox
          disabled={line.returnable <= 0}
          aria-label={t(
            side === 'sales'
              ? 'doc.creditNote.returnsFromCustomer'
              : 'doc.creditNote.returnsToSupplier',
          )}
          checked={draft.returnStock}
          onChange={(returnStock) => note.setDraft(draft.lineId, { returnStock })}
        />
      ),
    },
    {
      header: t('doc.creditNote.colWhere'),
      width: '16%',
      cell: ({ draft, line }) =>
        draft.returnStock ? (
          <div className="space-y-2">
            <Select
              ariaLabel={t('doc.creditNote.warehouse')}
              value={draft.warehouseId ?? ''}
              onChange={(warehouseId) => note.setDraft(draft.lineId, { warehouseId, zoneId: null })}
              options={options(warehouses)}
            />
            {note.zonesOf(draft.warehouseId).length > 0 && (
              <Select
                ariaLabel={t('doc.creditNote.zone')}
                value={draft.zoneId ?? ''}
                onChange={(zoneId) => note.setDraft(draft.lineId, { zoneId })}
                options={options(note.zonesOf(draft.warehouseId))}
              />
            )}
            {line.batches.some((batch) => batch.available > 0) && (
              <p className="text-xs text-fg-muted">
                {t('doc.creditNote.batches', {
                  batches: line.batches
                    .filter((batch) => batch.available > 0)
                    .map((batch) => `${batch.batchNum} (${batch.available})`)
                    .join(', '),
                })}
              </p>
            )}
          </div>
        ) : line.returnedUncredited > 0 ? (
          <p className="text-xs text-fg-muted">
            {t('doc.creditNote.backByLogistics', {
              count: fmt.quantity(line.returnedUncredited),
            })}
          </p>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
  ];

  // Lleva más columnas que un alta normal: sin repartir el ancho, los campos se quedan
  // tan estrechos que no se lee el número.
  const widths: Record<string, string> = {
    [t('doc.lines.item')]: '24%',
    [t('doc.lines.quantity')]: '13%',
    [t('doc.lines.price')]: '9%',
    [t('doc.lines.vatRate')]: '8%',
    [t('doc.lines.total')]: '10%',
    [t('doc.lines.project')]: '10%',
  };
  const inputWidths: Record<string, string> = {
    [t('doc.lines.quantity')]: '[&_input]:min-w-[4.5rem]',
    [t('doc.lines.price')]: '[&_input]:min-w-[4.5rem]',
  };

  // Sin la columna de acciones: de un abono no se añaden ni se quitan líneas.
  const columns = buildFormLineColumns({
    kind: DocKind.Invoice,
    side: side === 'sales' ? DocSide.Sale : DocSide.Purchase,
    state: { lines: pageRows },
    masters,
    actions: {
      updateLine: (idx, field, value) => {
        if (field === 'quantity') note.setDraft(pageRows[idx].draft.lineId, { quantity: value });
      },
      removeLine: () => {},
    },
    fmt,
    getItemUoms: itemUoms.get,
    pluginLineFields,
    editableBaseQuantity: true,
    negativeTotals: true,
    hideBatches: true,
    extraColumns,
  })
    .filter((column) => column.header !== '')
    .map((column) => ({ ...column, width: widths[column.header] ?? column.width }));

  const many = rows.length > 1;

  return (
    <div>
      {many && (
        <div className="space-y-3 p-4 border-b border-border-subtle">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs font-semibold text-fg-muted">
              {t('doc.creditNote.picked', { picked: bulk.picked, total: rows.length })}
            </span>
            <Button size="sm" variant="secondary" onClick={bulk.selectAll}>
              {t('doc.creditNote.selectAll')}
            </Button>
            <Button size="sm" variant="secondary" onClick={bulk.selectNone}>
              {t('doc.creditNote.selectNone')}
            </Button>
          </div>
          <Checkbox
            label={t(
              side === 'sales'
                ? 'doc.creditNote.returnAllFromCustomer'
                : 'doc.creditNote.returnAllToSupplier',
            )}
            checked={bulk.allReturned}
            onChange={bulk.setAllReturned}
          />
          {bulk.anyReturned && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label={t('doc.creditNote.warehouseAll')}
                placeholder={t('doc.creditNote.several')}
                value={bulk.warehouseId}
                onChange={bulk.setAllWarehouse}
                options={options(warehouses)}
              />
              {note.zonesOf(bulk.warehouseId || null).length > 0 && (
                <Select
                  label={t('doc.creditNote.zoneAll')}
                  placeholder={t('doc.creditNote.several')}
                  value={bulk.zoneId}
                  onChange={bulk.setAllZone}
                  options={options(note.zonesOf(bulk.warehouseId || null))}
                />
              )}
            </div>
          )}
          {rows.length >= SEARCH_FROM && (
            <SearchInput
              value={query}
              placeholder={t('doc.creditNote.searchLine')}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
            />
          )}
        </div>
      )}
      {mobile ? (
        <MobileLineCards
          columns={columns}
          lines={pageRows}
          emptyMessage={t('doc.creditNote.noLineMatch')}
          lineNumber={(row) => row.line.lineNum}
        />
      ) : (
        <Table
          responsive="scroll"
          columns={columns}
          data={pageRows}
          rowKey={(row) => row.id}
          cellClassName={(column) => inputWidths[column.header]}
          emptyMessage={t('doc.creditNote.noLineMatch')}
        />
      )}
      {found.length > PAGE_SIZE && (
        <div className="p-3 border-t border-border-subtle">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={found.length}
            onPageChange={setPage}
            pageSizeOptions={[]}
          />
        </div>
      )}
    </div>
  );
};
