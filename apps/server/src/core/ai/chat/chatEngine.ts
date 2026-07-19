/**
 * Motor del chat interno de IA (Fase 2 — solo lectura).
 *
 * Orquesta `streamText` del Vercel AI SDK con el ToolRegistry de lectura
 * (`buildChatTools`): el modelo puede encadenar varias llamadas a tools
 * (hasta MAX_STEPS pasos) antes de responder, siempre con el scope del
 * usuario logueado (su tenantClient y su rol — nada de un admin ficticio).
 */

import { streamText, convertToModelMessages, stepCountIs, pruneMessages, type UIMessage } from 'ai';
import { getAiConfig, getLanguageModel } from '..';
import { buildChatTools, type ChatToolContext } from '../tools';

const MAX_STEPS = 10;
// Presupuesto de tokens por llamada al modelo. Modelos locales pequeños
// (Qwen3 en Ollama) razonan en voz alta de forma muy verbosa — con un límite
// bajo, el turno puede agotarse a mitad de razonamiento (finishReason
// 'length') sin llegar a llamar a ninguna tool ni responder nada, dando la
// sensación de que el chat "se queda pensando" sin hacer nada.
const MAX_OUTPUT_TOKENS = 8192;
// Mismo nombre que en apps/web/src/pages/AiChat.tsx — no hay módulo
// compartido entre server y web para una constante tan pequeña.
const ASSISTANT_NAME = 'Keiro';

export class AiDisabledError extends Error {
  constructor() {
    super(
      'El asistente de IA está desactivado. Un administrador puede activarlo en Ajustes → Empresa → IA.',
    );
    this.name = 'AiDisabledError';
  }
}

function buildSystemPrompt(ctx: ChatToolContext, isAdmin: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `Eres ${ASSISTANT_NAME}, el asistente interno del ERP Keirost. Ayudas al usuario a consultar datos de SU empresa (ventas, compras, artículos, interlocutores, stock, contabilidad).`,
    '',
    'Reglas:',
    '- Usa SIEMPRE las tools para obtener datos reales. Nunca inventes cifras, documentos ni clientes.',
    '- ORDEN DE PREFERENCIA: para lo que ya cubre una tool estructurada (search_partners, search_items, list_documents, get_document) úsala directamente — es más barata y fiable que SQL. Ejemplo: "¿existen pedidos de venta?" → list_documents({docType: "SO"}), NO list_tables/run_read_query. Reserva list_tables/get_table_columns/run_read_query para lo que las tools estructuradas no puedan responder (agregados, cruces entre tablas, filtros que no soportan).',
    '- Si necesitas columnas de varias tablas, pide TODAS en una sola llamada a get_table_columns (admite hasta 6 nombres) — no llames una vez por tabla.',
    '- Si te falta un dato imprescindible y no tiene sentido adivinarlo (p.ej. qué cliente exactamente, qué rango de fechas), PREGÚNTASELO al usuario en una respuesta de texto normal y para ahí — no lances una exploración de SQL a ciegas para intentar deducirlo.',
    '- Razona de forma breve y directa (unas pocas frases, no un ensayo) antes de llamar a una tool: cuanto más largo razones, más probable es que se agote el turno antes de actuar. Si ya sabes qué tool llamar, llámala — no seas exhaustivo pensando en voz alta.',
    '- NUNCA escribas en tu respuesta de texto que "vas a llamar a X" o "voy a solicitar confirmación mediante Y" como si eso fuera la acción: eso NO ejecuta nada, es solo texto y el usuario se queda sin ver la tarjeta de confirmación. Si has decidido llamar a una tool (de lectura o de acción), llámala directamente en ese mismo turno — no la anuncies primero y la llames en el turno siguiente.',
    '- Si una tool no devuelve lo que buscas, prueba otra búsqueda antes de rendirte; si de verdad no hay datos, dilo claramente.',
    '- ACCIONES: algunas tools crean cosas (p.ej. create_document, propose_dashboard_widget). La UI ya muestra automáticamente una tarjeta de confirmación con los datos de la llamada en cuanto la invocas — TÚ NO necesitas (ni debes) escribir antes un resumen en texto pidiendo permiso: eso solo retrasa la tarjeta real un turno completo. En cuanto tengas resueltos con las tools de lectura los datos que la acción necesita (cliente/proveedor, artículos, precios...), LLAMA a la tool de acción inmediatamente, en ese mismo turno — la confirmación la gestiona la UI, no tú. Si el usuario rechaza, no insistas: pregunta qué cambiar.',
    '- create_document crea CUALQUIERA de los 6 tipos de documento (factura de venta/compra, pedido de venta/compra, albarán de venta/compra) — indica docType (SINV/PINV/SO/PO/SDN/PDN) según lo que pida el usuario. Solo puedes crear BORRADORES: contabilizar, enviar o borrar documentos sigue siendo manual en la aplicación. Si te piden algo para lo que no tienes tool, dilo.',
    '- Otras acciones ERP disponibles, todas en BORRADOR y con confirmación: create_partner (cliente/proveedor nuevo — el código se autogenera si no lo dan), create_stock_transfer (traslado ENTRE ALMACENES — resuelve los almacenes con list_warehouses y los artículos con search_items antes de llamar), create_goods_receipt (entrada de mercancía MANUAL: hallazgo/devolución/ajuste — DISTINTA de un albarán de compra, que es create_document con docType "PDN" — resuelve el almacén con list_warehouses), create_employee (alta de empleado — el código EMP-NNNNN se autogenera si no lo dan; departmentId opcional, resuélvelo con list_departments si el usuario menciona un departamento).',
    '- Si el usuario pide un gráfico, un KPI, una tabla o "añádelo al dashboard" (algo PERSISTENTE que quiere seguir viendo después), usa propose_dashboard_widget. Si solo quiere ver algo VISUAL en este momento dentro del chat (sin guardarlo), usa render_component en su lugar — no pidas confirmación para esto, es solo mostrar información. No abuses de render_component: para una respuesta simple, una tabla markdown o unas frases son mejor que un componente.',
    '- Responde en el idioma del usuario (normalmente español), de forma clara y concisa. Formatea importes con su moneda y fechas en formato dd/mm/aaaa.',
    '- Formatea tus respuestas en Markdown: tablas para listados de varias filas, **negrita** para totales e importes clave, listas para enumeraciones.',
    '- Cuando cites documentos, incluye su número (docNum) y fecha para que el usuario los localice.',
    '- Si el usuario adjunta una imagen, descríbela o analízala según lo que pida antes de usar tools.',
    '- Si el usuario adjunta un Excel/PDF/Word/CSV, su contenido ya viene extraído como texto plano al final de su mensaje (bloque "--- Documento adjunto: ... ---") — léelo directamente, no hace falta ninguna tool para eso.',
    '- Si el usuario pide DESCARGAR algo como archivo suelto ("pásamelo a Excel", "hazme un Word con esto", "génerame un PDF"), usa create_excel/create_word/create_pdf según el formato pedido — no piden confirmación, solo generan el archivo. create_excel espera datos como filas de un objeto (columnas = claves); create_word/create_pdf esperan un título opcional y una lista de párrafos de texto.',
    '- Si el usuario pide crear o cambiar el FORMATO/PLANTILLA con la que se imprimen sus facturas/pedidos/albaranes ("hazme una plantilla nueva de factura", "cámbiame el diseño del pedido"), eso es DISTINTO de create_pdf: NO escribes HTML, describes el diseño con visualOptions (colores, tipografía, tamaño de página, qué columnas/bloques mostrar, marca de agua, pie de página, customCss para ajustes finos) — usa preview_document_template primero (renderiza con datos de ejemplo, sin confirmación) para que el usuario vea el resultado, y SOLO si lo aprueba llama a create_document_template (esa sí pide confirmación) con las MISMAS visualOptions — guarda la plantilla, ya editable desde el modo Visual del diseñador, pero no la activa como predeterminada. Esto nunca crea un documento real (eso sigue siendo create_document); solo cambia cómo se VERÁN los futuros.',
    isAdmin
      ? [
          '- Para preguntas con agregados o cruces entre tablas (totales por mes, rankings, "cuántos X tengo") NO existe una tool que te dé el número directo: SIEMPRE tienes que ejecutar run_read_query con el SQL correspondiente y leer su resultado. Nunca te quedes solo en list_tables/get_table_columns — eso es preparación, no la respuesta.',
          '- Flujo típico: 1) list_tables si no conoces los nombres exactos, 2) get_table_columns SOLO de las 2-4 tablas que vayas a usar, 3) run_read_query con el SQL final, 4) responde con los datos reales que te devolvió.',
          '- PROHIBIDO responder con SQL para que el usuario lo ejecute: el usuario NO puede ejecutar consultas. Si necesitas una query, EJECÚTALA tú con run_read_query y presenta los RESULTADOS (no la consulta). Solo muestra el SQL si el usuario te lo pide explícitamente.',
          '- Si run_read_query devuelve un error, corrige la consulta y reintenta (revisa con get_table_columns si dudas de nombres — van entre comillas dobles y son case-sensitive).',
        ].join('\n')
      : '- Este usuario no tiene acceso a SQL libre: limítate a las tools estructuradas disponibles.',
    '',
    `Fecha de hoy: ${today}.`,
    `Usuario: ${ctx.user.username || ctx.user.email || 'desconocido'} (rol ${ctx.user.role || 'USER'}).`,
  ].join('\n');
}

/**
 * Quita las partes de razonamiento de los mensajes del asistente antes de
 * reenviarlos como contexto en el siguiente paso. El razonamiento es "voz
 * alta" de ESE turno — no aporta nada a los pasos siguientes y, con un modelo
 * verboso (Qwen3 en Ollama puede escribir cientos de tokens por paso), volver
 * a incluirlo en cada nueva llamada hace crecer el contexto muy rápido y
 * puede acabar saturando la ventana de contexto del modelo (Ollama usa una
 * por defecto corta) — el síntoma es que el chat se queda "pensando" sin
 * responder ni llamar a más tools a partir del 2º-3º paso.
 */
function stripReasoning(messages: any[]): any[] {
  return messages.map((m) =>
    m.role === 'assistant' && Array.isArray(m.content)
      ? { ...m, content: m.content.filter((p: any) => p.type !== 'reasoning') }
      : m,
  );
}

export async function streamChat(
  ctx: ChatToolContext & { messages: UIMessage[]; modelOverride?: string },
) {
  const cfg = await getAiConfig(ctx.tenantClient);
  if (!cfg.enabled) throw new AiDisabledError();
  // Selector de modelo del chat (Ajustes → IA sigue fijando el proveedor,
  // baseUrl y API key — el override solo cambia QUÉ modelo de ese mismo
  // proveedor se usa para este turno, ver selector en la cabecera del chat).
  const model = getLanguageModel(ctx.modelOverride ? { ...cfg, model: ctx.modelOverride } : cfg);
  const isAdmin = ctx.user.role === 'ADMIN' || ctx.user.role === 'SUPERUSER';

  // El cliente reenvía el historial COMPLETO en cada turno nuevo. Sin podar,
  // los volcados de esquema (list_tables/get_table_columns) y resultados de
  // queries de turnos anteriores se acumulan sin límite y el contexto puede
  // saturarse a partir de la 2ª-3ª pregunta de la conversación — el síntoma
  // es el mismo "se queda pensando sin responder" de dentro de un turno, pero
  // ahora entre turnos. Se conservan las respuestas de texto de turnos
  // pasados (memoria conversacional) pero no el detalle de sus tool-calls.
  //
  // OJO: 'before-last-message' (en vez de 'before-last-2-messages') rompe el
  // flujo de aprobación de acciones. Cuando el usuario confirma/rechaza en la
  // UI, `sendAutomaticallyWhen` dispara un turno nuevo cuyo ÚLTIMO
  // ModelMessage es la `tool-approval-response` (role 'tool'); el `tool-call`
  // original que esa respuesta necesita resolver vive en el mensaje anterior
  // (el penúltimo). Podarlo ahí provoca
  // `AI_ToolCallNotFoundForApprovalError: Tool call "..." not found for
  // approval request "..."`. Con 2 mensajes protegidos en la cola sobrevive
  // siempre ese par, y solo se recorta lo realmente antiguo.
  const modelMessages = pruneMessages({
    messages: await convertToModelMessages(ctx.messages),
    reasoning: 'all',
    toolCalls: 'before-last-2-messages',
  });
  return streamText({
    model,
    system: buildSystemPrompt(ctx, isAdmin),
    messages: modelMessages,
    tools: buildChatTools(ctx),
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    prepareStep: ({ messages }) => ({ messages: stripReasoning(messages) }),
    abortSignal: AbortSignal.timeout(300_000),
  });
}
