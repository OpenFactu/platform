/**
 * Prueba de extremo a extremo del módulo de formularios contra la base local
 * y el servidor en marcha (http://localhost:3000): crea un formulario con
 * secciones, saltos, archivo y cuestionario; responde por la API pública
 * (subida real con multipart), edita con el enlace de edición, comprueba el
 * máximo de respuestas, la nota, la corrección manual y el resumen; y lo
 * borra todo al final. Si el flag `formsEnabled` estaba apagado, lo enciende
 * mientras dura y lo deja como estaba.
 *
 *   npx ts-node --transpile-only src/scripts/check-forms.ts [tenantId] [--keep]
 *
 * Con `--keep` el formulario se queda (para abrir /f/:tenantId/:slug a mano).
 */
import '../core/documents/registerDocumentTypes';
import { eq, inArray } from 'drizzle-orm';
import { ClientFactory } from '../core/tenant/ClientFactory';
import { callRouter, type DispatchContext } from '../core/dataimport/RouterDispatcher';
import { getConfigSection, setConfigSection } from '../core/config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../core/config/appConfig';
import formsRouter from '../api/forms';
import * as schema from '../db/schema';

const BASE = process.env.CHECK_BASE_URL || 'http://localhost:3000';
let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`   ✅ ${label}`);
  else {
    failures++;
    console.log(`   ❌ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

const definition = {
  version: 2,
  sections: [
    {
      id: 's1',
      title: 'Datos',
      items: [
        { kind: 'question', id: 'name', type: 'shortText', title: 'Nombre', required: true },
        {
          kind: 'question',
          id: 'route',
          type: 'radio',
          title: '¿Adjuntas algo?',
          required: true,
          options: [
            { id: 'yes', label: 'Sí' },
            { id: 'no', label: 'No' },
          ],
          goTo: { no: 's3' },
        },
      ],
    },
    {
      id: 's2',
      title: 'Archivo',
      items: [
        {
          kind: 'question',
          id: 'doc',
          type: 'file',
          title: 'Documento',
          required: true,
          file: { maxFiles: 1, maxSizeMb: 1, accept: ['.txt'] },
        },
      ],
    },
    {
      id: 's3',
      title: 'Cuestionario',
      items: [
        {
          kind: 'question',
          id: 'capital',
          type: 'radio',
          title: 'Capital de Francia',
          options: [
            { id: 'paris', label: 'París' },
            { id: 'roma', label: 'Roma' },
          ],
          quiz: { points: 2, correct: ['paris'] },
        },
        { kind: 'question', id: 'why', type: 'paragraph', title: 'Explica', quiz: { points: 3 } },
        {
          kind: 'question',
          id: 'secret',
          type: 'shortText',
          title: 'Solo si dices Roma',
          required: true,
          showIf: { questionId: 'capital', op: 'equals', value: 'roma' },
        },
      ],
    },
  ],
};

async function http(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* sin cuerpo */
  }
  return { status: res.status, json };
}

async function main() {
  const keep = process.argv.includes('--keep');
  const publicDb = ClientFactory.getClient('public');
  const tenantId =
    process.argv.slice(2).find((a) => !a.startsWith('--')) ||
    (await publicDb.select().from(schema.tenants).limit(1))[0]?.id;
  const [tenant] = await publicDb
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  const db = await ClientFactory.getTenantClient(tenantId);
  const [user] = await publicDb.select().from(schema.globalUsers).limit(1);
  const ctx: DispatchContext = {
    tenantClient: db,
    tenantId,
    tenantSchema: tenant.schemaName,
    user: { id: user?.id || 'script', role: 'ADMIN', email: user?.email, tenantId },
  };
  const call = (method: any, url: string, body?: any) =>
    callRouter(formsRouter, { method, url, body, ctx });

  console.log(`\n[forms] Tenant "${tenant.name}"\n`);
  const flags = await getConfigSection(db, 'flags', FLAGS_DEFAULTS);
  const flagWasOff = !flags.formsEnabled;
  if (flagWasOff) await setConfigSection(db, 'flags', FLAGS_DEFAULTS, { formsEnabled: true });

  // Restos de una ejecución anterior que se cortó a medias.
  for (const old of await db
    .select({ id: schema.forms.id })
    .from(schema.forms)
    .where(eq(schema.forms.name, 'Prueba automática')))
    await call('DELETE', `/${old.id}`);

  let formId: string | null = null;
  try {
    console.log('1) Crear y configurar');
    const created = await call('POST', '/', { name: 'Prueba automática', template: 'blank' });
    check('crea el formulario', created.status === 200 && !!created.data?.id, created);
    formId = created.data.id;
    const patched = await call('PATCH', `/${formId}`, {
      title: 'Prueba automática',
      definition,
      settings: {
        ...created.data.settings,
        maxResponses: 2,
        allowEdit: true,
        collectEmail: 'optional',
        quiz: { enabled: true, release: 'immediate', showCorrect: true },
      },
    });
    check('guarda definición y ajustes', patched.status === 200, patched.data);
    const bad = await call('PATCH', `/${formId}`, { definition: { version: 2, sections: [] } });
    check('rechaza una definición sin secciones', bad.status === 400, bad.status);
    const slug = patched.data.slug;
    const pub = `/api/public/forms/${tenantId}/${slug}`;

    console.log('2) Formulario público');
    const got = await http('GET', pub);
    check('se abre sin sesión', got.status === 200, got.status);
    const capital = got.json?.form?.definition?.sections?.[2]?.items?.[0];
    check('no expone la respuesta correcta', capital && !capital.quiz?.correct, capital?.quiz);

    console.log('3) Camino con salto (sin archivo)');
    const missing = await http('POST', pub, { answers: { route: 'no' } });
    check(
      'falta el obligatorio → 422 con error',
      missing.status === 422 && !!missing.json?.errors?.name,
      missing.json,
    );
    const viaJump = await http('POST', pub, {
      answers: {
        name: 'Ana',
        route: 'no',
        doc: ['no-debería-validarse'],
        capital: 'roma',
        why: 'Porque sí',
      },
    });
    check(
      'la condicional visible es obligatoria',
      viaJump.status === 422 && !!viaJump.json?.errors?.secret,
      viaJump.json,
    );
    const ok1 = await http('POST', pub, {
      answers: { name: 'Ana', route: 'no', doc: ['ignorado'], capital: 'paris', why: 'Porque sí' },
      email: 'ana@example.com',
    });
    check('envío por el salto (la sección del archivo no se valida)', ok1.status === 200, ok1.json);
    check(
      'nota inmediata 2 de 5 con párrafo pendiente',
      ok1.json?.score?.score === 2 &&
        ok1.json?.score?.maxScore === 5 &&
        ok1.json?.score?.pending === true,
      ok1.json?.score,
    );
    check('devuelve enlace de edición', !!ok1.json?.editToken);

    console.log('4) Camino con archivo');
    const fd = new FormData();
    fd.append('file', new Blob(['hola'], { type: 'text/plain' }), 'nota.txt');
    fd.append('questionId', 'doc');
    const up = await http('POST', `${pub}/upload`, fd);
    check('sube el archivo y devuelve token', up.status === 200 && !!up.json?.token, up.json);
    const badFd = new FormData();
    badFd.append('file', new Blob(['x'], { type: 'image/png' }), 'foto.png');
    badFd.append('questionId', 'doc');
    const badUp = await http('POST', `${pub}/upload`, badFd);
    check('rechaza un tipo no permitido', badUp.status === 400, badUp.json);
    const forged = await http('POST', pub, {
      answers: { name: 'Eva', route: 'yes', doc: ['token-falso'] },
    });
    check('rechaza un token de archivo falso', forged.status >= 400, forged.status);
    const ok2 = await http('POST', pub, {
      answers: { name: 'Luis', route: 'yes', doc: [up.json.token], capital: 'roma', secret: 'x' },
    });
    check('envío con archivo', ok2.status === 200, ok2.json);

    console.log('5) Máximo de respuestas');
    const third = await http('POST', pub, { answers: { name: 'Juan', route: 'no' } });
    check('la tercera se rechaza (máximo 2)', third.status === 409, third.json);

    console.log('6) Editar con el enlace');
    const editGet = await http('GET', `${pub}?e=${ok1.json.editToken}`);
    check(
      'carga la respuesta para editar',
      editGet.json?.editing?.answers?.name === 'Ana',
      editGet.json?.editing,
    );
    const edited = await http('PUT', `${pub}/edit/${ok1.json.editToken}`, {
      answers: { name: 'Ana María', route: 'no', capital: 'paris', why: 'Editado' },
    });
    check('edita aunque esté lleno', edited.status === 200, edited.json);

    console.log('7) Respuestas en el ERP');
    const list = await call('GET', `/${formId}/responses`);
    check('hay 2 respuestas', list.data?.length === 2, list.data?.length);
    const ana = list.data.find((r: any) => r.answers?.name === 'Ana María');
    check('la edición se guardó', !!ana && !!ana.updatedAt, ana);
    check(
      'no se exponen editToken ni browserKey',
      ana && ana.editToken === undefined && ana.browserKey === undefined,
    );
    const luis = list.data.find((r: any) => r.answers?.name === 'Luis');
    const detail = await call('GET', `/${formId}/responses/${luis.id}`);
    check(
      'el archivo quedó ligado a la respuesta',
      detail.data?.files?.length === 1 && detail.data.files[0].fileName === 'nota.txt',
      detail.data?.files,
    );
    const graded = await call('PATCH', `/${formId}/responses/${ana.id}/grades`, {
      grades: { why: 3 },
    });
    check(
      'corrección manual: 5 de 5',
      graded.data?.score === 5 && graded.data?.pending === false,
      graded.data,
    );
    const summary = await call('GET', `/${formId}/summary`);
    const cap = summary.data?.questions?.find((q: any) => q.questionId === 'capital');
    check(
      'resumen con recuentos',
      summary.data?.total === 2 && cap?.counts?.find((c: any) => c.key === 'paris')?.count === 1,
      cap,
    );
    const csv = await call('GET', `/${formId}/export`);
    check('exporta CSV', csv.status === 200, csv.status);
  } finally {
    if (formId && !keep) {
      const ids = (
        await db
          .select({ id: schema.formResponses.id })
          .from(schema.formResponses)
          .where(eq(schema.formResponses.formId, formId))
      ).map((r: any) => r.id);
      await call('DELETE', `/${formId}`);
      const left = ids.length
        ? await db
            .select()
            .from(schema.attachments)
            .where(inArray(schema.attachments.entityId, ids))
        : [];
      check('al borrar el formulario se borran sus archivos', left.length === 0, left.length);
      console.log('\n   (formulario de prueba borrado)');
    }
    if (flagWasOff && !keep)
      await setConfigSection(db, 'flags', FLAGS_DEFAULTS, { formsEnabled: false });
    await ClientFactory.disconnectAll();
  }
  console.log(failures === 0 ? '\nTodo bien.' : `\n${failures} comprobación(es) fallida(s).`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(async (e) => {
  console.error(e);
  await ClientFactory.disconnectAll();
  process.exitCode = 1;
});
