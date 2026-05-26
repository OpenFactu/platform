/**
 * Geocoding de direcciones postales.
 *
 * Orden de proveedores (cascada):
 *   1. **MapTiler Geocoding** — si `MAPTILER_API_KEY` está en env.
 *      Mucho más preciso que Photon/Nominatim en direcciones residenciales
 *      españolas. Gratis 100k/mes (https://www.maptiler.com).
 *   2. Photon (OSM) — sin API key, mejor que Nominatim para autocomplete
 *      pero se confunde con frecuencia en portales.
 *   3. Nominatim (fallback), con variantes de la query (+"España").
 *
 * Devuelve el mejor candidato, anotado con la precisión ('house' | 'street'
 * | 'area'). No devuelve `null` cuando no hay match de vivienda: entrega el
 * centroide de calle y deja que el UI (pin arrastrable) lo corrija.
 */

type Precision = 'house' | 'street' | 'area';
type GeoResult = { lat: number; lng: number; precision: Precision } | null;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: GeoResult }>();

const USER_AGENT = 'Keirost-ERP/1.0 (logistics-module)';

// ── Throttle compartido ─────────────────────────────────────────────────
let lastCallAt = 0;
const MIN_INTERVAL_MS = 1100;
async function waitSlot() {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastCallAt = Date.now();
}

// ── Helpers comunes ─────────────────────────────────────────────────────
/** Extrae el número de portal de una dirección libre ("Calle X 12" → "12"). */
function extractHouseNumber(address: string): string | null {
  const m = address.match(/(?:^|[\s,])(?:nº\s*|n\.?º?\s*|#\s*)?(\d{1,4}[A-Za-z]?)(?=[\s,]|$)/);
  return m ? m[1] : null;
}

async function safeFetchJson(url: string, ms = 6000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── MapTiler ────────────────────────────────────────────────────────────
async function queryMapTiler(
  q: string,
): Promise<Array<{ lat: number; lng: number; precision: Precision }>> {
  const key = process.env.MAPTILER_API_KEY?.trim();
  if (!key) return [];
  await waitSlot();
  // MapTiler Geocoding — `language=es&country=es&limit=5`. Score es confianza.
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${encodeURIComponent(key)}&language=es&country=es&limit=5`;
  const data: any = await safeFetchJson(url);
  const feats = Array.isArray(data?.features) ? data.features : [];
  return feats
    .map((f: any) => {
      const coords = f.center || (f.geometry?.type === 'Point' ? f.geometry.coordinates : null);
      if (!coords || coords.length < 2) return null;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      // MapTiler usa `place_type` tipo ['address'] para portales, ['street']
      // para calles, ['locality'] para ciudades. Priorizamos address.
      const types: string[] = Array.isArray(f.place_type) ? f.place_type : [];
      const precision: Precision = types.includes('address')
        ? 'house'
        : types.includes('street')
          ? 'street'
          : 'area';
      return { lat, lng, precision };
    })
    .filter(Boolean) as Array<{ lat: number; lng: number; precision: Precision }>;
}

// ── Photon ──────────────────────────────────────────────────────────────
interface PhotonHit {
  properties?: {
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string; // 'house' | 'street' | 'locality' | 'city' | …
    housenumber?: string;
    street?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  geometry?: { type: string; coordinates: [number, number] /* lon, lat */ };
}

async function queryPhoton(q: string): Promise<PhotonHit[]> {
  await waitSlot();
  // `lang=es` mejora resultados en España. `limit=5` para tener candidatos.
  const url = `https://photon.komoot.io/api/?lang=es&limit=5&q=${encodeURIComponent(q)}`;
  const data = await safeFetchJson(url);
  return Array.isArray(data?.features) ? (data.features as PhotonHit[]) : [];
}

function photonToResult(h: PhotonHit): GeoResult {
  const coords = h.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const t = h.properties?.type;
  const precision: Precision =
    t === 'house' || h.properties?.housenumber ? 'house' : t === 'street' ? 'street' : 'area';
  return { lat, lng, precision };
}

function pickBestPhoton(hits: PhotonHit[], wanted: string | null): GeoResult {
  if (hits.length === 0) return null;
  if (wanted) {
    const exact = hits.find(
      (h) =>
        h.properties?.housenumber &&
        h.properties.housenumber.toLowerCase() === wanted.toLowerCase(),
    );
    if (exact) return photonToResult(exact);
    const anyHouse = hits.find((h) => !!h.properties?.housenumber);
    if (anyHouse) return photonToResult(anyHouse);
  }
  return photonToResult(hits[0]);
}

// ── Nominatim ───────────────────────────────────────────────────────────
interface NomHit {
  lat: string;
  lon: string;
  place_rank?: number;
  address?: { house_number?: string; road?: string; city?: string; postcode?: string };
}

async function queryNominatim(q: string): Promise<NomHit[]> {
  await waitSlot();
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=es&limit=5&q=${encodeURIComponent(q)}`;
  const data = await safeFetchJson(url);
  return Array.isArray(data) ? (data as NomHit[]) : [];
}

function nomToResult(h: NomHit, precision: Precision): GeoResult {
  const lat = Number(h.lat);
  const lng = Number(h.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, precision };
}

function pickBestNom(hits: NomHit[], wanted: string | null): GeoResult {
  if (hits.length === 0) return null;
  if (wanted) {
    const exact = hits.find(
      (h) =>
        h.address?.house_number && h.address.house_number.toLowerCase() === wanted.toLowerCase(),
    );
    if (exact) return nomToResult(exact, 'house');
    const anyHouse = hits.find((h) => !!h.address?.house_number);
    if (anyHouse) return nomToResult(anyHouse, 'house');
  }
  const first = hits[0];
  const rank = Number(first.place_rank ?? 30);
  const precision: Precision = first.address?.house_number
    ? 'house'
    : rank >= 26 && rank <= 28
      ? 'street'
      : 'area';
  return nomToResult(first, precision);
}

// ── Orquestador ─────────────────────────────────────────────────────────
/** Devuelve el resultado con mejor precisión de entre los candidatos. */
function betterOf(a: GeoResult, b: GeoResult): GeoResult {
  if (!a) return b;
  if (!b) return a;
  const rank = { house: 3, street: 2, area: 1 } as const;
  return rank[b.precision] > rank[a.precision] ? b : a;
}

export async function geocodeAddress(address: string | null | undefined): Promise<GeoResult> {
  if (!address || address.trim().length < 3) return null;
  const key = address.trim().toLowerCase();

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const wanted = extractHouseNumber(address);
  const withCountry = /espa(ñ|n)a/i.test(address) ? address : `${address}, España`;

  let best: GeoResult = null;

  // 0) MapTiler (si hay API key). Es el proveedor con mejor precisión en
  // direcciones residenciales de España. Si devuelve algo de precisión
  // 'house', terminamos aquí y no lanzamos más queries.
  const mtHits = await queryMapTiler(withCountry);
  if (mtHits.length > 0) {
    // Preferimos el primer hit 'house'; si no hay, el primero.
    const house = mtHits.find((h) => h.precision === 'house');
    best = betterOf(best, house || mtHits[0]);
  }

  // 1) Photon como fallback.
  if (!best || best.precision !== 'house') {
    best = betterOf(best, pickBestPhoton(await queryPhoton(withCountry), wanted));
  }

  // 2) Nominatim como segundo fallback.
  if (!best || best.precision !== 'house') {
    best = betterOf(best, pickBestNom(await queryNominatim(withCountry), wanted));
  }

  // 3) Último intento: la query original sin sufijo, por si era una dirección
  //    internacional o con el país ya implícito que confunde al append.
  if (!best) {
    best = betterOf(best, pickBestPhoton(await queryPhoton(address), wanted));
  }

  cache.set(key, { at: Date.now(), value: best });
  return best;
}
