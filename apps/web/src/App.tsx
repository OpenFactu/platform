import { apiClient } from '@/shared/http';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PopupProvider } from '@openfactu/ui';
import { useAuth } from './context/AuthContext';
import { PageLoading } from './components/PageLoading';
import { BootLoader } from './components/BootLoader';
import { TabsProvider } from './context/TabsContext';
import { MobileNavProvider } from './context/MobileNavContext';
import { ScannerProvider } from './context/ScannerContext';
import { AiChatProvider } from '@/modules/ai/AiChatContext';
import { ChatLauncherPanel } from '@/modules/ai/components/ChatLauncherPanel';
import { DebugPanel } from './components/DebugPanel';

const SetupWizard = lazy(() =>
  import('./pages/SetupWizard').then((m) => ({ default: m.SetupWizard })),
);
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const ForgotPassword = lazy(() =>
  import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })),
);
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const TrackingPage = lazy(() =>
  import('./pages/public/TrackingPage').then((m) => ({ default: m.TrackingPage })),
);
const PublicFormPage = lazy(() =>
  import('./pages/public/PublicFormPage').then((m) => ({ default: m.PublicFormPage })),
);
const KioskMode = lazy(() =>
  import('@/modules/hr/pages/KioskMode').then((m) => ({ default: m.KioskMode })),
);
const MainLayout = lazy(() =>
  import('./components/MainLayout').then((m) => ({ default: m.MainLayout })),
);

function App() {
  const [setupChecked, setSetupChecked] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const { isAuthenticated, loading: authLoading } = useAuth();

  useEffect(() => {
    const checkSetup = async () => {
      try {
        // `?force=1` en la URL del front fuerza al backend a devolver
        // setupNeeded=true. Útil para volver a ver el wizard sin haber tirado
        // los tenants (modo debug).
        const force = new URLSearchParams(window.location.search).get('force') === '1';
        const data = await apiClient.get<any>(
          `/api/setup/status?t=${Date.now()}${force ? '&force=1' : ''}`,
          { auth: false },
        );
        console.log('[App] Setup Status:', data);
        setSetupNeeded(data.setupNeeded);
        setSetupChecked(true);
      } catch (err) {
        console.error('Error checking setup status', err);
        setSetupNeeded(true);
        setSetupChecked(true);
      }
    };
    checkSetup();
  }, []);

  // Rutas públicas que deben funcionar sin auth ni wizard — `/track/:token`.
  // El `BrowserRouter` se remonta dentro de cada rama, así que duplicamos el
  // check aquí para el caso "cargando".
  const publicPath =
    window.location.pathname.startsWith('/track/') || window.location.pathname.startsWith('/f/');
  const kioskPath = window.location.pathname.startsWith('/kiosk');

  if (publicPath) {
    return (
      <>
        <BrowserRouter>
          <Routes>
            <Route path="/track/:token" element={<TrackingPage />} />
            <Route path="/f/:tenantId/:slug" element={<PublicFormPage />} />
          </Routes>
        </BrowserRouter>
        <DebugPanel />
      </>
    );
  }

  // Modo kiosko: ruta pública sin chrome del ERP. Se autentica con
  // x-kiosk-token (header) en cada fichaje. No requiere login del ERP.
  if (kioskPath) {
    return (
      <>
        <BrowserRouter>
          <Routes>
            <Route path="/kiosk" element={<KioskMode />} />
          </Routes>
        </BrowserRouter>
        <DebugPanel />
      </>
    );
  }

  if (!setupChecked || authLoading) {
    return <BootLoader />;
  }

  if (setupNeeded) {
    return (
      <>
        <BrowserRouter>
          <PopupProvider>
            <Routes>
              <Route path="/setup" element={<SetupWizard />} />
              <Route path="*" element={<Navigate to="/setup" replace />} />
            </Routes>
          </PopupProvider>
        </BrowserRouter>
        <DebugPanel />
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/que-es-keirost" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        <DebugPanel />
      </>
    );
  }

  return (
    <>
      <TabsProvider>
        <MobileNavProvider>
          <ScannerProvider>
            <PopupProvider>
              <AiChatProvider>
                <MainLayout />
                <ChatLauncherPanel />
              </AiChatProvider>
            </PopupProvider>
          </ScannerProvider>
        </MobileNavProvider>
      </TabsProvider>
      <DebugPanel />
    </>
  );
}

export default function AppWithSuspense() {
  return (
    <Suspense fallback={<PageLoading fullScreen />}>
      <App />
    </Suspense>
  );
}
