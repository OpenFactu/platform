/**
 * Comprueba que `callRouter` (core/dataimport/RouterDispatcher) ejecuta de
 * verdad los handlers de la API en proceso, sin HTTP.
 *
 * La prueba no es "responde 200": crea tres interlocutores dentro de un grupo
 * con `codePrefix` y verifica que los códigos salen PRE-00001/2/3. Esa
 * numeración correlativa SOLO existe dentro del handler de `partners.ts`, así
 * que si sale bien es que se ejecutó el código real y no una copia. De paso
 * comprueba que la auditoría se escribió y que un error de negocio (NIF
 * inválido) vuelve como 400 en vez de reventar.
 *
 * Todo lo que crea lo borra al terminar. Ejecuta con:
 *   npx ts-node src/scripts/check-router-dispatch.ts [tenantId]
 */

import crypto from 'crypto';
import { eq, and, like, desc } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { callRouter } from '../core/dataimport/RouterDispatcher';
import partnersRouter from '../api/partners';
import * as schema from '../db/schema';

const PREFIX = 'ZZTEST';

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`   ✅ ${label}`);
  } else {
    failures++;
    console.log(`   ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const publicDb = ClientFactory.getClient('public');

  const tenantId =
    process.argv[2] || (await publicDb.select().from(schema.tenants).limit(1))[0]?.id;
  if (!tenantId) throw new Error('No hay ningún tenant en la base de datos.');

  const [tenant] = await publicDb
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  if (!tenant) throw new Error(`Tenant ${tenantId} no encontrado.`);

  const tenantClient = await ClientFactory.getTenantClient(tenantId);
  const [user] = await publicDb.select().from(schema.globalUsers).limit(1);

  console.log(`\n[dispatch] Tenant "${tenant.name}" (schema ${tenant.schemaName})`);
  console.log(`[dispatch] Usuario ${user?.email || '(ninguno)'}\n`);

  const ctx = {
    tenantClient,
    tenantId,
    tenantSchema: tenant.schemaName,
    user: {
      id: user?.id || 'script',
      role: 'ADMIN',
      email: user?.email,
      tenantId,
    },
  };

  const groupId = crypto.randomUUID();
  const createdPartnerIds: string[] = [];

  try {
    // Grupo con prefijo — la pieza que dispara la numeración del handler.
    await tenantClient.insert(schema.partnerGroups).values({
      id: groupId,
      code: PREFIX,
      name: 'Grupo de prueba del dispatcher',
      codePrefix: PREFIX,
      isCustomer: true,
      isVendor: false,
    });

    console.log('1) Tres altas seguidas por el router real');
    for (let i = 1; i <= 3; i++) {
      const result = await callRouter(partnersRouter, {
        method: 'POST',
        url: '/',
        originalUrl: '/api/partners',
        body: { name: `Interlocutor de prueba ${i}`, groupId },
        ctx,
      });

      if (!result.ok) {
        check(`fila ${i} creada`, false, `status ${result.status}: ${result.data?.error}`);
        continue;
      }
      createdPartnerIds.push(result.data.id);
      const expected = `${PREFIX}-${String(i).padStart(5, '0')}`;
      check(
        `fila ${i} → código ${result.data.code}`,
        result.data.code === expected,
        `esperado ${expected}`,
      );
    }

    console.log('\n2) Los interlocutores existen de verdad en la base de datos');
    const rows = await tenantClient
      .select()
      .from(schema.businessPartners)
      .where(like(schema.businessPartners.code, `${PREFIX}-%`));
    check(`${rows.length} filas en BusinessPartner`, rows.length === 3, `esperadas 3`);

    console.log('\n3) La auditoría se escribió (el handler la dispara sin await)');
    await new Promise((r) => setTimeout(r, 500));
    let audited = 0;
    for (const id of createdPartnerIds) {
      const [log] = await tenantClient
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.entityId, id),
            eq(schema.auditLogs.entityType, 'BusinessPartner'),
          ),
        )
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(1);
      if (log) audited++;
    }
    check(
      `${audited} de ${createdPartnerIds.length} altas auditadas`,
      audited === createdPartnerIds.length,
    );

    console.log('\n4) Un error de negocio vuelve como 400, no como excepción');
    const bad = await callRouter(partnersRouter, {
      method: 'POST',
      url: '/',
      originalUrl: '/api/partners',
      body: { name: 'NIF inválido', nif: 'ESTO-NO-ES-UN-NIF', countryCode: 'ES', groupId },
      ctx,
    });
    check(
      `status ${bad.status} con mensaje "${bad.data?.error}"`,
      bad.status === 400 && typeof bad.data?.error === 'string',
      'esperado 400 con error legible',
    );
    if (bad.ok && bad.data?.id) createdPartnerIds.push(bad.data.id);

    console.log('\n5) PATCH por el mismo camino');
    if (createdPartnerIds[0]) {
      const patched = await callRouter(partnersRouter, {
        method: 'PATCH',
        url: `/${createdPartnerIds[0]}`,
        originalUrl: `/api/partners/${createdPartnerIds[0]}`,
        body: { email: 'dispatcher@test.local' },
        ctx,
      });
      check(
        `email actualizado (status ${patched.status})`,
        patched.ok && patched.data?.email === 'dispatcher@test.local',
        JSON.stringify(patched.data)?.slice(0, 120),
      );
    }

    console.log('\n6) Una ruta que no existe devuelve 404 en vez de colgarse');
    const missing = await callRouter(partnersRouter, {
      method: 'POST',
      url: '/no-existe-esta-ruta',
      body: {},
      ctx,
      timeoutMs: 5000,
    });
    check(`status ${missing.status}`, missing.status === 404);
  } finally {
    console.log('\n[dispatch] Limpiando…');
    try {
      const all = await tenantClient
        .select()
        .from(schema.businessPartners)
        .where(like(schema.businessPartners.code, `${PREFIX}-%`));
      for (const p of all) {
        await tenantClient
          .delete(schema.partnerAddresses)
          .where(eq(schema.partnerAddresses.partnerId, p.id));
        await tenantClient
          .delete(schema.businessPartners)
          .where(eq(schema.businessPartners.id, p.id));
      }
      await tenantClient.delete(schema.partnerGroups).where(eq(schema.partnerGroups.id, groupId));
      console.log(`[dispatch] Borrados ${all.length} interlocutores y el grupo de prueba.`);
    } catch (e: any) {
      console.error('[dispatch] No se pudo limpiar del todo:', e?.message);
    }
    await ClientFactory.disconnectAll();
  }

  console.log(
    failures === 0
      ? '\n✅ El dispatcher ejecuta los handlers reales.\n'
      : `\n❌ ${failures} comprobación(es) fallidas.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('\n[dispatch] Error fatal:', e?.stack || e?.message || e);
  process.exitCode = 1;
});
