import { Button, Input, Card, Table, Badge, Loader, KpiCard, useToast } from '@openfactu/ui';
import { Mail, Search } from 'lucide-react';
import React from 'react';
import { KeirostLogo } from '../components/branding/KeirostLogo';

const TEAL_SCALE: Array<{ name: string; hex: string }> = [
  { name: '50', hex: '#F0FAFA' },
  { name: '100', hex: '#CCEFED' },
  { name: '200', hex: '#99DDD9' },
  { name: '300', hex: '#5EC9C3' },
  { name: '400', hex: '#2DB8B0' },
  { name: '500 ★', hex: '#0D9488' },
  { name: '600', hex: '#0A6E63' },
  { name: '700', hex: '#08524A' },
  { name: '800', hex: '#063D37' },
  { name: '900', hex: '#042B26' },
];

const INK_SCALE: Array<{ name: string; hex: string }> = [
  { name: '50', hex: '#FAFBFC' },
  { name: '100', hex: '#F1F5F9' },
  { name: '200', hex: '#E2E8F0' },
  { name: '300', hex: '#CBD5E1' },
  { name: '400', hex: '#94A3B8' },
  { name: '500', hex: '#64748B' },
  { name: '600', hex: '#475569' },
  { name: '700', hex: '#2D3A4A' },
  { name: '800', hex: '#1A2535' },
  { name: '900 ★', hex: '#0A1628' },
];

const SystemColors: Array<{ name: string; hex: string; token: string; role: string }> = [
  {
    name: 'Ink / Brand Black',
    hex: '#0A1628',
    token: '--k-ink-900',
    role: 'Texto principal, fondos oscuros',
  },
  {
    name: 'Teal / Brand Accent',
    hex: '#0D9488',
    token: '--k-teal-500',
    role: 'Acento principal, CTAs',
  },
  { name: 'White', hex: '#FFFFFF', token: '—', role: 'Fondo base' },
  { name: 'Surface', hex: '#FAFBFC', token: '--k-surface', role: 'Fondos de sección' },
  { name: 'Line / Border', hex: '#E2E8F0', token: '--k-line', role: 'Divisores' },
  { name: 'Ink Muted', hex: '#64748B', token: '--k-ink-500', role: 'Texto secundario' },
];

const Semantics: Array<{ name: string; hex: string; desc: string }> = [
  { name: 'Success', hex: '#16A34A', desc: 'Pagado · OK' },
  { name: 'Warning', hex: '#D97706', desc: 'Pendiente · Revisar' },
  { name: 'Danger', hex: '#DC2626', desc: 'Error · Vencido' },
  { name: 'Info', hex: '#2563EB', desc: 'Información · Nota' },
];

const SectionHeader: React.FC<{ num: string; title: string }> = ({ num, title }) => (
  <div className="flex items-baseline gap-4 mb-8 pb-4 border-b border-[var(--k-line)]">
    <span className="font-mono text-[11px] text-[var(--k-teal-500)] tracking-[1px]">{num}</span>
    <span className="font-display font-semibold text-[18px] text-[var(--k-ink-900)]">{title}</span>
  </div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--k-ink-400)] mb-3">
    {children}
  </div>
);

export const StyleGuide: React.FC = () => {
  const toast = useToast();
  const [showOverlayLoader, setShowOverlayLoader] = React.useState(false);

  const tableData = [
    {
      id: 'INV-2025-0042',
      client: 'Transportes García S.L.',
      date: '12 ene 2025',
      status: 'Pagado',
      total: '€ 3.480,00',
    },
    {
      id: 'INV-2025-0041',
      client: 'Construcciones Pérez',
      date: '10 ene 2025',
      status: 'Pendiente',
      total: '€ 7.200,00',
    },
    {
      id: 'INV-2025-0040',
      client: 'Logística Norte S.A.',
      date: '08 ene 2025',
      status: 'Vencido',
      total: '€ 1.950,00',
    },
    {
      id: 'INV-2025-0039',
      client: 'Distribuciones Alva',
      date: '05 ene 2025',
      status: 'Pagado',
      total: '€ 12.600,00',
    },
  ];

  const tableColumns = [
    { header: 'Nº Factura', accessor: 'id' as const, primary: true },
    { header: 'Cliente', accessor: 'client' as const },
    { header: 'Fecha emisión', accessor: 'date' as const },
    {
      header: 'Estado',
      accessor: (item: any) => (
        <Badge
          variant={
            item.status === 'Pagado' ? 'success' : item.status === 'Pendiente' ? 'warning' : 'error'
          }
        >
          {item.status}
        </Badge>
      ),
    },
    { header: 'Importe', accessor: 'total' as const, align: 'right' as const },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 pb-24">
      <div className="max-w-6xl mx-auto px-10 py-16">
        {/* HERO */}
        <div className="pt-10 pb-14 border-b border-[var(--k-line)] mb-16 flex items-start justify-between gap-10">
          <div className="flex items-center gap-5">
            <KeirostLogo size={48} variant="dark" />
            <div>
              <div className="font-display text-[40px] font-extrabold tracking-[-1px] leading-none text-[var(--k-ink-900)] dark:text-slate-100">
                Keirost <span className="text-[var(--k-teal-500)]">ERP</span>
              </div>
              <div className="font-mono text-[11px] text-[var(--k-ink-400)] mt-2 tracking-[1px]">
                BRAND GUIDE · DESIGN SYSTEM
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="font-mono text-[10px] text-[var(--k-teal-600)] bg-[var(--k-teal-50)] border border-[var(--k-teal-100)] rounded-[2px] px-3 py-1 tracking-[1px]">
              v1.0 · 2026
            </span>
            <span className="font-mono text-[10px] text-[var(--k-ink-400)]">Uso interno</span>
          </div>
        </div>

        {/* 01 · IDENTIDAD */}
        <section className="mb-20">
          <SectionHeader num="01" title="Identidad visual" />
          <Label>Variantes del monograma</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-[var(--k-line)] border border-[var(--k-line)] mb-8">
            {[
              {
                bg: '#0A1628',
                variant: 'dark' as const,
                label: 'Primary dark',
                labelColor: 'rgba(255,255,255,.35)',
              },
              {
                bg: '#FAFBFC',
                variant: 'outline' as const,
                label: 'Primary light',
                labelColor: '#94A3B8',
              },
              {
                bg: '#FFFFFF',
                variant: 'outline' as const,
                label: 'Outline',
                labelColor: '#94A3B8',
              },
              {
                bg: '#0D9488',
                variant: 'accent' as const,
                label: 'Brand teal',
                labelColor: 'rgba(255,255,255,.5)',
              },
              {
                bg: '#1E293B',
                variant: 'dark' as const,
                label: 'Slate',
                labelColor: 'rgba(255,255,255,.35)',
              },
              {
                bg: '#F1F5F9',
                variant: 'mono' as const,
                label: 'Monochrome',
                labelColor: '#94A3B8',
              },
            ].map((card) => (
              <div
                key={card.label}
                className="flex flex-col items-center gap-4 p-10 pt-12"
                style={{ background: card.bg }}
              >
                <KeirostLogo size={64} variant={card.variant} />
                <span
                  className="font-mono text-[10px] tracking-[2px] uppercase"
                  style={{ color: card.labelColor }}
                >
                  {card.label}
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--k-line)] border border-[var(--k-line)]">
            {[
              {
                title: 'Uso correcto',
                body: 'Usar siempre sobre fondos sólidos. Mantener zona de exclusión mínima de 1× el tamaño del icono.',
              },
              {
                title: 'Tamaño mínimo',
                body: 'Digital: 24 × 24 px. Impresión: 8 mm. Por debajo no se garantiza legibilidad.',
              },
              {
                title: 'No hacer',
                body: 'No rotar, distorsionar, cambiar colores fuera de la paleta ni añadir efectos.',
              },
            ].map((r) => (
              <div key={r.title} className="bg-white dark:bg-slate-900 p-6">
                <Label>{r.title}</Label>
                <div className="text-[13px] text-[var(--k-ink-700)] dark:text-slate-300 leading-[1.7]">
                  {r.body}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 02 · PALETA */}
        <section className="mb-20">
          <SectionHeader num="02" title="Paleta de colores" />

          <Label>Escala primaria — Teal</Label>
          <div className="flex h-12 border border-[var(--k-line)] rounded-[2px] overflow-hidden mb-6">
            {TEAL_SCALE.map((c) => (
              <div
                key={c.name}
                className="flex-1 flex items-end p-1.5 font-mono text-[9px]"
                style={{
                  background: c.hex,
                  color: c.hex === '#F0FAFA' || c.hex === '#CCEFED' ? '#0A6E63' : '#fff',
                }}
              >
                {c.name}
              </div>
            ))}
          </div>

          <Label>Escala neutros — Ink</Label>
          <div className="flex h-12 border border-[var(--k-line)] rounded-[2px] overflow-hidden mb-10">
            {INK_SCALE.map((c) => (
              <div
                key={c.name}
                className="flex-1 flex items-end p-1.5 font-mono text-[9px]"
                style={{
                  background: c.hex,
                  color: ['#FAFBFC', '#F1F5F9', '#E2E8F0', '#CBD5E1'].includes(c.hex)
                    ? '#334155'
                    : '#fff',
                }}
              >
                {c.name}
              </div>
            ))}
          </div>

          <Label>Colores del sistema</Label>
          <div className="border border-[var(--k-line)] mb-6">
            <table className="w-full">
              <tbody>
                {SystemColors.map((c) => (
                  <tr key={c.name} className="border-b border-[var(--k-line)] last:border-b-0">
                    <td className="pl-4 py-3 w-10">
                      <div
                        className="w-5 h-5 rounded-[2px]"
                        style={{
                          background: c.hex,
                          border:
                            c.hex === '#FFFFFF' ? '1px solid #E2E8F0' : '1px solid rgba(0,0,0,.08)',
                        }}
                      />
                    </td>
                    <td className="py-3 px-4 text-[13px] font-medium text-[var(--k-ink-900)]">
                      {c.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[var(--k-ink-500)]">
                      {c.hex}
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-[var(--k-ink-400)]">
                      {c.token}
                    </td>
                    <td className="py-3 px-4 text-[12px] text-[var(--k-ink-400)]">{c.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Label>Semánticos</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--k-line)] border border-[var(--k-line)]">
            {Semantics.map((s) => (
              <div key={s.name} className="bg-white dark:bg-slate-900 p-5">
                <div className="w-2 h-2 rounded-full mb-2" style={{ background: s.hex }} />
                <div className="text-[13px] font-medium text-[var(--k-ink-900)] dark:text-slate-100">
                  {s.name}
                </div>
                <div className="font-mono text-[11px] text-[var(--k-ink-500)]">{s.hex}</div>
                <div className="text-[11px] text-[var(--k-ink-400)] mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 03 · TIPOGRAFÍA */}
        <section className="mb-20">
          <SectionHeader num="03" title="Tipografía" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--k-line)] border border-[var(--k-line)] mb-8">
            <div className="bg-white dark:bg-slate-900 p-7">
              <Label>Display / Títulos</Label>
              <div className="font-display text-[28px] font-bold tracking-[-0.5px]">
                Space Grotesk
              </div>
              <div className="font-display text-[13px] text-[var(--k-ink-500)] mt-2">
                Aa Bb Cc Dd 0123456789
              </div>
              <div className="font-mono text-[10px] text-[var(--k-ink-400)] mt-3">
                Google Fonts · 400 500 600 700
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-7">
              <Label>Cuerpo / UI</Label>
              <div className="font-sans text-[28px] font-light">DM Sans</div>
              <div className="font-sans text-[13px] text-[var(--k-ink-500)] mt-2">
                Aa Bb Cc Dd 0123456789
              </div>
              <div className="font-mono text-[10px] text-[var(--k-ink-400)] mt-3">
                Google Fonts · 300 400 500
              </div>
            </div>
          </div>

          <div className="border border-[var(--k-line)] px-7">
            {[
              {
                meta: 'Display · Space Grotesk 800 · 48px',
                cls: 'font-display text-[48px] font-extrabold tracking-[-1px] leading-[1.05]',
                text: 'Gestión empresarial',
              },
              {
                meta: 'H1 · Space Grotesk 700 · 32px',
                cls: 'font-display text-[32px] font-bold tracking-[-0.5px]',
                text: 'Panel de control',
              },
              {
                meta: 'H2 · Space Grotesk 600 · 22px',
                cls: 'font-display text-[22px] font-semibold',
                text: 'Resumen mensual de facturación',
              },
              {
                meta: 'H3 · Space Grotesk 600 · 16px',
                cls: 'font-display text-[16px] font-semibold',
                text: 'Últimas transacciones',
              },
              {
                meta: 'Body · DM Sans 400 · 14px',
                cls: 'font-sans text-[14px] text-[var(--k-ink-700)] leading-[1.6] max-w-[500px]',
                text: 'Keirost centraliza todos los procesos de tu empresa: facturación, inventario, contabilidad y gestión de clientes.',
              },
              {
                meta: 'Small · DM Sans · 12px · ink-500',
                cls: 'font-sans text-[12px] text-[var(--k-ink-500)]',
                text: 'Última actualización: 12 ene 2026 · 14:32',
              },
              {
                meta: 'Mono · JetBrains Mono · 12px',
                cls: 'font-mono text-[12px] text-[var(--k-ink-700)]',
                text: 'INV-2026-0042 · €12.480,00 · --k-teal-500',
              },
            ].map((row) => (
              <div
                key={row.meta}
                className="grid grid-cols-[160px_1fr] gap-8 items-baseline py-6 border-b border-[var(--k-line)] last:border-b-0"
              >
                <div className="font-mono text-[10px] text-[var(--k-ink-400)] leading-[1.6]">
                  {row.meta}
                </div>
                <div className={row.cls}>{row.text}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 04 · COMPONENTES */}
        <section className="mb-20">
          <SectionHeader num="04" title="Componentes UI" />

          <Label>Botones</Label>
          <div className="border border-[var(--k-line)] p-6 mb-6 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="primary">Guardar</Button>
              <Button variant="accent">Nueva factura</Button>
              <Button variant="outline">Exportar</Button>
              <Button variant="ghost">Cancelar</Button>
              <Button variant="danger">Eliminar</Button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="primary" size="sm">
                Confirmar
              </Button>
              <Button variant="accent" size="sm">
                + Añadir
              </Button>
              <Button variant="outline" size="sm">
                <Mail size={12} /> Enviar
              </Button>
              <Button variant="ghost" size="sm">
                Descartar
              </Button>
            </div>
          </div>

          <Label>Estados · Badges</Label>
          <div className="border border-[var(--k-line)] p-5 mb-6">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="success">Pagado</Badge>
              <Badge variant="teal">Activo</Badge>
              <Badge variant="warning">Pendiente</Badge>
              <Badge variant="error">Vencido</Badge>
              <Badge variant="neutral">Borrador</Badge>
              <Badge variant="info">En revisión</Badge>
            </div>
          </div>

          <Label>Formularios</Label>
          <div className="border border-[var(--k-line)] p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="Razón social" placeholder="Empresa Ejemplo S.L." />
              <Input label="NIF / CIF" placeholder="B-12345678" />
              <Input label="Importe" placeholder="0,00 €" leftIcon={<Search size={14} />} />
            </div>
          </div>

          <Label>Tarjetas KPI</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--k-line)] border border-[var(--k-line)] mb-6">
            <KpiCard
              label="Facturación · mes"
              value="€ 48.230"
              sub="enero 2026"
              trend={{ dir: 'up', text: '12% vs mes anterior' }}
              className="border-0"
            />
            <KpiCard
              label="Pedidos abiertos"
              value={127}
              sub="23 requieren atención"
              trend={{ dir: 'down', text: '5 más que ayer' }}
              className="border-0"
            />
            <KpiCard
              label="Clientes activos"
              value={342}
              sub="+8 nuevos este mes"
              trend={{ dir: 'up', text: 'tendencia positiva' }}
              className="border-0"
            />
          </div>

          <Label>Tabla de datos</Label>
          <Table columns={tableColumns as any} data={tableData} />

          <div className="mt-6 flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={() => toast.success('Toast de prueba')}>
              Disparar toast
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowOverlayLoader((v) => !v)}>
              Toggle loader
            </Button>
            {showOverlayLoader && <Loader size="sm" label="Cargando…" />}
          </div>
        </section>

        {/* 05 · ESPACIADO */}
        <section className="mb-20">
          <SectionHeader num="05" title="Espaciado & Forma" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--k-line)] border border-[var(--k-line)]">
            <div className="bg-white dark:bg-slate-900 p-7">
              <Label>Escala de espaciado</Label>
              <div className="flex items-end gap-5">
                {[4, 8, 12, 16, 24, 32, 48, 64, 80].map((v) => (
                  <div key={v} className="flex flex-col items-center gap-1.5">
                    <div
                      className="w-7 bg-[var(--k-teal-100)] border-t-2 border-[var(--k-teal-500)]"
                      style={{ height: `${v}px` }}
                    />
                    <span className="font-mono text-[9px] text-[var(--k-ink-400)]">{v}</span>
                    <span className="font-mono text-[9px] text-[var(--k-teal-500)]">{v}px</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-7">
              <Label>Border radius</Label>
              <div className="flex items-end gap-6">
                {[
                  { n: 'none', v: 0 },
                  { n: 'xs', v: 2 },
                  { n: 'sm', v: 4 },
                  { n: 'md', v: 8 },
                  { n: 'lg', v: 12 },
                ].map((r) => (
                  <div key={r.n} className="flex flex-col items-center gap-2">
                    <div
                      className="w-[52px] h-[52px] bg-[var(--k-teal-50)] border-[1.5px] border-[var(--k-teal-100)]"
                      style={{ borderRadius: `${r.v}px` }}
                    />
                    <span className="font-mono text-[9px] text-[var(--k-ink-400)]">{r.n}</span>
                    <span className="font-mono text-[9px] text-[var(--k-teal-500)]">{r.v}px</span>
                  </div>
                ))}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-[52px] h-[24px] bg-[var(--k-teal-50)] border-[1.5px] border-[var(--k-teal-100)] rounded-full" />
                  <span className="font-mono text-[9px] text-[var(--k-ink-400)]">pill</span>
                  <span className="font-mono text-[9px] text-[var(--k-teal-500)]">999px</span>
                </div>
              </div>
              <div className="mt-6 font-mono text-[10px] text-[var(--k-ink-400)] leading-[1.8]">
                Botones / inputs → 2px
                <br />
                Cards / modales → 4–8px
                <br />
                Badges / pills → 999px
              </div>
            </div>
          </div>
        </section>

        {/* 06 · TOKENS */}
        <section className="mb-14">
          <SectionHeader num="06" title="Variables CSS" />
          <pre className="bg-[var(--k-ink-900)] text-[#CBD5E1] font-mono text-[12px] leading-[2] p-8 rounded-[2px] overflow-x-auto">
            {`/* Keirost ERP — Design Tokens */
:root {
  --k-ink-900:  #0A1628;   /* texto principal */
  --k-ink-700:  #2D3A4A;
  --k-ink-500:  #64748B;   /* texto secundario */
  --k-ink-400:  #94A3B8;   /* labels, placeholders */
  --k-line:     #E2E8F0;   /* bordes */
  --k-surface:  #FAFBFC;   /* fondos suaves */
  --k-teal-500: #0D9488;   /* acento principal */
  --k-teal-600: #0A6E63;   /* hover */
  --k-teal-50:  #F0FAFA;
  --k-teal-100: #CCEFED;

  --font-display: 'Space Grotesk', sans-serif;
  --font-sans:    'DM Sans', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
}`}
          </pre>
        </section>

        {/* FOOTER */}
        <div className="border-t border-[var(--k-line)] pt-6 flex justify-between items-center">
          <div className="font-display text-[16px] font-bold">
            Keirost <span className="text-[var(--k-teal-500)]">ERP</span>
          </div>
          <div className="font-mono text-[10px] text-[var(--k-ink-400)] tracking-[1px]">
            BRAND GUIDE v1.0 · 2026 · USO INTERNO
          </div>
        </div>
      </div>
    </div>
  );
};

export default StyleGuide;
