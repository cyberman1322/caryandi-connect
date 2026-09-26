import { getSupabase } from '@/lib/supabase/client';
import type { Enums, Tables } from '@/lib/supabase/database.types';
import type { VehicleCardData } from '@/lib/vehicles/vehicle-service';
import { formatDate } from '@/lib/vehicles/vehicle-options';

/* ------------------------------------------------------------------ favourites */

export async function listMyFavouriteIds(): Promise<string[]> {
  const { data, error } = await getSupabase().from('favourites').select('vehicle_id');
  if (error) throw new Error('We couldn’t load your saved vehicles.');
  return (data ?? []).map((f) => f.vehicle_id);
}

export async function addFavourite(vehicleId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) throw new Error('Please sign in to save vehicles.');
  const { error } = await supabase.from('favourites').insert({ profile_id: uid, vehicle_id: vehicleId });
  // Already saved (double tap / two tabs) is not an error for the user.
  if (error && error.code !== '23505') throw new Error('We couldn’t save this vehicle.');
}

export async function removeFavourite(vehicleId: string): Promise<void> {
  const { error } = await getSupabase().from('favourites').delete().eq('vehicle_id', vehicleId);
  if (error) throw new Error('We couldn’t remove this vehicle from your saved list.');
}

const CARD_COLUMNS =
  'id, owner_id, business_id, business_slug, make, model, variant, year, price, mileage_km, transmission, fuel_type, ' +
  'condition, registration_status, duty_status, import_status, province, city, listing_status, is_verified, seller_is_verified, ' +
  'seller_name, seller_type, primary_image_path, published_at, created_at';

/** Saved vehicles that are still visible (sold ones stay listed so buyers know what happened). */
export async function listMyFavouriteVehicles(): Promise<VehicleCardData[]> {
  const ids = await listMyFavouriteIds();
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase().from('vehicle_listings').select(CARD_COLUMNS).in('id', ids);
  if (error) throw new Error('We couldn’t load your saved vehicles.');
  const rows = (data ?? []) as unknown as VehicleCardData[];
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is VehicleCardData => Boolean(r));
}

/* --------------------------------------------------------------------- contact */

export type ContactTarget = 'vehicle' | 'part' | 'service' | 'import_route' | 'business' | 'profile';
export type ContactDetails = { displayName: string | null; phone: string | null; whatsappNumber: string | null; whatsappLink: string | null };

/** Phone + WhatsApp for a listing's seller. Requires sign-in; every reveal is logged by the database. */
export async function getContact(target: ContactTarget, id: string): Promise<ContactDetails> {
  const { data, error } = await getSupabase().rpc('get_contact', { p_target_type: target, p_target_id: id });
  if (error) {
    if (error.message.includes('Sign in')) throw new Error('Please sign in to see contact details.');
    if (error.message.includes('Too many')) throw new Error('You’ve viewed a lot of contacts recently. Please try again later.');
    if (error.message.includes('own listing')) throw new Error('This is your own listing.');
    if (error.message.includes('not available')) throw new Error('This listing is no longer available.');
    throw new Error('We couldn’t load the contact details. Please try again.');
  }
  const row = data?.[0];
  return {
    displayName: row?.display_name ?? null,
    phone: row?.phone ?? null,
    whatsappNumber: row?.whatsapp_number ?? null,
    whatsappLink: row?.whatsapp_link ?? null,
  };
}

/** wa.me link with a friendly pre-filled first message. */
export function whatsappLinkWithMessage(link: string, message: string): string {
  return `${link}?text=${encodeURIComponent(message)}`;
}

/* --------------------------------------------------------------------- reports */

export type ReportCategory = Enums<'report_category'>;
export type ReportTarget = Enums<'report_target'>;

export const REPORT_CATEGORIES: ReadonlyArray<readonly [ReportCategory, string]> = [
  ['scam', 'Scam or fraud (asked for money, fake seller)'],
  ['misleading_listing', 'Misleading or false details'],
  ['inappropriate_content', 'Inappropriate photos or text'],
  ['spam', 'Spam or duplicate listing'],
  ['other', 'Something else'],
];

export async function fileReport(input: { target: ReportTarget; targetId: string; category: ReportCategory; details: string }): Promise<void> {
  const details = input.details.trim();
  if (details.length < 10) throw new Error('Please describe what happened (at least 10 characters).');
  const { error } = await getSupabase()
    .from('reports')
    .insert({ target_type: input.target, target_id: input.targetId, category: input.category, details: details.slice(0, 3000) });
  if (error) {
    if (error.message.includes('Too many')) throw new Error('You’ve sent several reports today. Our team is reviewing them.');
    throw new Error('We couldn’t send your report. Please try again.');
  }
}

/* --------------------------------------------------------------- notifications */

export type Notification = Tables<'notifications'>;

export async function listMyNotifications(limit = 50): Promise<Notification[]> {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('We couldn’t load your notifications.');
  return data ?? [];
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase().from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
  if (error) throw new Error('We couldn’t update your notifications.');
}

/* ------------------------------------------------------------------- dashboard */

export type DashboardStats = {
  active_listings: number;
  draft_listings: number;
  sold_listings: number;
  times_saved: number;
  contact_requests_7d: number;
  contact_requests_total: number;
  unread_notifications: number;
};

const ZERO_STATS: DashboardStats = {
  active_listings: 0, draft_listings: 0, sold_listings: 0, times_saved: 0,
  contact_requests_7d: 0, contact_requests_total: 0, unread_notifications: 0,
};

export async function getMyDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await getSupabase().rpc('my_dashboard_stats');
  if (error) throw new Error('We couldn’t load your dashboard numbers.');
  const raw = (data ?? {}) as Record<string, unknown>;
  const out = { ...ZERO_STATS };
  for (const key of Object.keys(ZERO_STATS) as Array<keyof DashboardStats>) {
    const n = Number(raw[key]);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

/** "5 min ago", "Yesterday", "12 Sep" */
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const secs = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (secs < 60) return 'Just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

/** "+260971234567" → "+260 97 123 4567"; other numbers are returned unchanged. */
export function formatPhone(e164: string): string {
  const m = /^\+260(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+260 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
