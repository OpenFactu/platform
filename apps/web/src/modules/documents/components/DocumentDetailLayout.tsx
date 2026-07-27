import React from 'react';
import { Badge, Button, PageHeader } from '@openfactu/ui';
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
      <PageHeader
        size="lg"
        divider
        className="pb-6"
        breadcrumbs={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            aria-label="Volver"
            className="p-2.5 shrink-0 self-start"
          >
            <ArrowLeft size={18} />
          </Button>
        }
        eyebrow={breadcrumb}
        title={
          <>
            {title}
            {status && (
              <Badge variant={status.variant} className="uppercase tracking-wide">
                {status.label}
              </Badge>
            )}
          </>
        }
        actions={actions}
      />
      {children}
    </div>
  );
};
