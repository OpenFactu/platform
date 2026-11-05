export interface LogisticsSummary {
  delivery: { total: number; onTime: number; late: number; unknown: number };
  incidents: { reason: string; count: number }[];
  drivers: {
    driver: string;
    stops: number;
    delivered: number;
    postponed: number;
    incidents: number;
  }[];
}

/** El porcentaje a tiempo, sobre las entregas que tenían fecha prevista. */
export function onTimeRate(delivery: LogisticsSummary['delivery']): number | null {
  const known = delivery.onTime + delivery.late;
  return known === 0 ? null : Math.round((delivery.onTime / known) * 100);
}
