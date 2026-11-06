/** Resume un User-Agent en navegador y sistema; cada uno es null si no se reconoce. */
export function summarizeUserAgent(ua: string | null | undefined): {
  browser: string | null;
  os: string | null;
} {
  if (!ua) return { browser: null, os: null };
  let browser: string | null = null;
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  else if (/Tauri|keirost/i.test(ua)) browser = 'Keirost';

  let os: string | null = null;
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return { browser, os };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** «hace 5 minutos» / «5 minutes ago» en el idioma dado; «ahora» por debajo del minuto. */
export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return fmt.format(0, 'second');
}
