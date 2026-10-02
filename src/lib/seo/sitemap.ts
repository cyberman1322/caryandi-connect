import { getSupabase } from '@/lib/supabase/client';

/** Public pages that are always listed. Private areas (dashboard, admin, sign-in) are left out on purpose. */
const STATIC_PAGES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/vehicles', changefreq: 'hourly', priority: '0.9' },
  { path: '/parts', changefreq: 'daily', priority: '0.8' },
  { path: '/services', changefreq: 'daily', priority: '0.8' },
  { path: '/agents', changefreq: 'daily', priority: '0.8' },
  { path: '/sellers', changefreq: 'daily', priority: '0.7' },
  { path: '/information', changefreq: 'weekly', priority: '0.7' },
  { path: '/locations', changefreq: 'weekly', priority: '0.5' },
  { path: '/warning-lights', changefreq: 'monthly', priority: '0.4' },
  { path: '/help', changefreq: 'monthly', priority: '0.4' },
  { path: '/terms', changefreq: 'yearly', priority: '0.2' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.2' },
  { path: '/cookies', changefreq: 'yearly', priority: '0.2' },
];

const MAX_ROWS = 5000;

type Entry = { loc: string; lastmod?: string | null | undefined; changefreq?: string; priority?: string };

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : undefined);

/**
 * Builds sitemap.xml from the live database (public data only, read with the
 * anonymous key, so row-level security decides what is listed). If a query
 * fails, that section is skipped rather than failing the whole sitemap.
 */
export async function buildSitemap(origin: string): Promise<string> {
  const supabase = getSupabase();
  const entries: Entry[] = STATIC_PAGES.map((p) => ({ loc: origin + p.path, changefreq: p.changefreq, priority: p.priority }));

  const [vehicles, parts, sellers, providers, articles] = await Promise.all([
    supabase.from('vehicle_listings').select('id, updated_at').eq('listing_status', 'active').order('updated_at', { ascending: false }).limit(MAX_ROWS),
    supabase.from('part_listings').select('id, updated_at').eq('listing_status', 'active').order('updated_at', { ascending: false }).limit(MAX_ROWS),
    supabase.from('vehicle_sellers').select('id, slug, created_at').limit(MAX_ROWS),
    supabase.from('service_providers').select('slug, business_type, created_at').limit(MAX_ROWS),
    supabase.from('info_articles').select('slug, updated_at').eq('is_published', true).limit(MAX_ROWS),
  ]);

  for (const v of vehicles.data ?? []) if (v.id) entries.push({ loc: `${origin}/vehicles/${v.id}`, lastmod: day(v.updated_at), changefreq: 'weekly', priority: '0.8' });
  for (const p of parts.data ?? []) if (p.id) entries.push({ loc: `${origin}/parts/${p.id}`, lastmod: day(p.updated_at), changefreq: 'weekly', priority: '0.6' });
  for (const s of sellers.data ?? []) {
    const key = s.slug ?? s.id;
    if (key) entries.push({ loc: `${origin}/sellers/${encodeURIComponent(key)}`, changefreq: 'weekly', priority: '0.6' });
  }
  for (const b of providers.data ?? []) {
    if (!b.slug) continue;
    const base = b.business_type === 'import_agent' ? 'agents' : 'services';
    entries.push({ loc: `${origin}/${base}/${encodeURIComponent(b.slug)}`, changefreq: 'weekly', priority: '0.6' });
  }
  for (const a of articles.data ?? []) if (a.slug) entries.push({ loc: `${origin}/information/${encodeURIComponent(a.slug)}`, lastmod: day(a.updated_at), changefreq: 'monthly', priority: '0.6' });

  const body = entries
    .map((e) => `  <url><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}${e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : ''}${e.priority ? `<priority>${e.priority}</priority>` : ''}</url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
