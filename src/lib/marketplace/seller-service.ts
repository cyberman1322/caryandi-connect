import { getSupabase } from '@/lib/supabase/client';
import type { Views } from '@/lib/supabase/database.types';
import { sanitizeSearchText } from '@/lib/vehicles/filters';
import type { Province } from '@/lib/vehicles/vehicle-options';
import type { VehicleCardData } from '@/lib/vehicles/vehicle-service';

export type SellerSummary = Views<'vehicle_sellers'>;
export type Review = Views<'review_feed'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Link target for a seller: dealerships use their slug, private sellers their id. */
export function sellerParam(s: { seller_kind?: string | null; slug?: string | null; id?: string | null }): string {
  return s.seller_kind === 'business' && s.slug ? s.slug : s.id ?? '';
}

/** Seller link from a listing card. */
export function sellerParamFromListing(v: { business_slug?: string | null; owner_id?: string | null }): string {
  return v.business_slug ?? v.owner_id ?? '';
}

export const SELLER_TYPE_LABELS: Record<string, string> = {
  dealer: 'Dealer',
  import_agent: 'Import agent',
  private_seller: 'Private seller',
};

export async function listSellers(opts: { q?: string; province?: Province; kind?: 'business' | 'private' }): Promise<SellerSummary[]> {
  let query = getSupabase().from('vehicle_sellers').select('*');
  if (opts.q) {
    const q = sanitizeSearchText(opts.q);
    if (q) query = query.or(`name.ilike.*${q}*,city.ilike.*${q}*`);
  }
  if (opts.province) query = query.eq('province', opts.province);
  if (opts.kind) query = query.eq('seller_kind', opts.kind);
  const { data, error } = await query
    .order('is_verified', { ascending: false })
    .order('active_vehicle_count', { ascending: false })
    .order('name', { ascending: true })
    .limit(60);
  if (error) {
    console.error(error);
    throw new Error('We couldn’t load sellers right now. Please try again.');
  }
  return data ?? [];
}

export type SellerPage = { seller: SellerSummary; vehicles: VehicleCardData[]; reviews: Review[] };

const CARD_COLUMNS =
  'id, owner_id, business_id, business_slug, make, model, variant, year, price, mileage_km, transmission, fuel_type, ' +
  'condition, registration_status, duty_status, import_status, province, city, listing_status, is_verified, seller_is_verified, ' +
  'seller_name, seller_type, primary_image_path, published_at, created_at';

export async function getSellerPage(param: string): Promise<SellerPage | null> {
  const supabase = getSupabase();
  const key = param.trim().toLowerCase();
  if (!key || key.length > 120) return null;
  const lookup = UUID.test(key)
    ? await supabase.from('vehicle_sellers').select('*').eq('id', key).limit(1).maybeSingle()
    : await supabase.from('vehicle_sellers').select('*').eq('slug', key).limit(1).maybeSingle();
  if (lookup.error) throw new Error('We couldn’t load this seller.');
  const seller = lookup.data;
  if (!seller?.id) return null;

  const isBusiness = seller.seller_kind === 'business';
  let vehicles = supabase.from('vehicle_listings').select(CARD_COLUMNS).eq('listing_status', 'active');
  vehicles = isBusiness ? vehicles.eq('business_id', seller.id) : vehicles.eq('owner_id', seller.id).is('business_id', null);
  const reviews = supabase.from('review_feed').select('*').eq(isBusiness ? 'business_id' : 'seller_id', seller.id)
    .order('created_at', { ascending: false }).limit(20);

  const [v, r] = await Promise.all([vehicles.order('published_at', { ascending: false, nullsFirst: false }).limit(48), reviews]);
  return {
    seller,
    vehicles: (v.data ?? []) as unknown as VehicleCardData[],
    reviews: r.data ?? [],
  };
}

/** Reviews about the signed-in user (as a private seller) or their business. */
export async function listReviewsAbout(target: { businessId?: string | null; sellerId?: string | null }): Promise<Review[]> {
  const supabase = getSupabase();
  const filters: string[] = [];
  if (target.businessId) filters.push(`business_id.eq.${target.businessId}`);
  if (target.sellerId) filters.push(`seller_id.eq.${target.sellerId}`);
  if (filters.length === 0) return [];
  const { data, error } = await supabase.from('review_feed').select('*').or(filters.join(',')).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error('We couldn’t load your reviews.');
  return data ?? [];
}
