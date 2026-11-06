import { Modal } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Aviso sin salida para la pestaña que se ha quedado en la empresa anterior: la sesión ya está en
 * otra (se cambió desde otra pestaña) y todo lo que pida aquí daría 403. Recargar entra con el token
 * que dejó la otra pestaña.
 */
export function TenantChangedNotice({ open }: { open: boolean }) {
  const { t } = useI18n();
  return (
    <Modal
      isOpen={open}
      onClose={() => undefined}
      dismissible={false}
      role="alertdialog"
      title={t('app.tenant.changedElsewhereTitle')}
      size="sm"
      hideCancel
      primaryAction={{ label: t('app.tenant.reload'), onClick: () => window.location.reload() }}
    >
      <p className="text-sm text-fg-muted">{t('app.tenant.changedElsewhereBody')}</p>
    </Modal>
  );
}
