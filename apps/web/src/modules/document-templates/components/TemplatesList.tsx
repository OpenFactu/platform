import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DropdownMenu,
  EmptyState,
  List,
  Loader,
  PageHeader,
  SearchInput,
  usePopup,
  useToast,
  type ListSectionData,
} from '@openfactu/ui';
import {
  AlertCircle,
  Copy,
  FileCode,
  FileDown,
  FileText,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { getCachedDocType } from '@/modules/documents/domain/docTypeRegistry';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';
import { templatesApi } from '../api';
import {
  getDocTypeLabel,
  isUserDocType,
  useDocTypeOptions,
  type DocType,
  type TemplateRow,
} from './constants';
import { useTemplatePreviewPdf } from './useTemplatePreviewPdf';

interface Props {
  data: TemplateRow[];
  loading: boolean;
  onCreate: (docType: DocType) => void;
  /** Abre el editor que le corresponde a esa plantilla. */
  onEdit: (t: TemplateRow) => void;
  /** Abre el lienzo, aunque la plantilla no se haya hecho en él. */
  onDesign: (t: TemplateRow) => void;
  onSetDefault: (t: TemplateRow) => Promise<void>;
  onDuplicate: (t: TemplateRow) => Promise<void>;
  onDelete: (t: TemplateRow) => Promise<void>;
  onGenerate?: (t: TemplateRow) => void;
  /** Abre el generador de plantillas con IA (solo se pasa si el usuario es admin). */
  onAiGenerate?: () => void;
  onReload?: () => void;
}

const isFreeType = (docType: string) => docType === 'FREE' || docType === 'LABEL';

/**
 * Plantillas por tipo de documento: se elige el tipo, se elige la plantilla y a la
 * derecha se ve cómo queda, con lo que se puede hacer con ella a la vista.
 */
export const TemplatesList: React.FC<Props> = ({
  data,
  loading,
  onCreate,
  onEdit,
  onDesign,
  onSetDefault,
  onDuplicate,
  onDelete,
  onGenerate,
  onAiGenerate,
  onReload,
}) => {
  const toast = useToast();
  const popup = usePopup();
  const { t } = useI18n();
  const [chosenType, setChosenType] = useState<DocType | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const docTypes = useDocTypeOptions();

  const handleResyncDefaults = async () => {
    const ok = await popup.confirm({
      title: t('templates.list.resync'),
      message: t('templates.list.resyncConfirm'),
      confirmLabel: t('templates.list.resync'),
    });
    if (!ok) return;
    try {
      const body: any = await templatesApi.resyncDefaults();
      toast.success(t('templates.list.resyncDone', { count: body.count }));
      onReload?.();
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || t('templates.list.resyncError'));
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, TemplateRow[]> = {};
    for (const row of data) (map[row.docType] ??= []).push(row);
    return map;
  }, [data]);

  // Por defecto, el primer tipo que tenga plantillas.
  const selectedType =
    chosenType ??
    docTypes.find((option) => (grouped[option.value]?.length ?? 0) > 0)?.value ??
    docTypes[0]?.value ??
    null;

  const query = search.trim().toLowerCase();
  const rows = query
    ? data.filter(
        (row) =>
          row.name.toLowerCase().includes(query) ||
          getDocTypeLabel(row.docType).toLowerCase().includes(query),
      )
    : selectedType
      ? (grouped[selectedType] ?? [])
      : [];

  // La plantilla que se enseña: la elegida o, si no sigue en la lista, la predeterminada.
  const selected =
    rows.find((row) => row.id === chosenId) ?? rows.find((row) => row.isDefault) ?? rows[0] ?? null;

  const { url: previewUrl, loading: previewLoading, failed } = useTemplatePreviewPdf(selected);

  const typeSections = useMemo<ListSectionData[]>(() => {
    const groups: Record<string, DocType[]> = { sales: [], purchase: [], own: [], other: [] };
    for (const { value } of docTypes) {
      if (isUserDocType(value)) groups.own.push(value);
      else if (isFreeType(value)) groups.other.push(value);
      else groups[getCachedDocType(value)?.side === 'purchase' ? 'purchase' : 'sales'].push(value);
    }
    return Object.entries(groups)
      .filter(([, list]) => list.length > 0)
      .map(([key, list]) => ({
        key,
        label: t(`templates.list.groups.${key}`),
        items: list.map((docType) => ({
          id: docType,
          title: getDocTypeLabel(docType),
          badge: <Badge variant="neutral">{grouped[docType]?.length ?? 0}</Badge>,
          onClick: () => {
            setSearch('');
            setChosenType(docType);
            setChosenId(null);
          },
        })),
      }));
  }, [docTypes, grouped, t]);

  const editorLabel = (row: TemplateRow) => t(`templates.list.editors.${row.editor ?? 'visual'}`);

  const moreActions = (row: TemplateRow) => [
    ...(row.editor !== 'designer'
      ? [
          {
            label: t('templates.list.design'),
            icon: <Palette size={14} />,
            onClick: () => onDesign(row),
          },
        ]
      : []),
    ...(onGenerate && isFreeType(row.docType)
      ? [
          {
            label: t('templates.list.generateDocument'),
            icon: <FileDown size={14} />,
            onClick: () => onGenerate(row),
          },
        ]
      : []),
    {
      label: t('templates.list.duplicate'),
      icon: <Copy size={14} />,
      onClick: () => void onDuplicate(row),
    },
    {
      label: t('templates.list.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      separatorBefore: true,
      onClick: () => void onDelete(row),
    },
  ];

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={t('templates.list.title')}
        subtitle={t('templates.list.subtitle')}
        icon={<FileCode size={18} />}
        size="sm"
        divider
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DropdownMenu
              align="end"
              aria-label={t('templates.list.more')}
              items={[
                {
                  label: t('templates.list.resync'),
                  icon: <RefreshCw size={14} />,
                  onClick: () => void handleResyncDefaults(),
                },
              ]}
            >
              <Button type="button" variant="ghost" aria-label={t('templates.list.more')}>
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenu>
            {onAiGenerate && (
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                title={t('templates.list.aiTooltip')}
                onClick={onAiGenerate}
              >
                <Sparkles size={14} /> {t('templates.list.aiGenerate')}
              </Button>
            )}
            <Button
              type="button"
              className="gap-2"
              onClick={() => onCreate(selectedType ?? ('SINV' as DocType))}
            >
              <Plus size={14} /> {t('templates.list.newTemplate')}
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[230px_300px_1fr] gap-4 items-start">
          <Card noPadding>
            <List
              sections={typeSections}
              activeId={query ? null : selectedType}
              density="compact"
              staggerAnimation={false}
              aria-label={t('templates.list.docTypeHeader')}
            />
          </Card>

          <Card noPadding>
            <div className="p-3 border-b border-border-subtle">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t('templates.list.search')}
                clearable
                inputSize="sm"
              />
            </div>
            {rows.length === 0 ? (
              <EmptyState
                variant="compact"
                icon={<AlertCircle size={16} />}
                title={query ? t('templates.list.noMatches') : t('templates.list.emptyForType')}
                action={
                  query || !selectedType ? undefined : (
                    <Button size="sm" className="gap-1" onClick={() => onCreate(selectedType)}>
                      <Plus size={12} /> {t('templates.list.newTemplate')}
                    </Button>
                  )
                }
              />
            ) : (
              <List
                activeId={selected?.id}
                density="compact"
                staggerAnimation={false}
                aria-label={t('templates.list.colName')}
                items={rows.map((row) => ({
                  id: row.id,
                  icon: <FileText size={15} />,
                  title: row.name,
                  subtitle: query
                    ? getDocTypeLabel(row.docType)
                    : `${editorLabel(row)}${row.updatedAt ? ` · ${formatDateTime(row.updatedAt)}` : ''}`,
                  content: (row.isDefault || row.isFactoryDefault) && (
                    <span className="flex items-center gap-1 pt-1">
                      {row.isDefault && (
                        <Badge variant="success">{t('templates.list.defaultBadge')}</Badge>
                      )}
                      {row.isFactoryDefault && (
                        <Badge variant="neutral">{t('templates.list.factoryBadge')}</Badge>
                      )}
                    </span>
                  ),
                  onClick: () => setChosenId(row.id),
                }))}
              />
            )}
          </Card>

          {selected ? (
            <Card
              noPadding
              title={selected.name}
              subtitle={`${getDocTypeLabel(selected.docType)} · ${editorLabel(selected)}`}
              headerAction={
                <div className="flex items-center gap-2">
                  {!selected.isDefault && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                      onClick={() => void onSetDefault(selected)}
                    >
                      <Star size={14} /> {t('templates.list.setDefault')}
                    </Button>
                  )}
                  <Button size="sm" className="gap-2" onClick={() => onEdit(selected)}>
                    <Pencil size={14} /> {t('templates.list.edit')}
                  </Button>
                  <DropdownMenu
                    align="end"
                    aria-label={t('templates.list.more')}
                    items={moreActions(selected)}
                  >
                    <Button variant="ghost" size="sm" aria-label={t('templates.list.more')}>
                      <MoreHorizontal size={16} />
                    </Button>
                  </DropdownMenu>
                </div>
              }
            >
              <div className="h-[calc(100vh-300px)] min-h-[420px] bg-bg-muted flex items-center justify-center">
                {previewUrl ? (
                  <iframe
                    src={`${previewUrl}#navpanes=0`}
                    title={selected.name}
                    className="w-full h-full border-0"
                  />
                ) : previewLoading ? (
                  <Loader label={t('templates.preview.generating')} />
                ) : (
                  failed && (
                    <EmptyState
                      variant="compact"
                      icon={<AlertCircle size={16} />}
                      title={t('templates.list.previewFailed')}
                    />
                  )
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<FileCode size={18} />}
                title={t('templates.list.nothingSelected')}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
