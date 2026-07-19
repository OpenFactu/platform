/**
 * POST /api/mcp — servidor MCP (Streamable HTTP, modo stateless) para clientes
 * externos (Claude Desktop, Claude Code…). Ver core/ai/mcp/server.ts para el
 * detalle de qué tools expone y por qué solo lectura.
 *
 * Auth: exclusivamente tokens de API (`Authorization: Bearer tk_...`) — nunca
 * el JWT de sesión de un usuario. `apiTokenMiddleware` (montado globalmente en
 * /api, antes que este router) ya validó el token y pobló `req.apiToken` +
 * `req.tenantClient`/`req.tenantId` a partir de él.
 */

import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer, hasMcpScope } from '../core/ai/mcp/server';

const router = Router();

router.post('/', async (req: any, res) => {
  if (!req.apiToken) {
    return res
      .status(401)
      .json({ error: 'El servidor MCP requiere un token de API (Authorization: Bearer tk_...).' });
  }
  if (!req.tenantClient || !req.tenantSchema) {
    return res.status(400).json({ error: 'No se pudo resolver el tenant del token.' });
  }
  const scopes: string[] = req.apiToken.scopes || [];
  if (!hasMcpScope(scopes, 'mcp:read')) {
    return res.status(403).json({
      error: 'El token no tiene el scope "mcp:read". Añádelo en Ajustes → Tokens de API.',
    });
  }

  try {
    const server = createMcpServer({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId,
      tenantSchema: req.tenantSchema,
      tokenId: req.apiToken.id,
      tokenName: req.apiToken.name,
      scopes,
    });
    // Stateless: una instancia de server + transport por request, sin sesión
    // compartida — cada llamada JSON-RPC (tools/list, tools/call...) es una
    // conexión HTTP independiente autenticada con el mismo token.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e: any) {
    console.error('[Mcp]', e);
    if (!res.headersSent) {
      res.status(500).json({ error: e?.message || 'Error en el servidor MCP' });
    }
  }
});

export default router;
