import { getSupabase } from '@/lib/supabase/client';
import type { Tables, Views } from '@/lib/supabase/database.types';
import { compressPhoto, checkImageFile, extensionFor, storagePath } from '@/lib/storage/images';
import { sanitizeSearchText } from '@/lib/vehicles/filters';
import { ServiceError, type UploadProgress } from '@/lib/vehicles/vehicle-service';
import type { ListingStatus, Province } from '@/lib/vehicles/vehicle-options';
import { toPartColumns, type PartCondition, type PartFormValues } from './validation';

/**
 * Parts marketplace. Reads go through the public part_listings view (row-level
 * security still applies); writes go to parts / part_images, where the
 * database checks ownership, the phone-number rule for publishing and that
 * only admins can set review statuses.
 */

export type PartListing = Views<'part_listings'>;
export type PartImageRow = Tables<'part_images'>;
export type PartCategory = Tables<'part_categories'>;

export const MAX_PART_PHOTOS = 10;
export const PARTS_PAGE_SIZE = 24;

function fail(message: string, cause?: unknown): never {
  if (cause) console.error(message, cause);
  throw new ServiceError(message);
}

async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) fail('Please sign in to continue.');
  return id;
}

const PART_CARD_COLUMNS =
  'id, owner_id, business_id, category_id, category_slug, category_name, title, price, condition, quantity, ' +
  'province, city, listing_status, seller_name, business_slug, is_verified, primary_image_path, published_at, created_at';

export type PartCardData = Pick<
  PartListing,
  | 'id' | 'owner_id' | 'business_id' | 'category_id' | 'category_slug' | 'category_name' | 'title' | 'price' | 'condition'
  | 'quantity' | 'province' | 'city' | 'listing_status' | 'seller_name' | 'business_slug' | 'is_verified'
  | 'primary_image_path' | 'published_at' | 'created_at'
>;

/* ------------------------------------------------------------------ public reads */

export type PartFilters = { q?: string; category?: string; province?: Province; condition?: PartCondition; page?: number };

export function parsePartFilters(search: Record<string, unknown>, categories?: string[]): PartFilters {
  const out: PartFilters = {};
  const q = typeof search['q'] === 'string' ? search['q'].trim().slice(0, 80) : '';
  if (q) out.q = q;
  const cat = typeof search['category'] === 'string' ? search['category'].trim().toLowerCase() : '';
  if (cat && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(cat) && (!categories || categories.includes(cat))) out.category = cat;
  const p = search['province'];
  if (typeof p === 'string' && /^[a-z_]{3,20}$/.test(p)) out.province = p as Province;
  const c = search['condition'];
  if (c === 'new' || c === 'used' || c === 'reconditioned') out.condition = c;
  const page = Number(search['page']);
  if (Number.isInteger(page) && page > 1 && page <= 1000) out.page = page;
  return out;
}

export type PartSearchResult = { items: PartCardData[]; total: number; page: number; pageCount: number };

export async function searchParts(filters: PartFilters): Promise<PartSearchResult> {
  const page = filters.page ?? 1;
  const from = (page - 1) * PARTS_PAGE_SIZE;
  let query = getSupabase().from('part_listings').select(PART_CARD_COLUMNS, { count: 'exact' }).eq('listing_status', 'active');
  if (filters.q) {
    const words = sanitizeSearchText(filters.q).split(' ').filter(Boolean).slice(0, 5);
    for (const word of words) query = query.or(`search_text.ilike.*${word}*,compatibility_note.ilike.*${word}*,city.ilike.*${word}*`);
  }
  if (filters.category) query = query.eq('category_slug', filters.category);
  if (filters.province) query = query.eq('province', filters.province);
  if (filters.condition) query = query.eq('condition', filters.condition);
  const { data, error, count } = await query
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + PARTS_PAGE_SIZE - 1);
  if (error) {
    if (error.code === 'PGRST103') return { items: [], total: 0, page, pageCount: 1 };
    fail('We couldn’t load parts right now. Please try again.', error);
  }
  const total = count ?? 0;
  return { items: (data ?? []) as unknown as PartCardData[], total, page, pageCount: Math.max(1, Math.ceil(total / PARTS_PAGE_SIZE)) };
}

export async function listPartCategories(): Promise<PartCategory[]> {
  const { data, error } = await getSupabase().from('part_categories').select('*').order('sort_order');
  if (error) fail('We couldn’t load part categories.', error);
  return data ?? [];
}

export type PartPageData = { part: PartListing; images: PartImageRow[] };

export async function getPartPage(id: string): Promise<PartPageData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = getSupabase();
  const [p, imgs] = await Promise.all([
    supabase.from('part_listings').select('*').eq('id', id).maybeSingle(),
    supabase.from('part_images').select('*').eq('part_id', id).order('is_primary', { ascending: false }).order('position'),
  ]);
  if (p.error) fail('We couldn’t load this part.', p.error);
  if (!p.data) return null;
  return { part: p.data, images: imgs.data ?? [] };
}

/* ------------------------------------------------------------------ seller: parts */

export async function listMyParts(businessId: string | null): Promise<PartCardData[]> {
  const uid = await currentUserId();
  let query = getSupabase().from('part_listings').select(PART_CARD_COLUMNS);
  query = businessId ? query.or(`owner_id.eq.${uid},business_id.eq.${businessId}`) : query.eq('owner_id', uid);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) fail('We couldn’t load your parts.', error);
  return (data ?? []) as unknown as PartCardData[];
}

export async function getMyPart(id: string): Promise<Tables<'parts'> | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await getSupabase().from('parts').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) fail('We couldn’t load this part.', error);
  return data;
}

function friendlyWriteError(error: { message: string; code?: string }): string {
  if (error.message.includes('phone number')) return 'Add a phone number to your profile before publishing, so buyers can reach you.';
  if (error.message.includes('Only administrators') || error.message.includes('under review')) return 'This listing is under review by Caryandi and can’t be changed right now.';
  if (error.code === '42501') return 'Your account can’t list parts, or this listing isn’t yours.';
  if (error.code === '23514' || error.code === '23503') return 'Some details are not valid. Please check the form and try again.';
  return 'We couldn’t save this part. Please try again.';
}

export async function createPart(values: PartFormValues, opts: { businessId: string | null }): Promise<string> {
  const uid = await currentUserId();
  const { data, error } = await getSupabase()
    .from('parts')
    .insert({ ...toPartColumns(values), owner_id: uid, business_id: opts.businessId, listing_status: 'draft' })
    .select('id')
    .single();
  if (error) fail(friendlyWriteError(error), error);
  return data.id;
}

export async function updatePart(id: string, values: PartFormValues): Promise<void> {
  const { error } = await getSupabase().from('parts').update(toPartColumns(values)).eq('id', id);
  if (error) fail(friendlyWriteError(error), error);
}

export async function setPartStatus(id: string, status: Extract<ListingStatus, 'draft' | 'active' | 'sold' | 'archived'>): Promise<void> {
  const { data, error } = await getSupabase().from('parts').update({ listing_status: status }).eq('id', id).select('id');
  if (error) fail(friendlyWriteError(error), error);
  if (!data?.length) fail('This part could not be found or you can’t change it.');
}

export async function deletePart(id: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('parts')
    .update({ deleted_at: new Date().toISOString(), listing_status: 'archived' })
    .eq('id', id)
    .select('id');
  if (error) fail(friendlyWriteError(error), error);
  if (!data?.length) fail('This part could not be found or you can’t delete it.');
}

/* ------------------------------------------------------------------ seller: photos */

export async function listPartImages(partId: string): Promise<PartImageRow[]> {
  const { data, error } = await getSupabase().from('part_images').select('*').eq('part_id', partId).order('position');
  if (error) fail('We couldn’t load photos.', error);
  return data ?? [];
}

export async function addPartPhotos(partId: string, files: File[], onProgress?: (p: UploadProgress) => void): Promise<{ added: number; errors: string[] }> {
  const uid = await currentUserId();
  const supabase = getSupabase();
  const errors: string[] = [];
  const current = await supabase.from('part_images').select('position, is_primary').eq('part_id', partId);
  if (current.error) fail('We couldn’t check this part’s photos. Please try again.', current.error);
  let hasPrimary = current.data.some((r) => r.is_primary);
  let nextPosition = current.data.reduce((max, r) => Math.max(max, r.position + 1), 0);
  const room = Math.max(0, MAX_PART_PHOTOS - current.data.length);
  if (files.length > room) errors.push(`Only ${MAX_PART_PHOTOS} photos are allowed per part; ${files.length - room} were skipped.`);
  const accepted = files.slice(0, room);
  let added = 0;
  for (const [i, file] of accepted.entries()) {
    onProgress?.({ done: i, total: accepted.length });
    const check = checkImageFile(file);
    if (!check.ok) { errors.push(check.error); continue; }
    let blob: Blob;
    try {
      blob = await compressPhoto(file);
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : 'this photo couldn’t be processed.'}`);
      continue;
    }
    const contentType = blob.type || file.type;
    const path = storagePath(uid, `parts-${partId}`, extensionFor(contentType));
    const upload = await supabase.storage.from('part-images').upload(path, blob, { contentType, cacheControl: '31536000', upsert: false });
    if (upload.error) { errors.push(`${file.name}: upload failed. Please try again.`); continue; }
    const position = Math.min(nextPosition, 19);
    const insert = await supabase.from('part_images').insert({ part_id: partId, storage_path: path, position, is_primary: !hasPrimary });
    if (insert.error) {
      await supabase.storage.from('part-images').remove([path]);
      errors.push(`${file.name}: couldn’t be added to the listing.`);
      continue;
    }
    added += 1;
    hasPrimary = true;
    nextPosition = position + 1;
  }
  onProgress?.({ done: accepted.length, total: accepted.length });
  return { added, errors };
}

export async function removePartPhoto(image: PartImageRow, remaining: PartImageRow[]): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('part_images').delete().eq('id', image.id);
  if (error) fail('We couldn’t remove that photo.', error);
  await supabase.storage.from('part-images').remove([image.storage_path]);
  if (image.is_primary) {
    const next = remaining.find((r) => r.id !== image.id);
    if (next) await supabase.from('part_images').update({ is_primary: true }).eq('id', next.id);
  }
}

export async function setPrimaryPartPhoto(partId: string, imageId: string): Promise<void> {
  const supabase = getSupabase();
  const clear = await supabase.from('part_images').update({ is_primary: false }).eq('part_id', partId).eq('is_primary', true);
  if (clear.error) fail('We couldn’t change the main photo.', clear.error);
  const set = await supabase.from('part_images').update({ is_primary: true }).eq('id', imageId);
  if (set.error) fail('We couldn’t change the main photo.', set.error);
}
