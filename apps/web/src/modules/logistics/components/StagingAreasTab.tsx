import { logisticsApi } from '../api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Modal, Loader, Badge, useToast } from '@openfactu/ui';
import {
  Plus,
  Trash2,
  QrCode,
  Edit2,
  Package as PackageIcon,
  Boxes,
  Printer,
  Tag,
} from 'lucide-react';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { useAuth } from '@/context/AuthContext';

interface StagingArea {
  id: string;
  code: string;
  name: string;
  warehouseId: string | null;
  partnerId: string | null;
  platformId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
}

interface Platform {
  id: string;
  code: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

interface StagingAreaItem {
  id: string;
  stagingAreaId: string;
  itemId: string;
  expectedQty: number | null;
  notes: string | null;
}

export const StagingAreasTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<StagingArea[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StagingArea | null>(null);
  const [form, setForm] = useState<any>({});
  const [qrFor, setQrFor] = useState<{
    id: string;
    name: string;
    payload: any;
    imgUrl: string | null;
  } | null>(null);
  const [itemsFor, setItemsFor] = useState<StagingArea | null>(null);
  const [areaItems, setAreaItems] = useState<StagingAreaItem[]>([]);
  const [pkgsFor, setPkgsFor] = useState<StagingArea | null>(null);
  const [areaPackages, setAreaPackages] = useState<any[]>([]);
  const [newItemId, setNewItemId] = useState('');
  const [newItemQty, setNewItemQty] = useState<string>('');

  const load = async () => {
    setLoading(true);
    const [r, w, p, it, pl] = await Promise.all([
      logisticsApi.get('/api/logistics/staging-areas'),
      logisticsApi.get('/api/warehouses').catch(() => []),
      logisticsApi.get('/api/partners').catch(() => []),
      logisticsApi.get('/api/items').catch(() => []),
      logisticsApi.get('/api/logistics/platforms').catch(() => []),
    ]);
    setRows(Array.isArray(r) ? r : []);
    setWarehouses(Array.isArray(w) ? w : []);
    setPartners(Array.isArray(p) ? p : []);
    setItems(Array.isArray(it) ? it : []);
    setPlatforms(Array.isArray(pl) ? pl : []);
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setShowModal(true);
  };
  const openEdit = (a: StagingArea) => {
    setEditing(a);
    setForm({ ...a });
    setShowModal(true);
  };

  const save = async () => {
    // El nombre es opcional: si no se rellena, el backend lo genera como
    // "Acopio <cliente>" si hay partnerId, o con el código como último
    // recurso. Así el usuario no está obligado a inventar un nombre.
    const url = editing
      ? `/api/logistics/staging-areas/${editing.id}`
      : '/api/logistics/staging-areas';
    const method = editing ? 'PATCH' : 'POST';
    const res = await logisticsApi.raw(method, url, form);
    const d = res.data;
    if (!res.ok) {
      toast.error(d.error || 'Error');
      return;
    }
    toast.success(editing ? 'Acopio actualizado' : `Acopio ${d.code} creado`);
    setShowModal(false);
    setForm({});
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar acopio?')) return;
    await logisticsApi.raw('DELETE', `/api/logistics/staging-areas/${id}`);
    load();
  };

  const openQr = async (area: StagingArea) => {
    // Petición autenticada (el <img> no enviaría headers) → blob URL.
    const payload = await logisticsApi
      .get<any>(`/api/logistics/staging-areas/${area.id}/payload`)
      .catch(() => ({}));
    let imgUrl: string | null = null;
    try {
      const { blob } = await logisticsApi.getBlob(`/api/logistics/staging-areas/${area.id}/qr.png`);
      imgUrl = URL.createObjectURL(blob);
    } catch {
      toast.error('No se pudo cargar el QR');
    }
    setQrFor({ id: area.id, name: area.name, payload, imgUrl });
  };

  /**
   * Abre una ventana nueva con el packing list del acopio en formato
   * imprimible y dispara `window.print()` al cargar. Usa el payload del
   * backend (mismo que alimenta el QR) para no tocar la API.
   */
  const openPackingList = async (area: StagingArea) => {
    const payloadRes = await logisticsApi.raw('GET', `/api/logistics/staging-areas/${area.id}/payload`);
    if (!payloadRes.ok) {
      toast.error('No se pudo cargar el acopio');
      return;
    }
    const p = payloadRes.data;
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('El navegador bloqueó la ventana emergente');
      return;
    }
    const esc = (s: any) =>
      String(s ?? '—').replace(
        /[&<>"']/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
      );
    const totalWeight = (p.packages || []).reduce(
      (acc: number, pk: any) => acc + (Number(pk.weightKg) || 0),
      0,
    );
    const shipmentMap = new Map<string, any>((p.shipments || []).map((s: any) => [s.id, s]));
    const byShipment = new Map<string, any[]>();
    for (const pk of p.packages || []) {
      const key = pk.shipmentId || '__none__';
      if (!byShipment.has(key)) byShipment.set(key, []);
      byShipment.get(key)!.push(pk);
    }

    const shipmentBlocks = Array.from(byShipment.entries())
      .map(([sid, pkgs]) => {
        const s = sid !== '__none__' ? shipmentMap.get(sid) : null;
        return `
          <section class="ship">
            <h3>${s ? `Envío ${esc(s.code || s.id.slice(0, 8))}` : 'Paquetes sin envío'}</h3>
            ${s?.destinationAddress ? `<div class="addr">${esc(s.destinationAddress)}</div>` : ''}
            <table>
              <thead><tr><th>Código</th><th>Estado</th><th class="r">Peso</th><th>Sellado</th></tr></thead>
              <tbody>
                ${pkgs
                  .map(
                    (pk: any) => `
                  <tr>
                    <td><code>${esc(pk.code)}</code></td>
                    <td>${esc(pk.status)}</td>
                    <td class="r">${pk.weightKg != null ? esc(pk.weightKg) + ' kg' : '—'}</td>
                    <td>${pk.sealedAt ? esc(new Date(pk.sealedAt).toLocaleString('es-ES')) : '—'}</td>
                  </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </section>`;
      })
      .join('');

    const routesList = (p.routes || [])
      .map(
        (r: any) =>
          `<li><b>${esc(r.code)}</b> · ${esc(r.name || '—')} · ${esc(r.driverName || '— sin driver —')}${r.vehiclePlate ? ` · ${esc(r.vehiclePlate)}` : ''}</li>`,
      )
      .join('');

    w.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>Packing list · ${esc(p.staging?.name || '')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; margin: 0; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color:#64748b; margin: 18px 0 6px; font-weight: 900; }
  h3 { font-size: 14px; margin: 12px 0 6px; color:#0f172a; }
  header { border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sub { color:#64748b; font-size: 12px; margin-top: 2px; }
  ul { margin: 0; padding-left: 18px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
  th { text-align: left; background: #f1f5f9; padding: 6px 8px; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
  .r { text-align: right; }
  code { font-family: 'SF Mono', Menlo, monospace; background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size: 11px; }
  .addr { color:#64748b; font-size: 11px; margin-bottom: 4px; }
  .totals { margin-top: 24px; border-top: 2px solid #0f172a; padding-top: 12px; font-size: 12px; }
  .sign { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; font-size: 11px; color: #64748b; }
  .sign > div { border-top: 1px solid #0f172a; padding-top: 6px; }
  @page { margin: 16mm; }
  @media print { body { padding: 0; } }
</style></head><body>
<header>
  <div>
    <h1>Packing list</h1>
    <div class="sub">${esc(p.staging?.name || '')} · <code>${esc(p.staging?.code || '')}</code></div>
  </div>
  <div class="sub">${new Date().toLocaleString('es-ES')}</div>
</header>

<h2>Rutas asignadas</h2>
${routesList ? `<ul>${routesList}</ul>` : '<div class="sub">— sin ruta asignada todavía —</div>'}

<h2>Contenido</h2>
${shipmentBlocks || '<div class="sub">Acopio vacío.</div>'}

<div class="totals">
  <b>Total paquetes:</b> ${p.packages?.length || 0} · <b>Peso total:</b> ${totalWeight.toFixed(2)} kg · <b>Envíos:</b> ${p.shipments?.length || 0}
</div>

<div class="sign">
  <div>Firma del almacén</div>
  <div>Firma del transportista</div>
</div>

<script>
  window.addEventListener('load', () => setTimeout(() => window.print(), 250));
</script>
</body></html>`);
    w.document.close();
  };

  /**
   * Etiquetas imprimibles tipo Amazon: una por paquete, con QR grande con el
   * código del paquete, dirección de destino en grande y datos de envío.
   * Pensadas para pegar físicamente en la caja — el repartidor las escanea
   * en ruta y la app le muestra quién la va a recibir.
   */
  const openPackageLabels = async (area: StagingArea, perPage: 1 | 4 = 4) => {
    const r = await logisticsApi.raw('GET', `/api/logistics/staging-areas/${area.id}/payload`);
    if (!r.ok) {
      toast.error('No se pudo cargar el acopio');
      return;
    }
    const p = r.data;
    const pkgs = (p.packages || []) as any[];
    if (pkgs.length === 0) {
      toast.error('Este acopio no tiene paquetes');
      return;
    }
    const shipMap = new Map<string, any>((p.shipments || []).map((s: any) => [s.id, s]));
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('El navegador bloqueó la ventana emergente');
      return;
    }
    const esc = (s: any) =>
      String(s ?? '—').replace(
        /[&<>"']/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
      );
    const labels = pkgs
      .map((pk) => {
        const s = pk.shipmentId ? shipMap.get(pk.shipmentId) : null;
        const trackingOrId = s ? s.code || s.id.slice(0, 8) : '—';
        const address = s?.destinationAddress || 'SIN DIRECCIÓN';
        const qrPayload = JSON.stringify({ v: 1, type: 'package', id: pk.id, code: pk.code });
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`;
        return `
          <section class="label">
            <header>
              <div class="brand">KEIROST · ENTREGA</div>
              <code>${esc(pk.code)}</code>
            </header>
            <div class="row">
              <img src="${qrSrc}" alt="qr" class="qr"/>
              <div class="info">
                <div class="field"><span class="k">Envío</span><span class="v mono">${esc(trackingOrId)}</span></div>
                <div class="field"><span class="k">Peso</span><span class="v">${pk.weightKg != null ? esc(pk.weightKg) + ' kg' : '—'}</span></div>
                <div class="field"><span class="k">Estado</span><span class="v">${esc(pk.status)}</span></div>
                <div class="field"><span class="k">Acopio</span><span class="v">${esc(area.name)}</span></div>
              </div>
            </div>
            <div class="addr">
              <div class="addr-label">DESTINO</div>
              <div class="addr-text">${esc(address)}</div>
            </div>
            <footer>
              <span class="ts">${new Date().toLocaleString('es-ES')}</span>
              <span class="hint">Escanea el QR con la app del repartidor</span>
            </footer>
          </section>`;
      })
      .join('');

    w.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>Etiquetas · ${esc(area.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; color:#0f172a; background:#f1f5f9; }
  .sheet { display: flex; flex-wrap: wrap; gap: 0; }
  .label {
    ${
      perPage === 1
        ? // Una etiqueta por A4 — ocupa toda la hoja (A4 portrait 210×297mm).
          `width: 210mm; height: 297mm; padding: 18mm;`
        : // Cuatro por A4 — A6 (105×148mm), 2×2.
          `width: 105mm; height: 148mm; padding: 5mm;`
    }
    background: #fff;
    display: flex; flex-direction: column; gap: ${perPage === 1 ? '10mm' : '3mm'};
    border: 1px dashed #0f172a;
    break-inside: avoid;
  }
  /* Salto de página según formato. */
  .label:nth-child(${perPage}n) { page-break-after: always; }
  ${
    perPage === 1
      ? `.addr-text { font-size: 36px; line-height: 1.2; }
         .qr { width: 70mm !important; height: 70mm !important; }
         .brand { font-size: 16px; }
         header code { font-size: 22px; padding: 6px 14px; }
         .info { font-size: 16px; gap: 4mm; }
         .k { font-size: 11px; } .v { font-size: 15px; }`
      : ''
  }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 3mm; }
  .brand { font-size: 10px; font-weight: 900; letter-spacing: .15em; color: #0f172a; }
  header code { font-family: 'SF Mono', Menlo, monospace; font-size: 13px; background:#0f172a; color:#fff; padding: 3px 8px; border-radius: 4px; }
  .row { display: flex; gap: 6mm; align-items: flex-start; }
  .qr { width: 38mm; height: 38mm; border: 1px solid #0f172a; }
  .info { flex: 1; display: flex; flex-direction: column; gap: 2mm; font-size: 10px; }
  .field { display: flex; justify-content: space-between; gap: 4mm; border-bottom: 1px dashed #cbd5e1; padding-bottom: 1.5mm; }
  .k { text-transform: uppercase; letter-spacing: .1em; color: #64748b; font-weight: 700; font-size: 8px; }
  .v { font-weight: 700; text-align: right; }
  .mono { font-family: 'SF Mono', Menlo, monospace; }
  .addr { flex: 1; background: #fef3c7; border: 2px solid #f59e0b; border-radius: 6px; padding: 4mm; display: flex; flex-direction: column; justify-content: center; }
  .addr-label { font-size: 9px; font-weight: 900; letter-spacing: .15em; color: #92400e; margin-bottom: 2mm; }
  .addr-text { font-size: 15px; font-weight: 800; line-height: 1.25; color:#0f172a; }
  footer { display: flex; justify-content: space-between; font-size: 8px; color: #64748b; }
  @page { size: A4 portrait; margin: 0; }
  @media print { body { background: #fff; } .label { border: 1px dashed #94a3b8; } }
</style></head><body>
<div class="sheet">${labels}</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body></html>`);
    w.document.close();
  };

  const closeQr = () => {
    // Liberar memoria del blob URL al cerrar el modal.
    if (qrFor?.imgUrl) URL.revokeObjectURL(qrFor.imgUrl);
    setQrFor(null);
  };

  const downloadQr = () => {
    if (!qrFor?.imgUrl) return;
    const a = document.createElement('a');
    a.href = qrFor.imgUrl;
    a.download = `qr-${qrFor.name}.png`;
    a.click();
  };

  const openItems = async (area: StagingArea) => {
    setItemsFor(area);
    const r = await logisticsApi.raw('GET', `/api/logistics/staging-areas/${area.id}/items`);
    const list = r.data;
    setAreaItems(Array.isArray(list) ? list : []);
    setNewItemId('');
    setNewItemQty('');
  };

  const openPackages = async (area: StagingArea) => {
    setPkgsFor(area);
    // Filtramos client-side: no hay endpoint específico, pero GET /packages
    // devuelve todos — filtramos por stagingAreaId.
    const r = await logisticsApi.raw('GET', '/api/logistics/packages');
    const list = r.ok ? r.data : [];
    setAreaPackages(
      (Array.isArray(list) ? list : []).filter((p: any) => p.stagingAreaId === area.id),
    );
  };

  const PKG_BADGE: Record<string, any> = {
    open: 'warning',
    sealed: 'info',
    shipped: 'info',
    delivered: 'success',
    returned: 'danger',
  };

  const addItem = async () => {
    if (!itemsFor || !newItemId) return;
    const res = await logisticsApi.raw('POST', `/api/logistics/staging-areas/${itemsFor.id}/items`, {
        itemId: newItemId,
        expectedQty: newItemQty === '' ? null : Number(newItemQty),
      });
    const d = res.data;
    if (!res.ok) {
      toast.error(d.error || 'Error');
      return;
    }
    toast.success('Artículo añadido');
    setNewItemId('');
    setNewItemQty('');
    const r = await logisticsApi.raw('GET', `/api/logistics/staging-areas/${itemsFor.id}/items`);
    setAreaItems(r.data);
  };

  const removeItem = async (rowId: string) => {
    if (!itemsFor) return;
    await logisticsApi.raw('DELETE', `/api/logistics/staging-areas/${itemsFor.id}/items/${rowId}`);
    setAreaItems((xs) => xs.filter((x) => x.id !== rowId));
  };

  const partnerMap = new Map(partners.map((p) => [p.id, p] as const));
  const itemMap = new Map(items.map((i) => [i.id, i] as const));
  const whMap = new Map(warehouses.map((w) => [w.id, w] as const));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> Nuevo acopio
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">Sin acopios.</Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((a) => {
              const partner = a.partnerId ? partnerMap.get(a.partnerId) : null;
              const wh = a.warehouseId ? whMap.get(a.warehouseId) : null;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                >
                  <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded shrink-0">
                    {a.code}
                  </code>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
                        {a.name}
                      </span>
                      {partner && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 shrink-0">
                          {partner.name}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex gap-3 flex-wrap">
                      {wh && <span>Almacén: {wh.name}</span>}
                      {a.address && <span className="truncate max-w-sm">{a.address}</span>}
                    </div>
                  </div>

                  {/* Acciones críticas — siempre visibles. */}
                  <button
                    onClick={() => openPackages(a)}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded shrink-0"
                    title="Paquetes actualmente en el acopio"
                  >
                    <Boxes size={13} />
                  </button>
                  <button
                    onClick={() => openQr(a)}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded shrink-0"
                    title="QR del acopio"
                  >
                    <QrCode size={13} />
                  </button>

                  {/* Resto — kebab, no rompe en móvil. */}
                  <RowActionsMenu
                    actions={[
                      {
                        label: 'Artículos esperados',
                        icon: <PackageIcon size={14} />,
                        onClick: () => openItems(a),
                      },
                      {
                        label: 'Imprimir packing list',
                        icon: <Printer size={14} />,
                        onClick: () => openPackingList(a),
                      },
                      {
                        label: 'Etiquetas (4 por página)',
                        icon: <Tag size={14} />,
                        onClick: () => openPackageLabels(a, 4),
                      },
                      {
                        label: 'Etiquetas (1 por página)',
                        icon: <Tag size={14} strokeWidth={2.5} />,
                        onClick: () => openPackageLabels(a, 1),
                      },
                      { label: 'Editar', icon: <Edit2 size={14} />, onClick: () => openEdit(a) },
                      {
                        label: 'Eliminar',
                        icon: <Trash2 size={14} />,
                        onClick: () => remove(a.id),
                        destructive: true,
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Editar acopio' : 'Nuevo acopio'}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Cliente propietario (opcional)
            </label>
            <select
              value={form.partnerId || ''}
              onChange={(e) => setForm({ ...form, partnerId: e.target.value || null })}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
            >
              <option value="">— acopio compartido (sin cliente) —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.code ? `(${p.code})` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Déjalo en <b>sin cliente</b> si es un muelle/zona tuya donde agrupas paquetes de{' '}
              <b>varios clientes</b> (lo más habitual). Solo marca un cliente si es un{' '}
              <b>acopio de consignación</b> (un armario/estantería en las instalaciones de ese
              cliente con su stock reservado).
            </p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Nombre (opcional)
            </label>
            <Input
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={
                form.partnerId
                  ? `Acopio ${partners.find((p) => p.id === form.partnerId)?.name || ''}`
                  : 'Déjalo vacío para auto-nombrar'
              }
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Si lo dejas vacío, se generará <b>Acopio &lt;cliente&gt;</b> automáticamente.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Almacén propio
              </label>
              <select
                value={form.warehouseId || ''}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value || null })}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
              >
                <option value="">—</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Plataforma ajena
              </label>
              <select
                value={form.platformId || ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const pl = id ? platforms.find((p) => p.id === id) : null;
                  setForm((prev: any) => {
                    const next: any = { ...prev, platformId: id };
                    // Heredar dirección/coords de la plataforma si aún están vacíos.
                    if (pl) {
                      if (!prev.address && pl.address) next.address = pl.address;
                      if (prev.lat == null && pl.lat != null) next.lat = pl.lat;
                      if (prev.lng == null && pl.lng != null) next.lng = pl.lng;
                    }
                    return next;
                  });
                }}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
              >
                <option value="">—</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 -mt-1 leading-relaxed">
            Elige <b>Almacén propio</b> si es tu muelle/zona, o <b>Plataforma ajena</b> si el acopio
            vive en un cross-dock o nave alquilada. Puedes dejar ambos vacíos para un acopio neutro.
          </p>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Dirección
            </label>
            <Input
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Calle Ejemplo 1, 28013 Madrid"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Se geolocaliza automáticamente al guardar para mostrarla en el mapa de repartos.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Latitud (opcional)
              </label>
              <Input
                type="number"
                step="0.000001"
                value={form.lat ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lat: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="40.4168"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Longitud (opcional)
              </label>
              <Input
                type="number"
                step="0.000001"
                value={form.lng ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lng: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="-3.7038"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 -mt-2">
            Pega lat/lng de Google Maps si conoces el punto exacto. Si no, se geolocalizará por
            dirección.
          </p>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>{editing ? 'Guardar' : 'Crear'}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!itemsFor}
        onClose={() => setItemsFor(null)}
        title={`Artículos · ${itemsFor?.name || ''}`}
        subtitle="Artículos que se manejan en este acopio. La cantidad objetivo es opcional."
        maxWidth="lg"
      >
        {itemsFor && (
          <div className="space-y-3 pt-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Artículo
                </label>
                <select
                  value={newItemId}
                  onChange={(e) => setNewItemId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  <option value="">— seleccionar —</option>
                  {items
                    .filter((i) => !areaItems.some((ai) => ai.itemId === i.id))
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} · {i.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="w-32">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Qty esperada
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value)}
                  placeholder="—"
                />
              </div>
              <Button onClick={addItem} disabled={!newItemId}>
                Añadir
              </Button>
            </div>

            {areaItems.length === 0 ? (
              <Card bodyClassName="py-8 text-center text-sm text-slate-500">
                Sin artículos en este acopio.
              </Card>
            ) : (
              <Card bodyClassName="p-0">
                <ul>
                  {areaItems.map((ai) => {
                    const it = itemMap.get(ai.itemId);
                    return (
                      <li
                        key={ai.id}
                        className="flex items-center gap-3 px-4 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                      >
                        <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
                          {it?.code || '—'}
                        </code>
                        <span className="flex-1 text-sm text-slate-800 dark:text-slate-100">
                          {it?.name || ai.itemId}
                        </span>
                        {ai.expectedQty != null && (
                          <span className="text-[11px] text-slate-500">
                            objetivo: {ai.expectedQty}
                          </span>
                        )}
                        <button
                          onClick={() => removeItem(ai.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!pkgsFor}
        onClose={() => setPkgsFor(null)}
        title={`Paquetes en ${pkgsFor?.name || ''}`}
        subtitle="Paquetes físicos presentes ahora mismo en este acopio."
        maxWidth="lg"
      >
        {pkgsFor && (
          <div className="space-y-3 pt-4">
            {areaPackages.length === 0 ? (
              <Card bodyClassName="py-8 text-center text-sm text-slate-500">
                Acopio vacío — no hay paquetes aquí.
              </Card>
            ) : (
              <Card bodyClassName="p-0">
                <ul>
                  {areaPackages.map((pk) => (
                    <li
                      key={pk.id}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                    >
                      <Badge variant={PKG_BADGE[pk.status] || 'neutral'}>{pk.status}</Badge>
                      <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
                        {pk.code}
                      </code>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex gap-3 flex-wrap">
                          {pk.shipmentId && (
                            <span>
                              Envío:{' '}
                              <span className="font-mono">{String(pk.shipmentId).slice(0, 8)}</span>
                            </span>
                          )}
                          {pk.weightKg != null && <span>· {pk.weightKg} kg</span>}
                          {pk.sealedAt && (
                            <span>
                              · Sellado {new Date(pk.sealedAt).toLocaleDateString('es-ES')}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span>
                Total paquetes: <b>{areaPackages.length}</b>
              </span>
              <span>
                Envíos únicos:{' '}
                <b>{new Set(areaPackages.map((p) => p.shipmentId).filter(Boolean)).size}</b>
              </span>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!qrFor}
        onClose={closeQr}
        title={`QR · ${qrFor?.name || ''}`}
        subtitle="Imprime y pega en el acopio. El repartidor lo escanea desde la app para obtener su ruta."
        maxWidth="md"
      >
        {qrFor && (
          <div className="space-y-3 pt-4">
            <div className="flex items-center justify-center p-4 bg-white rounded-lg border border-slate-100 dark:border-slate-800">
              {qrFor.imgUrl ? (
                <img src={qrFor.imgUrl} alt="QR" className="w-80 h-80" />
              ) : (
                <div className="w-80 h-80 flex items-center justify-center text-slate-400 text-sm">
                  No se pudo cargar el QR
                </div>
              )}
            </div>
            <div className="w-full max-w-md space-y-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Rutas asignadas
                </div>
                {qrFor.payload.routes?.length ? (
                  <ul className="space-y-1.5">
                    {qrFor.payload.routes.map((r: any) => (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                      >
                        <code className="px-1.5 py-0.5 bg-white dark:bg-slate-900 text-[10px] font-mono rounded shadow-sm">
                          {r.code}
                        </code>
                        <span className="flex-1 text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {r.name || '—'}
                        </span>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {r.driverName || '— sin driver —'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    Sin ruta asignada todavía
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
                <span>
                  <b>{qrFor.payload.packages?.length || 0}</b> paquete(s)
                </span>
                <span>
                  <b>{qrFor.payload.shipments?.length || 0}</b> envío(s)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {qrFor.imgUrl && (
                <button
                  onClick={downloadQr}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:opacity-90"
                >
                  <QrCode size={14} /> Descargar QR
                </button>
              )}
              <button
                onClick={() =>
                  qrFor && openPackingList({ id: qrFor.id, name: qrFor.name } as StagingArea)
                }
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm hover:opacity-90"
              >
                <Printer size={14} /> Imprimir packing list
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
