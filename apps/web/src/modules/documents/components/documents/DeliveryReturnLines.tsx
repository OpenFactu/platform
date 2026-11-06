import React, { useMemo, useState } from 'react';
import {
  Button,
  NumberInput,
  Pagination,
  SearchInput,
  Table,
  type TableColumn,
} from '@openfactu/ui';
import { useFormat } from '@/hooks/useFormat';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nContext';
import { returnKey, returnLineMatches, type ReturnableLine } from '../../domain/deliveryReturn';
import type { useDeliveryReturn } from '../../hooks/useDeliveryReturn';
import { MobileLineCards } from '../MobileLineCards';

/** Un albarán puede traer cientos de líneas: se pagina y, a partir de unas pocas, se busca. */
const PAGE_SIZE = 25;
const SEARCH_FROM = 6;

interface Props {
  ret: ReturnType<typeof useDeliveryReturn>;
}

/** Lo que puede volver, línea a línea y por lote: se escribe lo que ha traído el cliente. */
export const DeliveryReturnLines: React.FC<Props> = ({ ret }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const mobile = useIsMobile();
  const { lines, form } = ret;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const found = useMemo(
    () => lines.filter((line) => returnLineMatches(line, query)),
    [lines, query],
  );
  const pageRows = found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const anyBatch = lines.some((line) => line.batchNum);

  const columns: TableColumn<ReturnableLine>[] = [
    {
      header: t('doc.lines.item'),
      cell: (line) => (
        <div className="min-w-0">
          <p className="font-semibold text-fg-default">{line.itemName ?? line.itemId}</p>
          {line.itemCode && <p className="font-mono text-xs text-fg-muted">{line.itemCode}</p>}
        </div>
      ),
    },
    ...(anyBatch
      ? [
          {
            header: t('doc.deliveryReturn.batch'),
            width: '16%',
            cell: (line: ReturnableLine) => (
              <span className="font-mono text-sm text-fg-body">{line.batchNum ?? '—'}</span>
            ),
          },
        ]
      : []),
    {
      header: t('doc.deliveryReturn.pending'),
      width: '18%',
      align: 'right',
      cell: (line) => (
        <span className="tabular-nums text-fg-muted">
          {fmt.quantity(line.pending)} {line.uomName ?? ''}
        </span>
      ),
    },
    {
      header: t('doc.deliveryReturn.comesBack'),
      width: '20%',
      cell: (line) => (
        <NumberInput
          aria-label={t('doc.deliveryReturn.comesBackOf', {
            item: line.itemName ?? line.itemId,
          })}
          value={form.quantities[returnKey(line)] ?? null}
          onChange={(value) => ret.setQuantity(returnKey(line), value)}
          min={0}
          inputSize="sm"
        />
      ),
    },
  ];

  return (
    <div>
      {lines.length > 1 && (
        <div className="space-y-3 p-4 border-b border-border-subtle">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs font-semibold text-fg-muted">
              {t('doc.deliveryReturn.picked', { picked: ret.picked, total: lines.length })}
            </span>
            <Button size="sm" variant="secondary" onClick={ret.selectAll}>
              {t('doc.deliveryReturn.selectAll')}
            </Button>
            <Button size="sm" variant="secondary" onClick={ret.selectNone}>
              {t('doc.deliveryReturn.selectNone')}
            </Button>
          </div>
          {lines.length >= SEARCH_FROM && (
            <SearchInput
              value={query}
              placeholder={t('doc.deliveryReturn.search')}
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
          lines={pageRows.map((line) => ({ ...line, id: returnKey(line) }))}
          emptyMessage={t('doc.deliveryReturn.noMatch')}
          lineNumber={(line) => line.lineNum}
        />
      ) : (
        <Table
          responsive="scroll"
          columns={columns}
          data={pageRows}
          rowKey={returnKey}
          emptyMessage={t('doc.deliveryReturn.noMatch')}
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
