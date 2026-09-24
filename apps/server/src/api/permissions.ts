/**
 * El catálogo de permisos, para que la pantalla de Usuarios lo pinte.
 *
 * Antes esa pantalla llevaba la lista escrita dentro (`PERMISSION_GROUPS`), y
 * por eso se desincronizó: 27 pantallas exigían permisos que el administrador
 * no podía conceder porque no salían en ningún sitio. Ahora la lista viene de
 * donde manda.
 */

import { Router } from 'express';
import { catalogForAdmins, PERMISSION_CATALOG } from '../core/auth/permissionCatalog';

const router = Router();

/** Agrupado y sin lo de SUPERUSER — es lo que dibuja la pantalla de Usuarios. */
router.get('/catalog', (_req, res) => {
  res.json({ groups: catalogForAdmins() });
});

/** Lista plana, para herramientas y comprobaciones. */
router.get('/catalog/flat', (_req, res) => {
  res.json(PERMISSION_CATALOG);
});

export default router;
