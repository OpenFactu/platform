import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import * as Lucide from 'lucide-react';
import * as UI from '@openfactu/ui';
import * as Router from 'react-router-dom';
import * as Common from '@openfactu/common';
import { apiClient } from '@/shared/http';

/**
 * Cliente "capado" para componentes de widget escritos por el usuario desde
 * la web (Ajustes → Widgets de dashboard → "Componente React"). Deliberadamente
 * solo expone `get` (siempre GET, nunca post/put/delete) — no es un sandbox real
 * (el componente sigue corriendo en el mismo origen, como cualquier plugin), pero
 * evita que el helper "oficial" pueda mutar datos; ver DashboardMetrics.ts para
 * el mismo criterio aplicado a los widgets sin código.
 */
const widgetApi = {
  get: async (path: string) => {
    if (!path.startsWith('/api/')) {
      throw new Error('[OpenFactuWidgetAPI] Solo se permiten rutas que empiecen con /api/');
    }
    // Delegamos en el ApiClient central: auth + tenant + errores normalizados.
    return apiClient.get<unknown>(path);
  },
};

/**
 * Exponemos las librerías al objeto global window para que los
 * plugins cargados dinámicamente puedan acceder a ellas sin redundancia.
 */
export const initializeSDK = () => {
  (window as any).React = React;
  (window as any).ReactDOM = ReactDOM;
  (window as any).Lucide = Lucide;
  (window as any).OpenFactuUI = UI;
  (window as any).ReactRouterDOM = Router;
  (window as any).OpenFactuCommon = Common;
  (window as any).OpenFactuWidgetAPI = widgetApi;

  console.log('[SDK] Infraestructura compartida inicializada en window.');
};
