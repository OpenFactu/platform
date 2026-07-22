import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { MigrationEngine } from '../core/plugins/MigrationEngine';
import { TenantPluginCache } from '../core/plugins/TenantPluginCache';
import { ClientFactory } from '../core/tenant/ClientFactory';
import * as schema from '../db/schema';
import path from 'path';
import fs from 'fs';
import { activePlugins, activePluginManifests, pluginsDir } from '../plugins/loader';
import { transpilePluginFile } from '../plugins/transpiler';
import { eq } from 'drizzle-orm';
import { adminMiddleware } from './middleware/adminAuth';
import { devKeyOrAdmin } from './middleware/devKeyAuth';

const upload = multer({ dest: '/tmp/openfactu-uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// ── Endpoints con rutas fijas (ANTES de las rutas con :pluginId) ──

/**
 * GET /api/plugins/available
 * Lista todos los plugins instalados con su estado de activación para el tenant actual.
 */
router.get('/available', (req: any, res) => {
  const tenantId = req.tenantId;
  const activeForTenant = tenantId ? TenantPluginCache.getActivePlugins(tenantId) : [];

  // Solo listamos plugins cuyo módulo se cargó correctamente (`activePlugins`).
  // Antes incluíamos también los que solo tenían `manifest.json` aunque el
  // `init` fallara → el UI los mostraba pero al activarlos daba 404
  // "no está instalado". Con esto la lista refleja lo que realmente puede
  // activarse. Los que tienen manifest pero no cargan se marcan `loadFailed`
  // para que el front pueda avisarlos como entrada con problema, pero no
  // permitiremos activarlos.
  const loadedById = new Set(activePlugins);
  const result: any[] = [];

  // Plugins con manifest UI cargado:
  for (const m of activePluginManifests) {
    const loaded = loadedById.has(m.id);
    result.push({
      ...m,
      isActive: activeForTenant.includes(m.id),
      loaded,
      ...(loaded
        ? {}
        : {
            loadError: 'El plugin tiene manifest pero su index no exporta init() o falló al cargar',
          }),
    });
  }

  // Plugins solo backend (sin manifest UI) que sí cargaron.
  for (const pluginId of activePlugins) {
    if (!result.find((r: any) => r.id === pluginId)) {
      result.push({
        id: pluginId,
        name: pluginId,
        isActive: activeForTenant.includes(pluginId),
        loaded: true,
      });
    }
  }

  res.json(result);
});

/**
 * GET /api/plugins/active
 * Lista plugins con su estado para el tenant actual.
 */
router.get('/active', (req: any, res) => {
  const tenantId = req.tenantId;
  const activeForTenant = tenantId ? TenantPluginCache.getActivePlugins(tenantId) : [];

  res.json(
    activePlugins.map((id) => ({
      id,
      isActive: activeForTenant.includes(id),
    })),
  );
});

/**
 * GET /api/plugins/manifests
 * Devuelve solo los manifests de plugins activos para el tenant actual.
 */
router.get('/manifests', (req: any, res) => {
  const tenantId = req.tenantId;

  if (!tenantId) {
    return res.json(activePluginManifests);
  }

  const activeForTenant = TenantPluginCache.getActivePlugins(tenantId);
  const filtered = activePluginManifests.filter((m: any) => activeForTenant.includes(m.id));
  res.json(filtered);
});

/**
 * POST /api/plugins/register-field
 */
router.post('/register-field', async (req, res) => {
  const { pluginId, tableName, fieldName, fieldType, label } = req.body;

  try {
    await MigrationEngine.addCustomField({
      pluginId,
      tableName,
      fieldName,
      type: fieldType,
      label,
    });

    res.json({ success: true, message: `Campo ${fieldName} registrado y aplicado.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/fields', async (req: any, res) => {
  try {
    const publicClient = ClientFactory.getClient('public');
    let results = await publicClient.select().from(schema.pluginFields);

    // Filtrar por plugins activos del tenant
    if (req.tenantId) {
      const activeForTenant = TenantPluginCache.getActivePlugins(req.tenantId);
      results = results.filter((f: any) => activeForTenant.includes(f.pluginId));
    }

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tables', async (req: any, res) => {
  try {
    const publicClient = ClientFactory.getClient('public');
    let results = await publicClient.select().from(schema.pluginTables);

    // Filtrar por plugins activos del tenant
    if (req.tenantId) {
      const activeForTenant = TenantPluginCache.getActivePlugins(req.tenantId);
      results = results.filter((t: any) => activeForTenant.includes(t.pluginId));
    }

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/plugins/fields/:tableName?
 */
router.get('/fields/:tableName?', async (req: any, res) => {
  const { tableName } = req.params;
  const publicClient = ClientFactory.getClient('public');

  let fields;
  if (tableName) {
    fields = await publicClient
      .select()
      .from(schema.pluginFields)
      .where(eq(schema.pluginFields.tableName, tableName));
  } else {
    fields = await publicClient.select().from(schema.pluginFields);
  }

  // Filtrar: campos de plugin (plugin activo para el tenant) + campos
  // creados desde la UI (`__user__`) que pertenezcan a este tenant.
  if (req.tenantId) {
    const activeForTenant = TenantPluginCache.getActivePlugins(req.tenantId);
    fields = fields.filter((f: any) => {
      if (f.pluginId === '__user__') return f.tenantId === req.tenantId;
      return activeForTenant.includes(f.pluginId);
    });
  }

  res.json(fields);
});

// ── Endpoints con :pluginId ──

/**
 * POST /api/plugins/:pluginId/activate
 * Activa un plugin para el tenant actual.
 */
router.post('/:pluginId/activate', adminMiddleware, async (req: any, res) => {
  const { pluginId } = req.params;
  const tenantId = req.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant requerido' });
  }

  if (!activePlugins.includes(pluginId)) {
    return res.status(404).json({ error: `Plugin "${pluginId}" no está instalado` });
  }

  try {
    await TenantPluginCache.activate(tenantId, pluginId);
    res.json({ success: true, pluginId, isActive: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/plugins/:pluginId/deactivate
 * Desactiva un plugin para el tenant actual.
 */
router.post('/:pluginId/deactivate', adminMiddleware, async (req: any, res) => {
  const { pluginId } = req.params;
  const tenantId = req.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant requerido' });
  }

  try {
    await TenantPluginCache.deactivate(tenantId, pluginId);
    res.json({ success: true, pluginId, isActive: false });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/plugins/upload
 * Sube un plugin como archivo ZIP y lo instala/actualiza.
 * Body: multipart/form-data con campo 'plugin' (archivo .zip)
 */
router.post(
  '/upload',
  devKeyOrAdmin('plugin:push'),
  upload.single('plugin'),
  async (req: any, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibio ningun archivo' });
    }

    try {
      const zip = new AdmZip(req.file.path);
      const entries = zip.getEntries();

      if (entries.length === 0) {
        return res.status(400).json({ error: 'El archivo ZIP esta vacio' });
      }

      // Detectar nombre del plugin: carpeta raiz del zip o nombre del archivo
      let pluginName = '';
      const firstEntry = entries[0].entryName;
      if (firstEntry.includes('/')) {
        pluginName = firstEntry.split('/')[0];
      } else {
        pluginName = path.basename(req.file.originalname, '.zip');
      }

      if (!pluginName) {
        return res.status(400).json({ error: 'No se pudo determinar el nombre del plugin' });
      }

      const targetDir = path.join(pluginsDir, pluginName);

      // Extraer
      zip.extractAllTo(pluginsDir, true);

      // Limpiar archivo temporal
      fs.unlinkSync(req.file.path);

      // Recargar el plugin si ya estaba cargado
      if (activePlugins.includes(pluginName)) {
        const { reloadPlugin } = await import('../plugins/loader');
        await reloadPlugin(pluginName);

        const { broadcastPluginReload } = await import('../plugins/devSocket');
        broadcastPluginReload(pluginName);
      }

      // Verificar estructura
      const hasIndex =
        fs.existsSync(path.join(targetDir, 'index.ts')) ||
        fs.existsSync(path.join(targetDir, 'index.js'));
      const hasManifest = fs.existsSync(path.join(targetDir, 'manifest.json'));

      res.json({
        success: true,
        pluginId: pluginName,
        hasIndex,
        hasManifest,
        message: activePlugins.includes(pluginName)
          ? 'Plugin actualizado y recargado'
          : 'Plugin instalado. Reinicia el servidor para cargarlo.',
      });
    } catch (err: any) {
      // Limpiar archivo temporal
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * POST /api/plugins/:pluginId/push
 * Recibe archivos individuales de un plugin (para sync incremental).
 * Body JSON: { files: [{ path: "relative/path.ts", content: "base64..." }] }
 */
router.post('/:pluginId/push', devKeyOrAdmin('plugin:push'), async (req: any, res) => {
  const { pluginId } = req.params;
  const { files } = req.body;

  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'Se requiere un array de files' });
  }

  const targetDir = path.join(pluginsDir, pluginId);

  try {
    // Crear directorio si no existe
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Escribir archivos
    for (const file of files) {
      const filePath = path.join(targetDir, file.path);
      const dir = path.dirname(filePath);

      // Seguridad: no permitir path traversal
      if (!filePath.startsWith(targetDir)) {
        return res.status(400).json({ error: `Ruta no permitida: ${file.path}` });
      }

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const content = Buffer.from(file.content, 'base64');
      fs.writeFileSync(filePath, content);
    }

    // Recargar si ya estaba cargado
    if (activePlugins.includes(pluginId)) {
      const { reloadPlugin } = await import('../plugins/loader');
      await reloadPlugin(pluginId);

      const { broadcastPluginReload } = await import('../plugins/devSocket');
      broadcastPluginReload(pluginId);
    }

    res.json({
      success: true,
      pluginId,
      filesWritten: files.length,
      reloaded: activePlugins.includes(pluginId),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/plugins/:pluginId/reload
 * Recarga un plugin en caliente (hot reload).
 */
router.post('/:pluginId/reload', devKeyOrAdmin('plugin:reload'), async (req: any, res) => {
  const { pluginId } = req.params;

  if (!activePlugins.includes(pluginId)) {
    return res.status(404).json({ error: `Plugin "${pluginId}" no esta instalado` });
  }

  try {
    const { reloadPlugin } = await import('../plugins/loader');
    const result = await reloadPlugin(pluginId);

    if (result.success) {
      const { broadcastPluginReload } = await import('../plugins/devSocket');
      broadcastPluginReload(pluginId);
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/plugins/load/:pluginId/*
 * Carga dinámica y transpilación on-the-fly.
 */
router.get('/load/:pluginId/*', async (req, res) => {
  const { pluginId } = req.params;
  // Usamos req.params['0'] para evitar el error de tipado en TS
  const filePath = req.params['0'];

  const pluginsDir = path.resolve(__dirname, '../../../../plugins');
  const fullPath = path.join(pluginsDir, pluginId, filePath);

  // Seguridad básica: prevenir path traversal
  if (!fullPath.startsWith(pluginsDir)) {
    return res.status(403).json({ error: 'Acceso no autorizado fuera del directorio de plugins' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Archivo de plugin no encontrado' });
  }

  const ext = path.extname(fullPath).toLowerCase();

  try {
    // Nunca cachear — es código transpilado en caliente y puede cambiar en
    // cualquier reload/hot-reload. Evita que un caché HTTP o un service
    // worker (activo también en dev, ver vite.config.ts) sirva una versión vieja.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');

    if (ext === '.tsx' || ext === '.ts' || ext === '.jsx') {
      const transpiledCode = await transpilePluginFile(
        fullPath,
        `${req.protocol}://${req.get('host')}`,
      );
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      return res.send(transpiledCode);
    }

    res.sendFile(fullPath);
  } catch (error: any) {
    console.error(`[PluginLoader] Error al cargar ${fullPath}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/plugins/sdk/*
 * Sirve los proxies ESM. Soporta nombres de paquetes complejos con slashes.
 */
router.get('/sdk/*', (req, res) => {
  // Capturamos todo lo que viene después de /sdk/ y quitamos el .js
  const rawPkg = req.params['0'];
  const pkg = rawPkg.replace(/^\//, '').replace(/\.js$/, '');

  const pkgMap: Record<string, string> = {
    react: 'window.React',
    'react-dom': 'window.ReactDOM',
    'lucide-react': 'window.Lucide',
    '@openfactu/ui': 'window.OpenFactuUI',
    'react-router-dom': 'window.ReactRouterDOM',
    '@openfactu/common': 'window.OpenFactuCommon',
    '@openfactu/widget-api': 'window.OpenFactuWidgetAPI',
  };

  const globalVar = pkgMap[pkg];

  if (!globalVar) {
    console.error(`[SDK] Paquete no mapeado: ${pkg}`);
    return res.status(404).send(`SDK Package "${pkg}" not found`);
  }

  const namedExportsMap: Record<string, string> = {
    react:
      'useState, useEffect, useMemo, useCallback, useRef, useContext, createContext, forwardRef, Fragment, Suspense, Children, cloneElement, isValidElement, lazy',
    'react-dom': 'createPortal',
    'lucide-react':
      'Star, Plus, Minus, Zap, Puzzle, X, Check, ChevronRight, ChevronDown, ChevronLeft, Search, Settings, Eye, EyeOff, Loader2, AlertCircle, Info, Bell, LayoutDashboard, Box, ExternalLink, RefreshCw, List, Trash2, Edit, Save, ArrowLeft, ArrowRight, UserPlus, Mail, Building, Shield, CheckCircle, AlertTriangle, Package, Globe, Users, FileText',
    '@openfactu/ui':
      'Button, Card, Table, Badge, Input, NavItem, Loader, Toast, ToastProvider, useToast',
    'react-router-dom': 'Link, useNavigate, useParams, useLocation, NavLink, Outlet',
    '@openfactu/common': 'useDocument, useDataTable',
    '@openfactu/widget-api': 'get',
  };

  const namedExports = namedExportsMap[pkg] || '';

  const esmCode = `// OpenFactu Plugin SDK - ${pkg}
const _pkg = ${globalVar};
if (!_pkg) {
  throw new Error('[OpenFactu SDK] Librería "${pkg}" no disponible en el objeto global.');
}
export default _pkg;
${namedExports ? `export const { ${namedExports} } = _pkg;` : ''}
`;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.send(esmCode);
});

export default router;
