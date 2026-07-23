import { coreApi } from '@/shared/api';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export interface Country {
  code: string;
  name: string;
  nameEn: string;
  phonePrefix: string;
  currency: string;
  localeDefault: string;
  taxIdRegex: string;
  taxIdLabel: string;
  taxIdExample: string;
  postalCodeRegex: string;
  postalCodeLabel: string;
  regionLabel: string | null;
  subRegionLabel: string;
  localityLabel: string;
}

export interface GeoRow {
  id: string;
  countryCode: string;
  regionId?: string | null;
  code: string;
  name: string;
}

// Cache a nivel de módulo (compartido entre componentes) — los países rara vez cambian
let _countries: Country[] | null = null;
let _countriesPromise: Promise<Country[]> | null = null;
const _regionsCache = new Map<string, Promise<GeoRow[]>>();
const _subRegionsCache = new Map<string, Promise<GeoRow[]>>();

async function request<T>(url: string): Promise<T> {
  const res = await coreApi.raw<T>('GET', url);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.data;
}

export function useGeo() {
  const { token } = useAuth();
  const [countries, setCountries] = useState<Country[]>(_countries || []);
  const [loading, setLoading] = useState(!_countries);

  useEffect(() => {
    if (_countries) {
      setCountries(_countries);
      setLoading(false);
      return;
    }
    if (!_countriesPromise) {
      _countriesPromise = request<Country[]>('/api/geo/countries').then((data) => {
        _countries = data;
        return data;
      });
    }
    _countriesPromise
      .then((data) => {
        setCountries(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [token]);

  const getCountry = useCallback(
    (code: string | null | undefined): Country | null => {
      if (!code) return null;
      return countries.find((c) => c.code === code.toUpperCase()) || null;
    },
    [countries],
  );

  const loadRegions = useCallback(
    async (countryCode: string): Promise<GeoRow[]> => {
      const key = countryCode.toUpperCase();
      if (!_regionsCache.has(key)) {
        _regionsCache.set(key, request<GeoRow[]>(`/api/geo/countries/${key}/regions`));
      }
      return _regionsCache.get(key)!;
    },
    [token],
  );

  const loadSubRegionsByCountry = useCallback(
    async (countryCode: string): Promise<GeoRow[]> => {
      const key = `country:${countryCode.toUpperCase()}`;
      if (!_subRegionsCache.has(key)) {
        _subRegionsCache.set(
          key,
          request<GeoRow[]>(`/api/geo/countries/${countryCode.toUpperCase()}/subregions`),
        );
      }
      return _subRegionsCache.get(key)!;
    },
    [token],
  );

  const loadSubRegionsByRegion = useCallback(
    async (regionId: string): Promise<GeoRow[]> => {
      const key = `region:${regionId}`;
      if (!_subRegionsCache.has(key)) {
        _subRegionsCache.set(
          key,
          request<GeoRow[]>(`/api/geo/regions/${regionId}/subregions`),
        );
      }
      return _subRegionsCache.get(key)!;
    },
    [token],
  );

  const searchLocalities = useCallback(
    async (subRegionId: string, query: string): Promise<GeoRow[]> => {
      const q = encodeURIComponent(query.trim());
      const url = `/api/geo/subregions/${subRegionId}/localities?q=${q}&limit=50`;
      return request<GeoRow[]>(url);
    },
    [token],
  );

  return {
    countries,
    loading,
    getCountry,
    loadRegions,
    loadSubRegionsByCountry,
    loadSubRegionsByRegion,
    searchLocalities,
  };
}
