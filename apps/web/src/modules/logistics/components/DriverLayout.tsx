import React from 'react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DriverApp } from '@/modules/logistics/pages/DriverApp';

/**
 * Para usuarios con rol DRIVER: solo su app, sin barra lateral ni pestañas. La pantalla
 * la pone `DriverScreen` y cerrar sesión está en sus ajustes.
 */
export const DriverLayout: React.FC = () => (
  <MemoryRouter initialEntries={['/driver']}>
    <Routes>
      <Route path="/driver" element={<DriverApp />} />
      <Route path="*" element={<Navigate to="/driver" replace />} />
    </Routes>
  </MemoryRouter>
);
