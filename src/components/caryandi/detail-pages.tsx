import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, Clock, MapPin, Package, Star, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMyBusiness, useUserId } from '@/lib/marketplace/hooks';
import { PROVIDER_TYPE_LABELS, type ProviderKind, type ProviderPage } from '@/lib/directory/provider-service';
import { DAYS, formatDayHours, openStatus, parseOpeningHours, routeLabel } from '@/lib/directory/validation';
import type { PartPageData } from '@/lib/parts/parts-service';
import { PART_CONDITIONS } from '@/lib/parts/validation';
import { PROVINCES, formatDate, formatMonthYear, formatNumber, formatPrice, labelOf } from '@/lib/vehicles/vehicle-options';
import type { Review } from '@/lib/marketplace/seller-service';
import { PartPhoto, ProviderImage } from './media';
import { Rating, VerifiedBadge } from './cards';
import { ContactPanel, ReportDialog, ShareButton } from './engagement-widgets';
import { BackButton } from './back-button';
import { EnquiryActions } from './messaging-pages';
import { ReviewAction } from './review-widgets';

function NotFound({ title, body, error, to, cta }: { title: string; body: string; error?: string | undefined; to: '/services' | '/agents' | '/parts'; cta: string }) {
  return (
    <main className="mx-auto grid min-h-[50vh] max-w-lg place-items-center px-4 py-16 text-center">
      <div>
        <AlertTriangle className="mx-auto size-9 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">{error ? 'We couldn’t load this page' : title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error ? 'Please check your connection and try again.' : body}</p>
        <Button className="mt-5" asChild><Link to={to}>{cta}</Link></Button>
      </div>
    </main>
  );
}

function Reviews({ reviews }: { reviews: Review[] }) {
  return (
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
  );
}

function duration(minutes: number): string {
  if (minutes < 60) return `About ${minutes} min`;
  if (minutes < 60 * 24) { const h = Math.round((minutes / 60) * 2) / 2; return `About ${h} ${h === 1 ? 'hour' : 'hours'}`; }
  const d = Math.round(minutes / (60 * 24)); return `About ${d} ${d === 1 ? 'day' : 'days'}`;
}

export type ProviderRouteData = { page: ProviderPage | null; error?: string };

/** Mechanic, servicing company or import agent profile (/services/:slug, /agents/:slug). */
export function ProfileDetail({ kind, data }: { kind: ProviderKind; data: ProviderRouteData }) {
  const uid = useUserId();
  const myBusiness = useMyBusiness();
  const back = kind === 'agents' ? { to: '/agents' as const, label: 'Back to import agents' } : { to: '/services' as const, label: 'Back to services' };
  if (!data.page) {
    return <NotFound title="Profile not found" body="This business may have been removed or is no longer listed." error={data.error} to={back.to} cta={kind === 'agents' ? 'Browse import agents' : 'Browse mechanics'} />;
  }
  const { provider: p, services, routes, reviews } = data.page;
  const id = p.id ?? '';
  const isSelf = Boolean(uid && myBusiness.data?.business.id === id);
  const location = [p.area, p.city, labelOf(PROVINCES, p.province)].filter((x) => x && x !== '—').join(', ');
  const hours = parseOpeningHours(p.opening_hours);
  const status = openStatus(hours);
  const from = p.price_from ?? (kind === 'agents' ? p.min_route_price : p.min_service_price);
  const ratingCount = p.rating_count ?? 0;
  const since = p.created_at ? formatMonthYear(p.created_at) : null;

  return (
    <main>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton to={back.to} label={back.label} /></div>
      <div className="bg-muted/35">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[220px_1fr_auto] md:items-end">
          <ProviderImage type={p.business_type} path={p.logo_path ?? p.cover_path} alt={p.name ?? 'Business'} className="aspect-[4/3] w-full rounded-lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">{PROVIDER_TYPE_LABELS[p.business_type ?? ''] ?? 'Service provider'}</p>
            <h1 className="mt-1 text-3xl font-bold">{p.name}</h1>
            {location && <p className="mt-2 flex items-center gap-1 text-muted-foreground"><MapPin className="size-4" />{location}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {ratingCount > 0 ? <Rating value={Number(p.rating_avg ?? 0)} count={ratingCount} /> : <span className="text-sm text-muted-foreground">No reviews yet</span>}
              {p.is_verified && <VerifiedBadge label="Verified business" />}
              {p.is_mobile_service && <Badge variant="secondary" className="gap-1"><Truck className="size-3.5" />Comes to you</Badge>}
            </div>
          </div>
          <ShareButton title={`${p.name} on Caryandi`} />
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">About</h2>
          <p className="mt-2 whitespace-pre-line leading-7 text-muted-foreground">{p.description || 'This business hasn’t added a description yet.'}</p>

          {kind === 'services' ? (
            <>
              <h2 className="mt-8 text-xl font-semibold">Services offered</h2>
              {services.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <div key={s.id} className="flex gap-3 rounded-lg border p-4">
                      <CheckCircle2 className="size-5 shrink-0 text-success" />
                      <div className="min-w-0">
                        <b>{s.name}</b>
                        <p className="mt-1 text-sm font-medium">{s.price_from != null ? `From ${formatPrice(s.price_from)}` : 'Price on request'}{s.price_note ? <span className="font-normal text-muted-foreground"> · {s.price_note}</span> : null}</p>
                        {s.duration_minutes != null && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" />{duration(s.duration_minutes)}</p>}
                        {s.description && <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-2 text-sm text-muted-foreground">This business hasn’t listed its services yet. Contact them to ask.</p>}
            </>
          ) : (
            <>
              <h2 className="mt-8 text-xl font-semibold">Routes and services</h2>
              {routes.length ? (
                <div className="mt-4 grid gap-3">
                  {routes.map((r) => (
                    <div key={r.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <b>{routeLabel(r)}</b>
                        <span className="text-sm font-semibold">{r.price_from != null ? `From ${formatPrice(r.price_from)}` : 'Price on request'}</span>
                      </div>
                      {(r.est_days_min != null || r.est_days_max != null) && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" />
                          {r.est_days_min != null && r.est_days_max != null && r.est_days_min !== r.est_days_max ? `${r.est_days_min}–${r.est_days_max} days` : `About ${r.est_days_max ?? r.est_days_min} days`}
                        </p>
                      )}
                      {r.price_note && <p className="mt-1 text-xs text-muted-foreground">{r.price_note}</p>}
                      {r.services.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{r.services.map((x) => <Badge key={x} variant="outline">{x}</Badge>)}</div>}
                      {r.notes && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{r.notes}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="mt-2 text-sm text-muted-foreground">This agent hasn’t listed routes yet. Contact them to ask.</p>}
            </>
          )}

          {hours && (
            <>
              <h2 className="mt-8 text-xl font-semibold">Opening hours</h2>
              <dl className="mt-4 grid max-w-md gap-2 text-sm">
                {DAYS.map(([day, label]) => (
                  <div key={day} className="flex justify-between border-b pb-2 last:border-0"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{formatDayHours(hours[day])}</dd></div>
                ))}
              </dl>
            </>
          )}

          <h2 className="mt-8 text-xl font-semibold">Customer reviews</h2>
          <ReviewAction subject={{ businessId: id }} name={p.name ?? 'this business'} />
          <Reviews reviews={reviews} />
        </div>
        <aside className="self-start rounded-lg border bg-card p-5">
          <h2 className="font-semibold">At a glance</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Starting price</dt><dd className="text-right font-semibold">{from != null ? formatPrice(from) : 'On request'}</dd></div>
            {p.price_note && <p className="-mt-2 text-right text-xs text-muted-foreground">{p.price_note}</p>}
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Availability</dt><dd className={`text-right font-semibold ${status?.open ? 'text-success' : ''}`}>{status ? status.label : 'Ask for hours'}</dd></div>
            {kind === 'services' && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Comes to you</dt><dd className="font-semibold">{p.is_mobile_service ? 'Yes' : 'No'}</dd></div>}
            {since && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">On Caryandi since</dt><dd className="font-semibold">{since}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Verification</dt><dd className="font-semibold">{p.is_verified ? 'Verified' : 'Not verified'}</dd></div>
          </dl>
          {isSelf ? (
            <Button variant="outline" className="mt-5 w-full" asChild><Link to="/dashboard/profile">Edit your profile</Link></Button>
          ) : (
            <>
              <ContactPanel target="business" id={id} label={kind === 'agents' ? 'Contact agent' : 'Contact business'} whatsappMessage={`Hi ${p.name ?? ''}, I found you on Caryandi and I’d like to ask about your ${kind === 'agents' ? 'import services' : 'services'}.`} />
              <EnquiryActions target="business" id={id} defaultMessage={`Hi ${p.name ?? ''}, I found you on Caryandi and I’d like to ask about your ${kind === 'agents' ? 'import services' : 'services'}.`} />
              <div className="mt-3 text-center"><ReportDialog target="business" id={id} subject={p.name ?? 'this business'} /></div>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

export type PartRouteData = { page: PartPageData | null; error?: string };

/** Part listing (/parts/:id). */
export function PartDetail({ data }: { data: PartRouteData }) {
  const uid = useUserId();
  const myBusiness = useMyBusiness();
  const [selected, setSelected] = useState(0);
  if (!data.page) {
    return <NotFound title="Part not found" body="This part may have been sold or removed." error={data.error} to="/parts" cta="Browse parts" />;
  }
  const { part: p, images } = data.page;
  const id = p.id ?? '';
  const isOwner = Boolean(uid && (uid === p.owner_id || (p.business_id && myBusiness.data?.business.id === p.business_id)));
  const location = [p.city, labelOf(PROVINCES, p.province)].filter((x) => x && x !== '—').join(', ');
  const main = images[selected] ?? images[0];
  const sold = p.listing_status === 'sold';
  const live = p.listing_status === 'active';

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <BackButton to="/parts" label="Back to parts" />
      {!live && !sold && <p className="mt-4 rounded-md bg-muted p-3 text-sm">Only you can see this part — it isn’t published. <Link to="/dashboard/add-part" search={{ id }} className="font-semibold text-primary">Edit and publish</Link></p>}
      <div className="mt-5 grid gap-8 md:grid-cols-2">
        <div>
          <div className="relative">
            <PartPhoto path={main?.storage_path} alt={p.title ?? 'Part'} eager className="aspect-square w-full rounded-lg" />
            {sold && <span className="absolute left-3 top-3"><Badge>Sold</Badge></span>}
          </div>
          {images.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {images.map((img, i) => (
                <button key={img.id} type="button" onClick={() => setSelected(i)} aria-label={`Photo ${i + 1}`} aria-pressed={i === selected} className={`overflow-hidden rounded-md border-2 ${i === selected ? 'border-primary' : 'border-transparent'}`}>
                  <PartPhoto path={img.storage_path} alt="" className="aspect-square w-full" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">{p.category_name && <Badge>{p.category_name}</Badge>}<Badge variant="outline">{labelOf(PART_CONDITIONS, p.condition)}</Badge>{p.is_verified && <VerifiedBadge label="Verified seller" />}</div>
          <h1 className="mt-4 text-3xl font-bold">{p.title}</h1>
          <p className="mt-3 text-3xl font-bold">{formatPrice(p.price)}</p>
          {location && <p className="mt-4 flex items-center gap-2 text-muted-foreground"><MapPin className="size-4" />{location}</p>}
          {!sold && p.quantity != null && <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Package className="size-4" />{p.quantity === 0 ? 'Out of stock — ask the seller' : `${formatNumber(p.quantity)} in stock`}</p>}
          {p.compatibility_note && <div className="mt-5 rounded-lg border bg-muted/30 p-4"><h2 className="text-sm font-semibold">Fits</h2><p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{p.compatibility_note}</p></div>}
          {p.description && <><h2 className="mt-6 font-semibold">Description</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{p.description}</p></>}
          <div className="my-6 border-t" />
          <h2 className="font-semibold">Sold by {p.seller_name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Confirm fitment with your vehicle’s make, model, year and part number before you pay. Meet in a safe, public place.</p>
          {isOwner ? (
            <Button variant="outline" className="mt-6 w-full" asChild><Link to="/dashboard/add-part" search={{ id }}>Edit this part</Link></Button>
          ) : sold ? (
            <p className="mt-6 rounded-md bg-muted p-3 text-center text-sm">This part has been sold.</p>
          ) : (
            <>
              <ContactPanel target="part" id={id} label="Contact seller" whatsappMessage={`Hi, I saw your ${p.title ?? 'part'} (${formatPrice(p.price)}) on Caryandi. Is it still available, and will it fit my vehicle?`} />
              <EnquiryActions target="part" id={id} defaultMessage={`Hi, is the ${p.title ?? 'part'} still available? Will it fit my vehicle?`} />
              <div className="mt-3 text-center"><ReportDialog target="part" id={id} subject={p.title ?? 'this part'} /></div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
