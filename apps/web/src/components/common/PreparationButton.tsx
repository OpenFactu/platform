/**
 * Botón "Preparar" para albaranes de venta (SDN) y compra (PDN).
 * Llama a `/api/logistics/prep/from-<kind>/:id` y navega a Logística → Preparación.
 */
import React, { useState } from 'react';
import { Button, useToast } from '@openfactu/ui';
import { ClipboardCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTabs } from '../../context/TabsContext';

interface Props {
  docType: 'SDN' | 'PDN';
  docId: string;
  size?: number;
  className?: string;
}

export const PreparationButton: React.FC<Props> = ({ docType, docId, size = 14, className }) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const tabs = (() => {
    try {
      return useTabs();
    } catch {
      return null;
    }
  })();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const url =
        docType === 'SDN'
          ? `/api/logistics/prep/from-sdn/${docId}`
          : `/api/logistics/prep/from-pdn/${docId}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user?.tenantId || '',
        },
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || 'Error al iniciar preparación');
        return;
      }
      toast.success(d.reused ? 'Preparación ya iniciada — abriendo' : 'Preparación iniciada');
      // Navegar DIRECTAMENTE al detalle del shipment creado, en lugar de
      // caer en la lista genérica de /logistics. Así el usuario ve el
      // mapa, las tareas de picking y puede moverlo al siguiente estado.
      const sid = d.shipmentId;
      const target = sid ? `/logistics/shipments/${sid}` : '/logistics';
      const title = sid ? 'Envío en preparación' : 'Preparación';
      if (tabs && (tabs as any).openTab) {
        (tabs as any).openTab(target, { title });
      } else {
        window.location.href = target;
      }
    } catch (e: any) {
      toast.error(e?.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      isLoading={loading}
      className={className}
    >
      <ClipboardCheck size={size} className="mr-1" />
      {docType === 'SDN' ? 'Preparar envío' : 'Recepcionar'}
    </Button>
  );
};
