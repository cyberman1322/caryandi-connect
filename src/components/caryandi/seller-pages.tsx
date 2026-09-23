import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive, CheckCircle2, Eye, FileText, ImagePlus, Loader2, MoreHorizontal, Pencil, Plus, Search, Send, Star, Trash2, Undo2, Upload, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/auth-context';
import { fieldErrors } from '@/lib/auth/validation';
import { isBusinessAccount } from '@/lib/auth/account-types';
import { queryKeys, useMyBusiness, useUserId } from '@/lib/marketplace/hooks';
import {
  BUSINESS_TYPE_LABELS, businessFormSchema, businessToForm, businessTypeFor, emptyBusinessForm, saveMyBusiness, uploadBusinessLogo,
  type BusinessFormInput,
} from '@/lib/business/business-service';
import {
  DOCUMENT_TYPE_LABELS, MAX_PHOTOS, addVehicleDocument, addVehiclePhotos, createVehicle, deleteVehicle, documentViewUrl, getMyVehicle,
  getVehicleImages, listMyVehicles, listVehicleDocuments, removeVehicleDocument, removeVehiclePhoto, setPrimaryPhoto, setVehicleStatus,
  updateVehicle, type UploadProgress, type VehicleCardData, type VehicleDocumentRow, type VehicleDocumentType, type VehicleImageRow,
} from '@/lib/vehicles/vehicle-service';
import { emptyVehicleForm, vehicleFormSchema, type VehicleFormInput } from '@/lib/vehicles/validation';
import {
  BODY_TYPES, COMMON_MAKES, CONDITIONS, DUTY_STATUSES, FUEL_TYPES, IMPORT_STATUSES, LISTING_STATUS_LABELS, PROVINCES,
  REGISTRATION_STATUSES, TRANSMISSIONS, formatPrice, labelOf, vehicleTitle, type ListingStatus,
} from '@/lib/vehicles/vehicle-options';
import { timeAgo } from '@/lib/marketplace/engagement-service';
import { Card, Field, Status } from './account-forms';
import { ListingPhoto, SellerImage } from './media';
import { EmptyState, ErrorState } from './states';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Where a seller manages their cars: dealers call it Inventory, everyone else Listings. */
export function useListingsPath(): '/dashboard/inventory' | '/dashboard/listings' {
  const auth = useAuth();
  return auth.status === 'signed-in' && auth.account.profile.account_type === 'dealer' ? '/dashboard/inventory' : '/dashboard/listings';
}

/** Vehicles are attached to the dealership for business accounts; private sellers list as themselves. */
function useListingBusiness() {
  const auth = useAuth();
  const type = auth.status === 'signed-in' ? auth.account.profile.account_type : null;
  const needsBusiness = type ? isBusinessAccount(type) : false;
  const business = useMyBusiness();
  return { needsBusiness, business };
}

/* =============================================================== business profile */

export function BusinessProfileForm() {
  const auth = useAuth();
  const uid = useUserId();
  const queryClient = useQueryClient();
  const { data: mine, isPending, isError, refetch } = useMyBusiness();
  const [values, setValues] = useState<BusinessFormInput>(emptyBusinessForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  // Fill the form once per business, so a background refresh (e.g. after a logo upload) never wipes unsaved typing.
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (mine && filledFor.current !== mine.business.id) {
      filledFor.current = mine.business.id;
      setValues(businessToForm(mine));
    }
  }, [mine]);

  if (auth.status !== 'signed-in' || !uid) return null;
  const type = businessTypeFor(auth.account.profile.account_type);
  if (!type) return null;
  if (isPending) return <Card title="Business profile"><Loader2 className="size-5 animate-spin text-muted-foreground" /></Card>;
  if (isError) return <ErrorState message="We couldn’t load your business profile." onRetry={() => void refetch()} />;

  const business = mine?.business ?? null;
  const canEdit = !mine || mine.role === 'owner' || mine.role === 'manager';
  const set = (key: keyof BusinessFormInput) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = businessFormSchema.safeParse(values);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); setStatus({ kind: 'error', text: 'Please fix the highlighted fields.' }); return; }
    setErrors({}); setStatus(null); setBusy(true);
    try {
      await saveMyBusiness(parsed.data, type!, business);
      setStatus({ kind: 'success', text: business ? 'Your business profile has been saved.' : 'Your business profile is set up. You can now add vehicles.' });
    } catch (err) {
      setStatus({ kind: 'error', text: errorText(err, 'We couldn’t save your business profile.') });
    } finally {
      // Refresh even on failure: the business row may exist even if saving the contacts failed.
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBusiness(uid!) });
      setBusy(false);
    }
  }

  async function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !business) return;
    setLogoBusy(true);
    try {
      await uploadBusinessLogo(business.id, file);
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBusiness(uid!) });
      toast.success('Logo updated');
    } catch (err) {
      toast.error(errorText(err, 'The logo could not be uploaded.'));
    } finally {
      setLogoBusy(false);
    }
  }

  const publicLink = business && business.business_type === 'dealer' && business.slug ? business.slug : null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <Card title={business ? `${BUSINESS_TYPE_LABELS[type]} profile` : `Set up your ${BUSINESS_TYPE_LABELS[type].toLowerCase()} profile`}
        description={business ? 'This is what buyers see on your public page and listings.' : 'Buyers see your business name on every listing. You need this before adding vehicles.'}>
        {business && (
          <div className="flex flex-wrap items-center gap-4">
            <SellerImage kind="business" path={business.logo_path} alt={`${business.name} logo`} className="size-20 rounded-lg" />
            <div className="grid gap-1">
              <label className={`inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent ${!canEdit || logoBusy ? 'pointer-events-none opacity-60' : ''}`}>
                {logoBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{business.logo_path ? 'Change logo' : 'Upload logo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onLogo(e)} disabled={!canEdit || logoBusy} />
              </label>
              <span className="text-xs text-muted-foreground">JPG, PNG or WebP. Square works best.</span>
            </div>
            {publicLink && <Button variant="outline" size="sm" className="ml-auto" asChild><Link to="/sellers/$sellerId" params={{ sellerId: publicLink }}><Eye />View public page</Link></Button>}
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Business name" error={errors['name']}>{(id) => <Input id={id} value={values.name} onChange={set('name')} maxLength={120} disabled={!canEdit} />}</Field>
          <Field label="Province" error={errors['province']}>
            {(id) => (
              <Select value={values.province} onValueChange={(v) => setValues((s) => ({ ...s, province: v }))} disabled={!canEdit}>
                <SelectTrigger id={id}><SelectValue placeholder="Select province" /></SelectTrigger>
                <SelectContent>{PROVINCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Town or city" error={errors['city']}>{(id) => <Input id={id} value={values.city} onChange={set('city')} placeholder="e.g. Lusaka" disabled={!canEdit} />}</Field>
          <Field label="Area (optional)" error={errors['area']}>{(id) => <Input id={id} value={values.area} onChange={set('area')} placeholder="e.g. Kabulonga" disabled={!canEdit} />}</Field>
        </div>
        <Field label="Street address (optional)" error={errors['address']} hint="Shown on your public page so buyers can find your yard.">{(id) => <Input id={id} value={values.address} onChange={set('address')} disabled={!canEdit} />}</Field>
        <Field label="About the business" error={errors['description']}>{(id) => <Textarea id={id} rows={4} maxLength={3000} value={values.description} onChange={set('description')} placeholder="What you sell, how long you’ve been trading, what makes you trustworthy" disabled={!canEdit} />}</Field>
      </Card>

      <Card title="Business contact details" description="Buyers see these only after signing in and tapping “Show contact”. A phone number is required to publish listings.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Business phone" error={errors['phone']} hint="e.g. 097 123 4567">{(id) => <Input id={id} type="tel" value={values.phone} onChange={set('phone')} disabled={!canEdit} />}</Field>
          <Field label="WhatsApp number (optional)" error={errors['whatsappNumber']} hint="Leave empty if you don’t use WhatsApp">{(id) => <Input id={id} type="tel" value={values.whatsappNumber} onChange={set('whatsappNumber')} disabled={!canEdit} />}</Field>
          <Field label="Business email (optional)" error={errors['email']} hint="Not shown publicly">{(id) => <Input id={id} type="email" value={values.email} onChange={set('email')} disabled={!canEdit} />}</Field>
          <Field label="Website (optional)" error={errors['website']} hint="e.g. autoworld.co.zm">{(id) => <Input id={id} value={values.website} onChange={set('website')} disabled={!canEdit} />}</Field>
        </div>
      </Card>

      {!canEdit && <Status kind="error">Only the business owner or a manager can change these details.</Status>}
      {status && <Status kind={status.kind}>{status.text}</Status>}
      {canEdit && (
        <Button type="submit" className="w-full sm:w-auto sm:justify-self-start" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}{busy ? 'Saving…' : business ? 'Save business profile' : 'Create business profile'}
        </Button>
      )}
    </form>
  );
}

/* ================================================================= vehicle editor */

function toForm(v: NonNullable<Awaited<ReturnType<typeof getMyVehicle>>>): VehicleFormInput {
  return {
    make: v.make, model: v.model, variant: v.variant ?? '', year: String(v.year), price: String(v.price),
    mileage: v.mileage_km == null ? '' : String(v.mileage_km),
    // Show litres only when that round-trips exactly; otherwise keep the seller's cc figure (1998cc stays 1998cc).
    engineSize: v.engine_size_cc == null ? '' : v.engine_size_cc % 100 === 0 ? (v.engine_size_cc / 1000).toFixed(1) : `${v.engine_size_cc}cc`,
    condition: v.condition, transmission: v.transmission, fuel: v.fuel_type, registration: v.registration_status,
    duty: v.duty_status, importStatus: v.import_status, bodyType: v.body_type ?? '', colour: v.colour ?? '',
    province: v.province, city: v.city, area: v.area ?? '', description: v.description ?? '',
  };
}

/** Add or edit a vehicle. New vehicles are saved as drafts, then photos and documents are added before publishing. */
export function VehicleEditor({ vehicleId }: { vehicleId?: string | undefined }) {
  const uid = useUserId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listingsPath = useListingsPath();
  const { needsBusiness, business } = useListingBusiness();

  const existing = useQuery({
    queryKey: queryKeys.myVehicle(vehicleId ?? 'new'),
    queryFn: () => getMyVehicle(vehicleId!),
    enabled: Boolean(vehicleId && uid),
  });

  const [values, setValues] = useState<VehicleFormInput>(emptyVehicleForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Fill the form once per listing (not on every background refetch, which would wipe typing).
  useEffect(() => {
    if (existing.data && loadedFor.current !== existing.data.id) {
      loadedFor.current = existing.data.id;
      setValues(toForm(existing.data));
    }
  }, [existing.data]);

  // New listings start in the seller's own town.
  const auth = useAuth();
  const homeProvince = business.data?.business.province ?? (auth.status === 'signed-in' ? auth.account.profile.province : null) ?? '';
  const homeCity = business.data?.business.city ?? (auth.status === 'signed-in' ? auth.account.profile.city : null) ?? '';
  useEffect(() => {
    if (vehicleId || (!homeProvince && !homeCity)) return;
    setValues((v) => (v.province && v.city ? v : { ...v, province: v.province || homeProvince, city: v.city || homeCity }));
  }, [vehicleId, homeProvince, homeCity]);

  if (!vehicleId && needsBusiness) {
    if (business.isPending) return <Loader2 className="size-6 animate-spin text-muted-foreground" />;
    if (business.isError) return <ErrorState message="We couldn’t load your business profile." onRetry={() => void business.refetch()} />;
    if (!business.data) {
      return (
        <div className="rounded-lg border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">Set up your business profile first</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Your vehicles are listed under your business name, with your business phone number for buyers.</p>
          <Button className="mt-5" asChild><Link to="/dashboard/profile">Set up business profile</Link></Button>
        </div>
      );
    }
  }

  if (vehicleId) {
    if (existing.isPending) return <Loader2 className="size-6 animate-spin text-muted-foreground" />;
    if (existing.isError) return <ErrorState message="We couldn’t load this listing." onRetry={() => void existing.refetch()} />;
    if (!existing.data) return <EmptyState title="Listing not found" body="It may have been deleted, or it belongs to another account." />;
  }

  const set = (key: keyof VehicleFormInput) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const choose = (key: keyof VehicleFormInput) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = vehicleFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setStatus({ kind: 'error', text: 'Please fix the highlighted fields.' });
      return;
    }
    setErrors({}); setStatus(null); setBusy(true);
    try {
      if (vehicleId) {
        await updateVehicle(vehicleId, parsed.data);
        await queryClient.invalidateQueries({ queryKey: queryKeys.myVehicle(vehicleId) });
        setStatus({ kind: 'success', text: 'Changes saved.' });
      } else {
        const id = await createVehicle(parsed.data, { businessId: needsBusiness ? business.data?.business.id ?? null : null });
        toast.success('Draft saved. Now add photos, then publish.');
        await navigate({ to: '/dashboard/edit-vehicle', search: { id }, replace: true });
      }
      if (uid) void queryClient.invalidateQueries({ queryKey: queryKeys.myVehicles(uid) });
    } catch (err) {
      setStatus({ kind: 'error', text: errorText(err, 'We couldn’t save this listing.') });
    } finally {
      setBusy(false);
    }
  }

  const select = (key: keyof VehicleFormInput, label: string, options: ReadonlyArray<readonly [string, string]>, placeholder: string) => (
    <Field label={label} error={errors[key]}>
      {(id) => (
        <Select value={values[key]} onValueChange={choose(key)}>
          <SelectTrigger id={id}><SelectValue placeholder={placeholder} /></SelectTrigger>
          <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </Field>
  );

  const form = (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <Card title="Vehicle details" description="Clear, accurate details get more serious buyers.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Make" error={errors['make']}>
            {(id) => <><Input id={id} list="caryandi-makes" value={values.make} onChange={set('make')} placeholder="e.g. Toyota" maxLength={60} autoComplete="off" /><datalist id="caryandi-makes">{COMMON_MAKES.map((m) => <option key={m} value={m} />)}</datalist></>}
          </Field>
          <Field label="Model" error={errors['model']}>{(id) => <Input id={id} value={values.model} onChange={set('model')} placeholder="e.g. Harrier" maxLength={60} />}</Field>
          <Field label="Version / trim (optional)" error={errors['variant']}>{(id) => <Input id={id} value={values.variant} onChange={set('variant')} placeholder="e.g. 2.0 Premium" maxLength={80} />}</Field>
          <Field label="Year" error={errors['year']}>{(id) => <Input id={id} inputMode="numeric" value={values.year} onChange={set('year')} placeholder="2020" maxLength={4} />}</Field>
          <Field label="Price (ZMW)" error={errors['price']}>{(id) => <Input id={id} inputMode="decimal" value={values.price} onChange={set('price')} placeholder="485,000" />}</Field>
          <Field label="Mileage in km (optional)" error={errors['mileage']}>{(id) => <Input id={id} inputMode="numeric" value={values.mileage} onChange={set('mileage')} placeholder="48,200" />}</Field>
          {select('condition', 'Condition', CONDITIONS, 'Select condition')}
          {select('transmission', 'Transmission', TRANSMISSIONS, 'Select transmission')}
          {select('fuel', 'Fuel type', FUEL_TYPES, 'Select fuel type')}
          <Field label="Engine size (optional)" error={errors['engineSize']} hint="Litres or cc, e.g. 2.0 or 1998cc">{(id) => <Input id={id} value={values.engineSize} onChange={set('engineSize')} placeholder="2.0" />}</Field>
          {select('bodyType', 'Body type (optional)', BODY_TYPES.map((b) => [b, b] as const), 'Select body type')}
          <Field label="Colour (optional)" error={errors['colour']}>{(id) => <Input id={id} value={values.colour} onChange={set('colour')} placeholder="e.g. Pearl white" maxLength={40} />}</Field>
        </div>
      </Card>

      <Card title="Registration and import" description="Buyers filter on these, so answer them honestly.">
        <div className="grid gap-5 sm:grid-cols-3">
          {select('registration', 'Registered in Zambia?', REGISTRATION_STATUSES, 'Select')}
          {select('duty', 'Import duty', DUTY_STATUSES, 'Select')}
          {select('importStatus', 'Local or imported', IMPORT_STATUSES, 'Select')}
        </div>
      </Card>

      <Card title="Location" description="Where buyers can view the vehicle.">
        <div className="grid gap-5 sm:grid-cols-3">
          {select('province', 'Province', PROVINCES, 'Select province')}
          <Field label="Town or city" error={errors['city']}>{(id) => <Input id={id} value={values.city} onChange={set('city')} placeholder="e.g. Lusaka" maxLength={80} />}</Field>
          <Field label="Area (optional)" error={errors['area']}>{(id) => <Input id={id} value={values.area} onChange={set('area')} placeholder="e.g. Woodlands" maxLength={120} />}</Field>
        </div>
      </Card>

      <Card title="Description">
        <Field label="Condition, service history and anything a buyer should know" error={errors['description']}>
          {(id) => <Textarea id={id} rows={6} maxLength={5000} value={values.description} onChange={set('description')} placeholder="e.g. Full service history, new tyres in March, no accidents. Spare key available." />}
        </Field>
      </Card>

      {status && <Status kind={status.kind}>{status.text}</Status>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{busy ? 'Saving…' : vehicleId ? 'Save changes' : 'Save and continue to photos'}</Button>
        <Button type="button" variant="outline" asChild><Link to={listingsPath}>Cancel</Link></Button>
      </div>
    </form>
  );

  if (!vehicleId || !existing.data) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {form}
        <section className="self-start rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Vehicle photos</h2>
          <div className="mt-4 grid aspect-square place-items-center rounded-lg border border-dashed bg-muted/30 p-4 text-center">
            <div><ImagePlus className="mx-auto size-7 text-muted-foreground" /><b className="mt-2 block text-sm">Photos come next</b><p className="text-xs text-muted-foreground">Save the details first, then add up to {MAX_PHOTOS} photos: front, rear, sides, interior and engine.</p></div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="grid min-w-0 gap-6">
        <PhotosManager vehicleId={vehicleId} />
        {form}
        <DocumentsManager vehicleId={vehicleId} />
      </div>
      <div className="grid gap-6 self-start lg:sticky lg:top-24">
        <PublishPanel vehicleId={vehicleId} status={existing.data.listing_status} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ publish panel */

function PublishPanel({ vehicleId, status }: { vehicleId: string; status: ListingStatus }) {
  const uid = useUserId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const listingsPath = useListingsPath();
  const images = useQuery({ queryKey: queryKeys.vehicleImages(vehicleId), queryFn: () => getVehicleImages(vehicleId) });
  const [error, setError] = useState<ReactNode>(null);

  const change = useMutation({
    mutationFn: (next: 'draft' | 'active' | 'sold' | 'archived') => setVehicleStatus(vehicleId, next),
    onSuccess: async (_d, next) => {
      setError(null);
      toast.success(next === 'active' ? 'Your listing is live.' : next === 'sold' ? 'Marked as sold.' : next === 'draft' ? 'Listing hidden from buyers.' : 'Listing archived.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.myVehicle(vehicleId) });
      if (uid) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.myVehicles(uid) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.stats(uid) });
      }
    },
    onError: (e) => {
      const message = errorText(e, 'We couldn’t change this listing.');
      setError(message.includes('phone number')
        ? <>{message} <Link to="/dashboard/profile" className="font-semibold underline">Add your phone number</Link></>
        : message);
    },
  });

  const photoCount = images.data?.length ?? 0;
  const publish = () => {
    if (photoCount === 0) { setError('Add at least one photo before publishing — listings without photos get very few enquiries.'); return; }
    change.mutate('active');
  };
  const underReview = status === 'pending' || status === 'rejected';

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Listing status</h2>
        <Badge variant={status === 'active' ? 'default' : 'outline'}>{LISTING_STATUS_LABELS[status]}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {status === 'draft' && 'Only you can see this listing. Publish it when the details and photos are ready.'}
        {status === 'active' && 'Buyers can find this vehicle in search right now.'}
        {status === 'sold' && 'Buyers see this vehicle as sold. Relist it if the sale falls through.'}
        {status === 'archived' && 'Hidden from buyers. Move it back to drafts to edit and relist.'}
        {status === 'pending' && 'Caryandi is reviewing this listing. You can edit it or move it back to drafts.'}
        {status === 'rejected' && 'Caryandi didn’t approve this listing. Edit it and move it back to drafts, or archive it.'}
      </p>
      <div className="mt-4 grid gap-2">
        {status === 'draft' && <Button onClick={publish} disabled={change.isPending || images.isPending}>{change.isPending ? <Loader2 className="animate-spin" /> : <Send />}Publish listing</Button>}
        {status === 'active' && <>
          <Button variant="outline" asChild><Link to="/vehicles/$vehicleId" params={{ vehicleId }}><Eye />View live listing</Link></Button>
          <Button variant="outline" onClick={() => change.mutate('sold')} disabled={change.isPending}><CheckCircle2 />Mark as sold</Button>
          <Button variant="ghost" onClick={() => change.mutate('draft')} disabled={change.isPending}><Undo2 />Unpublish</Button>
        </>}
        {status === 'sold' && <Button variant="outline" onClick={() => change.mutate('active')} disabled={change.isPending}><Send />Relist</Button>}
        {(status === 'archived' || underReview) && <Button variant="outline" onClick={() => change.mutate('draft')} disabled={change.isPending}><Undo2 />Move to drafts</Button>}
        {status !== 'archived' && status !== 'active' && <Button variant="ghost" onClick={() => change.mutate('archived')} disabled={change.isPending}><Archive />Archive</Button>}
        <Button variant="ghost" asChild><Link to={listingsPath}>Back to my listings</Link></Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {status === 'draft' && (
        <ul className="mt-4 space-y-1 border-t pt-4 text-xs text-muted-foreground">
          <li className={photoCount > 0 ? 'text-success' : ''}>{photoCount > 0 ? '✓' : '•'} At least one photo ({photoCount} added)</li>
          <li>• A phone number on your profile so buyers can reach you</li>
        </ul>
      )}
      {status === 'draft' && <Button variant="link" className="mt-2 h-auto p-0 text-xs" onClick={() => void navigate({ to: '/vehicles/$vehicleId', params: { vehicleId } })}>Preview how buyers will see it</Button>}
    </section>
  );
}

/* ----------------------------------------------------------------------- photos */

function PhotosManager({ vehicleId }: { vehicleId: string }) {
  const uid = useUserId();
  const queryClient = useQueryClient();
  const key = queryKeys.vehicleImages(vehicleId);
  const images = useQuery({ queryKey: key, queryFn: () => getVehicleImages(vehicleId) });
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = images.data ?? [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    if (uid) void queryClient.invalidateQueries({ queryKey: queryKeys.myVehicles(uid) });
  };

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setProblems([]);
    setProgress({ done: 0, total: files.length });
    try {
      const result = await addVehiclePhotos(vehicleId, files, setProgress);
      setProblems(result.errors);
      if (result.added) toast.success(`${result.added} photo${result.added === 1 ? '' : 's'} added`);
    } catch (err) {
      setProblems([errorText(err, 'The photos could not be uploaded.')]);
    } finally {
      setProgress(null);
      await refresh();
    }
  }

  async function act(image: VehicleImageRow, action: 'primary' | 'remove') {
    setBusyId(image.id);
    try {
      if (action === 'primary') await setPrimaryPhoto(vehicleId, image.id);
      else await removeVehiclePhoto(image, list);
      await refresh();
    } catch (err) {
      toast.error(errorText(err, 'That didn’t work. Please try again.'));
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const full = list.length >= MAX_PHOTOS;
  const blocked = Boolean(progress) || full || !images.isSuccess;
  return (
    <section className="rounded-lg border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Photos</h2>
          <p className="mt-1 text-sm text-muted-foreground">{list.length} of {MAX_PHOTOS}. The main photo is shown in search results. Location data is removed from photos automatically.</p>
        </div>
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 ${blocked ? 'pointer-events-none opacity-60' : ''}`}>
          <ImagePlus className="size-4" />Add photos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void onFiles(e)} disabled={blocked} />
        </label>
      </div>
      {progress && (
        <div className="mt-4" role="status">
          <p className="text-sm">Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}…</p>
          <Progress className="mt-2" value={(progress.done / Math.max(1, progress.total)) * 100} />
        </div>
      )}
      {problems.length > 0 && <ul role="alert" className="mt-4 space-y-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {images.isError && <p className="mt-4 text-sm text-destructive">We couldn’t load the photos. <button type="button" className="underline" onClick={() => void images.refetch()}>Try again</button></p>}
      {list.length === 0 && !images.isPending && !progress && (
        <div className="mt-4 grid place-items-center rounded-lg border border-dashed bg-muted/30 p-8 text-center">
          <div><Upload className="mx-auto size-7 text-muted-foreground" /><b className="mt-2 block text-sm">Add clear photos</b><p className="text-xs text-muted-foreground">Front, rear, both sides, interior, dashboard (showing mileage) and engine</p></div>
        </div>
      )}
      {list.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((img) => (
            <figure key={img.id} className="relative overflow-hidden rounded-md border">
              <ListingPhoto path={img.storage_path} alt="Vehicle photo" className="aspect-[4/3] w-full" />
              {img.is_primary && <span className="absolute left-2 top-2"><Badge><Star className="size-3" />Main</Badge></span>}
              <figcaption className="flex gap-1 border-t bg-card p-1.5">
                {!img.is_primary && <Button type="button" size="sm" variant="ghost" className="h-8 flex-1 px-2 text-xs" disabled={busyId !== null} onClick={() => void act(img, 'primary')}>Make main</Button>}
                <Button type="button" size="sm" variant="ghost" className="ml-auto h-8 px-2 text-xs text-destructive" disabled={busyId !== null} onClick={() => void act(img, 'remove')} aria-label="Remove photo">
                  {busyId === img.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}Remove
                </Button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------- documents */

const DOC_TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as Array<[VehicleDocumentType, string]>;

function DocumentsManager({ vehicleId }: { vehicleId: string }) {
  const queryClient = useQueryClient();
  const key = queryKeys.vehicleDocuments(vehicleId);
  const docs = useQuery({ queryKey: key, queryFn: () => listVehicleDocuments(vehicleId) });
  const [type, setType] = useState<VehicleDocumentType>('registration_certificate');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await addVehicleDocument(vehicleId, type, file);
      toast.success('Document uploaded');
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.error(errorText(err, 'The document could not be uploaded.'));
    } finally {
      setBusy(false);
    }
  }

  async function open(doc: VehicleDocumentRow) {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed link.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await documentViewUrl(doc.storage_path);
      if (tab) tab.location.href = url; else window.location.assign(url);
    } catch (err) {
      tab?.close();
      toast.error(errorText(err, 'We couldn’t open that document.'));
    }
  }

  async function remove(doc: VehicleDocumentRow) {
    setBusyId(doc.id);
    try {
      await removeVehicleDocument(doc);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.error(errorText(err, 'We couldn’t remove that document.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Documents (private)</h2>
      <p className="mt-1 text-sm text-muted-foreground">Buyers only see which documents you’ve provided, never the files. Caryandi uses them for verification.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Select value={type} onValueChange={(v) => setType(v as VehicleDocumentType)}>
          <SelectTrigger aria-label="Document type"><SelectValue /></SelectTrigger>
          <SelectContent>{DOC_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Upload PDF or photo
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void onFile(e)} disabled={busy} />
        </label>
      </div>
      {docs.isError && <p className="mt-4 text-sm text-destructive">We couldn’t load your documents.</p>}
      {(docs.data?.length ?? 0) > 0 && (
        <ul className="mt-4 divide-y rounded-md border">
          {docs.data?.map((d) => (
            <li key={d.id} className="flex items-center gap-3 p-3 text-sm">
              <FileText className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{DOCUMENT_TYPE_LABELS[d.document_type]}<span className="text-muted-foreground"> · {timeAgo(d.created_at)}</span></span>
              <Button type="button" size="sm" variant="ghost" onClick={() => void open(d)}>View</Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busyId === d.id} onClick={() => void remove(d)} aria-label="Remove document">
                {busyId === d.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* =================================================================== my listings */

const STATUS_TABS = [['all', 'All'], ['active', 'Live'], ['draft', 'Drafts'], ['sold', 'Sold'], ['archived', 'Archived']] as const;
type StatusTab = (typeof STATUS_TABS)[number][0];

export function MyListings() {
  const uid = useUserId();
  const queryClient = useQueryClient();
  const { needsBusiness, business } = useListingBusiness();
  const businessId = needsBusiness ? business.data?.business.id ?? null : null;
  const ready = Boolean(uid) && (!needsBusiness || !business.isPending);
  const listings = useQuery({
    queryKey: [...queryKeys.myVehicles(uid ?? 'anon'), businessId],
    queryFn: () => listMyVehicles(businessId),
    enabled: ready,
  });
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<StatusTab>('all');
  const [selected, setSelected] = useState<VehicleCardData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (listings.data ?? []).filter((v) => {
      if (tab !== 'all' && !(tab === 'archived' ? ['archived', 'pending', 'rejected'].includes(v.listing_status ?? '') : v.listing_status === tab)) return false;
      if (!text) return true;
      return `${v.year} ${v.make} ${v.model} ${v.variant ?? ''} ${v.city ?? ''}`.toLowerCase().includes(text);
    });
  }, [listings.data, q, tab]);

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'active' | 'draft' | 'sold' | 'archived' | 'delete' }) =>
      action === 'delete' ? deleteVehicle(id) : setVehicleStatus(id, action),
    onSuccess: (_d, { action }) => {
      toast.success(action === 'delete' ? 'Listing deleted.' : action === 'active' ? 'Your listing is live.' : action === 'sold' ? 'Marked as sold.' : action === 'draft' ? 'Moved to drafts.' : 'Listing archived.');
      setSelected(null);
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(errorText(e, 'We couldn’t update this listing.')),
    onSettled: () => {
      if (!uid) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.myVehicles(uid) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats(uid) });
    },
  });

  if (needsBusiness && business.isSuccess && !business.data) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Set up your business profile first</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Once your business profile is saved you can start adding vehicles.</p>
        <Button className="mt-5" asChild><Link to="/dashboard/profile">Set up business profile</Link></Button>
      </div>
    );
  }

  const counts = (listings.data ?? []).reduce<Record<string, number>>((acc, v) => { const s = v.listing_status ?? 'draft'; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {});
  const status = selected?.listing_status ?? 'draft';

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid gap-3 border-b p-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative max-w-sm"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search your vehicles" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your vehicles" /></div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
            <TabsList className="flex-wrap">{STATUS_TABS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}{v !== 'all' && counts[v] ? ` (${counts[v]})` : ''}</TabsTrigger>)}</TabsList>
          </Tabs>
        </div>
        {listings.isPending || !ready ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : listings.isError ? (
          <div className="p-4"><ErrorState message="We couldn’t load your listings." onRetry={() => void listings.refetch()} /></div>
        ) : rows.length === 0 ? (
          <div className="p-4"><EmptyState title={listings.data.length ? 'No listings match' : 'No vehicles yet'} body={listings.data.length ? 'Try another search or status.' : 'Add your first vehicle — it takes about five minutes.'} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Vehicle</TableHead><TableHead>Location</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="flex min-w-56 items-center gap-3">
                        <ListingPhoto path={v.primary_image_path} alt="" className="h-12 w-16 shrink-0 rounded" />
                        <div className="min-w-0"><Link to="/dashboard/edit-vehicle" search={{ id: v.id ?? '' }} className="block truncate font-medium hover:text-primary">{v.year} {vehicleTitle({ make: v.make, model: v.model, variant: v.variant })}</Link>{v.created_at && <span className="text-xs text-muted-foreground">Added {timeAgo(v.created_at)}</span>}</div>
                      </div>
                    </TableCell>
                    <TableCell>{v.city || labelOf(PROVINCES, v.province)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatPrice(v.price)}</TableCell>
                    <TableCell><Badge variant={v.listing_status === 'active' ? 'default' : 'outline'}>{LISTING_STATUS_LABELS[v.listing_status ?? 'draft']}</Badge></TableCell>
                    <TableCell className="text-right"><Button size="icon" variant="ghost" aria-label={`Actions for ${v.make} ${v.model}`} onClick={() => { setSelected(v); setConfirmDelete(false); }}><MoreHorizontal /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setConfirmDelete(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Listing actions</DialogTitle>
            <DialogDescription>{selected ? `${selected.year} ${vehicleTitle({ make: selected.make, model: selected.model, variant: selected.variant })} · ${LISTING_STATUS_LABELS[status]}` : ''}</DialogDescription>
          </DialogHeader>
          {selected?.id && (confirmDelete ? (
            <>
              <p className="text-sm">Delete this listing? Buyers will no longer see it and you won’t be able to restore it yourself.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button>
                <Button variant="destructive" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'delete' })}>{act.isPending && <Loader2 className="animate-spin" />}Delete listing</Button>
              </DialogFooter>
            </>
          ) : (
            <div className="grid gap-2">
              <Button variant="outline" asChild><Link to="/dashboard/edit-vehicle" search={{ id: selected.id }}><Pencil />Edit details and photos</Link></Button>
              {status === 'active' && <Button variant="outline" asChild><Link to="/vehicles/$vehicleId" params={{ vehicleId: selected.id }}><Eye />View live listing</Link></Button>}
              {status === 'draft' && <Button variant="outline" asChild><Link to="/dashboard/edit-vehicle" search={{ id: selected.id }}><Send />Review and publish</Link></Button>}
              {status === 'active' && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'sold' })}><CheckCircle2 />Mark as sold</Button>}
              {status === 'active' && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'draft' })}><Undo2 />Unpublish</Button>}
              {status === 'sold' && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'active' })}><Send />Relist</Button>}
              {['archived', 'pending', 'rejected'].includes(status) && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'draft' })}><Undo2 />Move to drafts</Button>}
              {status !== 'archived' && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'archived' })}><Archive />Archive</Button>}
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 />Delete listing</Button>
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AddVehicleButton() {
  return <Button asChild><Link to="/dashboard/add-vehicle"><Plus />Add vehicle</Link></Button>;
}
