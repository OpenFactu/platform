/** Orden de paradas del planificador. Sin pantalla: se prueba con datos. */

export type Coords = [number, number];

const squaredDistance = (a: Coords, b: Coords) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

/** Reordena minimizando la distancia total, partiendo del primer punto. */
export function nearestNeighborOrder(points: Coords[]): number[] {
  if (points.length <= 1) return points.map((_, i) => i);
  const order = [0];
  const used = new Set([0]);
  while (order.length < points.length) {
    const last = points[order[order.length - 1]];
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;
      const distance = squaredDistance(last, points[i]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    order.push(best);
    used.add(best);
  }
  return order;
}

/** Límites que encuadran unos puntos. Sin puntos, `null`. */
export function boundsOfPoints(points: Coords[]) {
  if (points.length === 0) return null;
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}
