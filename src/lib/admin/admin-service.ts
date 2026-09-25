import { getSupabase } from '@/lib/supabase/client';
import type { Enums, Json, Tables, Views } from '@/lib/supabase/database.types';
import { sanitizeSearchText } from '@/lib/vehicles/filters';
import { ServiceError } from '@/lib/vehicles/vehicle-service';

/**
 * Administration. Reads use admin-only views; every decision goes through an
 * audited database function that checks administrator rights itself — the
 * browser is never trusted to decide who is an admin.
 */

export type AdminUser = Views<'admin_users'>;
export type AdminBusiness = Views<'admin_businesses'>;
export type AdminListing = Views<'admin_listings'>;
export type AdminReview = Views<'admin_reviews'>;
export type AdminReport = Views<'admin_reports'>;
export type AdminAudit = Views<'admin_audit_feed'>;
export type InfoArticle = Tables<'info_articles'>;
export type AccountStatus = Enums<'account_status'>;
export type AccountType = Enums<'account_type'>;
export type BusinessType = Enums<'business_type'>;
export type ListingStatus = Enums<'listing_status'>;
export type ReportStatus = Enums<'report_status'>;
export type ReviewStatus = Enums<'review_status'>;

const PAGE = 50;

function fail(message: string, cause?: unknown): never {
  if (cause) console.error(message, cause);
  throw new ServiceError(message);
}

function rpcError(error: { message?: string }, fallback: string): string {
  const msg = error.message ?? '';
  if (/administrator/i.test(msg)) return 'Administrator access is required.';
  if (/reason is required/i.test(msg)) return 'Give a reason — the user is told why.';
  if (/own account/i.test(msg)) return 'You can’t change your own account.';
  if (/not found/i.test(msg)) return 'That record no longer exists.';
  if (/only available/i.test(msg)) return msg;
  return fallback;
}

function searchWords(q: string | undefined): string[] {
  return q ? sanitizeSearchText(q).split(' ').filter(Boolean).slice(0, 4) : [];
}

/* ------------------------------------------------------------------ overview */

export type PlatformStats = Record<
  'users' | 'users_7d' | 'suspended_or_banned' | 'live_vehicles' | 'live_parts' | 'businesses' | 'pending_verifications'
  | 'open_reports' | 'open_scam_reports' | 'reviews' | 'conversations_7d', number>;

export async function getPlatformStats(): Promise<PlatformStats> {
  const { data, error } = await getSupabase().rpc('admin_platform_stats');
  if (error) fail(rpcError(error, 'We couldn’t load platform numbers.'), error);
  const obj = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, Json | undefined>;
  const n = (k: keyof PlatformStats) => Number(obj[k] ?? 0) || 0;
  return {
    users: n('users'), users_7d: n('users_7d'), suspended_or_banned: n('suspended_or_banned'), live_vehicles: n('live_vehicles'),
    live_parts: n('live_parts'), businesses: n('businesses'), pending_verifications: n('pending_verifications'),
    open_reports: n('open_reports'), open_scam_reports: n('open_scam_reports'), reviews: n('reviews'), conversations_7d: n('conversations_7d'),
  };
}

export async function listAuditFeed(limit = 15): Promise<AdminAudit[]> {
  const { data, error } = await getSupabase().from('admin_audit_feed').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) fail('We couldn’t load recent admin actions.', error);
  return data ?? [];
}

/* ------------------------------------------------------------------ users */

export async function listUsers(opts: { q?: string; type?: AccountType; status?: AccountStatus; page?: number }): Promise<AdminUser[]> {
  let query = getSupabase().from('admin_users').select('*');
  for (const w of searchWords(opts.q)) query = query.or(`full_name.ilike.*${w}*,city.ilike.*${w}*,business_name.ilike.*${w}*`);
  if (opts.type) query = query.eq('account_type', opts.type);
  if (opts.status) query = query.eq('account_status', opts.status);
  const from = ((opts.page ?? 1) - 1) * PAGE;
  const { data, error } = await query.order('created_at', { ascending: false }).range(from, from + PAGE - 1);
  if (error) fail('We couldn’t load users.', error);
  return data ?? [];
}

export async function setAccountStatus(profileId: string, status: AccountStatus, reason: string): Promise<void> {
  const text = reason.trim();
  if (!text) fail('Give a reason — the user is told why.');
  const { error } = await getSupabase().rpc('admin_set_account_status', { p_profile_id: profileId, p_status: status, p_reason: text.slice(0, 500) });
  if (error) fail(rpcError(error, 'We couldn’t change this account.'), error);
}

/* ------------------------------------------------------------------ businesses */

export async function listBusinesses(opts: { type: BusinessType; q?: string; verification?: string; active?: boolean }): Promise<AdminBusiness[]> {
  let query = getSupabase().from('admin_businesses').select('*').eq('business_type', opts.type);
  for (const w of searchWords(opts.q)) query = query.or(`name.ilike.*${w}*,city.ilike.*${w}*,owner_name.ilike.*${w}*`);
  if (opts.verification === 'approved' || opts.verification === 'pending' || opts.verification === 'unverified' || opts.verification === 'rejected') {
    query = query.eq('verification_status', opts.verification);
  }
  if (opts.active !== undefined) query = query.eq('is_active', opts.active);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error) fail('We couldn’t load businesses.', error);
  return data ?? [];
}

export async function setBusinessActive(businessId: string, active: boolean, reason: string): Promise<void> {
  const text = reason.trim();
  if (!text) fail('Give a reason — the owner is told why.');
  const { error } = await getSupabase().rpc('admin_set_business_active', { p_business_id: businessId, p_active: active, p_reason: text.slice(0, 500) });
  if (error) fail(rpcError(error, 'We couldn’t update this business.'), error);
}

/* ------------------------------------------------------------------ listings */

export async function listListings(opts: { type?: 'vehicle' | 'part'; q?: string; status?: ListingStatus; page?: number }): Promise<AdminListing[]> {
  let query = getSupabase().from('admin_listings').select('*');
  if (opts.type) query = query.eq('listing_type', opts.type);
  for (const w of searchWords(opts.q)) query = query.or(`title.ilike.*${w}*,seller_name.ilike.*${w}*,city.ilike.*${w}*`);
  if (opts.status) query = query.eq('listing_status', opts.status);
  const from = ((opts.page ?? 1) - 1) * PAGE;
  const { data, error } = await query.order('created_at', { ascending: false }).range(from, from + PAGE - 1);
  if (error) fail('We couldn’t load listings.', error);
  return data ?? [];
}

export async function setListingStatus(type: 'vehicle' | 'part', id: string, status: ListingStatus, reason: string): Promise<void> {
  const text = reason.trim();
  if ((status === 'rejected' || status === 'archived') && !text) fail('Give a reason — the seller is told why.');
  const { error } = await getSupabase().rpc('admin_set_listing_status', {
    p_listing_type: type, p_listing_id: id, p_status: status, ...(text ? { p_reason: text.slice(0, 500) } : {}),
  });
  if (error) fail(rpcError(error, 'We couldn’t change this listing.'), error);
}

/* ------------------------------------------------------------------ reviews */

export async function listReviews(opts: { status?: ReviewStatus; q?: string }): Promise<AdminReview[]> {
  let query = getSupabase().from('admin_reviews').select('*');
  if (opts.status) query = query.eq('status', opts.status);
  for (const w of searchWords(opts.q)) query = query.or(`body.ilike.*${w}*,reviewer_name.ilike.*${w}*,subject_name.ilike.*${w}*`);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error) fail('We couldn’t load reviews.', error);
  return data ?? [];
}

export async function moderateReview(id: string, status: ReviewStatus, reason: string): Promise<void> {
  const text = reason.trim();
  const { error } = await getSupabase().rpc('admin_moderate_review', { p_review_id: id, p_status: status, ...(text ? { p_reason: text.slice(0, 500) } : {}) });
  if (error) fail(rpcError(error, 'We couldn’t update this review.'), error);
}

/* ------------------------------------------------------------------ reports */

export async function listReports(opts: { status?: ReportStatus | 'active'; category?: string }): Promise<AdminReport[]> {
  let query = getSupabase().from('admin_reports').select('*');
  if (opts.status === 'active') query = query.in('status', ['open', 'reviewing']);
  else if (opts.status) query = query.eq('status', opts.status);
  if (opts.category === 'scam') query = query.eq('category', 'scam');
  const { data, error } = await query.order('created_at', { ascending: opts.status === 'active' }).limit(200);
  if (error) fail('We couldn’t load reports.', error);
  // Scam reports first in the working queue.
  return (data ?? []).sort((a, b) => Number(b.category === 'scam') - Number(a.category === 'scam'));
}

export async function updateReport(id: string, status: ReportStatus, notes: string): Promise<void> {
  const text = notes.trim();
  const { error } = await getSupabase().rpc('admin_update_report', { p_report_id: id, p_status: status, ...(text ? { p_notes: text.slice(0, 3000) } : {}) });
  if (error) fail(rpcError(error, 'We couldn’t update this report.'), error);
}

/** Identity and contact details of a reported user — scam reports under review only; logged. */
export async function getScamDetails(reportId: string): Promise<Record<string, Json | undefined>> {
  const { data, error } = await getSupabase().rpc('admin_get_scam_report_details', { p_report_id: reportId });
  if (error) fail(rpcError(error, 'We couldn’t load the investigation details.'), error);
  return (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, Json | undefined>;
}

/* ------------------------------------------------------------------ information content */

export const ARTICLE_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ['registration', 'Registration'], ['importing', 'Importing'], ['duty_and_tax', 'Duty and tax'], ['documents', 'Documents'],
  ['warning_lights', 'Warning lights'], ['service_intervals', 'Service intervals'], ['buying_safely', 'Buying safely'], ['general', 'General'],
];

export type ArticleInput = { slug: string; category: string; title: string; summary: string; body: string; isPublished: boolean };

export function validateArticle(a: ArticleInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug) || a.slug.length > 100) errors['slug'] = 'Use lowercase words joined by hyphens, e.g. registering-an-imported-car';
  if (!ARTICLE_CATEGORIES.some(([c]) => c === a.category)) errors['category'] = 'Choose a category';
  if (a.title.trim().length < 3 || a.title.trim().length > 160) errors['title'] = 'Title must be 3–160 characters';
  if (a.summary.length > 300) errors['summary'] = 'Keep the summary under 300 characters';
  if (a.body.length > 50000) errors['body'] = 'The article is too long';
  if (a.isPublished && a.body.trim().length < 50) errors['body'] = 'Write the article (at least a short paragraph) before publishing';
  return errors;
}

export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

export async function listArticles(): Promise<InfoArticle[]> {
  const { data, error } = await getSupabase().from('info_articles').select('*').order('updated_at', { ascending: false });
  if (error) fail('We couldn’t load articles.', error);
  return data ?? [];
}

export async function saveArticle(input: ArticleInput, id?: string): Promise<void> {
  const errors = validateArticle(input);
  const first = Object.values(errors)[0];
  if (first) fail(first);
  const row = {
    slug: input.slug, category: input.category, title: input.title.trim(),
    summary: input.summary.trim() || null, body: input.body, is_published: input.isPublished,
  };
  const supabase = getSupabase();
  const { error } = id ? await supabase.from('info_articles').update(row).eq('id', id) : await supabase.from('info_articles').insert(row);
  if (error) fail(error.code === '23505' ? 'Another article already uses that web address (slug).' : 'We couldn’t save the article.', error);
}

export async function deleteArticle(id: string): Promise<void> {
  const { error } = await getSupabase().from('info_articles').delete().eq('id', id);
  if (error) fail('We couldn’t delete the article.', error);
}

/* ------------------------------------------------------------------ public reads (information pages) */

export type PublicArticle = Pick<InfoArticle, 'slug' | 'category' | 'title' | 'summary' | 'published_at'>;

export async function listPublishedArticles(): Promise<PublicArticle[]> {
  const { data, error } = await getSupabase().from('info_articles').select('slug, category, title, summary, published_at')
    .eq('is_published', true).order('published_at', { ascending: false }).limit(100);
  if (error) fail('We couldn’t load guides.', error);
  return data ?? [];
}

export async function getPublishedArticle(slug: string): Promise<InfoArticle | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await getSupabase().from('info_articles').select('*').eq('slug', slug).eq('is_published', true).maybeSingle();
  if (error) fail('We couldn’t load this guide.', error);
  return data;
}
