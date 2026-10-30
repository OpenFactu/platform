import React from 'react';
import { Alert, Button, Field, SearchableSelect, Table, type TableColumn } from '@openfactu/ui';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { MobileLineCards } from '../MobileLineCards';
import { AddLinesButton } from '../AddLinesButton';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Sección «Líneas» del alta: tabla en escritorio y tarjetas en móvil, con el
 * botón de añadir debajo. Igual en todos los tipos de documento.
 */
export const LinesSection: React.FC<{
  columns: TableColumn<any>[];
  lines: any[];
  onAdd: () => void;
  addLabel?: string;
  emptyMessage?: string;
}> = ({ columns, lines, onAdd, addLabel, emptyMessage: emptyProp }) => {
  const { t } = useI18n();
  const emptyMessage = emptyProp ?? t('doc.lines.noLinesYet');
  const mobile = useIsMobile();
  return (
    <div>
      {mobile ? (
        <MobileLineCards columns={columns} lines={lines} emptyMessage={emptyMessage} />
      ) : (
        <Table responsive="scroll" columns={columns} data={lines} emptyMessage={emptyMessage} />
      )}
      <div className="p-4 border-t border-border-subtle">
        <AddLinesButton addLine={onAdd} label={addLabel} />
      </div>
    </div>
  );
};

/** Cliente o proveedor del documento (obligatorio). */
export const PartnerField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  partners: any[];
  placeholder?: string;
}> = ({ label, value, onChange, partners, placeholder }) => {
  const { t } = useI18n();
  return (
    <Field label={label} required>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={partners.map((p: any) => ({ label: p.name, value: p.id }))}
        placeholder={placeholder ?? t('doc.common.select')}
        required
      />
    </Field>
  );
};

/**
 * Cabecera en dos columnas: los campos del documento a la izquierda y serie,
 * periodo y campos de plugin a la derecha.
 */
export const HeaderSection: React.FC<{ fields: React.ReactNode; side: React.ReactNode }> = ({
  fields,
  side,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] gap-6">
    <div className="min-w-0">{fields}</div>
    <div className="space-y-4">{side}</div>
  </div>
);

/**
 * Aviso de que el interlocutor tiene retención IRPF por defecto y el documento
 * va sin ella, con el botón para aplicarla. Estaba copiado en pedidos y
 * albaranes como un recuadro ámbar hecho a mano.
 */
export const WithholdingNotice: React.FC<{
  partner: any;
  currentRate: number;
  onApply: (rate: number) => void;
  /** «pedido», «albarán»… */
  docLabel: string;
  side: 'sale' | 'purchase';
}> = ({ partner, currentRate, onApply, docLabel, side }) => {
  const { t } = useI18n();
  const rate = Number(partner?.defaultWithholdingRate || 0);
  if (!(rate > 0) || Number(currentRate || 0) !== 0) return null;
  return (
    <Alert
      tone="warning"
      title={
        side === 'sale'
          ? t('doc.withholding.customerDefault', { rate })
          : t('doc.withholding.supplierDefault', { rate })
      }
      action={
        <Button type="button" variant="secondary" size="sm" onClick={() => onApply(rate)}>
          {t('doc.withholding.apply', { rate })}
        </Button>
      }
    >
      {t('doc.withholding.withoutIt', { doc: docLabel })}
      {side === 'sale' && ` ${t('doc.withholding.saleHint')}`}
    </Alert>
  );
};
