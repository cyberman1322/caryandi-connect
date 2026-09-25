import { getSupabase } from '@/lib/supabase/client';
import type { Json, Tables, Views } from '@/lib/supabase/database.types';
import { sanitizeSearchText } from '@/lib/vehicles/filters';
import { ServiceError } from '@/lib/vehicles/vehicle-service';
import { PROVINCES, type Province } from '@/lib/vehicles/vehicle-options';
import type { Review } from '@/lib/marketplace/seller-service';
import {
  toRouteColumns, toServiceColumns, type OpeningHours, type RouteFormValues, type ServiceFormValues,
} from './validation';

/**
 * Service-provider directory: mechanics and servicing companies (/services)
 * and import agents (/agents). Public reads use the service_providers view;
 * businesses manage their own services, routes and hours from the dashboard.
 * Row-level security decides who can change what.
 */

export type Provider = Views<'service_providers'>;
export type ServiceRow = Tables<'services'>;
export type ImportRouteRow = Tables<'import_routes'>;
export type ProviderKind = 'services' | 'agents';

export const PROVIDER_TYPE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic',
  servicing_company: 'Servicing company',
  import_agent: 'Import agent',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function fail(message: string, cause?: unknown): never {
  if (cause) console.error(message, cause);
  throw new ServiceError(message);
}

const typesFor = (kind: ProviderKind) => (kind === 'agents' ? ['import_agent' as const] : ['mechanic' as const, 'servicing_company' as const]);

/* ------------------------------------------------------------------ public directory */

export type ProviderFilters = { q?: string; province?: Province; mobile?: boolean };

export function parseProviderFilters(search: Record<string, unknown>): ProviderFilters {
  const out: ProviderFilters = {};
  const q = typeof search['q'] === 'string' ? search['q'].trim().slice(0, 80) : '';
  if (q) out.q = q;
  const p = PROVINCES.find(([v]) => v === search['province'])?.[0];
  if (p) out.province = p;
  if (search['mobile'] === true || search['mobile'] === 'true' || search['mobile'] === '1') out.mobile = true;
  return out;
}

export async function listProviders(kind: ProviderKind, filters: ProviderFilters, limit = 60): Promise<Provider[]> {
  let query = getSupabase().from('service_providers').select('*').in('business_type', typesFor(kind));
  if (filters.q) {
    const words = sanitizeSearchText(filters.q).split(' ').filter(Boolean).slice(0, 5);
    for (const w of words) query = query.or(`name.ilike.*${w}*,city.ilike.*${w}*,area.ilike.*${w}*,description.ilike.*${w}*`);
  }
  if (filters.province) query = query.eq('province', filters.province);
  if (filters.mobile) query = query.eq('is_mobile_service', true);
  const { data, error } = await query
    .order('is_verified', { ascending: false })
    .order('rating_avg', { ascending: false })
    .order('name', { ascending: true })
    .limit(limit);
  if (error) fail(kind === 'agents' ? 'We couldn’t load import agents right now.' : 'We couldn’t load service providers right now.', error);
  return data ?? [];
}

export type ProviderPage = { provider: Provider; services: ServiceRow[]; routes: ImportRouteRow[]; reviews: Review[] };

/** Profile page by slug (or id). Returns null when missing or not of this kind. */
export async function getProviderPage(kind: ProviderKind, param: string): Promise<ProviderPage | null> {
  const key = param.trim().toLowerCase();
  if (!key || key.length > 120 || !(UUID.test(key) || SLUG.test(key))) return null;
  const supabase = getSupabase();
  const lookup = await supabase.from('service_providers').select('*').eq(UUID.test(key) ? 'id' : 'slug', key)
    .in('business_type', typesFor(kind)).limit(1).maybeSingle();
  if (lookup.error) fail('We couldn’t load this profile.', lookup.error);
  const provider = lookup.data;
  if (!provider?.id) return null;

  const [services, routes, reviews] = await Promise.all([
    kind === 'services'
      ? supabase.from('services').select('*').eq('business_id', provider.id).eq('is_active', true).order('price_from', { ascending: true, nullsFirst: false }).order('name')
      : Promise.resolve({ data: [] as ServiceRow[], error: null }),
    kind === 'agents'
      ? supabase.from('import_routes').select('*').eq('business_id', provider.id).eq('is_active', true).order('origin_country').order('price_from', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as ImportRouteRow[], error: null }),
    supabase.from('review_feed').select('*').eq('business_id', provider.id).order('created_at', { ascending: false }).limit(20),
  ]);
  if (services.error || routes.error) fail('We couldn’t load this profile.', services.error ?? routes.error);
  return { provider, services: services.data ?? [], routes: routes.data ?? [], reviews: reviews.data ?? [] };
}

/** Link param for a provider card: slug when present. */
export function providerParam(p: { slug?: string | null; id?: string | null }): string {
  return p.slug ?? p.id ?? '';
}

/* ------------------------------------------------------------------ dashboard: services */

function writeError(error: { code?: string; message?: string }, what: string): string {
  if (error.code === '42501') return 'Your account can’t change this business’s ' + what + '.';
  if (error.code === '23514') return 'Some details are not valid. Please check the form and try again.';
  if (/business type/i.test(error.message ?? '')) return `Only the right kind of business can add ${what}.`;
  return `We couldn’t save your ${what}. Please try again.`;
}

export async function listMyServices(businessId: string): Promise<ServiceRow[]> {
  const { data, error } = await getSupabase().from('services').select('*').eq('business_id', businessId)
    .order('is_active', { ascending: false }).order('name');
  if (error) fail('We couldn’t load your services.', error);
  return data ?? [];
}

export async function saveService(businessId: string, values: ServiceFormValues, id?: string): Promise<void> {
  const supabase = getSupabase();
  const columns = toServiceColumns(values);
  const { data, error } = id
    ? await supabase.from('services').update(columns).eq('id', id).eq('business_id', businessId).select('id')
    : await supabase.from('services').insert({ ...columns, business_id: businessId }).select('id');
  if (error) fail(writeError(error, 'services'), error);
  if (!data?.length) fail('This service could not be found or you can’t change it.');
}

export async function setServiceActive(id: string, active: boolean): Promise<void> {
  const { data, error } = await getSupabase().from('services').update({ is_active: active }).eq('id', id).select('id');
  if (error) fail(writeError(error, 'services'), error);
  if (!data?.length) fail('This service could not be found or you can’t change it.');
}

export async function deleteService(id: string): Promise<void> {
  const { data, error } = await getSupabase().from('services').delete().eq('id', id).select('id');
  if (error) fail(writeError(error, 'services'), error);
  if (!data?.length) fail('This service could not be found or you can’t delete it.');
}

/* ------------------------------------------------------------------ dashboard: import routes */

export async function listMyRoutes(businessId: string): Promise<ImportRouteRow[]> {
  const { data, error } = await getSupabase().from('import_routes').select('*').eq('business_id', businessId)
    .order('is_active', { ascending: false }).order('origin_country');
  if (error) fail('We couldn’t load your routes.', error);
  return data ?? [];
}

export async function saveRoute(businessId: string, values: RouteFormValues, id?: string): Promise<void> {
  const supabase = getSupabase();
  const columns = toRouteColumns(values);
  const { data, error } = id
    ? await supabase.from('import_routes').update(columns).eq('id', id).eq('business_id', businessId).select('id')
    : await supabase.from('import_routes').insert({ ...columns, business_id: businessId }).select('id');
  if (error) fail(writeError(error, 'routes'), error);
  if (!data?.length) fail('This route could not be found or you can’t change it.');
}

export async function setRouteActive(id: string, active: boolean): Promise<void> {
  const { data, error } = await getSupabase().from('import_routes').update({ is_active: active }).eq('id', id).select('id');
  if (error) fail(writeError(error, 'routes'), error);
  if (!data?.length) fail('This route could not be found or you can’t change it.');
}

export async function deleteRoute(id: string): Promise<void> {
  const { data, error } = await getSupabase().from('import_routes').delete().eq('id', id).select('id');
  if (error) fail(writeError(error, 'routes'), error);
  if (!data?.length) fail('This route could not be found or you can’t delete it.');
}

/* ------------------------------------------------------------------ dashboard: availability & pricing */

export type AvailabilityInput = {
  openingHours: OpeningHours | null;
  isMobileService: boolean;
  priceFrom: number | null;
  priceNote: string | null;
};

/** Owners and managers only (the database refuses staff). */
export async function saveAvailability(businessId: string, input: AvailabilityInput): Promise<void> {
  const hours = input.openingHours && Object.values(input.openingHours).some(Boolean) ? (input.openingHours as unknown as Json) : null;
  const { data, error } = await getSupabase()
    .from('businesses')
    .update({ opening_hours: hours, is_mobile_service: input.isMobileService, price_from: input.priceFrom, price_note: input.priceNote })
    .eq('id', businessId)
    .select('id');
  if (error) fail(error.code === '23514' ? 'Check the opening hours: each closing time must be after the opening time.' : 'We couldn’t save your availability. Please try again.', error);
  if (!data?.length) fail('Only the business owner or a manager can change opening hours and prices.');
}

/* ------------------------------------------------------------------ all businesses by area (/locations) */

export type DirectoryBusiness = Pick<Tables<'businesses'>,
  'id' | 'slug' | 'name' | 'business_type' | 'province' | 'city' | 'area' | 'verification_status' | 'rating_avg' | 'rating_count'>;

export async function listBusinessDirectory(opts: { types?: Array<Tables<'businesses'>['business_type']>; q?: string }, limit = 100): Promise<DirectoryBusiness[]> {
  let query = getSupabase().from('businesses')
    .select('id, slug, name, business_type, province, city, area, verification_status, rating_avg, rating_count')
    .eq('is_active', true).is('deleted_at', null);
  if (opts.types?.length) query = query.in('business_type', opts.types);
  if (opts.q) {
    const words = sanitizeSearchText(opts.q).split(' ').filter(Boolean).slice(0, 5);
    for (const w of words) query = query.or(`name.ilike.*${w}*,city.ilike.*${w}*,area.ilike.*${w}*`);
  }
  const { data, error } = await query.order('rating_avg', { ascending: false }).order('name').limit(limit);
  if (error) fail('We couldn’t load businesses right now.', error);
  // Verified first, otherwise keep the rating order (sort is stable).
  return (data ?? []).sort((x, y) => Number(y.verification_status === 'approved') - Number(x.verification_status === 'approved'));
}
