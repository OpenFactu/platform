-- Problemas e ideas sobre la propia aplicación, no sobre el reparto.
CREATE TABLE IF NOT EXISTS "AppReport" (
  id TEXT PRIMARY KEY,
  "userId" TEXT,
  "userName" TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  message TEXT NOT NULL,
  photo TEXT,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP
);
