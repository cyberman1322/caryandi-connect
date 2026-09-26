import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileCheck, FileX, Heart, Loader2, MapPin, Pencil, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth/auth-context';
import { queryKeys, useFavourites, useMyBusiness, useUserId } from '@/lib/marketplace/hooks';
import { SELLER_TYPE_LABELS, sellerParamFromListing } from '@/lib/marketplace/seller-service';
import {
  DOCUMENT_TYPE_LABELS, getSimilarVehicles, loadVehiclePage,
  type VehicleDocumentType, type VehiclePageData,
} from '@/lib/vehicles/vehicle-service';
import {
  CONDITIONS, DUTY_STATUSES, FUEL_TYPES, IMPORT_STATUSES, LISTING_STATUS_LABELS, PROVINCES, REGISTRATION_STATUSES, TRANSMISSIONS,
  featuresForDisplay, formatEngine, formatMileage, formatPrice, labelOf, vehicleTitle,
} from '@/lib/vehicles/vehicle-options';
import { ListingPhoto } from './media';
import { BackButton } from './back-button';
import { Check } from 'lucide-react';
import { Rating, VehicleCard, VerifiedBadge } from './cards';
import { ContactPanel, ReportDialog, ShareButton } from './engagement-widgets';
import { EnquiryActions } from './messaging-pages';

export type VehicleRouteData = { page: VehiclePageData | null; error?: string };

/**
 * Vehicle detail. Live listings arrive from the route loader (server-rendered).
 * If the server found nothing, a signed-in owner may still be looking at their
 * own draft, so we retry once in the browser with their session.
 */
export function VehicleDetail({ id, data }: { id: string; data: VehicleRouteData }) {
  const auth = useAuth();
  const uid = useUserId();
  const fallback = useQuery({
    queryKey: queryKeys.vehiclePage(id, uid ?? 'anon'),
    queryFn: () => loadVehiclePage(id),
    enabled: !data.page && Boolean(uid),
    retry: 1,
  });

  const page = data.page ?? fallback.data ?? null;
  if (page) return <VehicleView page={page} />;

  const stillChecking = auth.status === 'loading' || (Boolean(uid) && fallback.isPending);
  if (stillChecking) {
    return <main className="grid min-h-[50vh] place-items-center"><Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Loading" /></main>;
  }
  return (
    <main className="mx-auto grid min-h-[50vh] max-w-lg place-items-center px-4 py-16 text-center">
      <div>
        <AlertTriangle className="mx-auto size-9 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">{data.error || fallback.isError ? 'We couldn’t load this vehicle' : 'This vehicle isn’t available'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.error || fallback.isError ? 'Please check your connection and try again.' : 'It may have been sold or removed by the seller.'}
        </p>
        <Button className="mt-5" asChild><Link to="/vehicles">Browse vehicles</Link></Button>
      </div>
    </main>
  );
}

function VehicleView({ page }: { page: VehiclePageData }) {
  const { listing: v, images, documents } = page;
  const uid = useUserId();
  const myBusiness = useMyBusiness();
  const { isSaved, toggle } = useFavourites();
  const [photo, setPhoto] = useState(0);
  const id = v.id ?? '';
  const name = vehicleTitle({ make: v.make, model: v.model, variant: v.variant });
  const fullTitle = `${v.year ?? ''} ${name}`.trim();
  const location = [v.area, v.city, labelOf(PROVINCES, v.province)].filter((x) => x && x !== '—').join(', ');
  // The seller, or a colleague at the same dealership.
  const isOwner = Boolean(uid && (uid === v.owner_id || (v.business_id && myBusiness.data?.business.id === v.business_id)));
  const isLive = v.listing_status === 'active';
  const sellerParam = sellerParamFromListing(v);
  const current = images[photo] ?? images[0];

  const similar = useQuery({
    queryKey: queryKeys.similar(id),
    queryFn: () => getSimilarVehicles(v),
    enabled: isLive,
    staleTime: 5 * 60_000,
  });

  const features = featuresForDisplay(v.features);
  const specs: Array<[string, string]> = [
    ['Condition', labelOf(CONDITIONS, v.condition)],
    ['Mileage', formatMileage(v.mileage_km)],
    ['Transmission', labelOf(TRANSMISSIONS, v.transmission)],
    ['Fuel type', labelOf(FUEL_TYPES, v.fuel_type)],
    ['Engine size', formatEngine(v.engine_size_cc)],
    ['Body type', v.body_type || 'Not stated'],
    ['Colour', v.colour || 'Not stated'],
    ['Location', location || 'Zambia'],
    ['Registration', labelOf(REGISTRATION_STATUSES, v.registration_status)],
    ['Import duty', labelOf(DUTY_STATUSES, v.duty_status)],
    ['Import status', labelOf(IMPORT_STATUSES, v.import_status)],
  ];
  const whatsappMessage = `Hi, is the ${fullTitle} (${formatPrice(v.price)}) on Caryandi still available? ${typeof window === 'undefined' ? '' : window.location.href}`.trim();

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <BackButton to="/vehicles" label="Back to vehicles" />

      {isOwner && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-accent/50 p-4 text-sm">
          <span>This is your listing · <b>{LISTING_STATUS_LABELS[v.listing_status ?? 'draft']}</b>{!isLive && ' — buyers can’t see it yet.'}</span>
          <Button size="sm" className="ml-auto" asChild><Link to="/dashboard/edit-vehicle" search={{ id }}><Pencil />Edit listing</Link></Button>
        </div>
      )}

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)]">
        <div className="min-w-0">
          <ListingPhoto path={current?.storage_path} alt={fullTitle} eager className="aspect-[16/10] w-full rounded-lg" />
          {images.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {images.map((img, i) => (
                <button key={img.id} type="button" onClick={() => setPhoto(i)} aria-label={`Show photo ${i + 1} of ${images.length}`} aria-current={photo === i}
                  className={`overflow-hidden rounded-md border-2 ${photo === i ? 'border-primary' : 'border-transparent'}`}>
                  <ListingPhoto path={img.storage_path} alt="" className="aspect-[4/3] w-full" />
                </button>
              ))}
            </div>
          )}

          <Tabs defaultValue="overview" className="mt-8">
            <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger><TabsTrigger value="verification">Verification</TabsTrigger></TabsList>
            <TabsContent value="overview">
              <div className="mt-4 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
                {specs.map(([k, val]) => <div key={k} className="flex justify-between gap-4 bg-card p-4 text-sm"><span className="text-muted-foreground">{k}</span><b className="text-right">{val}</b></div>)}
              </div>
              {features.length > 0 && <div className="mt-6">
                <h2 className="text-xl font-semibold">Features</h2>
                <p className="mt-1 text-xs text-muted-foreground">As listed by the seller — confirm when you view the vehicle.</p>
                {features.map(([group, labels]) => <div key={group} className="mt-4">
                  <h3 className="text-sm font-medium text-muted-foreground">{group}</h3>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {labels.map(f => <li key={f} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"><Check className="size-4 shrink-0 text-success" />{f}</li>)}
                  </ul>
                </div>)}
              </div>}
              <div className="mt-6">
                <h2 className="text-xl font-semibold">Seller’s description</h2>
                <p className="mt-2 whitespace-pre-line leading-7 text-muted-foreground">{v.description || 'The seller hasn’t added a description. Ask about service history and any known issues before viewing.'}</p>
              </div>
            </TabsContent>
            <TabsContent value="documents"><DocumentsTab documents={documents} /></TabsContent>
            <TabsContent value="verification"><VerificationTab verified={Boolean(v.is_verified)} sellerVerified={Boolean(v.seller_is_verified)} business={Boolean(v.business_id)} /></TabsContent>
          </Tabs>
        </div>

        <aside>
          <div className="sticky top-24 rounded-lg border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">{v.year && <Badge variant="outline">{v.year}</Badge>}{v.listing_status === 'sold' && <Badge>Sold</Badge>}{v.is_verified && <VerifiedBadge label="Verified vehicle" />}</div>
                <h1 className="mt-3 text-2xl font-bold">{name}</h1>
                <p className="mt-2 text-3xl font-bold">{formatPrice(v.price)}</p>
              </div>
              <div className="flex shrink-0">
                <ShareButton title={`${fullTitle} for ${formatPrice(v.price)} — Caryandi`} />
                {!isOwner && <Button variant="ghost" size="icon" aria-label={isSaved(id) ? 'Remove from saved' : 'Save'} aria-pressed={isSaved(id)} onClick={() => toggle(id)}><Heart className={isSaved(id) ? 'fill-primary text-primary' : ''} /></Button>}
              </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4 shrink-0" />{location || 'Zambia'}</p>
            <div className="my-5 border-t" />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {sellerParam ? <Link to="/sellers/$sellerId" params={{ sellerId: sellerParam }} className="font-semibold hover:text-primary">{v.seller_name}</Link> : <p className="font-semibold">{v.seller_name}</p>}
                <p className="text-sm text-muted-foreground">{SELLER_TYPE_LABELS[v.seller_type ?? ''] ?? 'Seller'}</p>
                {(v.seller_rating_count ?? 0) > 0 && <div className="mt-1"><Rating value={Number(v.seller_rating_avg ?? 0)} count={v.seller_rating_count ?? 0} /></div>}
              </div>
              {v.seller_is_verified && <VerifiedBadge label="Verified dealer" subtle />}
            </div>
            {isOwner ? (
              <p className="mt-5 rounded-md bg-muted p-3 text-sm text-muted-foreground">Buyers see a “Show contact details” button here.</p>
            ) : isLive ? (
              <>
                <ContactPanel target="vehicle" id={id} whatsappMessage={whatsappMessage} />
                <EnquiryActions target="vehicle" id={id} defaultMessage={whatsappMessage} />
              </>
            ) : (
              <p className="mt-5 rounded-md bg-muted p-3 text-sm">This vehicle is no longer available.</p>
            )}
            <p className="mt-4 text-center text-xs text-muted-foreground">Never send money before viewing the vehicle and confirming ownership.</p>
            {!isOwner && <div className="mt-2 text-center"><ReportDialog target="vehicle" id={id} subject="this listing" /></div>}
          </div>
        </aside>
      </div>

      {isLive && (similar.data?.length ?? 0) > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold">Similar vehicles</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similar.data?.map((x) => <VehicleCard key={x.id} v={x} saved={isSaved(x.id)} onSave={() => x.id && toggle(x.id)} />)}
          </div>
        </section>
      )}
    </main>
  );
}

const DOCUMENT_ORDER: VehicleDocumentType[] = ['registration_certificate', 'import_declaration', 'duty_receipt', 'road_tax'];

function DocumentsTab({ documents }: { documents: VehicleDocumentType[] }) {
  const extra = documents.includes('other');
  return (
    <div className="mt-4 rounded-lg border p-5">
      <div className="space-y-3">
        {DOCUMENT_ORDER.map((type) => {
          const provided = documents.includes(type);
          return (
            <div key={type} className="flex items-center gap-3">
              {provided ? <FileCheck className="size-5 shrink-0 text-success" /> : <FileX className="size-5 shrink-0 text-muted-foreground" />}
              <span className={provided ? '' : 'text-muted-foreground'}>{DOCUMENT_TYPE_LABELS[type]}</span>
              <Badge className="ml-auto shrink-0" variant="outline">{provided ? 'Uploaded' : 'Not uploaded'}</Badge>
            </div>
          );
        })}
        {extra && <div className="flex items-center gap-3"><FileCheck className="size-5 shrink-0 text-success" /><span>Other supporting documents</span><Badge className="ml-auto" variant="outline">Uploaded</Badge></div>}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Documents are kept private and are not shown publicly. “Uploaded” means the seller provided a copy — always check the originals match the vehicle (chassis and engine numbers) before paying.
      </p>
    </div>
  );
}

function VerificationTab({ verified, sellerVerified, business }: { verified: boolean; sellerVerified: boolean; business: boolean }) {
  return (
    <div className="mt-4 grid gap-3">
      {verified ? (
        <div className="rounded-lg border bg-success/5 p-5">
          <div className="flex gap-3">
            <ShieldCheck className="size-6 shrink-0 text-success" />
            <div>
              <h3 className="font-semibold">Verified vehicle</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Caryandi checked this car’s documents (such as the registration book or import papers) against the listing and approved them.
                {' '}Verification helps you assess a listing, but always inspect the vehicle and match the chassis and engine numbers to the papers before paying.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border p-5">
          <div className="flex gap-3">
            <ShieldQuestion className="size-6 shrink-0 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">This vehicle isn’t verified yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Verification is optional for sellers, so many good cars aren’t verified. Ask the seller for the registration book or import papers, meet in a safe public place, and never pay a deposit before viewing.
              </p>
            </div>
          </div>
        </div>
      )}
      {business && (
        <p className="flex items-start gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
          <ShieldCheck className={`mt-0.5 size-4 shrink-0 ${sellerVerified ? 'text-success' : 'text-muted-foreground'}`} />
          {sellerVerified
            ? 'The dealer selling this car is a verified business: Caryandi reviewed its registration details.'
            : 'The dealer selling this car hasn’t verified their business yet.'}
        </p>
      )}
    </div>
  );
}
