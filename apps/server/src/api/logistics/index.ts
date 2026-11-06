/**
 * Módulo de logística propio.
 *
 *   shipments  envíos y sus acciones
 *   routes     rutas de reparto y paradas
 *   prep       preparación de pedidos y recepción de compras
 *   driver     mis rutas, para el conductor: se monta aparte, con su propio permiso
 *   packages   cajas y su contenido
 *   staging    acopios y su QR
 *   fleet      vehículos y plataformas
 *   tracking   lo público: seguimiento y posición, por token y sin sesión
 *
 * La lógica vive en `core/logistics`: aquí solo se traduce HTTP.
 */
import { Router } from 'express';
import shipmentsRouter from './shipments';
import routesRouter from './routes';
import prepRouter from './prep';
import driverRouter from './driver';
import packagesRouter from './packages';
import stagingRouter from './staging';
import fleetRouter from './fleet';
import geocodeRouter from './geocodeSuggest';
import { requireLogisticsScope } from './shared';

const router = Router();

router.use(requireLogisticsScope);
router.use(shipmentsRouter);
router.use(routesRouter);
router.use(prepRouter);
router.use(packagesRouter);
router.use(stagingRouter);
router.use(fleetRouter);
router.use(geocodeRouter);

export default router;
export { driverRouter };
export { publicTrackRouter } from './tracking';
