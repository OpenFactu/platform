import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { ApiError } from '@/shared/http';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useI18n } from '@/i18n/I18nContext';
import { inventoryCountsApi, type AddLineInput } from '../api/inventoryCountsApi';
import {
  withLine,
  type CountDetail,
  type CountItemOption,
  type CountLine,
  type CountProblem,
  type LineFilter,
} from '../domain/inventoryCount';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : undefined);

/** Un recuento abierto en pantalla: lo que se apunta, el lector y los pasos hasta cerrarlo. */
export function useInventoryCount(id: string) {
  const { t } = useI18n();
  const toast = useToast();
  const [count, setCount] = useState<CountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<CountProblem[]>([]);
  const [filter, setFilter] = useState<LineFilter>('pending');
  const [query, setQuery] = useState('');
  /** El artículo leído que necesita que le digan el lote. */
  const [askBatchFor, setAskBatchFor] = useState<CountItemOption | null>(null);
  const [lastLineId, setLastLineId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await inventoryCountsApi.get(id);
      setCount(data);
      return data;
    } catch (error) {
      toast.error(messageOf(error) || t('inventory.counts.loadError'));
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const applyLine = (line: CountLine) => {
    setCount((current) => (current ? withLine(current, line) : current));
    setLastLineId(line.id);
  };

  const setLineCount = async (lineId: string, value: number | null) => {
    try {
      applyLine(await inventoryCountsApi.setCount(id, lineId, value));
    } catch (error) {
      toast.error(messageOf(error) || t('inventory.counts.saveError'));
      void reload();
    }
  };

  const addLine = async (input: AddLineInput) => {
    const line = await inventoryCountsApi.addLine(id, input);
    applyLine(line);
    setFilter('all');
    return line;
  };

  const scan = async (code: string) => {
    if (!code.trim()) return;
    try {
      const result = await inventoryCountsApi.scan(id, code.trim());
      if (result.outcome === 'counted') {
        applyLine(result.line);
        setFilter('all');
        setQuery('');
        toast.success(
          t('inventory.counts.scanned', {
            item: result.line.itemCode,
            quantity: result.line.countedQty ?? 0,
          }),
        );
      } else if (result.outcome === 'choose') {
        setFilter('all');
        setQuery(result.lines[0]?.itemCode ?? code);
        toast.info(t('inventory.counts.scanChoose'));
      } else {
        setAskBatchFor(result.item);
      }
    } catch (error) {
      toast.error(messageOf(error) || t('inventory.counts.saveError'));
    }
  };

  const isOpen = count?.status === 'open';
  useBarcodeScanner((code) => void scan(code), { enabled: isOpen });

  /** Un paso del recuento: vuelve a pedirlo entero porque cambia qué se puede ver. */
  const step = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setProblems([]);
    try {
      await action();
      await reload();
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        const list = (error.body as { problems?: CountProblem[] } | null)?.problems;
        if (list?.length) {
          setProblems(list);
          setFilter('difference');
          return false;
        }
      }
      toast.error(messageOf(error) || t('inventory.counts.saveError'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    const ok = await step(() => inventoryCountsApi.finish(id));
    if (ok) setFilter('difference');
    return ok;
  };
  const reopen = async () => {
    const ok = await step(() => inventoryCountsApi.reopen(id));
    if (ok) setFilter('pending');
    return ok;
  };
  const close = async () => {
    const ok = await step(() => inventoryCountsApi.close(id));
    if (ok) {
      setFilter('difference');
      toast.success(t('inventory.counts.closed'));
    }
    return ok;
  };
  const cancel = () => step(() => inventoryCountsApi.cancel(id));

  const saveAllocations = async (
    lineId: string,
    rows: Array<{ batchNum: string; quantity: number }>,
  ) => {
    const line = await inventoryCountsApi.setAllocations(id, lineId, rows);
    applyLine(line);
    setProblems((current) => current.filter((problem) => problem.lineId !== lineId));
  };

  return {
    count,
    loading,
    busy,
    problems,
    filter,
    setFilter,
    query,
    setQuery,
    lastLineId,
    askBatchFor,
    setAskBatchFor,
    isOpen,
    setLineCount,
    addLine,
    scan,
    finish,
    reopen,
    close,
    cancel,
    saveAllocations,
  };
}
