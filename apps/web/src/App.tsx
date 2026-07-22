import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GlobalLoader, PopupProvider } from '@openfactu/ui';
import { SetupWizard } from './pages/SetupWizard';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { TrackingPage } from './pages/public/TrackingPage';
import { KioskMode } from '@/modules/hr/pages/KioskMode';
import { useAuth } from './context/AuthContext';
import { MainLayout } from './components/MainLayout';
import { TabsProvider } from './context/TabsContext';
import { MobileNavProvider } from './context/MobileNavContext';
import { ScannerProvider } from './context/ScannerContext';
import { AiChatProvider } from '@/modules/ai/AiChatContext';
import { ChatLauncherPanel } from '@/modules/ai/components/ChatLauncherPanel';
import { DebugPanel } from './components/DebugPanel';

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
        const res = await fetch(`/api/setup/status?t=${Date.now()}${force ? '&force=1' : ''}`);
        if (!res.ok) throw new Error('Servidor no disponible');
        const data = await res.json();
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
  const publicPath = window.location.pathname.startsWith('/track/');
  const kioskPath = window.location.pathname.startsWith('/kiosk');

  if (publicPath) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/track/:token" element={<TrackingPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Modo kiosko: ruta pública sin chrome del ERP. Se autentica con
  // x-kiosk-token (header) en cada fichaje. No requiere login del ERP.
  if (kioskPath) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/kiosk" element={<KioskMode />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (!setupChecked || authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 relative">
        <GlobalLoader isLoading={true} message="Keirost ERP | Cargando Sistema…" />
      </div>
    );
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
      {/* <DebugPanel /> */}
    </>
  );
}

export default App;
