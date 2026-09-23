import { getSupabase } from '@/lib/supabase/client';
import type { Tables, Views } from '@/lib/supabase/database.types';
import { compressPhoto, checkDocumentFile, checkImageFile, extensionFor, storagePath } from '@/lib/storage/images';
import { PAGE_SIZE, sanitizeSearchText, type VehicleFilters } from './filters';
import type { ListingStatus } from './vehicle-options';
import { toVehicleColumns, type VehicleFormValues } from './validation';

export type VehicleListing = Views<'vehicle_listings'>;
export type VehicleImageRow = Tables<'vehicle_images'>;
export type VehicleDocumentRow = Tables<'vehicle_documents'>;
export type VehicleDocumentType = VehicleDocumentRow['document_type'];

export const MAX_PHOTOS = 20;

export class ServiceError extends Error {}

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

/* ------------------------------------------------------------------ public reads */

/** Columns needed for listing cards (keeps search responses small on mobile data). */
const CARD_COLUMNS =
  'id, owner_id, business_id, business_slug, make, model, variant, year, price, mileage_km, transmission, fuel_type, ' +
  'condition, registration_status, duty_status, import_status, province, city, listing_status, is_verified, ' +
  'seller_name, seller_type, primary_image_path, published_at, created_at';

export type VehicleCardData = Pick<
  VehicleListing,
  | 'id' | 'owner_id' | 'business_id' | 'business_slug' | 'make' | 'model' | 'variant' | 'year' | 'price' | 'mileage_km'
  | 'transmission' | 'fuel_type' | 'condition' | 'registration_status' | 'duty_status' | 'import_status' | 'province'
  | 'city' | 'listing_status' | 'is_verified' | 'seller_name' | 'seller_type' | 'primary_image_path' | 'published_at'
  | 'created_at'
>;

export type VehicleSearchResult = { items: VehicleCardData[]; total: number; page: number; pageCount: number };

export async function searchVehicles(filters: VehicleFilters): Promise<VehicleSearchResult> {
  const page = filters.page ?? 1;
  const from = (page - 1) * PAGE_SIZE;
  let query = getSupabase()
    .from('vehicle_listings')
    .select(CARD_COLUMNS, { count: 'exact' })
    .eq('listing_status', 'active');

  if (filters.q) {
    const words = sanitizeSearchText(filters.q).split(' ').filter((w) => w.length > 0).slice(0, 5);
    // Every word must match the make/model/variant or the town.
    for (const word of words) query = query.or(`search_text.ilike.*${word}*,city.ilike.*${word}*`);
  }
  if (filters.make) query = query.ilike('make', sanitizeSearchText(filters.make));
  if (filters.province) query = query.eq('province', filters.province);
  if (filters.minPrice !== undefined) query = query.gte('price', filters.minPrice);
  if (filters.maxPrice !== undefined) query = query.lte('price', filters.maxPrice);
  if (filters.minYear !== undefined) query = query.gte('year', filters.minYear);
  if (filters.maxYear !== undefined) query = query.lte('year', filters.maxYear);
  if (filters.maxMileage !== undefined) query = query.lte('mileage_km', filters.maxMileage);
  if (filters.transmission) query = query.eq('transmission', filters.transmission);
  if (filters.fuel) query = query.eq('fuel_type', filters.fuel);
  if (filters.condition) query = query.eq('condition', filters.condition);
  if (filters.registration) query = query.eq('registration_status', filters.registration);
  if (filters.duty) query = query.eq('duty_status', filters.duty);
  if (filters.import) query = query.eq('import_status', filters.import);
  if (filters.verified) query = query.eq('is_verified', true);

  switch (filters.sort ?? 'newest') {
    case 'price_asc': query = query.order('price', { ascending: true }); break;
    case 'price_desc': query = query.order('price', { ascending: false }); break;
    case 'year_desc': query = query.order('year', { ascending: false }).order('published_at', { ascending: false, nullsFirst: false }); break;
    case 'mileage_asc': query = query.order('mileage_km', { ascending: true, nullsFirst: false }); break;
    default: query = query.order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  }
  // Final tie-breaker so equal prices/years never repeat or vanish between pages.
  query = query.order('id', { ascending: true });

  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) {
    // Asking for a page past the end (old bookmark, listings sold since) is not an error for the visitor.
    if (error.code === 'PGRST103') return { items: [], total: 0, page, pageCount: 1 };
    fail('We couldn’t load vehicles right now. Please try again.', error);
  }
  const total = count ?? 0;
  return {
    items: (data ?? []) as unknown as VehicleCardData[],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getLatestVehicles(limit = 8): Promise<VehicleCardData[]> {
  const { data, error } = await getSupabase()
    .from('vehicle_listings')
    .select(CARD_COLUMNS)
    .eq('listing_status', 'active')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) fail('We couldn’t load the latest vehicles.', error);
  return (data ?? []) as unknown as VehicleCardData[];
}

export async function getMakeOptions(): Promise<Array<{ make: string; count: number }>> {
  const { data, error } = await getSupabase()
    .from('vehicle_listings')
    .select('make')
    .eq('listing_status', 'active')
    .order('make');
  if (error) fail('We couldn’t load vehicle makes.', error);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const make = row.make;
    if (make) counts.set(make, (counts.get(make) ?? 0) + 1);
  }
  return Array.from(counts, ([make, count]) => ({ make, count })).sort((a, b) => a.make.localeCompare(b.make));
}

/** One listing (any status the caller is allowed to see: live for everyone, drafts for the owner). */
export async function getVehicleListing(id: string): Promise<VehicleListing | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await getSupabase().from('vehicle_listings').select('*').eq('id', id).maybeSingle();
  if (error) fail('We couldn’t load this vehicle.', error);
  return data;
}

export async function getVehicleImages(vehicleId: string): Promise<VehicleImageRow[]> {
  const { data, error } = await getSupabase()
    .from('vehicle_images')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('is_primary', { ascending: false })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) fail('We couldn’t load the photos for this vehicle.', error);
  return data ?? [];
}

export async function getDocumentSummary(vehicleId: string): Promise<VehicleDocumentType[]> {
  const { data, error } = await getSupabase().rpc('vehicle_document_summary', { p_vehicle_id: vehicleId });
  if (error) return [];
  return (data ?? []).map((d) => d.document_type).filter((t): t is VehicleDocumentType => Boolean(t));
}

export type VehiclePageData = { listing: VehicleListing; images: VehicleImageRow[]; documents: VehicleDocumentType[] };

/** Everything the vehicle detail page needs, fetched in parallel. Null when the caller can't see the listing. */
export async function loadVehiclePage(id: string): Promise<VehiclePageData | null> {
  const listing = await getVehicleListing(id);
  if (!listing?.id) return null;
  const [images, documents] = await Promise.all([getVehicleImages(listing.id), getDocumentSummary(listing.id)]);
  return { listing, images, documents };
}

export async function getSimilarVehicles(v: Pick<VehicleListing, 'id' | 'make' | 'price'>, limit = 3): Promise<VehicleCardData[]> {
  const supabase = getSupabase();
  const byMake = await supabase
    .from('vehicle_listings')
    .select(CARD_COLUMNS)
    .eq('listing_status', 'active')
    .neq('id', v.id ?? '')
    .ilike('make', sanitizeSearchText(v.make ?? ''))
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  const items = ((byMake.data ?? []) as unknown as VehicleCardData[]);
  if (items.length >= limit || !v.price) return items;
  const byPrice = await supabase
    .from('vehicle_listings')
    .select(CARD_COLUMNS)
    .eq('listing_status', 'active')
    .neq('id', v.id ?? '')
    .gte('price', Math.round(v.price * 0.7))
    .lte('price', Math.round(v.price * 1.3))
    .limit(limit * 2);
  const more = ((byPrice.data ?? []) as unknown as VehicleCardData[]).filter((x) => !items.some((i) => i.id === x.id));
  return [...items, ...more].slice(0, limit);
}

/* ------------------------------------------------------------- seller: listings */

/** All of the signed-in seller's vehicles, plus their dealership's (for team members). */
export async function listMyVehicles(businessId: string | null): Promise<VehicleCardData[]> {
  const uid = await currentUserId();
  let query = getSupabase().from('vehicle_listings').select(CARD_COLUMNS);
  query = businessId ? query.or(`owner_id.eq.${uid},business_id.eq.${businessId}`) : query.eq('owner_id', uid);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) fail('We couldn’t load your listings.', error);
  return (data ?? []) as unknown as VehicleCardData[];
}

export async function getMyVehicle(id: string): Promise<Tables<'vehicles'> | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await getSupabase().from('vehicles').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) fail('We couldn’t load this listing.', error);
  return data;
}

function friendlyWriteError(error: { message: string; code?: string }): string {
  if (error.message.includes('phone number')) return 'Add a phone number to your profile before publishing, so buyers can reach you.';
  if (error.message.includes('Only administrators') || error.message.includes('under review')) return 'This listing is under review by Caryandi and can’t be changed right now.';
  if (error.code === '42501') return 'You don’t have permission to change this listing.';
  if (error.code === '23514') return 'Some details are not valid. Please check the form and try again.';
  return 'We couldn’t save this listing. Please try again.';
}

export async function createVehicle(values: VehicleFormValues, opts: { businessId: string | null }): Promise<string> {
  const uid = await currentUserId();
  const supabase = getSupabase();
  // Always create as a draft first, so photos can be attached before it goes live.
  const { data, error } = await supabase
    .from('vehicles')
    .insert({ ...toVehicleColumns(values), owner_id: uid, business_id: opts.businessId, listing_status: 'draft' })
    .select('id')
    .single();
  if (error) fail(friendlyWriteError(error), error);
  return data.id;
}

export async function updateVehicle(id: string, values: VehicleFormValues): Promise<void> {
  const { error } = await getSupabase().from('vehicles').update(toVehicleColumns(values)).eq('id', id);
  if (error) fail(friendlyWriteError(error), error);
}

export async function setVehicleStatus(id: string, status: Extract<ListingStatus, 'draft' | 'active' | 'sold' | 'archived'>): Promise<void> {
  const { data, error } = await getSupabase().from('vehicles').update({ listing_status: status }).eq('id', id).select('id');
  if (error) fail(friendlyWriteError(error), error);
  if (!data || data.length === 0) fail('This listing could not be found or you can’t change it.');
}

/** Soft delete: hidden everywhere but kept for records (reports, disputes). */
export async function deleteVehicle(id: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('vehicles')
    .update({ deleted_at: new Date().toISOString(), listing_status: 'archived' })
    .eq('id', id)
    .select('id');
  if (error) fail(friendlyWriteError(error), error);
  if (!data || data.length === 0) fail('This listing could not be found or you can’t delete it.');
}

/* ---------------------------------------------------------------- seller: photos */

export type UploadProgress = { done: number; total: number };

/**
 * Compress and upload photos, then register them on the listing. Photos that
 * fail are reported back; the others are kept.
 */
export async function addVehiclePhotos(
  vehicleId: string,
  files: File[],
  onProgress?: (p: UploadProgress) => void,
): Promise<{ added: number; errors: string[] }> {
  const uid = await currentUserId();
  const supabase = getSupabase();
  const errors: string[] = [];
  // Re-read what's already there rather than trusting the caller's (possibly stale) count.
  const current = await supabase.from('vehicle_images').select('position, is_primary').eq('vehicle_id', vehicleId);
  if (current.error) fail('We couldn’t check this listing’s photos. Please try again.', current.error);
  const existingCount = current.data.length;
  let hasPrimary = current.data.some((r) => r.is_primary);
  let nextPosition = current.data.reduce((max, r) => Math.max(max, r.position + 1), 0);
  const room = Math.max(0, MAX_PHOTOS - existingCount);
  if (files.length > room) errors.push(`Only ${MAX_PHOTOS} photos are allowed per listing; ${files.length - room} were skipped.`);
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
    const path = storagePath(uid, `vehicles-${vehicleId}`, extensionFor(contentType));
    const upload = await supabase.storage.from('vehicle-images').upload(path, blob, { contentType, cacheControl: '31536000', upsert: false });
    if (upload.error) { errors.push(`${file.name}: upload failed. Please try again.`); continue; }
    const position = Math.min(nextPosition, 49);
    const insert = await supabase.from('vehicle_images').insert({ vehicle_id: vehicleId, storage_path: path, position, is_primary: !hasPrimary });
    if (insert.error) {
      await supabase.storage.from('vehicle-images').remove([path]);
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

export async function removeVehiclePhoto(image: VehicleImageRow, remaining: VehicleImageRow[]): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('vehicle_images').delete().eq('id', image.id);
  if (error) fail('We couldn’t remove that photo.', error);
  // Best effort: the file lives in the uploader's folder; team members may not own it.
  await supabase.storage.from('vehicle-images').remove([image.storage_path]);
  if (image.is_primary) {
    const next = remaining.find((r) => r.id !== image.id);
    if (next) await supabase.from('vehicle_images').update({ is_primary: true }).eq('id', next.id);
  }
}

export async function setPrimaryPhoto(vehicleId: string, imageId: string): Promise<void> {
  const supabase = getSupabase();
  // Two steps because only one photo per listing may be primary at any moment.
  const clear = await supabase.from('vehicle_images').update({ is_primary: false }).eq('vehicle_id', vehicleId).eq('is_primary', true);
  if (clear.error) fail('We couldn’t change the main photo.', clear.error);
  const set = await supabase.from('vehicle_images').update({ is_primary: true }).eq('id', imageId);
  if (set.error) fail('We couldn’t change the main photo.', set.error);
}

/* ------------------------------------------------------------- seller: documents */

export const DOCUMENT_TYPE_LABELS: Record<VehicleDocumentType, string> = {
  registration_certificate: 'Registration certificate (blue book)',
  import_declaration: 'Import / customs declaration',
  duty_receipt: 'Duty payment receipt',
  road_tax: 'Road tax',
  other: 'Other document',
};

export async function listVehicleDocuments(vehicleId: string): Promise<VehicleDocumentRow[]> {
  const { data, error } = await getSupabase()
    .from('vehicle_documents')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false });
  if (error) fail('We couldn’t load documents.', error);
  return data ?? [];
}

export async function addVehicleDocument(vehicleId: string, documentType: VehicleDocumentType, file: File): Promise<void> {
  const check = checkDocumentFile(file);
  if (!check.ok) fail(check.error);
  const uid = await currentUserId();
  const supabase = getSupabase();
  // Private bucket: if a photo can't be re-encoded, keeping the original is acceptable here.
  const body: Blob = file.type === 'application/pdf' ? file : await compressPhoto(file, 2400, 0.85).catch(() => file);
  const contentType = body.type || file.type;
  const path = storagePath(uid, `vehicle-${vehicleId}`, extensionFor(contentType));
  const upload = await supabase.storage.from('vehicle-documents').upload(path, body, { contentType, upsert: false });
  if (upload.error) fail('The document could not be uploaded. Please try again.', upload.error);
  const { error } = await supabase
    .from('vehicle_documents')
    .insert({ vehicle_id: vehicleId, uploaded_by: uid, document_type: documentType, storage_path: path });
  if (error) {
    await supabase.storage.from('vehicle-documents').remove([path]);
    fail('The document could not be saved.', error);
  }
}

export async function removeVehicleDocument(doc: VehicleDocumentRow): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('vehicle_documents').delete().eq('id', doc.id);
  if (error) fail('We couldn’t remove that document.', error);
  await supabase.storage.from('vehicle-documents').remove([doc.storage_path]);
}

/** Short-lived private link so the owner can view their own uploaded document. */
export async function documentViewUrl(path: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from('vehicle-documents').createSignedUrl(path, 300);
  if (error || !data) fail('We couldn’t open that document.', error);
  return data.signedUrl;
}
