import { useEffect, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, PenLine, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/auth-context';
import { useSignInRedirect, useUserId } from '@/lib/marketplace/hooks';
import {
  createReview, deleteReview, getMyReview, getReviewEligibility, updateReview, type ReviewSubject,
} from '@/lib/marketplace/review-service';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

function subjectKey(s: ReviewSubject) { return 'businessId' in s ? `b:${s.businessId}` : `s:${s.sellerId}`; }

/**
 * "Write a review" / "Edit your review" under a profile's reviews. Only people
 * who contacted the seller on Caryandi can review (checked by the database).
 */
export function ReviewAction({ subject, name }: { subject: ReviewSubject; name: string }) {
  const auth = useAuth();
  const uid = useUserId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const goToSignIn = useSignInRedirect();
  const key = ['review-eligibility', uid ?? 'anon', subjectKey(subject)] as const;
  const eligibility = useQuery({ queryKey: key, queryFn: () => getReviewEligibility(subject), enabled: auth.status !== 'loading', staleTime: 30_000 });
  const reviewId = eligibility.data?.reviewId ?? null;
  const existing = useQuery({ queryKey: ['my-review', reviewId], queryFn: () => getMyReview(reviewId!), enabled: Boolean(reviewId) });

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && existing.data) { setRating(existing.data.rating); setBody(existing.data.body ?? ''); }
  }, [open, existing.data]);

  const status = eligibility.data?.status;
  if (auth.status === 'loading' || eligibility.isPending || status === 'own' || status === 'not_found') return null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['review-eligibility'] });
    await queryClient.invalidateQueries({ queryKey: ['my-review'] });
    await router.invalidate();
  };

  async function save() {
    setBusy('save'); setError(null);
    try {
      if (reviewId) await updateReview(reviewId, rating, body); else await createReview(subject, rating, body);
      toast.success(reviewId ? 'Your review was updated.' : 'Thank you — your review is published.');
      setOpen(false);
      await refresh();
    } catch (e) {
      setError(errorText(e, 'We couldn’t save your review.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!reviewId) return;
    setBusy('delete'); setError(null);
    try {
      await deleteReview(reviewId);
      toast.success('Your review was deleted.');
      setOpen(false); setRating(0); setBody('');
      await refresh();
    } catch (e) {
      setError(errorText(e, 'We couldn’t delete your review.'));
    } finally {
      setBusy(null);
    }
  }

  if (status === 'sign_in') {
    return <Button variant="outline" size="sm" className="mt-3" onClick={() => { toast('Sign in to write a review'); goToSignIn(); }}><PenLine />Write a review</Button>;
  }
  if (status === 'not_contacted') {
    return <p className="mt-3 text-sm text-muted-foreground">Dealt with {name}? You can leave a review after contacting them on Caryandi — this keeps reviews genuine.</p>;
  }

  return (
    <>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => { setError(null); setOpen(true); }}><PenLine />{reviewId ? 'Edit your review' : 'Write a review'}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewId ? 'Edit your review' : `Review ${name}`}</DialogTitle>
            <DialogDescription>Share an honest account of your experience. Your first name and initial are shown with your review.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Your rating</Label>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setRating(n)} className="rounded p-1 hover:bg-accent">
                    <Star className={`size-7 ${n <= rating ? 'fill-warning text-warning' : 'text-muted-foreground/40'}`} />
                  </button>
                ))}
                <span className="ml-2 text-sm text-muted-foreground">{RATING_WORDS[rating]}</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="review-body">Your review (optional)</Label>
              <Textarea id="review-body" rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What went well? What could be better?" />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {reviewId ? <Button variant="ghost" className="text-destructive" disabled={busy !== null} onClick={() => void remove()}>{busy === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />}Delete</Button> : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={busy !== null || rating < 1} onClick={() => void save()}>{busy === 'save' && <Loader2 className="animate-spin" />}{reviewId ? 'Save changes' : 'Publish review'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
