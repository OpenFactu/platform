import { Loader2 } from 'lucide-react';

export const PageLoading = () => (
  <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-fg-muted">
    <Loader2 aria-hidden="true" size={18} className="animate-spin" />
    Cargando…
  </div>
);
