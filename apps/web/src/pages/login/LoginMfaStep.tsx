/** Paso del código del login: casillas, enlaces de método y «No eres tú». */
import React from 'react';
import { Alert, Avatar, Button, OtpInput } from '@openfactu/ui';
import { ArrowRight, KeyRound } from 'lucide-react';
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
  canTotp,
  canPasskey,
  elsewhere,
  resetKey,
  code,
  setCode,
  error,
  submitting,
  lockedFor,
  submit,
  signInWithPasskey,
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

      {elsewhere ? (
        // Sin método usable aquí: se dice por qué y solo queda volver, no un formulario vacío.
        <Alert tone="warning" role="status">
          {elsewhere === 'desktop'
            ? t('auth.passkey.elsewhereDesktop')
            : t('auth.passkey.elsewhereDevice')}
        </Alert>
      ) : (
        <p className="text-sm text-fg-muted">
          {mode === 'totp'
            ? t('auth.mfa.totpHint')
            : mode === 'backup'
              ? t('auth.mfa.backupHint')
              : t('auth.mfa.passkeyHint')}
        </p>
      )}

      {lockedFor > 0 && (
        <Alert tone="warning" role="status">
          {t('auth.mfa.locked', { seconds: lockedFor })}
        </Alert>
      )}

      {elsewhere ? null : mode === 'passkey' ? (
        <>
          {error && (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          )}
          <Button
            type="button"
            size="lg"
            className="w-full gap-2"
            isLoading={submitting}
            disabled={submitting || lockedFor > 0}
            onClick={() => void signInWithPasskey()}
          >
            {!submitting && <KeyRound size={16} />}
            {t('auth.passkey.use')}
          </Button>
        </>
      ) : mode === 'totp' ? (
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

      {!elsewhere && mode !== 'passkey' && (
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
      )}

      <div className="flex flex-col items-start gap-1">
        {!elsewhere && canTotp && mode !== 'totp' && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-0"
            onClick={() => setMode('totp')}
          >
            {t('auth.mfa.useApp')}
          </Button>
        )}
        {!elsewhere && canBackup && mode !== 'backup' && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-0"
            onClick={() => setMode('backup')}
          >
            {t('auth.mfa.useBackup')}
          </Button>
        )}
        {!elsewhere && canPasskey && mode !== 'passkey' && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-0"
            onClick={() => setMode('passkey')}
          >
            {t('auth.mfa.usePasskey')}
          </Button>
        )}
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
