import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, Button, Badge, Loader, PageHeader, useToast } from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import {
  FileCode,
  Plus,
  Trash2,
  Copy,
  Star,
  AlertCircle,
  RefreshCw,
  FileDown,
  Pencil,
  Sparkles,
} from 'lucide-react';
import {
  DOC_TYPE_LABELS,
  getDocTypeLabel,
  getDocTypeColor,
  useDocTypeOptions,
  type DocType,
  type TemplateRow,
} from './constants';
import { useAuth } from '@/context/AuthContext';
import { templatesApi } from '../api';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';

interface Props {
  data: TemplateRow[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (t: TemplateRow) => void;
  onSetDefault: (t: TemplateRow) => Promise<void>;
  onDuplicate: (t: TemplateRow) => Promise<void>;
  onDelete: (t: TemplateRow) => Promise<void>;
  onGenerate?: (t: TemplateRow) => void;
  /** Abre el generador de plantillas con IA (solo se pasa si el usuario es admin). */
  onAiGenerate?: () => void;
  onReload?: () => void;
}

export const TemplatesList: React.FC<Props> = ({
  data,
  loading,
  onCreate,
  onEdit,
  onSetDefault,
  onDuplicate,
  onDelete,
  onGenerate,
  onAiGenerate,
  onReload,
}) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const [resyncing, setResyncing] = useState(false);
  const [selectedType, setSelectedType] = useState<DocType | null>(null);

  // Tipos desde el registry del servidor (+FREE/LABEL); fallback a los 8
  // estáticos mientras carga.
  const DOC_TYPES = useDocTypeOptions().map((o) => o.value);

  const handleResyncDefaults = async () => {
    if (!confirm(t('templates.list.resyncConfirm'))) return;
    setResyncing(true);
    try {
      const body: any = await templatesApi.resyncDefaults();
      toast.success(t('templates.list.resyncDone', { count: body.count }));
      onReload?.();
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || t('templates.list.resyncError'));
    } finally {
      setResyncing(false);
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, TemplateRow[]> = {};
    for (const row of data) {
      if (!map[row.docType]) map[row.docType] = [];
      map[row.docType].push(row);
    }
    return map;
  }, [data]);

  // Selecciona por defecto el primer tipo que tenga plantillas.
  useEffect(() => {
    if (selectedType && (grouped[selectedType]?.length ?? 0) >= 0) return;
    const firstWith = DOC_TYPES.find((t) => (grouped[t]?.length ?? 0) > 0) ?? DOC_TYPES[0];
    setSelectedType((prev) => prev ?? firstWith);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped]);

  const rows = selectedType ? grouped[selectedType] || [] : [];

  const columns = [
    {
      header: t('templates.list.colName'),
      accessor: (item: TemplateRow) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-fg-default">{item.name}</span>
          {item.isDefault && (
            <Badge variant="success" className="text-[9px] font-black uppercase">
              {t('templates.list.defaultBadge')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: t('templates.list.colUpdated'),
      accessor: (item: TemplateRow) => (item.updatedAt ? formatDateTime(item.updatedAt) : '—'),
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que los condicionales de cada
  // acción se declaran una vez en lugar de duplicarse entre una columna de
  // botones y el menú.
  const rowActions = (item: TemplateRow): RowAction[] => [
    { label: t('templates.list.edit'), icon: <Pencil size={14} />, onClick: () => onEdit(item) },
    ...(onGenerate && (item.docType === 'FREE' || item.docType === 'LABEL')
      ? [
          {
            label: t('templates.list.generateDocument'),
            icon: <FileDown size={14} />,
            onClick: () => onGenerate(item),
          },
        ]
      : []),
    ...(!item.isDefault
      ? [
          {
            label: t('templates.list.setDefault'),
            icon: <Star size={14} />,
            onClick: () => onSetDefault(item),
          },
        ]
      : []),
    {
      label: t('templates.list.duplicate'),
      icon: <Copy size={14} />,
      onClick: () => onDuplicate(item),
    },
    {
      label: t('templates.list.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => onDelete(item),
      separatorBefore: true,
    },
  ];

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title={t('templates.list.title')}
        subtitle={t('templates.list.subtitle')}
        icon={<FileCode size={18} />}
        size="lg"
        divider
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              onClick={handleResyncDefaults}
              disabled={resyncing}
              variant="outline"
              className="flex items-center gap-2 h-12 px-5 border-accent/40 text-accent hover:bg-accent/5"
              title={t('templates.list.resyncTooltip')}
            >
              <RefreshCw size={16} className={resyncing ? 'animate-spin' : ''} />
              {resyncing ? t('templates.list.resyncing') : t('templates.list.resync')}
            </Button>
            {onAiGenerate && (
              <Button
                type="button"
                onClick={onAiGenerate}
                variant="outline"
                className="flex items-center gap-2 h-12 px-5 border-accent/40 text-accent hover:bg-accent/5"
                title={t('templates.list.aiTooltip')}
              >
                <Sparkles size={16} /> {t('templates.list.aiGenerate')}
              </Button>
            )}
            <Button type="button" onClick={onCreate} className="flex items-center gap-2 h-12 px-6">
              <Plus size={18} /> {t('templates.list.newTemplate')}
            </Button>
          </div>
        }
      />

      {loading && <Loader />}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
          {/* Panel izquierdo: tipos */}
          <Card noPadding className="overflow-hidden border-border-subtle">
            <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-border-subtle">
              {t('templates.list.docTypeHeader')}
            </div>
            <ul>
              {DOC_TYPES.map((docType) => {
                const count = grouped[docType]?.length ?? 0;
                const active = selectedType === docType;
                return (
                  <li key={docType}>
                    <button
                      type="button"
                      onClick={() => setSelectedType(docType)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left border-l-2 transition-colors ${
                        active
                          ? 'border-accent bg-accent/5'
                          : 'border-transparent hover:bg-bg-hover'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${getDocTypeColor(docType)}`}
                        >
                          {docType}
                        </span>
                        <span
                          className={`text-sm truncate ${active ? 'font-bold text-fg-default' : 'text-fg-body'}`}
                        >
                          {getDocTypeLabel(docType)}
                        </span>
                      </span>
                      <span
                        className={`text-[10px] font-bold shrink-0 ${count > 0 ? 'text-slate-500' : 'text-fg-subtle'}`}
                      >
                        {count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Panel derecho: plantillas del tipo seleccionado */}
          <Card
            noPadding
            className="overflow-hidden shadow-lg dark:bg-transparent border-border-subtle"
          >
            {selectedType && (
              <div
                className={`px-6 py-3 border-b flex items-center justify-between ${getDocTypeColor(selectedType)}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {selectedType}
                  </span>
                  <span className="font-bold text-sm">{getDocTypeLabel(selectedType)}</span>
                </div>
                <span className="text-[10px] font-bold opacity-70">
                  {t('templates.list.templateCount', { count: rows.length })}
                </span>
              </div>
            )}
            {rows.length === 0 ? (
              <div className="p-10 text-center text-fg-subtle text-sm italic flex items-center justify-center gap-2">
                <AlertCircle size={14} /> {t('templates.list.emptyForType')}
              </div>
            ) : (
              <Table
                className="max-md:p-3"
                columns={columns}
                data={rows}
                rowActions={rowActions}
                onRowClick={onEdit}
              />
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
