/** Ceremonias WebAuthn del navegador, sin estado: las usan el login y la ficha de passkeys. */
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export const passkeysSupported = (): boolean => {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

/** El usuario cerró o rechazó el diálogo del sistema: no es un error que mostrar. */
export const isPasskeyCancel = (err: unknown): boolean => {
  const name = (err as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'AbortError';
};

/** Lanza el diálogo de autenticación; `null` si el usuario lo cancela. */
export async function authenticateWithPasskey(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON | null> {
  try {
    return await startAuthentication({ optionsJSON });
  } catch (err) {
    if (isPasskeyCancel(err)) return null;
    throw err;
  }
}

/** Lanza el diálogo de alta; `null` si el usuario lo cancela. */
export async function registerPasskey(
  optionsJSON: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON | null> {
  try {
    return await startRegistration({ optionsJSON });
  } catch (err) {
    if (isPasskeyCancel(err)) return null;
    throw err;
  }
}
