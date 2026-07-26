import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Input, Button, Checkbox, ColorInput, FileDropzone, useToast } from '@openfactu/ui';
import {
  Landmark,
  Coins,
  FileText,
  CreditCard,
  CalendarClock,
  Save,
  PenLine,
  Upload,
  X as XIcon,
} from 'lucide-react';
import { FiscalCatalogTable } from '@/components/fiscal/FiscalCatalogTable';
import { PaymentTermsEditor } from '@/modules/accounting/components/PaymentTermsEditor';
import { useAuth } from '@/context/AuthContext';
import { validateIban, validateSwift, formatIban } from '@/utils/bankValidation';

/** Paleta de arranque para el color principal del PDF. */
const PDF_COLOR_PRESETS = [
  '#0D9488',
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#0F172A',
  '#64748B',
];

/**
 * Pestaña "Fiscal" dentro de Configuración de Empresa. Gestiona los
 * catálogos nuevos de la migración 032 (Currency, DocumentType,
 * PaymentMethod, PaymentTerm) y las claves bancarias / certificado fiscal.
 */
export const FiscalSettingsTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  // PUT /api/config/fiscal exige ADMIN o SUPERUSER en el backend
  // (adminMiddleware, apps/server/src/api/config.ts).
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
    'Content-Type': 'application/json',
  };

  // ── Datos bancarios + certificado fiscal (SystemConfig keys) ──
  const [bank, setBank] = useState({
    company_iban: '',
    company_bank_name: '',
    company_bank_swift: '',
    company_fiscal_regime: '',
    company_invoice_footer: '',
    company_invoice_color: '#0D9488',
    signature_name: '',
    signature_role: '',
    signature_image_url: '',
    signature_show_in_pdf: 'false',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.tenantId) return;
    // Los campos viven en SystemConfig — se leen por la ruta de config existente
    // mediante /api/config/system/<key> (o similar). Como fallback, cargamos
    // todos via un endpoint dedicado si existe; si no, lo dejamos editable y
    // al guardar se crea/actualiza.
    coreApi
      .get('/api/config/fiscal')
      .catch(() => null)
      .then((data) => {
        if (data && typeof data === 'object') setBank((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {
        /* endpoint opcional, se ignora */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const saveBank = async () => {
    setSaving(true);
    try {
      const res = await coreApi.raw('PUT', '/api/config/fiscal', bank);
      if (!res.ok) {
        const err = res.data ?? {};
        throw new Error(err?.error || 'Error');
      }
      toast.success('Guardado');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Datos bancarios + régimen + color ─── */}
      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 flex items-center gap-2">
            <Landmark size={14} /> Datos bancarios y fiscales
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                label="IBAN"
                value={bank.company_iban}
                onChange={(e) => setBank({ ...bank, company_iban: e.target.value })}
                onBlur={(e) => setBank({ ...bank, company_iban: formatIban(e.target.value) })}
                placeholder="ES91 2100 0418 45 0200051332"
              />
              <IbanFeedback value={bank.company_iban} />
            </div>
            <Input
              label="Banco"
              value={bank.company_bank_name}
              onChange={(e) => setBank({ ...bank, company_bank_name: e.target.value })}
            />
            <div>
              <Input
                label="SWIFT / BIC"
                value={bank.company_bank_swift}
                onChange={(e) =>
                  setBank({ ...bank, company_bank_swift: e.target.value.toUpperCase() })
                }
                placeholder="CAIXESBBXXX"
              />
              <SwiftFeedback value={bank.company_bank_swift} />
            </div>
            <Input
              label="Régimen fiscal"
              value={bank.company_fiscal_regime}
              onChange={(e) => setBank({ ...bank, company_fiscal_regime: e.target.value })}
              placeholder="General / Simplificado / Recargo equivalencia..."
            />
            <div className="md:col-span-2">
              <Input
                label="Pie legal de factura (opcional)"
                value={bank.company_invoice_footer}
                onChange={(e) => setBank({ ...bank, company_invoice_footer: e.target.value })}
                placeholder="Texto legal que aparece al pie del PDF"
              />
            </div>
            {/* ColorInput ya trae muestra + campo hex; el par de controles
                (selector de color nativo + Input) que había aquí era eso a mano. */}
            <ColorInput
              label="Color principal PDF"
              value={bank.company_invoice_color}
              onChange={(v) => setBank({ ...bank, company_invoice_color: v })}
              presets={PDF_COLOR_PRESETS}
            />
          </div>
          <div className="flex flex-col items-end gap-2">
            {!isAdmin && (
              <p className="text-[11px] text-ink-400 dark:text-ink-500">
                Solo un administrador puede guardar esta configuración.
              </p>
            )}
            <Button onClick={saveBank} disabled={saving || !isAdmin} className="gap-2">
              <Save size={14} />
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ─── Firma / representante legal ─── */}
      <Card>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 flex items-center gap-2">
              <PenLine size={14} /> Firma / representante
            </h2>
            {/* Checkbox y no Switch: se persiste con el «Guardar» de arriba
                (mismo estado `bank`), no al marcarlo. */}
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={bank.signature_show_in_pdf === 'true'}
                onChange={(v) => setBank({ ...bank, signature_show_in_pdf: v ? 'true' : 'false' })}
              />
              <span className="text-ink-700 dark:text-slate-200 font-bold">Mostrar en PDF</span>
            </label>
          </div>
          <p className="text-[11px] text-ink-400 dark:text-ink-500">
            El nombre y cargo aparecen bajo la línea de firma en la factura emitida. Si añades una
            URL de imagen (rúbrica escaneada), se imprime encima.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombre del firmante"
              value={bank.signature_name}
              onChange={(e) => setBank({ ...bank, signature_name: e.target.value })}
              placeholder="Juan García Pérez"
            />
            <Input
              label="Cargo"
              value={bank.signature_role}
              onChange={(e) => setBank({ ...bank, signature_role: e.target.value })}
              placeholder="Administrador único / Apoderado"
            />
            <div className="md:col-span-2">
              <label className="text-xs text-ink-500 dark:text-ink-400 block mb-1">
                Imagen de la firma (opcional) · PNG o JPG, máx. 500 KB
              </label>
              <div className="flex items-center gap-2">
                <Input
                  value={
                    bank.signature_image_url?.startsWith('data:')
                      ? '(imagen cargada)'
                      : bank.signature_image_url || ''
                  }
                  onChange={(e) => setBank({ ...bank, signature_image_url: e.target.value })}
                  readOnly={bank.signature_image_url?.startsWith('data:')}
                  placeholder="Pega una URL o sube un PNG →"
                  className="flex-1"
                />
                {/* El límite de 500 KB se sigue comprobando a mano (maxSizeMb
                    trabaja en MB y no cuadra exacto con 500 KB). */}
                <FileDropzone
                  variant="button"
                  accept="image/png,image/jpeg"
                  icon={<Upload size={14} />}
                  label="Subir PNG"
                  className="whitespace-nowrap"
                  onFiles={(files) => {
                    const f = files[0];
                    if (!f) return;
                    if (f.size > 500 * 1024) {
                      toast.error('Máximo 500 KB');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setBank({ ...bank, signature_image_url: String(reader.result || '') });
                    };
                    reader.onerror = () => toast.error('No se pudo leer el fichero');
                    reader.readAsDataURL(f);
                  }}
                  onReject={() => toast.error('Solo PNG o JPG')}
                />
                {bank.signature_image_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBank({ ...bank, signature_image_url: '' })}
                    title="Quitar firma"
                  >
                    <XIcon size={14} />
                  </Button>
                )}
              </div>
              {bank.signature_image_url && (
                <div className="mt-3 flex items-center gap-3 p-3 border border-line dark:border-ink-700 rounded-sm bg-white dark:bg-ink-900">
                  <span className="text-[10px] text-ink-400 font-mono uppercase tracking-wider">
                    Vista previa
                  </span>
                  <img src={bank.signature_image_url} alt="Firma" className="h-12 object-contain" />
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Divisas ─── */}
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4 text-ink-700 dark:text-slate-200">
            <Coins size={16} />
            <h2 className="text-base font-bold font-display">Divisas</h2>
          </div>
          <FiscalCatalogTable
            endpoint="/api/currencies"
            title="Monedas disponibles"
            defaultRow={{
              code: '',
              name: '',
              symbol: '',
              decimals: 2,
              exchangeRate: 1,
              isBase: false,
              isActive: true,
            }}
            columns={[
              { key: 'code', label: 'Código', width: '90px' },
              { key: 'name', label: 'Nombre' },
              { key: 'symbol', label: 'Símbolo', width: '90px' },
              { key: 'decimals', label: 'Decimales', type: 'number', width: '100px' },
              {
                key: 'exchangeRate',
                label: 'Cambio',
                type: 'number',
                width: '120px',
              },
              { key: 'isBase', label: 'Base', type: 'boolean', width: '70px' },
              { key: 'isActive', label: 'Activa', type: 'boolean', width: '80px' },
            ]}
          />
        </div>
      </Card>

      {/* ─── Tipos de documento ─── */}
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4 text-ink-700 dark:text-slate-200">
            <FileText size={16} />
            <h2 className="text-base font-bold font-display">Tipos de documento fiscal</h2>
          </div>
          <FiscalCatalogTable
            endpoint="/api/document-types"
            title="Tipos (F1, F2, R1...)"
            defaultRow={{
              code: '',
              name: '',
              description: '',
              docCategory: 'invoice',
              isRectify: false,
              isActive: true,
              sortOrder: 0,
            }}
            columns={[
              { key: 'code', label: 'Código', width: '110px', placeholder: 'F1, 33, INV…' },
              { key: 'name', label: 'Nombre', placeholder: 'Factura normal' },
              {
                key: 'docCategory',
                label: 'Categoría',
                width: '180px',
                type: 'select',
                options: [
                  { label: 'Factura', value: 'invoice' },
                  { label: 'Abono / Rectificativa', value: 'credit_note' },
                  { label: 'Cargo (nota débito)', value: 'debit_note' },
                  { label: 'Ticket / Simplificada', value: 'ticket' },
                ],
              },
              { key: 'isRectify', label: 'Rectificativa', type: 'boolean', width: '120px' },
              { key: 'isActive', label: 'Activo', type: 'boolean', width: '80px' },
            ]}
            render={(col, row) => {
              if (col.key === 'docCategory') {
                const map: Record<string, string> = {
                  invoice: 'Factura',
                  credit_note: 'Abono / Rectificativa',
                  debit_note: 'Cargo',
                  ticket: 'Ticket / Simplificada',
                };
                const label = map[row.docCategory] || row.docCategory || '—';
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-xs bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-wider">
                    {label}
                  </span>
                );
              }
              return col.type === 'boolean'
                ? row[col.key]
                  ? '✓'
                  : ''
                : String(row[col.key] ?? '');
            }}
          />
        </div>
      </Card>

      {/* ─── Métodos de pago ─── */}
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4 text-ink-700 dark:text-slate-200">
            <CreditCard size={16} />
            <h2 className="text-base font-bold font-display">Métodos de pago</h2>
          </div>
          <FiscalCatalogTable
            endpoint="/api/payment-methods"
            title="Cómo se cobra / paga"
            defaultRow={{ code: '', name: '', isActive: true }}
            columns={[
              { key: 'code', label: 'Código', width: '140px' },
              { key: 'name', label: 'Nombre' },
              { key: 'isActive', label: 'Activo', type: 'boolean', width: '80px' },
            ]}
          />
        </div>
      </Card>

      {/* ─── Plazos de pago ─── */}
      <Card>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4 text-ink-700 dark:text-slate-200">
            <CalendarClock size={16} />
            <h2 className="text-base font-bold font-display">Plazos de pago</h2>
          </div>
          <PaymentTermsEditor />
        </div>
      </Card>
    </div>
  );
};

const IbanFeedback: React.FC<{ value: string }> = ({ value }) => {
  if (!value?.trim()) return null;
  const res = validateIban(value);
  return res.ok ? (
    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
      ✓ IBAN válido
    </p>
  ) : (
    <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 font-mono">
      ⚠ IBAN: {res.reason}
    </p>
  );
};

const SwiftFeedback: React.FC<{ value: string }> = ({ value }) => {
  if (!value?.trim()) return null;
  const res = validateSwift(value);
  return res.ok ? (
    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
      ✓ SWIFT válido
    </p>
  ) : (
    <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 font-mono">
      ⚠ SWIFT: {res.reason}
    </p>
  );
};
