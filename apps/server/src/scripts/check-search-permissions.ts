/**
 * Comprueba que el buscador global recorta sus resultados por permiso.
 *
 * Era una fuga real: `/api/search` mira doce entidades de una vez —entre ellas
 * empleados, con nombre, DNI y correo— y no comprobaba nada. Con tres letras,
 * cualquiera con sesión sacaba la plantilla entera y los asientos contables.
 *
 * Se despacha el router en proceso (mismo `callRouter` del importador) con
 * tres perfiles: administrador, un usuario que solo ve artículos y un usuario
 * sin nada.
 *
 *   npx ts-node --transpile-only src/scripts/check-search-permissions.ts
 */

import { eq } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { callRouter } from '../core/dataimport/RouterDispatcher';
import { invalidatePermissions } from '../api/middleware/requirePermission';
import searchRouter from '../api/search';
import * as schema from '../db/schema';

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`   ✅ ${label}`);
  else {
    failures++;
    console.log(`   ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const SECCIONES = [
  'partners',
  'items',
  'salesInvoices',
  'purchaseInvoices',
  'salesDeliveryNotes',
  'purchaseDeliveryNotes',
  'salesOrders',
  'purchaseOrders',
  'journalEntries',
  'employees',
  'internalOrders',
  'chartOfAccounts',
];

/** Secciones que traen algún resultado. */
function conResultados(data: any): string[] {
  return SECCIONES.filter((s) => Array.isArray(data?.[s]) && data[s].length > 0);
}

async function main() {
  const publicDb = ClientFactory.getClient('public');
  const [tenant] = await publicDb.select().from(schema.tenants).limit(1);
  const db = await ClientFactory.getTenantClient(tenant.id);

  console.log(`\n[buscador] Tenant "${tenant.name}"\n`);

  // Un usuario de verdad al que se le montan permisos distintos en cada caso.
  // Se usa su membresía real, así que hay que dejarla como estaba.
  const [membership] = await publicDb
    .select()
    .from(schema.userTenantMemberships)
    .where(eq(schema.userTenantMemberships.tenantId, tenant.id))
    .limit(1);

  if (!membership) {
    console.log('   ⚠ Este tenant no tiene ninguna membresía; no se puede probar.');
    await ClientFactory.disconnectAll();
    return;
  }

  const original = { role: membership.role, permissions: membership.permissions };

  // El buscador exige dos caracteres, así que el término sale de un dato real.
  // Se prefiere el nombre de un EMPLEADO: es la sección que motivó el arreglo,
  // y con un término que solo case con artículos la prueba no demostraría nada.
  const [algunEmpleado] = await db.select().from(schema.employees).limit(1);
  const [algunItem] = await db.select().from(schema.items).limit(1);
  const termino = (algunEmpleado?.firstName || algunItem?.name || 'ab').slice(0, 3);
  console.log(
    `[buscador] Buscando "${termino}"${algunEmpleado ? ' (nombre de un empleado real)' : ''}\n`,
  );

  const buscar = (user: any) =>
    callRouter(searchRouter, {
      method: 'GET',
      url: `/?q=${encodeURIComponent(termino)}`,
      query: { q: termino },
      ctx: { tenantClient: db, tenantId: tenant.id, tenantSchema: tenant.schemaName, user },
    });

  const aplicar = async (role: string, permissions: any) => {
    await publicDb
      .update(schema.userTenantMemberships)
      .set({ role, permissions: permissions === null ? null : JSON.stringify(permissions) })
      .where(eq(schema.userTenantMemberships.id, membership.id));
    invalidatePermissions(membership.userId);
  };

  try {
    console.log('1) Administrador — lo ve todo');
    await aplicar('ADMIN', null);
    const admin = await buscar({ id: membership.userId, role: 'ADMIN' });
    const sectionesAdmin = conResultados(admin.data);
    check(`status ${admin.status}`, admin.ok);
    check(
      `encuentra en ${sectionesAdmin.length} secciones: ${sectionesAdmin.join(', ') || '(base vacía)'}`,
      admin.ok,
    );
    if (sectionesAdmin.length === 0) {
      console.log(
        '   ⚠ La base no tiene datos que casen con "a"; el resto de la prueba no dice nada.',
      );
      return;
    }

    // La prueba decisiva: si el administrador NO encuentra empleados con este
    // término, el caso 2 no demuestra nada aunque salga en verde.
    const empleadosVisiblesParaAdmin = (admin.data?.employees || []).length;
    check(
      `el administrador encuentra ${empleadosVisiblesParaAdmin} empleado(s) — hay algo que ocultar`,
      empleadosVisiblesParaAdmin > 0,
      'sin empleados en el resultado, el caso siguiente no prueba nada',
    );

    console.log('\n2) Usuario que SOLO puede ver artículos');
    await aplicar('USER', { '/items': { read: true, write: false, delete: false } });
    const soloItems = await buscar({ id: membership.userId, role: 'USER' });
    const seccionesItems = conResultados(soloItems.data);
    check(
      `solo devuelve artículos: ${seccionesItems.join(', ') || '(ninguna)'}`,
      seccionesItems.every((s) => s === 'items'),
    );
    check(
      'no se filtran empleados',
      (soloItems.data?.employees || []).length === 0,
      `${(soloItems.data?.employees || []).length} empleados devueltos`,
    );
    check('no se filtran asientos', (soloItems.data?.journalEntries || []).length === 0);
    check(
      'el total cuadra con lo devuelto',
      soloItems.data?.total === seccionesItems.reduce((n, s) => n + soloItems.data[s].length, 0),
    );

    console.log('\n3) Usuario sin ningún permiso');
    await aplicar('USER', {});
    const sinNada = await buscar({ id: membership.userId, role: 'USER' });
    check(`status ${sinNada.status}`, sinNada.ok);
    check(
      `no encuentra nada (total ${sinNada.data?.total})`,
      conResultados(sinNada.data).length === 0 && sinNada.data?.total === 0,
    );
  } finally {
    console.log('\n[buscador] Restaurando la membresía original…');
    await publicDb
      .update(schema.userTenantMemberships)
      .set({ role: original.role, permissions: original.permissions })
      .where(eq(schema.userTenantMemberships.id, membership.id));
    invalidatePermissions(membership.userId);
    await ClientFactory.disconnectAll();
  }

  console.log(
    failures === 0
      ? '\n✅ El buscador solo devuelve lo que el usuario puede ver.\n'
      : `\n❌ ${failures} comprobación(es) fallidas.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('\n[buscador] Error fatal:', e?.stack || e?.message || e);
  process.exitCode = 1;
});
