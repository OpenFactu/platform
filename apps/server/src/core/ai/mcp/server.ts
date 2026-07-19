/**
 * Servidor MCP (Fase 4) — expone el ToolRegistry del chat a clientes externos
 * (Claude Desktop, Claude Code, otros agentes) vía tokens de API con scopes.
 *
 * Deliberadamente SOLO LECTURA: reutiliza `buildChatTools` con
 * `includeActions: false` siempre. Las tools de acción (Fase 3) dependen de la
 * tarjeta de confirmación del chat interno, que un cliente MCP externo no
 * tiene — no se exponen aquí hasta que ese patrón esté maduro y este servidor
 * incorpore su propio mecanismo de aprobación (elicitation de MCP).
 *
 * Scopes de ApiToken reconocidos:
 *  - `mcp:read` — tools estructuradas (search_partners, search_items,
 *    list_documents, get_document).
 *  - `mcp:sql`  — además, get_schema_info y run_read_query (SQL de solo
 *    lectura, mismo sandbox que el chat interno).
 *  - `*`        — cualquier scope, incluye ambos.
 *
 * Servidor STATELESS: se crea una instancia de McpServer + tools nueva por
 * request HTTP (ver ../../../api/mcp.ts), scopeada al token que autenticó esa
 * llamada. No hay sesión persistente entre llamadas.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildChatTools, type ChatToolContext } from '../tools';

export interface McpAuthContext {
  tenantClient: any;
  tenantId: string;
  tenantSchema: string;
  tokenId: string;
  tokenName: string;
  scopes: string[];
}

export function hasMcpScope(scopes: string[], required: 'mcp:read' | 'mcp:sql'): boolean {
  if (scopes.includes('*')) return true;
  if (scopes.includes(required)) return true;
  // mcp:sql implica mcp:read (privilegio mayor incluye el menor).
  if (required === 'mcp:read' && scopes.includes('mcp:sql')) return true;
  return false;
}

/** Convierte el resultado (objeto/array JS) de una tool en contenido MCP. */
function toMcpResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * Construye un McpServer con las tools de lectura permitidas por los scopes
 * del token, listo para conectarse a un transport por request.
 */
export function createMcpServer(auth: McpAuthContext): McpServer {
  const server = new McpServer({ name: 'keirost', version: '1.0.0' });

  const ctx: ChatToolContext = {
    tenantClient: auth.tenantClient,
    tenantId: auth.tenantId,
    tenantSchema: auth.tenantSchema,
    // Rol sintético: buildChatTools solo lo usa como fallback si no pasamos
    // `options` explícitas — aquí siempre las pasamos, así que 'USER' es inerte.
    user: { id: `mcp:${auth.tokenId}`, role: 'USER', username: auth.tokenName },
  };

  const tools = buildChatTools(ctx, {
    includeSqlTools: hasMcpScope(auth.scopes, 'mcp:sql'),
    includeActions: false,
  });

  for (const [name, def] of Object.entries(tools)) {
    const anyDef = def as any;
    server.registerTool(
      name,
      {
        description: anyDef.description,
        inputSchema: anyDef.inputSchema?.shape ?? {},
      },
      async (args: unknown) => {
        try {
          const result = await anyDef.execute(args);
          return toMcpResult(result);
        } catch (e: any) {
          return {
            content: [{ type: 'text' as const, text: e?.message || 'Error al ejecutar la tool' }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}
