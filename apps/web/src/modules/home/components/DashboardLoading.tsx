import React from 'react';
import { Card, Skeleton, SkeletonList } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

/** Entrada escalonada: cada bloque aparece un poco después que el anterior. */
const Appear: React.FC<{ i: number; className?: string; children: React.ReactNode }> = ({
  i,
  className,
  children,
}) => (
  <div
    className={`animate-fade-up animate-duration-500 animate-fill-both ${className ?? ''}`}
    style={{ animationDelay: `${i * 70}ms` }}
  >
    {children}
  </div>
);

const KpiSkeleton: React.FC<{ i: number; compact?: boolean }> = ({ i, compact }) => (
  <Appear i={i}>
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Skeleton animation="shimmer" width={96} height={10} delayMs={i * 60} />
          <Skeleton
            animation="shimmer"
            width={compact ? 112 : 144}
            height={compact ? 24 : 32}
            delayMs={i * 60}
          />
          <Skeleton animation="shimmer" width={80} height={10} delayMs={i * 60} />
        </div>
        <Skeleton
          animation="shimmer"
          variant="rect"
          className="hidden sm:block"
          width={40}
          height={40}
          radius="xs"
        />
      </div>
    </Card>
  </Appear>
);

/** Barras de alturas variadas, como un gráfico a medio dibujar. */
const ChartSkeleton: React.FC = () => (
  <div className="flex h-48 items-end gap-2 sm:gap-3" aria-hidden>
    {[45, 70, 35, 85, 60, 95, 50, 75, 40, 65, 80, 55].map((h, i) => (
      <div key={i} className="flex flex-1 flex-col justify-end h-full">
        <Skeleton
          animation="shimmer"
          variant="rect"
          radius="xs"
          width="100%"
          height={`${h}%`}
          delayMs={i * 90}
        />
      </div>
    ))}
  </div>
);

/**
 * Carga del Dashboard con la forma real de la página: cabecera, las dos filas
 * de KPI, el gráfico con el donut y las listas; con brillo y entrada escalonada.
 */
export const DashboardLoading: React.FC = () => {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-label={t('home.dashboard.loadingAria')}
      className="p-4 w-full space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton animation="shimmer" width={224} height={28} />
          <Skeleton animation="shimmer" className="max-w-full" width={288} height={12} />
        </div>
        <div className="flex gap-2">
          <Skeleton animation="shimmer" variant="rect" radius="xs" width={160} height={32} />
          <Skeleton animation="shimmer" variant="rect" radius="full" width={80} height={32} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <KpiSkeleton key={i} i={i} />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[4, 5, 6, 7].map((i) => (
          <KpiSkeleton key={i} i={i} compact />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Appear i={8} className="lg:col-span-2">
          <Card>
            <div className="space-y-4">
              <Skeleton animation="shimmer" width={160} height={16} />
              <ChartSkeleton />
            </div>
          </Card>
        </Appear>
        <Appear i={9}>
          <Card>
            <div className="flex flex-col items-center gap-4">
              <Skeleton animation="shimmer" className="self-start" width={128} height={16} />
              <Skeleton animation="shimmer" variant="circle" width={160} height={160} />
              <Skeleton animation="shimmer" lines={2} className="w-full" />
            </div>
          </Card>
        </Appear>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[10, 11].map((i) => (
          <Appear key={i} i={i}>
            <Card>
              <div className="space-y-3">
                <Skeleton animation="shimmer" width={144} height={16} />
                <SkeletonList rows={4} showAvatar showMeta animation="shimmer" />
              </div>
            </Card>
          </Appear>
        ))}
      </div>
    </div>
  );
};
