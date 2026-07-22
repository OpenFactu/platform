import React, { useEffect, useMemo, useState } from 'react';
import { Table, Card, Button, Badge, Loader, useToast } from '@openfactu/ui';
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
import { DOC_TYPE_LABELS, DOC_TYPE_COLORS, type DocType, type TemplateRow } from './constants';
import { useAuth } from '@/context/AuthContext';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';
import { templatesApi } from '../api';

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

const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as DocType[];

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
  const [resyncing, setResyncing] = useState(false);
  const [selectedType, setSelectedType] = useState<DocType | null>(null);

  const handleResyncDefaults = async () => {
    if (
      !confirm(
        '¿Regenerar TODAS las plantillas por defecto con el diseño Keirost actual?\n\n' +
          'Esto sustituirá el HTML de las plantillas marcadas como "por defecto" de cada tipo de documento.\n' +
          'Tus plantillas personalizadas NO se tocan.',
      )
    )
      return;
    setResyncing(true);
    try {
      const body: any = await templatesApi.resyncDefaults();
      toast.success(`Plantillas regeneradas: ${body.count}`);
      onReload?.();
    } catch (e: any) {
      toast.error(e.message || 'Error al regenerar plantillas');
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
      header: 'Nombre',
      accessor: (item: TemplateRow) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 dark:text-slate-100">{item.name}</span>
          {item.isDefault && (
            <Badge variant="success" className="text-[9px] font-black uppercase">
              Default
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Última actualización',
      accessor: (item: TemplateRow) =>
        item.updatedAt ? new Date(item.updatedAt).toLocaleString('es-ES') : '—',
    },
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (item: TemplateRow) => (
        <div className="flex items-center justify-end gap-1">
          {(item.docType === 'FREE' || item.docType === 'LABEL') && onGenerate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e: any) => {
                e.stopPropagation();
                onGenerate(item);
              }}
              title="Generar documento"
              className="text-blue-600 hover:text-blue-700"
            >
              <FileDown size={14} />
            </Button>
          )}
          {!item.isDefault && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e: any) => {
                e.stopPropagation();
                onSetDefault(item);
              }}
              title="Marcar como default"
            >
              <Star size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e: any) => {
              e.stopPropagation();
              onDuplicate(item);
            }}
            title="Duplicar"
          >
            <Copy size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e: any) => {
              e.stopPropagation();
              onDelete(item);
            }}
            title="Borrar"
            className="text-rose-500 hover:text-rose-700"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  const ctxMenu = useContextMenu<TemplateRow>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (item: TemplateRow) => [
    { label: 'Editar', icon: <Pencil size={14} />, onClick: () => onEdit(item) },
    ...(onGenerate && (item.docType === 'FREE' || item.docType === 'LABEL')
      ? [
          {
            label: 'Generar documento',
            icon: <FileDown size={14} />,
            onClick: () => onGenerate(item),
          },
        ]
      : []),
    ...(!item.isDefault
      ? [
          {
            label: 'Marcar como default',
            icon: <Star size={14} />,
            onClick: () => onSetDefault(item),
          },
        ]
      : []),
    { label: 'Duplicar', icon: <Copy size={14} />, onClick: () => onDuplicate(item) },
    {
      label: 'Borrar',
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => onDelete(item),
      separatorBefore: true,
    },
  ];

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-line dark:border-ink-700 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 dark:text-slate-100 flex items-center gap-4 tracking-tight font-display">
            <div className="p-3 bg-accent/10 rounded-sm text-accent border border-accent/20">
              <FileCode size={28} />
            </div>
            Plantillas de Documento
          </h1>
          <p className="text-ink-500 dark:text-ink-400 mt-2 font-medium ml-1">
            Formatos PDF personalizables para facturas, albaranes, pedidos, etiquetas y documentos
            libres.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleResyncDefaults}
            disabled={resyncing}
            variant="outline"
            className="flex items-center gap-2 h-12 px-5 border-accent/40 text-accent hover:bg-accent/5"
            title="Regenera las plantillas por defecto con la paleta Keirost + trazabilidad. No toca plantillas custom."
          >
            <RefreshCw size={16} className={resyncing ? 'animate-spin' : ''} />
            {resyncing ? 'Regenerando…' : 'Regenerar estándares'}
          </Button>
          {onAiGenerate && (
            <Button
              onClick={onAiGenerate}
              variant="outline"
              className="flex items-center gap-2 h-12 px-5 border-accent/40 text-accent hover:bg-accent/5"
              title="Describe la plantilla en lenguaje natural y la IA la genera"
            >
              <Sparkles size={16} /> Generar con IA
            </Button>
          )}
          <Button onClick={onCreate} className="flex items-center gap-2 h-12 px-6">
            <Plus size={18} /> Nueva Plantilla
          </Button>
        </div>
      </div>

      {loading && <Loader />}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
          {/* Panel izquierdo: tipos */}
          <Card noPadding className="overflow-hidden border-slate-100 dark:border-slate-800">
            <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
              Tipo de documento
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
                          : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${DOC_TYPE_COLORS[docType]}`}
                        >
                          {docType}
                        </span>
                        <span
                          className={`text-sm truncate ${active ? 'font-bold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                          {DOC_TYPE_LABELS[docType]}
                        </span>
                      </span>
                      <span
                        className={`text-[10px] font-bold shrink-0 ${count > 0 ? 'text-slate-500' : 'text-slate-300 dark:text-slate-600'}`}
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
            className="overflow-hidden shadow-lg dark:bg-transparent border-slate-100 dark:border-slate-800"
          >
            {selectedType && (
              <div
                className={`px-6 py-3 border-b flex items-center justify-between ${DOC_TYPE_COLORS[selectedType]}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {selectedType}
                  </span>
                  <span className="font-bold text-sm">{DOC_TYPE_LABELS[selectedType]}</span>
                </div>
                <span className="text-[10px] font-bold opacity-70">{rows.length} plantilla(s)</span>
              </div>
            )}
            {rows.length === 0 ? (
              <div className="p-10 text-center text-slate-400 dark:text-slate-500 text-sm italic flex items-center justify-center gap-2">
                <AlertCircle size={14} /> Sin plantillas para este tipo
              </div>
            ) : (
              <Table columns={ctxColumns} data={rows} onRowClick={onEdit} />
            )}
          </Card>
        </div>
      )}
      {ctxMenu.state && (
        <ContextMenu
          x={ctxMenu.state.x}
          y={ctxMenu.state.y}
          items={buildCtxItems(ctxMenu.state.data)}
          onClose={ctxMenu.close}
        />
      )}
    </div>
  );
};
