import { Progress, ShimmerText, Spinner } from '@openfactu/ui';

/**
 * Mientras carga una pantalla: una barra fina arriba al instante y, solo si
 * tarda (más de ~300 ms), el indicador central. Así las cargas rápidas no
 * dejan un parpadeo de spinner.
 */
export const PageLoading = () => (
  <div role="status" aria-label="Cargando" className="relative flex-1 min-h-48">
    <Progress indeterminate glow size="sm" className="absolute inset-x-0 top-0 rounded-none" />
    <div
      className="flex flex-col items-center justify-center gap-4 py-20 animate-fade animate-duration-300 animate-fill-both"
      style={{ animationDelay: '300ms' }}
    >
      <Spinner variant="orbit" size="lg" />
      <ShimmerText as="p" className="text-sm font-medium text-fg-muted">
        Cargando…
      </ShimmerText>
    </div>
  </div>
);
