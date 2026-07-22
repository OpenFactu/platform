/**
 * Autenticación en dos pasos (2FA) por TOTP para el usuario autenticado.
 *
 *   - GET  /api/2fa/status  → { enabled }
 *   - POST /api/2fa/setup   → genera secreto (pendiente) + QR (otpauth)
 *   - POST /api/2fa/enable  → { code } valida y activa; devuelve códigos de respaldo
 *   - POST /api/2fa/disable → { code } valida (TOTP o backup) y desactiva
 *
 * Los datos viven en `GlobalUser` (schema public). El secreto se guarda cifrado
 * (AES-GCM) y los códigos de respaldo como hashes SHA-256 de un solo uso.
 */
import { Router } from 'express';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ClientFactory } from '../core/tenant/ClientFactory';
import {
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  hashCode,
} from '../core/auth/totpCrypto';

const router = Router();
const ISSUER = 'Keirost';

/**
 * Verifica un código de 2FA contra el secreto TOTP o, si no coincide, contra los
 * códigos de respaldo (consumiéndolo). Devuelve `{ ok, usedBackup }` y, si se usó
 * un backup, la lista de hashes restante para persistir.
 */
export function verifyTwoFactor(
  code: string,
  encryptedSecret: string | null,
  backupCodesJson: string | null,
): { ok: boolean; usedBackup: boolean; remainingBackups?: string[] } {
  const clean = (code || '').replace(/\s|-/g, '');
  if (!clean) return { ok: false, usedBackup: false };

  // 1) TOTP
  if (encryptedSecret) {
    try {
      const secret = decryptSecret(encryptedSecret);
      if (authenticator.verify({ token: clean, secret })) {
        return { ok: true, usedBackup: false };
      }
    } catch {
      /* secreto corrupto → cae a backup */
    }
  }

  // 2) Código de respaldo (un solo uso)
  if (backupCodesJson) {
    try {
      const hashes: string[] = JSON.parse(backupCodesJson);
      const incoming = hashCode(code);
      const idx = hashes.indexOf(incoming);
      if (idx !== -1) {
        const remaining = hashes.filter((_, i) => i !== idx);
        return { ok: true, usedBackup: true, remainingBackups: remaining };
      }
    } catch {
      /* json inválido → falla */
    }
  }

  return { ok: false, usedBackup: false };
}

/**
 * GET /api/2fa/status — indica si el usuario tiene 2FA activo.
 */
router.get('/status', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const publicDb = ClientFactory.getClient('public');
    const [row] = await publicDb
      .select({ totpEnabled: schema.globalUsers.totpEnabled })
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, userId));
    res.json({ enabled: !!row?.totpEnabled });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/**
 * POST /api/2fa/setup — genera un secreto TOTP pendiente (no activa aún) y
 * devuelve el otpauth URL + un QR como data-URL para escanear.
 */
router.post('/setup', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const publicDb = ClientFactory.getClient('public');
    const [user] = await publicDb
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, userId));
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    // Guardamos el secreto cifrado pero SIN activar (totpEnabled queda false).
    await publicDb
      .update(schema.globalUsers)
      .set({ totpSecret: encryptSecret(secret), totpEnabled: false, updatedAt: new Date() })
      .where(eq(schema.globalUsers.id, userId));

    res.json({ otpauth, qrDataUrl, secret });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/**
 * POST /api/2fa/enable — valida el primer código y activa el 2FA. Devuelve los
 * códigos de respaldo en claro UNA sola vez.
 */
router.post('/enable', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Falta el código' });

    const publicDb = ClientFactory.getClient('public');
    const [user] = await publicDb
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, userId));
    if (!user?.totpSecret) {
      return res.status(400).json({ error: 'No hay una configuración de 2FA pendiente' });
    }

    let secret: string;
    try {
      secret = decryptSecret(user.totpSecret);
    } catch {
      return res.status(400).json({ error: 'Configuración de 2FA inválida, reinténtalo' });
    }
    if (!authenticator.verify({ token: String(code).replace(/\s|-/g, ''), secret })) {
      return res.status(400).json({ error: 'Código incorrecto' });
    }

    const backupCodes = generateBackupCodes(8);
    const backupHashes = backupCodes.map(hashCode);
    await publicDb
      .update(schema.globalUsers)
      .set({
        totpEnabled: true,
        totpBackupCodes: JSON.stringify(backupHashes),
        updatedAt: new Date(),
      })
      .where(eq(schema.globalUsers.id, userId));

    res.json({ enabled: true, backupCodes });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

/**
 * POST /api/2fa/disable — valida un código (TOTP o backup) y desactiva el 2FA,
 * limpiando secreto y códigos.
 */
router.post('/disable', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Falta el código' });

    const publicDb = ClientFactory.getClient('public');
    const [user] = await publicDb
      .select()
      .from(schema.globalUsers)
      .where(eq(schema.globalUsers.id, userId));
    if (!user?.totpEnabled) {
      return res.status(400).json({ error: 'El 2FA no está activo' });
    }

    const check = verifyTwoFactor(String(code), user.totpSecret, user.totpBackupCodes);
    if (!check.ok) return res.status(400).json({ error: 'Código incorrecto' });

    await publicDb
      .update(schema.globalUsers)
      .set({
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodes: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.globalUsers.id, userId));

    res.json({ enabled: false });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
