CREATE TABLE IF NOT EXISTS "{{schema}}"."TimeclockCredential" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "{{schema}}"."Employee"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('rfid', 'qr')),
  "secretHash" TEXT NOT NULL,
  "secretEncrypted" TEXT,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "revokedAt" TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TimeclockCredential_active_value" ON "{{schema}}"."TimeclockCredential" ("kind", "secretHash") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "TimeclockCredential_active_qr" ON "{{schema}}"."TimeclockCredential" ("employeeId") WHERE "revokedAt" IS NULL AND "kind" = 'qr';
CREATE TABLE IF NOT EXISTS "{{schema}}"."TimeclockDevice" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "location" TEXT,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('paired', 'standalone')),
  "kioskId" TEXT REFERENCES "{{schema}}"."TimeclockKiosk"("id") ON DELETE RESTRICT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "lastSeenAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CHECK (("mode" = 'paired' AND "kioskId" IS NOT NULL) OR ("mode" = 'standalone' AND "kioskId" IS NULL))
);
CREATE TABLE IF NOT EXISTS "{{schema}}"."TimeclockIdentification" (
  "id" TEXT PRIMARY KEY,
  "kioskId" TEXT NOT NULL REFERENCES "{{schema}}"."TimeclockKiosk"("id") ON DELETE CASCADE,
  "deviceId" TEXT REFERENCES "{{schema}}"."TimeclockDevice"("id"),
  "employeeId" TEXT NOT NULL REFERENCES "{{schema}}"."Employee"("id") ON DELETE CASCADE,
  "credentialId" TEXT REFERENCES "{{schema}}"."TimeclockCredential"("id"),
  "method" TEXT NOT NULL CHECK ("method" IN ('pin','qr','rfid')),
  "expiresAt" TIMESTAMP NOT NULL, "consumedAt" TIMESTAMP, "cancelledAt" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TimeclockIdentification_kiosk_expiry" ON "{{schema}}"."TimeclockIdentification" ("kioskId", "expiresAt");
CREATE TABLE IF NOT EXISTS "{{schema}}"."TimeclockRequest" (
  "id" TEXT PRIMARY KEY, "actorKey" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL, "responseJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP NOT NULL,
  UNIQUE ("actorKey", "requestId")
);
ALTER TABLE "{{schema}}"."TimeclockEntry" ADD COLUMN IF NOT EXISTS "method" TEXT;
ALTER TABLE "{{schema}}"."TimeclockEntry" ADD COLUMN IF NOT EXISTS "kioskId" TEXT REFERENCES "{{schema}}"."TimeclockKiosk"("id") ON DELETE SET NULL;
ALTER TABLE "{{schema}}"."TimeclockEntry" ADD COLUMN IF NOT EXISTS "deviceId" TEXT REFERENCES "{{schema}}"."TimeclockDevice"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "TimeclockEntry_employee_at_idx" ON "{{schema}}"."TimeclockEntry" ("employeeId", "at");
