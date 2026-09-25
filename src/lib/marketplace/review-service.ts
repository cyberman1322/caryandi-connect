import { getSupabase } from '@/lib/supabase/client';
import type { Tables } from '@/lib/supabase/database.types';
import { ServiceError } from '@/lib/vehicles/vehicle-service';

/**
 * Reviews of a business or a private seller. The database enforces the rules:
 * sign-in, one review per person per seller, only after contacting them on
 * Caryandi, never your own business. Ratings are recalculated by the database.
 */

export type ReviewSubject = { businessId: string } | { sellerId: string };
export type ReviewRow = Tables<'reviews'>;
export type EligibilityStatus = 'sign_in' | 'own' | 'not_contacted' | 'already_reviewed' | 'ok' | 'not_found';
export type Eligibility = { status: EligibilityStatus; reviewId: string | null };

const MAX_BODY = 2000;

function fail(message: string, cause?: unknown): never {
  if (cause) console.error(message, cause);
  throw new ServiceError(message);
}

const args = (s: ReviewSubject) => ('businessId' in s ? { p_business_id: s.businessId } : { p_seller_id: s.sellerId });

export async function getReviewEligibility(subject: ReviewSubject): Promise<Eligibility> {
  const { data, error } = await getSupabase().rpc('review_eligibility', args(subject));
  if (error) fail('We couldn’t check whether you can review.', error);
  const obj = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const status = obj['status'];
  const known: EligibilityStatus[] = ['sign_in', 'own', 'not_contacted', 'already_reviewed', 'ok', 'not_found'];
  return {
    status: known.includes(status as EligibilityStatus) ? (status as EligibilityStatus) : 'not_found',
    reviewId: typeof obj['review_id'] === 'string' ? obj['review_id'] : null,
  };
}

export async function getMyReview(id: string): Promise<ReviewRow | null> {
  const { data, error } = await getSupabase().from('reviews').select('*').eq('id', id).maybeSingle();
  if (error) fail('We couldn’t load your review.', error);
  return data;
}

function checkInput(rating: number, body: string): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail('Choose a rating from 1 to 5 stars.');
  const text = body.trim();
  if (text.length > MAX_BODY) fail(`Keep your review under ${MAX_BODY} characters.`);
  return text || null;
}

function friendly(error: { message?: string; code?: string }, fallback: string): string {
  const msg = error.message ?? '';
  if (error.code === '23505') return 'You’ve already reviewed them — you can edit your review instead.';
  if (/after contacting/i.test(msg)) return 'You can leave a review after contacting them on Caryandi.';
  if (/yourself|own business/i.test(msg)) return 'You can’t review yourself or your own business.';
  return fallback;
}

export async function createReview(subject: ReviewSubject, rating: number, body: string): Promise<void> {
  const text = checkInput(rating, body);
  const { error } = await getSupabase().from('reviews').insert({
    business_id: 'businessId' in subject ? subject.businessId : null,
    seller_id: 'sellerId' in subject ? subject.sellerId : null,
    rating,
    body: text,
  });
  if (error) fail(friendly(error, 'We couldn’t save your review. Please try again.'), error);
}

export async function updateReview(id: string, rating: number, body: string): Promise<void> {
  const text = checkInput(rating, body);
  const { data, error } = await getSupabase().from('reviews').update({ rating, body: text }).eq('id', id).select('id');
  if (error) fail(friendly(error, 'We couldn’t update your review.'), error);
  if (!data?.length) fail('This review could not be found.');
}

export async function deleteReview(id: string): Promise<void> {
  const { data, error } = await getSupabase().from('reviews').delete().eq('id', id).select('id');
  if (error || !data?.length) fail('We couldn’t delete your review.', error);
}
