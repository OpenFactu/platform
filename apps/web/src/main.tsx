import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { PluginProvider } from './context/PluginContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { I18nProvider } from './i18n/I18nContext';
import { ToastProvider } from '@openfactu/ui';
import { initializeSDK } from './sdk/sdk-proxy';

// Inicializar infra compartida para plugins
initializeSDK();

// El dev server ahora corre sin service worker por default (ver vite.config.ts,
// VITE_PWA_DEV). Si el navegador todavía tiene registrado uno de una sesión
// anterior (con VITE_PWA_DEV=true, o de antes de este cambio), lo
// desregistramos para que no siga sirviendo bundles viejos en cada reload.
if (import.meta.env.DEV && !import.meta.env.VITE_PWA_DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) reg.unregister();
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <ThemeProvider>
            <PluginProvider>
              <App />
            </PluginProvider>
          </ThemeProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  </React.StrictMode>,
);
