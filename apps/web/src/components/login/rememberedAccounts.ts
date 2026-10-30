/**
 * Cuentas recordadas en este navegador para el acceso rápido del login
 * («Continuar como…»). Se guarda solo lo necesario para mostrar la cuenta y
 * rellenar el formulario: el usuario o email con el que se entró, el nombre, la
 * foto y la empresa. Nunca la contraseña ni el token: al elegir una cuenta, el
 * login sigue pidiendo la contraseña (y el código 2FA si lo tiene).
 *
 * Vive en localStorage, que puede no estar disponible (modo privado, bloqueo):
 * entonces simplemente no hay cuentas recordadas.
 */

export interface RememberedAccount {
  /** Lo que se teclea en «Usuario o email». */
  login: string;
  name: string;
  avatarUrl?: string | null;
  tenantId: string;
  tenantName?: string;
  lastUsedAt: number;
}

const STORAGE_KEY = 'keirost:remembered-accounts';
const MAX_ACCOUNTS = 5;

const sameAccount = (a: Pick<RememberedAccount, 'login' | 'tenantId'>, b: typeof a) =>
  a.login.toLowerCase() === b.login.toLowerCase() && a.tenantId === b.tenantId;

/** Las cuentas recordadas, de la más reciente a la más antigua. */
export function loadRememberedAccounts(): RememberedAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as RememberedAccount[]) : [];
    return Array.isArray(list)
      ? list
          .filter((a) => a && typeof a.login === 'string' && typeof a.tenantId === 'string')
          .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      : [];
  } catch {
    return [];
  }
}

function save(list: RememberedAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
  } catch {
    /* sin almacenamiento: el acceso rápido no estará disponible */
  }
}

/** Añade o actualiza una cuenta tras un acceso correcto. */
export function rememberAccount(account: Omit<RememberedAccount, 'lastUsedAt'>) {
  const rest = loadRememberedAccounts().filter((a) => !sameAccount(a, account));
  save([{ ...account, lastUsedAt: Date.now() }, ...rest]);
}

/** Quita una cuenta del acceso rápido de este navegador. */
export function forgetAccount(account: Pick<RememberedAccount, 'login' | 'tenantId'>) {
  save(loadRememberedAccounts().filter((a) => !sameAccount(a, account)));
}
