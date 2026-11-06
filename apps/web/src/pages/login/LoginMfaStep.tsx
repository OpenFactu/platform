/** Paso del código del login: casillas, enlaces de método y «No eres tú». */
import React from 'react';
import { Alert, Avatar, Button, OtpInput } from '@openfactu/ui';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { isCodeComplete, useMfaStep, type MfaStepParams, type MfaStepState } from './useMfaStep';
import type { LoginUserInfo } from './loginApi';

interface Props extends MfaStepState {
  user: LoginUserInfo;
  onNotYou: () => void;
}

export const LoginMfaStep: React.FC<Props> = ({
  user,
  onNotYou,
  mode,
  setMode,
  canBackup,
  resetKey,
  code,
  setCode,
  error,
  submitting,
  lockedFor,
  submit,
}) => {
  const { t } = useI18n();
  const name = user.name || user.email || '';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar src={user.avatarImageUrl ?? undefined} name={name} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg-default">{name}</p>
          {user.email && user.email !== name && (
            <p className="truncate text-xs text-fg-muted">{user.email}</p>
          )}
        </div>
      </div>

      <p className="text-sm text-fg-muted">
        {mode === 'totp' ? t('auth.mfa.totpHint') : t('auth.mfa.backupHint')}
      </p>

      {lockedFor > 0 && (
        <Alert tone="warning" role="status">
          {t('auth.mfa.locked', { seconds: lockedFor })}
        </Alert>
      )}

      {mode === 'totp' ? (
        // La celda se encoge para caber en la columna (320 px de pantalla → 272 px de columna);
        // 44 px como mucho. 58 px son los huecos y el separador.
        <div className="[container-type:inline-size] [&_.k-otp]:[--k-cell:min(44px,calc((100cqw_-_58px)/6))]">
          <OtpInput
            key={`totp-${resetKey}`}
            length={6}
            groupSize={3}
            autoFocus
            value={code}
            onChange={setCode}
            onComplete={submit}
            error={error}
            disabled={lockedFor > 0 || submitting}
          />
        </div>
      ) : (
        // Ocho casillas no caben a tamaño normal en la columna del formulario: la celda se
        // encoge hasta ocuparla (36 px como mucho; 60 px son los huecos y el separador).
        <div className="[container-type:inline-size] [&_.k-otp]:[--k-cell:min(36px,calc((100cqw_-_60px)/8))]">
          <OtpInput
            key={`backup-${resetKey}`}
            length={8}
            groupSize={4}
            mode="alphanumeric"
            size="sm"
            autoFocus
            value={code}
            onChange={setCode}
            onComplete={submit}
            error={error}
            disabled={lockedFor > 0 || submitting}
          />
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full gap-2"
        isLoading={submitting}
        disabled={submitting || lockedFor > 0 || !isCodeComplete(mode, code)}
        onClick={() => submit()}
      >
        {t('app.login.verify')}
        {!submitting && <ArrowRight size={16} />}
      </Button>

      <div className="flex flex-col items-start gap-1">
        {canBackup && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-0"
            onClick={() => setMode(mode === 'totp' ? 'backup' : 'totp')}
          >
            {mode === 'totp' ? t('auth.mfa.useBackup') : t('auth.mfa.useApp')}
          </Button>
        )}
        {/* «Usar una passkey»: oculto hasta que exista el inicio con passkey. */}
        <Button type="button" variant="link" size="sm" className="px-0" onClick={onNotYou}>
          {t('auth.mfa.notYou')}
        </Button>
      </div>
    </div>
  );
};

/** Une el hook con la vista: el hook necesita el reto, que solo existe en este paso. */
export const MfaStepContainer: React.FC<
  MfaStepParams & { user: LoginUserInfo; onNotYou: () => void }
> = ({ user, onNotYou, ...params }) => {
  const state = useMfaStep(params);
  return <LoginMfaStep {...state} user={user} onNotYou={onNotYou} />;
};
