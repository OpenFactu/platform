import React, { useState } from 'react';
import { FloatingActionButton } from '@openfactu/ui';
import type { FloatingAction } from '@openfactu/ui';
import { ScanLine, Search } from 'lucide-react';
import { useTabs } from '../../context/TabsContext';
import { BarcodeCameraModal } from '../scanner/BarcodeCameraModal';
import { useModuleSubTabs } from './useModuleSubTabs';
import { useMobilePageActionsFor } from '../../context/MobilePageActionsContext';
import { useI18n } from '@/i18n/I18nContext';

/** Pantallas donde tiene sentido escanear: artículos y documentos. */
const SCAN_PREFIXES = ['/sales', '/purchases', '/documents', '/items', '/inventory'];

/**
 * Botón flotante de móvil (`FloatingActionButton` de @openfactu/ui). Solo sale
 * donde hay algo que hacer: «Escanear» y «Buscar» donde hay códigos que leer, y
 * las acciones que la pantalla activa haya registrado (las de un documento:
 * asentar, PDF, enviar…; ver MobilePageActionsContext), junto al pulgar.
 *
 * En móvil no hay barra de navegación abajo: le quitaba alto a cada pantalla
 * (al chat, el que más) y el menú completo ya se abre con la hamburguesa de la
 * cabecera.
 */
export const MobileActionButton: React.FC = () => {
  const { activeTabId, tabs } = useTabs();
  const { active } = useModuleSubTabs();
  const activePath = tabs.find((t) => t.id === activeTabId)?.path?.split('?')[0] || '/';
  const [scanOpen, setScanOpen] = useState(false);
  const { t } = useI18n();

  const canScan = active?.id === 'inventory' || SCAN_PREFIXES.some((p) => activePath.startsWith(p));
  const pageActions = useMobilePageActionsFor(activeTabId);
  const quickActions: FloatingAction[] = [
    {
      id: 'scan',
      label: t('app.bottomNav.scan'),
      icon: <ScanLine size={19} />,
      onClick: () => setScanOpen(true),
    },
    {
      id: 'search',
      label: t('app.bottomNav.search'),
      icon: <Search size={19} />,
      // El buscador global (Ctrl+K) escucha el teclado: se le pide que abra.
      onClick: () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })),
    },
  ];
  const actions = [...(canScan ? quickActions : []), ...pageActions];

  return (
    <>
      {actions.length > 0 && (
        <FloatingActionButton
          className="md:hidden"
          actions={actions}
          label={pageActions.length ? t('app.bottomNav.actions') : t('app.bottomNav.quickActions')}
        />
      )}
      <BarcodeCameraModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </>
  );
};
