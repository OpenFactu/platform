import React from 'react';
import { Badge, Button } from '@openfactu/ui';
import { ArrowLeft } from 'lucide-react';

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface Props {
  onBack: () => void;
  breadcrumb: string;
  title: string;
  status?: { label: string; variant: StatusVariant };
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const DocumentDetailLayout: React.FC<Props> = ({
  onBack,
  breadcrumb,
  title,
  status,
  actions,
  children,
}) => {
  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300">
      <div className="space-y-3 pb-6 border-b border-border-subtle">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            aria-label="Volver"
            className="p-2.5 shrink-0"
          >
            <ArrowLeft size={18} />
          </Button>
          <div className="flex-1" />
          {actions && <div className="shrink-0 max-w-full">{actions}</div>}
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-subtle leading-none pt-2">
          {breadcrumb}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-black text-fg-default tracking-tight leading-none font-display">
            {title}
          </h1>
          {status && (
            <Badge variant={status.variant} className="uppercase tracking-wide">
              {status.label}
            </Badge>
          )}
        </div>
      </div>
      {children}
    </div>
  );
};
