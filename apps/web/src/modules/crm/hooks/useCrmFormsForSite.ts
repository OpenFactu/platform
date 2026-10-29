import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { formsApi } from '../api';
import { useCrmPermissions } from './useCrmPermissions';

export interface CrmFormsForSite {
  embedBase: string;
  forms: { slug: string; name: string }[];
}

/**
 * Formularios del CRM para el bloque «Formulario del CRM» del editor de la
 * web. `undefined` si la empresa no tiene el CRM y los formularios activos o
 * el usuario no puede verlos: el bloque lo indica en vez de ofrecer la lista.
 * La vista previa los incrusta desde este mismo origen; la web publicada usa
 * la URL pública configurada en el servidor.
 */
export function useCrmFormsForSite(): CrmFormsForSite | undefined {
  const { user } = useAuth();
  const { flags } = useTheme();
  const { canRead } = useCrmPermissions('/crm/forms');
  const enabled = !!(flags.crmEnabled && flags.crmFormsEnabled && canRead && user?.tenantId);
  const [forms, setForms] = useState<CrmFormsForSite['forms']>([]);

  useEffect(() => {
    if (!enabled) return;
    formsApi
      .list()
      .then((list) =>
        setForms(list.filter((f) => f.isActive).map((f) => ({ slug: f.slug, name: f.name }))),
      )
      .catch(() => setForms([]));
  }, [enabled]);

  if (!enabled) return undefined;
  return { embedBase: `${window.location.origin}/f/${user!.tenantId}`, forms };
}
