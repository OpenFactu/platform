/** Qué formas de entrar ofrece el servidor; si falla, solo queda la contraseña. */
import { useEffect, useState } from 'react';
import { methods, type LoginMethods } from './loginApi';

const ONLY_PASSWORD: LoginMethods = { password: true, passkey: false, emailCode: false, sso: [] };

export function useLoginMethods(tenantId?: string): LoginMethods {
  const [available, setAvailable] = useState<LoginMethods>(ONLY_PASSWORD);

  useEffect(() => {
    let cancelled = false;
    methods(tenantId || undefined)
      .then((m) => !cancelled && setAvailable(m))
      .catch(() => !cancelled && setAvailable(ONLY_PASSWORD));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return available;
}
