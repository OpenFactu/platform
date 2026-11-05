import { Router } from 'express';

const router = Router();

/**
 * Autocomplete de direcciones para el buscador del mapa (ShipmentDetail,
 * RouteMapPlanner…). Delegamos en Photon que soporta búsquedas parciales.
 */
router.get('/geocode/suggest', async (req: any, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 3) return res.json([]);

    // Si hay MapTiler key, lo preferimos — mejor precisión en direcciones
    // residenciales que Photon. Formato similar: features con place_type,
    // place_name, center [lng, lat].
    const mtKey = process.env.MAPTILER_API_KEY?.trim();
    if (mtKey) {
      const mtUrl = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${encodeURIComponent(mtKey)}&language=es&country=es&limit=8&autocomplete=true`;
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 5000);
      try {
        const r = await fetch(mtUrl, { signal: c.signal, headers: { Accept: 'application/json' } });
        if (r.ok) {
          const data: any = await r.json();
          const feats = Array.isArray(data?.features) ? data.features : [];
          const results = feats
            .map((f: any) => {
              const coords =
                f.center || (f.geometry?.type === 'Point' ? f.geometry.coordinates : null);
              if (!coords || coords.length < 2) return null;
              const ctx: any[] = Array.isArray(f.context) ? f.context : [];
              const city = ctx.find(
                (x: any) => (x.id || '').startsWith('place') || (x.id || '').startsWith('locality'),
              )?.text;
              const postcode = ctx.find((x: any) => (x.id || '').startsWith('postal_code'))?.text;
              const types: string[] = Array.isArray(f.place_type) ? f.place_type : [];
              return {
                label: f.place_name || f.text || '',
                lat: Number(coords[1]),
                lng: Number(coords[0]),
                type: types[0] || null,
                housenumber: f.address || null,
                street: f.text || null,
                city: city || null,
                postcode: postcode || null,
              };
            })
            .filter(Boolean);
          clearTimeout(t);
          return res.json(results);
        }
      } catch {
        /* cae a Photon */
      } finally {
        clearTimeout(t);
      }
    }

    // Fallback: Photon. Probamos con variantes si la query lleva CP/comas
    // extrañas — Photon es sensible a formato.
    //   1. La query tal cual.
    //   2. Sin comas (Photon prefiere espacios).
    //   3. Sólo calle + ciudad (quitamos CP).
    //   4. Tal cual + ", España" si no lleva ya el país.
    const variants: string[] = [];
    const add = (v: string) => {
      const clean = v.replace(/\s+/g, ' ').trim();
      if (clean.length >= 3 && !variants.includes(clean)) variants.push(clean);
    };
    add(q);
    add(q.replace(/,+/g, ' '));
    // "Calle la florida, 13, 06209, Solana" → "Calle la florida 13 Solana"
    add(
      q
        .replace(/,+/g, ' ')
        .replace(/\b\d{5}\b/g, '') // quita CPs
        .replace(/\s+/g, ' ')
        .trim(),
    );
    if (!/espa(ñ|n)a/i.test(q)) add(`${q}, España`);

    for (const v of variants) {
      const url = `https://photon.komoot.io/api/?lang=es&limit=8&q=${encodeURIComponent(v)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const r = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Keirost-ERP/1.0',
          },
        });
        if (!r.ok) continue;
        const data: any = await r.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        if (features.length === 0) continue;
        const results = features.map((f: any) => {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates || [];
          const parts = [
            p.name,
            p.housenumber ? `${p.street || ''} ${p.housenumber}`.trim() : p.street,
            p.postcode,
            p.city || p.town || p.village,
            p.country,
          ].filter(Boolean);
          return {
            label: parts.join(', '),
            lat: Number(coords[1]),
            lng: Number(coords[0]),
            type: p.type || p.osm_value || null,
            housenumber: p.housenumber || null,
            street: p.street || null,
            city: p.city || p.town || p.village || null,
            postcode: p.postcode || null,
          };
        });
        return res.json(results);
      } catch {
        // Siguiente variante
      } finally {
        clearTimeout(timer);
      }
    }

    // Ninguna variante dio resultados.
    res.json([]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
