import React from 'react';
import { Button, Card, Loader } from '@openfactu/ui';
import { Eye } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  previewUrl: string | null;
  previewing: boolean;
  onRefresh: () => void;
}

export const PreviewPane: React.FC<Props> = ({ previewUrl, previewing, onRefresh }) => {
  const { t } = useI18n();
  return (
    <Card
      className="h-full border-border-subtle bg-bg-muted"
      noPadding
      bodyClassName="h-full flex flex-col overflow-hidden p-3"
    >
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="text-[10px] font-black text-fg-subtle uppercase tracking-widest flex items-center gap-2">
          <Eye size={12} /> {t('templates.preview.title')}
          {previewing && <Loader />}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
          {t('templates.preview.refresh')}
        </Button>
      </div>
      <div className="flex-1 min-h-0 bg-bg-card border border-border-default rounded-lg overflow-hidden relative">
        {previewUrl ? (
          <iframe
            src={previewUrl}
            title={t('templates.preview.title')}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-fg-subtle text-sm italic">
            {t('templates.preview.generating')}
          </div>
        )}
      </div>
    </Card>
  );
};
