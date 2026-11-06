/** Paso del código por correo: casillas en la web, espera con código de confirmación en el escritorio. */
import React from 'react';
import { Alert, Button, OtpInput } from '@openfactu/ui';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { LoginHandoffWait } from './LoginHandoffWait';
import { isEmailCodeComplete, useEmailCode, type EmailCodeState } from './useEmailCode';
import type { LoginResult } from './loginApi';

interface ViewProps extends EmailCodeState {
  email: string;
  onBack: () => void;
}

const ResendButton: React.FC<Pick<ViewProps, 'canResend' | 'resendIn' | 'resend'>> = ({
  canResend,
  resendIn,
  resend,
}) => {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="px-0"
      disabled={!canResend}
      onClick={() => void resend()}
    >
      {resendIn > 0 ? t('auth.email.resendIn', { seconds: resendIn }) : t('auth.email.resend')}
    </Button>
  );
};

export const LoginEmailCodeStep: React.FC<ViewProps> = (p) => {
  const { t } = useI18n();

  if (p.desktop) {
    return (
      <div className="space-y-4">
        {p.error && (
          <Alert tone="danger" role="alert">
            {p.error}
          </Alert>
        )}
        <LoginHandoffWait
          confirmCode={p.handoff?.confirmCode ?? null}
          description={
            <>
              {t('auth.email.sentTo', { email: p.email })}. {t('auth.email.desktopHint')}
            </>
          }
          onCancel={p.onBack}
        >
          <ResendButton canResend={p.canResend} resendIn={p.resendIn} resend={p.resend} />
        </LoginHandoffWait>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-fg-default">
          {t('auth.email.sentTo', { email: p.email })}
        </p>
        <p className="text-sm text-fg-muted">{t('auth.email.hint')}</p>
      </div>

      {p.lockedFor > 0 && (
        <Alert tone="warning" role="status">
          {t('auth.email.locked', { seconds: p.lockedFor })}
        </Alert>
      )}

      {/* Seis casillas: la celda se encoge para caber en la columna (44 px como mucho; 58 px son los huecos). */}
      <div className="[container-type:inline-size] [&_.k-otp]:[--k-cell:min(44px,calc((100cqw_-_58px)/6))]">
        <OtpInput
          key={`email-${p.resetKey}`}
          length={6}
          groupSize={3}
          autoFocus
          value={p.code}
          onChange={p.setCode}
          onComplete={p.submit}
          error={p.error}
          disabled={p.lockedFor > 0 || p.submitting}
        />
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full gap-2"
        isLoading={p.submitting}
        disabled={p.submitting || p.lockedFor > 0 || !isEmailCodeComplete(p.code)}
        onClick={() => void p.submit()}
      >
        {t('app.login.verify')}
        {!p.submitting && <ArrowRight size={16} />}
      </Button>

      <p className="text-xs text-fg-subtle">{t('auth.email.linkAlso')}</p>

      <div className="flex flex-col items-start gap-1">
        <ResendButton canResend={p.canResend} resendIn={p.resendIn} resend={p.resend} />
        <Button type="button" variant="link" size="sm" className="px-0" onClick={p.onBack}>
          {t('auth.email.back')}
        </Button>
      </div>
    </div>
  );
};

/** Une el hook con la vista: el hook necesita el correo, que solo existe en este paso. */
export const EmailCodeContainer: React.FC<{
  email: string;
  tenantId?: string;
  onDone: (data: LoginResult) => void;
  onBack: () => void;
}> = ({ email, tenantId, onDone, onBack }) => {
  const state = useEmailCode({ email, tenantId, onDone });
  return <LoginEmailCodeStep {...state} email={email} onBack={onBack} />;
};
