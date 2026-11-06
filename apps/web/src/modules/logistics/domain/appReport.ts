/** Lo que alguien cuenta sobre la propia aplicación, no sobre el reparto. */
export interface AppReport {
  id: string;
  userId: string | null;
  userName: string | null;
  category: string;
  message: string;
  status: 'open' | 'resolved';
  context: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  hasPhoto?: boolean;
  /** Solo al abrir uno: en el listado no viaja, pesa demasiado. */
  photo?: string | null;
}
