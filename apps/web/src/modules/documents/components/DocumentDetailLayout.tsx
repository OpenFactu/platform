import React from 'react';
import { Badge, Button, PageHeader } from '@openfactu/ui';
import { ArrowLeft } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';

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
  const mobile = useIsMobile();
  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-300">
      <PageHeader
        size="lg"
        divider
        className="pb-6"
        // En móvil la flecha va en la misma línea que el antetítulo, no sola
        // en una fila encima del título.
        breadcrumbs={
          <div className="flex items-center gap-2">
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
            {mobile && (
              <span className="min-w-0 truncate text-[10px] font-mono font-semibold uppercase tracking-[1.5px] text-fg-subtle">
                {breadcrumb}
              </span>
            )}
          </div>
        }
        eyebrow={mobile ? undefined : breadcrumb}
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
