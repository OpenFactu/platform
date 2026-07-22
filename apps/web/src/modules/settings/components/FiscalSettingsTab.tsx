import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Input, Button, useToast } from '@openfactu/ui';
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

/**
 * Pestaña "Fiscal" dentro de Configuración de Empresa. Gestiona los
 * catálogos nuevos de la migración 032 (Currency, DocumentType,
 * PaymentMethod, PaymentTerm) y las claves bancarias / certificado fiscal.
 */
export const FiscalSettingsTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();

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
              <label className="text-xs text-ink-500 dark:text-ink-400 block mb-1">IBAN</label>
              <Input
                value={bank.company_iban}
                onChange={(e) => setBank({ ...bank, company_iban: e.target.value })}
                onBlur={(e) => setBank({ ...bank, company_iban: formatIban(e.target.value) })}
                placeholder="ES91 2100 0418 45 0200051332"
              />
              <IbanFeedback value={bank.company_iban} />
            </div>
            <div>
              <label className="text-xs text-ink-500 dark:text-ink-400 block mb-1">Banco</label>
              <Input
                value={bank.company_bank_name}
                onChange={(e) => setBank({ ...bank, company_bank_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-ink-500 dark:text-ink-400 block mb-1">
                SWIFT / BIC
              </label>
              <Input
                value={bank.company_bank_swift}
                onChange={(e) =>
                  setBank({ ...bank, company_bank_swift: e.target.value.toUpperCase() })
                }
                placeholder="CAIXESBBXXX"
              />
              <SwiftFeedback value={bank.company_bank_swift} />
            </div>
            <div>
              <label className="text-xs text-ink-500 dark:text-ink-400 block mb-1">
                Régimen fiscal
              </label>
              <Input
                value={bank.company_fiscal_regime}
                onChange={(e) => setBank({ ...bank, company_fiscal_regime: e.target.value })}
                placeholder="General / Simplificado / Recargo equivalencia..."
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-ink-500 dark:text-ink-400 block mb-1">
                Pie legal de factura (opcional)
              </label>
              <Input
                value={bank.company_invoice_footer}
                onChange={(e) => setBank({ ...bank, company_invoice_footer: e.target.value })}
                placeholder="Texto legal que aparece al pie del PDF"
              />
            </div>
            <div>
              <label className="text-xs text-ink-500 dark:text-ink-400 block mb-1">
                Color principal PDF
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  className="h-9 w-12 rounded-xs border border-line dark:border-ink-700 cursor-pointer"
                  value={bank.company_invoice_color}
                  onChange={(e) => setBank({ ...bank, company_invoice_color: e.target.value })}
                />
                <Input
                  value={bank.company_invoice_color}
                  onChange={(e) => setBank({ ...bank, company_invoice_color: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveBank} disabled={saving} className="gap-2">
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
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent cursor-pointer"
                checked={bank.signature_show_in_pdf === 'true'}
                onChange={(e) =>
                  setBank({
                    ...bank,
                    signature_show_in_pdf: e.target.checked ? 'true' : 'false',
                  })
                }
              />
              <span className="text-ink-700 dark:text-slate-200 font-bold">Mostrar en PDF</span>
            </label>
          </div>
          <p className="text-[11px] text-ink-400 dark:text-ink-500">
            El nombre y cargo aparecen bajo la línea de firma en la factura emitida. Si añades una
            URL de imagen (rúbrica escaneada), se imprime encima.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-ink-500 dark:text-ink-400 block mb-1">
                Nombre del firmante
              </label>
              <Input
                value={bank.signature_name}
                onChange={(e) => setBank({ ...bank, signature_name: e.target.value })}
                placeholder="Juan García Pérez"
              />
            </div>
            <div>
              <label className="text-xs text-ink-500 dark:text-ink-400 block mb-1">Cargo</label>
              <Input
                value={bank.signature_role}
                onChange={(e) => setBank({ ...bank, signature_role: e.target.value })}
                placeholder="Administrador único / Apoderado"
              />
            </div>
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
                <label className="inline-flex items-center gap-2 px-3 py-2 border border-line dark:border-ink-700 rounded-xs bg-white dark:bg-ink-900 text-ink-700 dark:text-slate-200 text-sm font-bold cursor-pointer hover:bg-accent/5 transition-colors whitespace-nowrap">
                  <Upload size={14} />
                  Subir PNG
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 500 * 1024) {
                        toast.error('Máximo 500 KB');
                        e.target.value = '';
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setBank({
                          ...bank,
                          signature_image_url: String(reader.result || ''),
                        });
                      };
                      reader.onerror = () => toast.error('No se pudo leer el fichero');
                      reader.readAsDataURL(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {bank.signature_image_url && (
                  <button
                    type="button"
                    onClick={() => setBank({ ...bank, signature_image_url: '' })}
                    className="p-2 text-ink-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xs transition-colors"
                    title="Quitar firma"
                  >
                    <XIcon size={14} />
                  </button>
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
