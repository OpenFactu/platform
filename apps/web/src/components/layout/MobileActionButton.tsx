import React, { useState } from 'react';
import { FloatingActionButton } from '@openfactu/ui';
import type { FloatingAction } from '@openfactu/ui';
import { ScanLine } from 'lucide-react';
import { useScanner } from '../../context/ScannerContext';
import { useTabs } from '../../context/TabsContext';
import { BarcodeCameraModal } from '../scanner/BarcodeCameraModal';
import {
  useFloatingButtonHidden,
  useMobilePageActionsFor,
} from '../../context/MobilePageActionsContext';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Botón flotante de móvil (`FloatingActionButton` de @openfactu/ui). Solo sale
 * donde hay algo que hacer: «Escanear» si la pantalla activa recibe lo escaneado, y
 * las acciones que haya registrado (las de un documento: asentar, PDF, enviar…; ver
 * MobilePageActionsContext), junto al pulgar. Buscar ya está en la lupa de la cabecera.
 *
 * En móvil no hay barra de navegación abajo: le quitaba alto a cada pantalla
 * (al chat, el que más) y el menú completo ya se abre con la hamburguesa de la
 * cabecera.
 */
export const MobileActionButton: React.FC = () => {
  const { activeTabId } = useTabs();
  const { handlerTabs } = useScanner();
  const [scanOpen, setScanOpen] = useState(false);
  const { t } = useI18n();

  const canScan = !!activeTabId && handlerTabs.includes(activeTabId);
  const pageActions = useMobilePageActionsFor(activeTabId);
  const hidden = useFloatingButtonHidden(activeTabId);
  const scan: FloatingAction = {
    id: 'scan',
    label: t('app.bottomNav.scan'),
    icon: <ScanLine size={19} />,
    onClick: () => setScanOpen(true),
  };
  const actions = [...(canScan ? [scan] : []), ...pageActions];

  return (
    <>
      {actions.length > 0 && !hidden && (
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
