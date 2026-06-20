import { register, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

// 1. Métricas por defecto de Node.js (GC, event loop, memoria, etc.)
collectDefaultMetrics({ register });

// 2. Contador de requests HTTP por método, ruta y status
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// 3. Histograma de duración de requests HTTP
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// 4. Exportar el registro para el endpoint /metrics
export { register };
