import { Link } from '@tanstack/react-router';
import { AlertTriangle, MapPin, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavourites, useMyBusiness, useUserId } from '@/lib/marketplace/hooks';
import { SELLER_TYPE_LABELS, type SellerPage } from '@/lib/marketplace/seller-service';
import { PROVINCES, formatDate, formatMonthYear, labelOf } from '@/lib/vehicles/vehicle-options';
import { SellerImage } from './media';
import { Rating, VehicleCard, VerifiedBadge } from './cards';
import { ContactPanel, ReportDialog, ShareButton } from './engagement-widgets';
import { EnquiryActions } from './messaging-pages';
import { ReviewAction } from './review-widgets';
import { EmptyState } from './states';
import { BackButton } from './back-button';

export type SellerRouteData = { page: SellerPage | null; error?: string };

export function SellerProfile({ data }: { data: SellerRouteData }) {
  const uid = useUserId();
  const { isSaved, toggle } = useFavourites();
  const myBusiness = useMyBusiness();
  if (!data.page) {
    return (
      <main className="mx-auto grid min-h-[50vh] max-w-lg place-items-center px-4 py-16 text-center">
        <div>
          <AlertTriangle className="mx-auto size-9 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold">{data.error ? 'We couldn’t load this seller' : 'Seller not found'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data.error ? 'Please check your connection and try again.' : 'This profile may have been removed or has no live listings.'}</p>
          <Button className="mt-5" asChild><Link to="/sellers">Browse sellers</Link></Button>
        </div>
      </main>
    );
  }

  const { seller: s, vehicles, reviews } = data.page;
  const id = s.id ?? '';
  const isBusiness = s.seller_kind === 'business';
  // Your own profile, or the dealership you work for: no contact/report buttons.
  const isSelf = Boolean(uid && (uid === id || myBusiness.data?.business.id === id));
  const location = [s.area, s.city, labelOf(PROVINCES, s.province)].filter((x) => x && x !== '—').join(', ');
  const since = s.created_at ? formatMonthYear(s.created_at) : null;
  const ratingCount = s.rating_count ?? 0;

  return (
    <main>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton to="/sellers" label="Back to sellers" /></div>
      <div className="bg-muted/35">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[220px_1fr_auto] md:items-end">
          <SellerImage kind={s.seller_kind} path={s.image_path} alt={s.name ?? 'Seller'} className="aspect-[4/3] w-full rounded-lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">{SELLER_TYPE_LABELS[s.seller_type ?? ''] ?? 'Seller'}</p>
            <h1 className="mt-1 text-3xl font-bold">{s.name}</h1>
            {location && <p className="mt-2 flex items-center gap-1 text-muted-foreground"><MapPin className="size-4" />{location}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {ratingCount > 0 ? <Rating value={Number(s.rating_avg ?? 0)} count={ratingCount} /> : <span className="text-sm text-muted-foreground">No reviews yet</span>}
              {s.is_verified && <VerifiedBadge />}
            </div>
          </div>
          <ShareButton title={`${s.name} on Caryandi`} />
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">About</h2>
          <p className="mt-2 whitespace-pre-line leading-7 text-muted-foreground">{s.about || (isBusiness ? 'This dealer hasn’t added a description yet.' : 'This private seller hasn’t added a description yet.')}</p>

          <h2 className="mt-8 text-xl font-semibold">Available inventory</h2>
          {vehicles.length ? (
            <div className="mt-4 grid gap-5 sm:grid-cols-2">{vehicles.map((v) => <VehicleCard key={v.id} v={v} saved={isSaved(v.id)} onSave={() => v.id && toggle(v.id)} />)}</div>
          ) : (
            <div className="mt-4"><EmptyState title="No vehicles listed right now" body="Check back soon — new listings appear here as soon as they’re published." /></div>
          )}

          <h2 className="mt-8 text-xl font-semibold">Customer reviews</h2>
          <ReviewAction subject={isBusiness ? { businessId: id } : { sellerId: id }} name={s.name ?? 'this seller'} />
          <div className="mt-4 space-y-3">
            {reviews.length ? reviews.map((r) => (
              <article key={r.id} className="rounded-lg border p-4">
                <div className="flex justify-between gap-3">
                  <b>{r.reviewer_name}</b>
                  <span className="flex" aria-label={`${r.rating} out of 5`}>{Array.from({ length: r.rating ?? 0 }).map((_, i) => <Star key={i} className="size-4 fill-warning text-warning" />)}</span>
                </div>
                {r.body && <p className="mt-2 text-sm text-muted-foreground">{r.body}</p>}
                {r.created_at && <p className="mt-2 text-xs text-muted-foreground">{formatDate(r.created_at)}</p>}
              </article>
            )) : <p className="text-sm text-muted-foreground">No reviews yet.</p>}
          </div>
        </div>
        <aside className="self-start rounded-lg border bg-card p-5">
          <h2 className="font-semibold">At a glance</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Live listings</dt><dd className="font-semibold">{s.active_vehicle_count ?? vehicles.length}</dd></div>
            {since && <div className="flex justify-between"><dt className="text-muted-foreground">On Caryandi since</dt><dd className="font-semibold">{since}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted-foreground">Verification</dt><dd className="font-semibold">{s.is_verified ? 'Verified' : 'Not verified'}</dd></div>
          </dl>
          {isSelf ? (
            <Button variant="outline" className="mt-5 w-full" asChild><Link to="/dashboard/profile">Edit your profile</Link></Button>
          ) : (
            <>
              <ContactPanel target={isBusiness ? 'business' : 'profile'} id={id} label={`Contact ${isBusiness ? 'dealer' : 'seller'}`} whatsappMessage={`Hi ${s.name ?? ''}, I found you on Caryandi and I’m interested in your vehicles.`} />
              <EnquiryActions target={isBusiness ? 'business' : 'profile'} id={id} meetup={isBusiness} defaultMessage={`Hi ${s.name ?? ''}, I found you on Caryandi and I’m interested in your vehicles.`} />
              <div className="mt-3 text-center"><ReportDialog target={isBusiness ? 'business' : 'profile'} id={id} subject={s.name ?? 'this seller'} /></div>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
