/**
 * Objetos a los que se puede enlazar un campo de usuario. Es una ruta compartida porque
 * cada objeto pide su propio permiso, y lo comprueba aquí.
 */
import { Router } from 'express';
import { ClientFactory } from '../core/tenant/ClientFactory';
import {
  linkableObjectById,
  linkedObjectLabels,
  linkedObjectRoute,
  listLinkableObjects,
  searchLinkedObject,
  type LinkContext,
} from '../core/customFields/linkableObjects';
import { tr } from '../i18n';
import { grantsRead, permissionsForRequest } from './middleware/requirePermission';

const router = Router();

const contextOf = (req: any): LinkContext => ({
  db: req.tenantClient,
  publicDb: ClientFactory.getClient('public'),
  tenantId: req.tenantId,
});

router.get('/', async (req: any, res) => {
  try {
    const [objects, permissions] = await Promise.all([
      listLinkableObjects(contextOf(req)),
      permissionsForRequest(req),
    ]);
    res.json(
      objects
        .filter((object) => grantsRead(permissions, object.permissionPath))
        .map(({ id, label, isDocument }) => ({
          id,
          label: tr(req, label),
          group: isDocument ? 'document' : id.startsWith('table:') ? 'table' : 'record',
        })),
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:object/search', async (req: any, res) => {
  try {
    const object = await linkableObjectById(contextOf(req), req.params.object);
    if (!object) return res.status(404).json({ error: 'Objeto no encontrado.' });
    if (!grantsRead(await permissionsForRequest(req), object.permissionPath)) {
      return res.status(403).json({ error: 'No tienes permiso para ver esto.' });
    }
    res.json(await searchLinkedObject(req.tenantClient, object, String(req.query.q ?? '')));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** El nombre y dónde abrir estos registros. Sin permiso se dice, sin dar el valor. */
router.post('/:object/resolve', async (req: any, res) => {
  try {
    const object = await linkableObjectById(contextOf(req), req.params.object);
    if (!object) return res.status(404).json({ error: 'Objeto no encontrado.' });
    const ids: string[] = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((id: unknown) => typeof id === 'string').slice(0, 200)
      : [];
    if (!grantsRead(await permissionsForRequest(req), object.permissionPath)) {
      return res.json(ids.map((id) => ({ id, hidden: true })));
    }
    const labels = await linkedObjectLabels(req.tenantClient, object, ids);
    res.json(
      ids.map((id) =>
        labels.has(id)
          ? { id, label: labels.get(id), route: linkedObjectRoute(object, id) }
          : { id, missing: true },
      ),
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
