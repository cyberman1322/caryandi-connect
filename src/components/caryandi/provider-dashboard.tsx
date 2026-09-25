import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive, CheckCircle2, Eye, EyeOff, ImagePlus, Loader2, MoreHorizontal, Pencil, Plus, Search, Send, Star, Trash2, Undo2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/auth-context';
import { fieldErrors } from '@/lib/auth/validation';
import { isBusinessAccount } from '@/lib/auth/account-types';
import { queryKeys, useMyBusiness, useUserId } from '@/lib/marketplace/hooks';
import { timeAgo } from '@/lib/marketplace/engagement-service';
import type { MyBusiness } from '@/lib/business/business-service';
import {
  MAX_PART_PHOTOS, addPartPhotos, createPart, deletePart, getMyPart, listMyParts, listPartCategories, listPartImages, removePartPhoto,
  setPartStatus, setPrimaryPartPhoto, updatePart, type PartCardData, type PartImageRow,
} from '@/lib/parts/parts-service';
import { PART_CONDITIONS, emptyPartForm, partFormSchema, type PartFormInput } from '@/lib/parts/validation';
import {
  deleteRoute, deleteService, listMyRoutes, listMyServices, saveAvailability, saveRoute, saveService, setRouteActive, setServiceActive,
  type ImportRouteRow, type ServiceRow,
} from '@/lib/directory/provider-service';
import {
  DAYS, ROUTE_SERVICE_SUGGESTIONS, emptyRouteForm, emptyServiceForm, parseOpeningHours, routeFormSchema, routeLabel, serviceFormSchema,
  validateOpeningHours, type OpeningHours, type RouteFormInput, type ServiceFormInput,
} from '@/lib/directory/validation';
import type { UploadProgress } from '@/lib/vehicles/vehicle-service';
import { parseMoney } from '@/lib/vehicles/validation';
import { LISTING_STATUS_LABELS, PROVINCES, formatNumber, formatPrice, labelOf, type ListingStatus } from '@/lib/vehicles/vehicle-options';
import { Card, Field, Status } from './account-forms';
import { PartPhoto } from './media';
import { EmptyState, ErrorState } from './states';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const Spinner = () => <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

function SetUpBusiness({ body }: { body: string }) {
  return (
    <div className="rounded-lg border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold">Set up your business profile first</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      <Button className="mt-5" asChild><Link to="/dashboard/profile">Set up business profile</Link></Button>
    </div>
  );
}

/** Renders children with the user's business, or the right loading / error / set-up state. */
function WithBusiness({ body, children }: { body: string; children: (b: MyBusiness) => ReactNode }) {
  const business = useMyBusiness();
  if (business.isPending) return <Spinner />;
  if (business.isError) return <ErrorState message="We couldn’t load your business profile." onRetry={() => void business.refetch()} />;
  if (!business.data) return <SetUpBusiness body={body} />;
  return <>{children(business.data)}</>;
}

function useAccountType() {
  const auth = useAuth();
  return auth.status === 'signed-in' ? auth.account.profile.account_type : null;
}

/** Parts are listed under the business for business accounts; private sellers list as themselves. */
function usePartsBusiness() {
  const type = useAccountType();
  const needsBusiness = type ? isBusinessAccount(type) : false;
  const business = useMyBusiness();
  return { needsBusiness, business, businessId: needsBusiness ? business.data?.business.id ?? null : null };
}

/* =============================================================== parts: inventory */

const STATUS_TABS = [['all', 'All'], ['active', 'Live'], ['draft', 'Drafts'], ['sold', 'Sold'], ['archived', 'Archived']] as const;
type StatusTab = (typeof STATUS_TABS)[number][0];

export function MyParts() {
  const uid = useUserId();
  const queryClient = useQueryClient();
  const { needsBusiness, business, businessId } = usePartsBusiness();
  const ready = Boolean(uid) && (!needsBusiness || !business.isPending);
  const parts = useQuery({ queryKey: [...queryKeys.myParts(uid ?? 'anon'), businessId], queryFn: () => listMyParts(businessId), enabled: ready });
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<StatusTab>('all');
  const [selected, setSelected] = useState<PartCardData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (parts.data ?? []).filter((p) => {
      if (tab !== 'all' && !(tab === 'archived' ? ['archived', 'pending', 'rejected'].includes(p.listing_status ?? '') : p.listing_status === tab)) return false;
      return !text || `${p.title} ${p.category_name ?? ''} ${p.city ?? ''}`.toLowerCase().includes(text);
    });
  }, [parts.data, q, tab]);

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'active' | 'draft' | 'sold' | 'archived' | 'delete' }) =>
      action === 'delete' ? deletePart(id) : setPartStatus(id, action),
    onSuccess: (_d, { action }) => {
      toast.success(action === 'delete' ? 'Part deleted.' : action === 'active' ? 'Your part is live.' : action === 'sold' ? 'Marked as sold.' : action === 'draft' ? 'Moved to drafts.' : 'Part archived.');
      setSelected(null); setConfirmDelete(false);
    },
    onError: (e) => toast.error(errorText(e, 'We couldn’t update this part.')),
    onSettled: () => { if (uid) void queryClient.invalidateQueries({ queryKey: queryKeys.myParts(uid) }); },
  });

  if (needsBusiness && business.isSuccess && !business.data) return <SetUpBusiness body="Once your business profile is saved you can start listing parts." />;

  const counts = (parts.data ?? []).reduce<Record<string, number>>((acc, p) => { const s = p.listing_status ?? 'draft'; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {});
  const status: ListingStatus = selected?.listing_status ?? 'draft';

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid gap-3 border-b p-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative max-w-sm"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search your parts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your parts" /></div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
            <TabsList className="flex-wrap">{STATUS_TABS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}{v !== 'all' && counts[v] ? ` (${counts[v]})` : ''}</TabsTrigger>)}</TabsList>
          </Tabs>
        </div>
        {parts.isPending || !ready ? <Spinner /> : parts.isError ? (
          <div className="p-4"><ErrorState message="We couldn’t load your parts." onRetry={() => void parts.refetch()} /></div>
        ) : rows.length === 0 ? (
          <div className="p-4"><EmptyState title={parts.data.length ? 'No parts match' : 'No parts yet'} body={parts.data.length ? 'Try another search or status.' : 'Add your first part — clear photos and the vehicles it fits sell parts fastest.'} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Category</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex min-w-56 items-center gap-3">
                        <PartPhoto path={p.primary_image_path} alt="" className="h-12 w-16 shrink-0 rounded" />
                        <div className="min-w-0"><Link to="/dashboard/add-part" search={{ id: p.id ?? '' }} className="block truncate font-medium hover:text-primary">{p.title}</Link>{p.created_at && <span className="text-xs text-muted-foreground">Added {timeAgo(p.created_at)}</span>}</div>
                      </div>
                    </TableCell>
                    <TableCell>{p.category_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatPrice(p.price)}</TableCell>
                    <TableCell>{p.quantity ?? '—'}</TableCell>
                    <TableCell><Badge variant={p.listing_status === 'active' ? 'default' : 'outline'}>{LISTING_STATUS_LABELS[p.listing_status ?? 'draft']}</Badge></TableCell>
                    <TableCell className="text-right"><Button size="icon" variant="ghost" aria-label={`Actions for ${p.title}`} onClick={() => { setSelected(p); setConfirmDelete(false); }}><MoreHorizontal /></Button></TableCell>
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
            <DialogTitle>Part actions</DialogTitle>
            <DialogDescription>{selected ? `${selected.title} · ${LISTING_STATUS_LABELS[status]}` : ''}</DialogDescription>
          </DialogHeader>
          {selected?.id && (confirmDelete ? (
            <>
              <p className="text-sm">Delete this part? Buyers will no longer see it and you won’t be able to restore it yourself.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button>
                <Button variant="destructive" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'delete' })}>{act.isPending && <Loader2 className="animate-spin" />}Delete part</Button>
              </DialogFooter>
            </>
          ) : (
            <div className="grid gap-2">
              <Button variant="outline" asChild><Link to="/dashboard/add-part" search={{ id: selected.id }}><Pencil />Edit details and photos</Link></Button>
              {status === 'active' && <Button variant="outline" asChild><Link to="/parts/$partId" params={{ partId: selected.id }}><Eye />View live listing</Link></Button>}
              {status === 'draft' && <Button variant="outline" asChild><Link to="/dashboard/add-part" search={{ id: selected.id }}><Send />Review and publish</Link></Button>}
              {status === 'active' && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'sold' })}><CheckCircle2 />Mark as sold</Button>}
              {status === 'active' && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'draft' })}><Undo2 />Unpublish</Button>}
              {status === 'sold' && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'active' })}><Send />Relist</Button>}
              {['archived', 'pending', 'rejected'].includes(status) && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'draft' })}><Undo2 />Move to drafts</Button>}
              {status !== 'archived' && <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id!, action: 'archived' })}><Archive />Archive</Button>}
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 />Delete part</Button>
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* =============================================================== parts: editor */

type PartTextKey = keyof PartFormInput;

export function PartEditor({ partId }: { partId?: string | undefined }) {
  const uid = useUserId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { needsBusiness, business, businessId } = usePartsBusiness();
  const categories = useQuery({ queryKey: queryKeys.partCategories, queryFn: listPartCategories, staleTime: 60 * 60_000 });
  const existing = useQuery({ queryKey: queryKeys.myPart(partId ?? 'new'), queryFn: () => getMyPart(partId!), enabled: Boolean(partId && uid) });

  const [values, setValues] = useState<PartFormInput>(emptyPartForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const p = existing.data;
    if (p && loadedFor.current !== p.id) {
      loadedFor.current = p.id;
      setValues({
        title: p.title, categoryId: String(p.category_id), condition: p.condition, price: String(p.price), quantity: String(p.quantity),
        compatibility: p.compatibility_note ?? '', province: p.province, city: p.city, description: p.description ?? '',
      });
    }
  }, [existing.data]);

  const homeProvince = business.data?.business.province ?? (auth.status === 'signed-in' ? auth.account.profile.province : null) ?? '';
  const homeCity = business.data?.business.city ?? (auth.status === 'signed-in' ? auth.account.profile.city : null) ?? '';
  useEffect(() => {
    if (partId || (!homeProvince && !homeCity)) return;
    setValues((v) => (v.province && v.city ? v : { ...v, province: v.province || homeProvince, city: v.city || homeCity }));
  }, [partId, homeProvince, homeCity]);

  if (!partId && needsBusiness) {
    if (business.isPending) return <Spinner />;
    if (business.isError) return <ErrorState message="We couldn’t load your business profile." onRetry={() => void business.refetch()} />;
    if (!business.data) return <SetUpBusiness body="Your parts are listed under your business name, with your business phone number for buyers." />;
  }
  if (partId) {
    if (existing.isPending) return <Spinner />;
    if (existing.isError) return <ErrorState message="We couldn’t load this part." onRetry={() => void existing.refetch()} />;
    if (!existing.data) return <EmptyState title="Part not found" body="It may have been deleted, or it belongs to another account." />;
  }

  const set = (key: PartTextKey) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const choose = (key: PartTextKey) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = partFormSchema.safeParse(values);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); setStatus({ kind: 'error', text: 'Please fix the highlighted fields.' }); return; }
    setErrors({}); setStatus(null); setBusy(true);
    try {
      if (partId) {
        await updatePart(partId, parsed.data);
        await queryClient.invalidateQueries({ queryKey: queryKeys.myPart(partId) });
        setStatus({ kind: 'success', text: 'Changes saved.' });
      } else {
        const id = await createPart(parsed.data, { businessId });
        toast.success('Draft saved. Now add photos, then publish.');
        await navigate({ to: '/dashboard/add-part', search: { id }, replace: true });
      }
      if (uid) void queryClient.invalidateQueries({ queryKey: queryKeys.myParts(uid) });
    } catch (err) {
      setStatus({ kind: 'error', text: errorText(err, 'We couldn’t save this part.') });
    } finally {
      setBusy(false);
    }
  }

  const select = (key: PartTextKey, label: string, options: ReadonlyArray<readonly [string, string]>, placeholder: string) => (
    <Field label={label} error={errors[key]}>
      {(id) => (
        <Select value={values[key]} onValueChange={choose(key)}>
          <SelectTrigger id={id}><SelectValue placeholder={placeholder} /></SelectTrigger>
          <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </Field>
  );
  const categoryOptions = (categories.data ?? []).map((c) => [String(c.id), c.name] as const);

  const form = (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <Card title="Part details" description="Say exactly what it is — buyers search by part name and vehicle.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Part name" error={errors['title']}>{(id) => <Input id={id} value={values.title} onChange={set('title')} placeholder="e.g. Front brake pads (Toyota Corolla 2014–2019)" maxLength={120} />}</Field>
          {select('categoryId', 'Category', categoryOptions, categories.isPending ? 'Loading…' : 'Select category')}
          {select('condition', 'Condition', PART_CONDITIONS, 'Select condition')}
          <Field label="Price (ZMW)" error={errors['price']}>{(id) => <Input id={id} inputMode="decimal" value={values.price} onChange={set('price')} placeholder="2,850" />}</Field>
          <Field label="Quantity in stock" error={errors['quantity']}>{(id) => <Input id={id} inputMode="numeric" value={values.quantity} onChange={set('quantity')} placeholder="1" />}</Field>
          <Field label="Compatible vehicles (optional)" error={errors['compatibility']} hint="Make, model, years and part number if you have it">
            {(id) => <Input id={id} value={values.compatibility} onChange={set('compatibility')} placeholder="e.g. Toyota Corolla, Axio 2012–2019 · 04465-12610" maxLength={500} />}
          </Field>
        </div>
      </Card>
      <Card title="Location" description="Where buyers can collect the part.">
        <div className="grid gap-5 sm:grid-cols-2">
          {select('province', 'Province', PROVINCES, 'Select province')}
          <Field label="Town or city" error={errors['city']}>{(id) => <Input id={id} value={values.city} onChange={set('city')} placeholder="e.g. Lusaka" maxLength={80} />}</Field>
        </div>
      </Card>
      <Card title="Description">
        <Field label="Condition, warranty, delivery and anything a buyer should know (optional)" error={errors['description']}>
          {(id) => <Textarea id={id} rows={5} maxLength={3000} value={values.description} onChange={set('description')} placeholder="e.g. Genuine OEM, 3-month warranty. Delivery within Lusaka available." />}
        </Field>
      </Card>
      {status && <Status kind={status.kind}>{status.text}</Status>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{busy ? 'Saving…' : partId ? 'Save changes' : 'Save and continue to photos'}</Button>
        <Button type="button" variant="outline" asChild><Link to="/dashboard/parts">Cancel</Link></Button>
      </div>
    </form>
  );

  if (!partId || !existing.data) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {form}
        <section className="self-start rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Part photos</h2>
          <div className="mt-4 grid aspect-square place-items-center rounded-lg border border-dashed bg-muted/30 p-4 text-center">
            <div><ImagePlus className="mx-auto size-7 text-muted-foreground" /><b className="mt-2 block text-sm">Photos come next</b><p className="text-xs text-muted-foreground">Save the details first, then add up to {MAX_PART_PHOTOS} photos, including any part number labels.</p></div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="grid min-w-0 gap-6"><PartPhotos partId={partId} />{form}</div>
      <div className="self-start lg:sticky lg:top-24"><PartPublishPanel partId={partId} status={existing.data.listing_status} /></div>
    </div>
  );
}

function PartPublishPanel({ partId, status }: { partId: string; status: ListingStatus }) {
  const uid = useUserId();
  const queryClient = useQueryClient();
  const images = useQuery({ queryKey: queryKeys.partImages(partId), queryFn: () => listPartImages(partId) });
  const [error, setError] = useState<ReactNode>(null);
  const change = useMutation({
    mutationFn: (next: 'draft' | 'active' | 'sold' | 'archived') => setPartStatus(partId, next),
    onSuccess: async (_d, next) => {
      setError(null);
      toast.success(next === 'active' ? 'Your part is live.' : next === 'sold' ? 'Marked as sold.' : next === 'draft' ? 'Hidden from buyers.' : 'Part archived.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.myPart(partId) });
      if (uid) void queryClient.invalidateQueries({ queryKey: queryKeys.myParts(uid) });
    },
    onError: (e) => {
      const message = errorText(e, 'We couldn’t change this part.');
      setError(message.includes('phone number') ? <>{message} <Link to="/dashboard/profile" className="font-semibold underline">Add your phone number</Link></> : message);
    },
  });
  const photoCount = images.data?.length ?? 0;
  const publish = () => { if (photoCount === 0) { setError('Add at least one photo before publishing.'); return; } change.mutate('active'); };
  const underReview = status === 'pending' || status === 'rejected';
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Listing status</h2><Badge variant={status === 'active' ? 'default' : 'outline'}>{LISTING_STATUS_LABELS[status]}</Badge></div>
      <p className="mt-2 text-sm text-muted-foreground">
        {status === 'draft' && 'Only you can see this part. Publish it when the details and photos are ready.'}
        {status === 'active' && 'Buyers can find this part right now.'}
        {status === 'sold' && 'Buyers see this part as sold. Relist it if you have more.'}
        {status === 'archived' && 'Hidden from buyers. Move it back to drafts to edit and relist.'}
        {underReview && 'Caryandi is reviewing this part. You can move it back to drafts.'}
      </p>
      <div className="mt-4 grid gap-2">
        {status === 'draft' && <Button onClick={publish} disabled={change.isPending || images.isPending}>{change.isPending ? <Loader2 className="animate-spin" /> : <Send />}Publish part</Button>}
        {status === 'active' && <>
          <Button variant="outline" asChild><Link to="/parts/$partId" params={{ partId }}><Eye />View live listing</Link></Button>
          <Button variant="outline" onClick={() => change.mutate('sold')} disabled={change.isPending}><CheckCircle2 />Mark as sold</Button>
          <Button variant="ghost" onClick={() => change.mutate('draft')} disabled={change.isPending}><Undo2 />Unpublish</Button>
        </>}
        {status === 'sold' && <Button variant="outline" onClick={() => change.mutate('active')} disabled={change.isPending}><Send />Relist</Button>}
        {(status === 'archived' || underReview) && <Button variant="outline" onClick={() => change.mutate('draft')} disabled={change.isPending}><Undo2 />Move to drafts</Button>}
        {status !== 'archived' && status !== 'active' && <Button variant="ghost" onClick={() => change.mutate('archived')} disabled={change.isPending}><Archive />Archive</Button>}
        <Button variant="ghost" asChild><Link to="/dashboard/parts">Back to my parts</Link></Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {status === 'draft' && (
        <ul className="mt-4 space-y-1 border-t pt-4 text-xs text-muted-foreground">
          <li className={photoCount > 0 ? 'text-success' : ''}>{photoCount > 0 ? '✓' : '•'} At least one photo ({photoCount} added)</li>
          <li>• A phone number on your profile so buyers can reach you</li>
        </ul>
      )}
    </section>
  );
}

function PartPhotos({ partId }: { partId: string }) {
  const uid = useUserId();
  const queryClient = useQueryClient();
  const key = queryKeys.partImages(partId);
  const images = useQuery({ queryKey: key, queryFn: () => listPartImages(partId) });
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = images.data ?? [];
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: key }); if (uid) void queryClient.invalidateQueries({ queryKey: queryKeys.myParts(uid) }); };

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setProblems([]); setProgress({ done: 0, total: files.length });
    try {
      const result = await addPartPhotos(partId, files, setProgress);
      setProblems(result.errors);
      if (result.added) toast.success(`${result.added} photo${result.added === 1 ? '' : 's'} added`);
    } catch (err) {
      setProblems([errorText(err, 'The photos could not be uploaded.')]);
    } finally {
      setProgress(null);
      await refresh();
    }
  }

  async function act(image: PartImageRow, action: 'primary' | 'remove') {
    setBusyId(image.id);
    try {
      if (action === 'primary') await setPrimaryPartPhoto(partId, image.id); else await removePartPhoto(image, list);
    } catch (err) {
      toast.error(errorText(err, 'That didn’t work. Please try again.'));
    } finally {
      await refresh();
      setBusyId(null);
    }
  }

  const blocked = Boolean(progress) || list.length >= MAX_PART_PHOTOS || !images.isSuccess;
  return (
    <section className="rounded-lg border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Photos</h2><p className="mt-1 text-sm text-muted-foreground">{list.length} of {MAX_PART_PHOTOS}. Show the part from several sides and any part number label.</p></div>
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 ${blocked ? 'pointer-events-none opacity-60' : ''}`}>
          <ImagePlus className="size-4" />Add photos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void onFiles(e)} disabled={blocked} />
        </label>
      </div>
      {progress && <div className="mt-4" role="status"><p className="text-sm">Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}…</p><Progress className="mt-2" value={(progress.done / Math.max(1, progress.total)) * 100} /></div>}
      {problems.length > 0 && <ul role="alert" className="mt-4 space-y-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {images.isError && <p className="mt-4 text-sm text-destructive">We couldn’t load the photos. <button type="button" className="underline" onClick={() => void images.refetch()}>Try again</button></p>}
      {list.length === 0 && !images.isPending && !progress && (
        <div className="mt-4 grid place-items-center rounded-lg border border-dashed bg-muted/30 p-8 text-center"><div><Upload className="mx-auto size-7 text-muted-foreground" /><b className="mt-2 block text-sm">Add clear photos</b><p className="text-xs text-muted-foreground">Good light, plain background, part number visible</p></div></div>
      )}
      {list.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((img) => (
            <figure key={img.id} className="relative overflow-hidden rounded-md border">
              <PartPhoto path={img.storage_path} alt="Part photo" className="aspect-[4/3] w-full" />
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

/* =============================================================== parts: categories */

export function PartCategoriesOverview() {
  const uid = useUserId();
  const { needsBusiness, business, businessId } = usePartsBusiness();
  const ready = Boolean(uid) && (!needsBusiness || !business.isPending);
  const categories = useQuery({ queryKey: queryKeys.partCategories, queryFn: listPartCategories, staleTime: 60 * 60_000 });
  const parts = useQuery({ queryKey: [...queryKeys.myParts(uid ?? 'anon'), businessId], queryFn: () => listMyParts(businessId), enabled: ready });
  if (categories.isPending || parts.isPending) return <Spinner />;
  if (categories.isError || parts.isError) return <ErrorState message="We couldn’t load your categories." onRetry={() => { void categories.refetch(); void parts.refetch(); }} />;
  const counts = new Map<number, { live: number; total: number }>();
  for (const p of parts.data) {
    if (p.category_id == null) continue;
    const c = counts.get(p.category_id) ?? { live: 0, total: 0 };
    c.total += 1; if (p.listing_status === 'active') c.live += 1;
    counts.set(p.category_id, c);
  }
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Your live parts</TableHead><TableHead>All your parts</TableHead><TableHead className="text-right">Marketplace</TableHead></TableRow></TableHeader>
        <TableBody>
          {categories.data.map((c) => {
            const n = counts.get(c.id) ?? { live: 0, total: 0 };
            return (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{n.live}</TableCell>
                <TableCell>{n.total}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost" asChild><Link to="/parts" search={{ category: c.slug }}>Browse</Link></Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="border-t p-3 text-xs text-muted-foreground">Categories are set by Caryandi so buyers can filter consistently. Pick the closest one when you add a part.</p>
    </div>
  );
}

/* =============================================================== services (mechanics, servicing companies) */

export function ServicesManager() {
  const type = useAccountType();
  if (type === 'import_agent') {
    return (
      <Card title="Your services are set per route" description="Each import route lists the services you offer on it, such as sourcing, shipping, clearing and registration.">
        <div><Button asChild><Link to="/dashboard/routes">Manage routes and services</Link></Button></div>
      </Card>
    );
  }
  return <WithBusiness body="Add your business profile, then list the services you offer.">{(b) => <ServicesList business={b} />}</WithBusiness>;
}

function ServicesList({ business }: { business: MyBusiness }) {
  const queryClient = useQueryClient();
  const businessId = business.business.id;
  const key = queryKeys.myServices(businessId);
  const services = useQuery({ queryKey: key, queryFn: () => listMyServices(businessId) });
  const [editing, setEditing] = useState<ServiceRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ServiceRow | null>(null);
  const act = useMutation({
    mutationFn: async ({ row, action }: { row: ServiceRow; action: 'show' | 'hide' | 'delete' }) =>
      action === 'delete' ? deleteService(row.id) : setServiceActive(row.id, action === 'show'),
    onSuccess: (_d, { action }) => { toast.success(action === 'delete' ? 'Service deleted.' : action === 'show' ? 'Service shown on your profile.' : 'Service hidden from your profile.'); setDeleting(null); },
    onError: (e) => toast.error(errorText(e, 'We couldn’t update this service.')),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEditing('new')}><Plus />Add service</Button></div>
      {services.isPending ? <Spinner /> : services.isError ? <ErrorState message="We couldn’t load your services." onRetry={() => void services.refetch()} /> : services.data.length === 0 ? (
        <EmptyState title="No services yet" body="Add what you do and a starting price — e.g. Full service from K1,200. Customers compare these on your profile." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card"><div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Service</TableHead><TableHead>From</TableHead><TableHead>Time</TableHead><TableHead>Shown</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {services.data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><div className="min-w-48"><b className="block">{s.name}</b>{s.price_note && <span className="text-xs text-muted-foreground">{s.price_note}</span>}</div></TableCell>
                  <TableCell className="whitespace-nowrap">{s.price_from != null ? formatPrice(s.price_from) : 'On request'}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.duration_minutes != null ? `${formatNumber(s.duration_minutes)} min` : '—'}</TableCell>
                  <TableCell><Badge variant={s.is_active ? 'default' : 'outline'}>{s.is_active ? 'Shown' : 'Hidden'}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil /></Button>
                      <Button size="icon" variant="ghost" aria-label={s.is_active ? `Hide ${s.name}` : `Show ${s.name}`} disabled={act.isPending} onClick={() => act.mutate({ row: s, action: s.is_active ? 'hide' : 'show' })}>{s.is_active ? <EyeOff /> : <Eye />}</Button>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div></div>
      )}
      {editing && <ServiceDialog businessId={businessId} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDelete open={Boolean(deleting)} what={deleting?.name ?? 'this service'} busy={act.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && act.mutate({ row: deleting, action: 'delete' })} />
    </>
  );
}

function ConfirmDelete({ open, what, busy, onCancel, onConfirm }: { open: boolean; what: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete {what}?</DialogTitle><DialogDescription>It disappears from your public profile. To keep it for later, hide it instead.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={onCancel}>Keep it</Button><Button variant="destructive" disabled={busy} onClick={onConfirm}>{busy && <Loader2 className="animate-spin" />}Delete</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceDialog({ businessId, row, onClose }: { businessId: string; row: ServiceRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ServiceFormInput>(() => row ? {
    name: row.name, description: row.description ?? '', priceFrom: row.price_from != null ? String(row.price_from) : '', priceNote: row.price_note ?? '',
    durationMinutes: row.duration_minutes != null ? String(row.duration_minutes) : '',
  } : emptyServiceForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof ServiceFormInput) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = serviceFormSchema.safeParse(values);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({}); setError(null); setBusy(true);
    try {
      await saveService(businessId, parsed.data, row?.id);
      toast.success(row ? 'Service updated.' : 'Service added to your profile.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.myServices(businessId) });
      onClose();
    } catch (err) {
      setError(errorText(err, 'We couldn’t save this service.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{row ? 'Edit service' : 'Add a service'}</DialogTitle><DialogDescription>Customers see this on your profile. Leave the price empty if it depends on the vehicle.</DialogDescription></DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Service" error={errors['name']}>{(id) => <Input id={id} value={values.name} onChange={set('name')} placeholder="e.g. Full service" maxLength={120} />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price from (ZMW, optional)" error={errors['priceFrom']}>{(id) => <Input id={id} inputMode="decimal" value={values.priceFrom} onChange={set('priceFrom')} placeholder="1,200" />}</Field>
            <Field label="Usual time in minutes (optional)" error={errors['durationMinutes']}>{(id) => <Input id={id} inputMode="numeric" value={values.durationMinutes} onChange={set('durationMinutes')} placeholder="90" />}</Field>
          </div>
          <Field label="Price note (optional)" error={errors['priceNote']}>{(id) => <Input id={id} value={values.priceNote} onChange={set('priceNote')} placeholder="e.g. Labour only, parts extra" maxLength={120} />}</Field>
          <Field label="Description (optional)" error={errors['description']}>{(id) => <Textarea id={id} rows={3} value={values.description} onChange={set('description')} placeholder="What’s included" maxLength={2000} />}</Field>
          {error && <Status kind="error">{error}</Status>}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{row ? 'Save changes' : 'Add service'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =============================================================== import routes (agents) */

export function RoutesManager() {
  return <WithBusiness body="Add your business profile, then list the routes you import vehicles on.">{(b) => <RoutesList business={b} />}</WithBusiness>;
}

function RoutesList({ business }: { business: MyBusiness }) {
  const queryClient = useQueryClient();
  const businessId = business.business.id;
  const key = queryKeys.myRoutes(businessId);
  const routes = useQuery({ queryKey: key, queryFn: () => listMyRoutes(businessId) });
  const [editing, setEditing] = useState<ImportRouteRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ImportRouteRow | null>(null);
  const act = useMutation({
    mutationFn: async ({ row, action }: { row: ImportRouteRow; action: 'show' | 'hide' | 'delete' }) =>
      action === 'delete' ? deleteRoute(row.id) : setRouteActive(row.id, action === 'show'),
    onSuccess: (_d, { action }) => { toast.success(action === 'delete' ? 'Route deleted.' : action === 'show' ? 'Route shown on your profile.' : 'Route hidden from your profile.'); setDeleting(null); },
    onError: (e) => toast.error(errorText(e, 'We couldn’t update this route.')),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  if (business.business.business_type !== 'import_agent') {
    return <EmptyState title="Routes are for import agents" body="Import routes appear on import agent profiles. Your account type doesn’t use them." />;
  }
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEditing('new')}><Plus />Add route</Button></div>
      {routes.isPending ? <Spinner /> : routes.isError ? <ErrorState message="We couldn’t load your routes." onRetry={() => void routes.refetch()} /> : routes.data.length === 0 ? (
        <EmptyState title="No routes yet" body="Add each route you handle — for example Japan → Durban → Lusaka — with the services and starting price." />
      ) : (
        <div className="grid gap-3">
          {routes.data.map((r) => (
            <article key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><b>{routeLabel(r)}</b><p className="mt-1 text-sm text-muted-foreground">{r.price_from != null ? `From ${formatPrice(r.price_from)}` : 'Price on request'}{r.est_days_min != null || r.est_days_max != null ? ` · ${[r.est_days_min, r.est_days_max].filter((x) => x != null).join('–')} days` : ''}</p></div>
                <div className="flex items-center gap-1">
                  <Badge variant={r.is_active ? 'default' : 'outline'}>{r.is_active ? 'Shown' : 'Hidden'}</Badge>
                  <Button size="icon" variant="ghost" aria-label="Edit route" onClick={() => setEditing(r)}><Pencil /></Button>
                  <Button size="icon" variant="ghost" aria-label={r.is_active ? 'Hide route' : 'Show route'} disabled={act.isPending} onClick={() => act.mutate({ row: r, action: r.is_active ? 'hide' : 'show' })}>{r.is_active ? <EyeOff /> : <Eye />}</Button>
                  <Button size="icon" variant="ghost" className="text-destructive" aria-label="Delete route" onClick={() => setDeleting(r)}><Trash2 /></Button>
                </div>
              </div>
              {r.services.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{r.services.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>}
            </article>
          ))}
        </div>
      )}
      {editing && <RouteDialog businessId={businessId} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDelete open={Boolean(deleting)} what={deleting ? routeLabel(deleting) : 'this route'} busy={act.isPending} onCancel={() => setDeleting(null)} onConfirm={() => deleting && act.mutate({ row: deleting, action: 'delete' })} />
    </>
  );
}

function RouteDialog({ businessId, row, onClose }: { businessId: string; row: ImportRouteRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<RouteFormInput>(() => row ? {
    originCountry: row.origin_country, transitPort: row.transit_port ?? '', destinationCity: row.destination_city, services: row.services,
    priceFrom: row.price_from != null ? String(row.price_from) : '', priceNote: row.price_note ?? '',
    estDaysMin: row.est_days_min != null ? String(row.est_days_min) : '', estDaysMax: row.est_days_max != null ? String(row.est_days_max) : '', notes: row.notes ?? '',
  } : emptyRouteForm);
  const [custom, setCustom] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  type RouteTextKey = Exclude<keyof RouteFormInput, 'services'>;
  const set = (key: RouteTextKey) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const toggle = (s: string, on: boolean) => setValues((v) => ({ ...v, services: on ? [...v.services.filter((x) => x !== s), s] : v.services.filter((x) => x !== s) }));
  const addCustom = () => { const s = custom.trim().slice(0, 60); if (s.length >= 2) { toggle(s, true); setCustom(''); } };
  const options = [...ROUTE_SERVICE_SUGGESTIONS, ...values.services.filter((s) => !(ROUTE_SERVICE_SUGGESTIONS as readonly string[]).includes(s))];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = routeFormSchema.safeParse(values);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({}); setError(null); setBusy(true);
    try {
      await saveRoute(businessId, parsed.data, row?.id);
      toast.success(row ? 'Route updated.' : 'Route added to your profile.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.myRoutes(businessId) });
      onClose();
    } catch (err) {
      setError(errorText(err, 'We couldn’t save this route.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{row ? 'Edit route' : 'Add a route'}</DialogTitle><DialogDescription>Any origin, transit port and destination — enter them as your customers know them.</DialogDescription></DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="From (country)" error={errors['originCountry']}>{(id) => <Input id={id} value={values.originCountry} onChange={set('originCountry')} placeholder="e.g. Japan" maxLength={60} />}</Field>
            <Field label="Via port (optional)" error={errors['transitPort']}>{(id) => <Input id={id} value={values.transitPort} onChange={set('transitPort')} placeholder="e.g. Durban" maxLength={80} />}</Field>
            <Field label="To (town in Zambia)" error={errors['destinationCity']}>{(id) => <Input id={id} value={values.destinationCity} onChange={set('destinationCity')} placeholder="e.g. Lusaka" maxLength={80} />}</Field>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Services on this route</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {options.map((s) => {
                const id = `route-service-${s.replace(/\W+/g, '-')}`;
                return <label key={s} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox id={id} checked={values.services.includes(s)} onCheckedChange={(c) => toggle(s, c === true)} />{s}</label>;
              })}
            </div>
            <div className="mt-3 flex gap-2"><Input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} placeholder="Add another service" maxLength={60} aria-label="Add another service" /><Button type="button" variant="outline" onClick={addCustom}>Add</Button></div>
            {errors['services'] && <p className="mt-2 text-xs text-destructive">{errors['services']}</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Price from (ZMW, optional)" error={errors['priceFrom']}>{(id) => <Input id={id} inputMode="decimal" value={values.priceFrom} onChange={set('priceFrom')} placeholder="18,000" />}</Field>
            <Field label="Min days (optional)" error={errors['estDaysMin']}>{(id) => <Input id={id} inputMode="numeric" value={values.estDaysMin} onChange={set('estDaysMin')} placeholder="35" />}</Field>
            <Field label="Max days (optional)" error={errors['estDaysMax']}>{(id) => <Input id={id} inputMode="numeric" value={values.estDaysMax} onChange={set('estDaysMax')} placeholder="60" />}</Field>
          </div>
          <Field label="Price note (optional)" error={errors['priceNote']}>{(id) => <Input id={id} value={values.priceNote} onChange={set('priceNote')} placeholder="e.g. Agent fee only, duty paid separately" maxLength={120} />}</Field>
          <Field label="Notes (optional)" error={errors['notes']}>{(id) => <Textarea id={id} rows={3} value={values.notes} onChange={set('notes')} placeholder="What customers should know about this route" maxLength={2000} />}</Field>
          {error && <Status kind="error">{error}</Status>}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{row ? 'Save changes' : 'Add route'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =============================================================== availability & pricing */

const EMPTY_HOURS: OpeningHours = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
const DEFAULT_DAY = { open: '08:00', close: '17:00' };

function canManage(b: MyBusiness) { return b.role === 'owner' || b.role === 'manager'; }

export function AvailabilityEditor() {
  return <WithBusiness body="Add your business profile, then set your opening hours.">{(b) => <AvailabilityForm key={b.business.id} business={b} />}</WithBusiness>;
}

function AvailabilityForm({ business }: { business: MyBusiness }) {
  const queryClient = useQueryClient();
  const uid = useUserId();
  const b = business.business;
  const [hours, setHours] = useState<OpeningHours>(() => parseOpeningHours(b.opening_hours) ?? EMPTY_HOURS);
  const [mobile, setMobile] = useState(b.is_mobile_service);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = canManage(business);
  const setDay = (day: keyof OpeningHours, value: OpeningHours[keyof OpeningHours]) => setHours((h) => ({ ...h, [day]: value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const problems = validateOpeningHours(hours);
    setErrors(problems);
    if (Object.keys(problems).length) { setStatus({ kind: 'error', text: 'Please fix the highlighted days.' }); return; }
    setBusy(true); setStatus(null);
    try {
      await saveAvailability(b.id, { openingHours: hours, isMobileService: mobile, priceFrom: b.price_from, priceNote: b.price_note });
      if (uid) await queryClient.invalidateQueries({ queryKey: queryKeys.myBusiness(uid) });
      setStatus({ kind: 'success', text: 'Availability saved. It now shows on your profile.' });
    } catch (err) {
      setStatus({ kind: 'error', text: errorText(err, 'We couldn’t save your availability.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-6">
      <Card title="Opening hours" description="Zambian time. Customers see whether you’re open now.">
        <div className="grid gap-3">
          {DAYS.map(([day, label]) => {
            const h = hours[day];
            return (
              <div key={day} className="grid items-center gap-2 border-b pb-3 last:border-0 sm:grid-cols-[140px_auto_1fr]">
                <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={Boolean(h)} disabled={!editable} onCheckedChange={(c) => setDay(day, c === true ? (h ?? DEFAULT_DAY) : null)} />{label}</label>
                {h ? (
                  <div className="flex items-center gap-2">
                    <Input type="time" aria-label={`${label} opening time`} className="w-32" value={h.open} disabled={!editable} onChange={(e) => setDay(day, { ...h, open: e.target.value })} />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input type="time" aria-label={`${label} closing time`} className="w-32" value={h.close} disabled={!editable} onChange={(e) => setDay(day, { ...h, close: e.target.value })} />
                  </div>
                ) : <span className="text-sm text-muted-foreground">Closed</span>}
                {errors[day] && <p className="text-xs text-destructive sm:col-span-3">{errors[day]}</p>}
              </div>
            );
          })}
        </div>
      </Card>
      {b.business_type !== 'import_agent' && (
        <Card title="Mobile service">
          <label className="flex items-start gap-3 text-sm"><Checkbox checked={mobile} disabled={!editable} onCheckedChange={(c) => setMobile(c === true)} className="mt-0.5" /><span><b>I can come to the customer</b><span className="block text-muted-foreground">Your profile shows “Comes to you”, and customers can filter for it.</span></span></label>
        </Card>
      )}
      {!editable && <p className="text-sm text-muted-foreground">Only the business owner or a manager can change these settings.</p>}
      {status && <Status kind={status.kind}>{status.text}</Status>}
      {editable && <div><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save availability</Button></div>}
    </form>
  );
}

export function PricingPanel() {
  return <WithBusiness body="Add your business profile, then set your prices.">{(b) => <PricingForm key={b.business.id} business={b} />}</WithBusiness>;
}

function PricingForm({ business }: { business: MyBusiness }) {
  const queryClient = useQueryClient();
  const uid = useUserId();
  const b = business.business;
  const isAgent = b.business_type === 'import_agent';
  const [priceFrom, setPriceFrom] = useState(b.price_from != null ? String(b.price_from) : '');
  const [priceNote, setPriceNote] = useState(b.price_note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = canManage(business);
  const items = useQuery({
    queryKey: ['pricing-items', b.id, isAgent] as const,
    queryFn: async (): Promise<Array<{ id: string; label: string; price: number | null; note: string | null; active: boolean }>> => isAgent
      ? (await listMyRoutes(b.id)).map((r) => ({ id: r.id, label: routeLabel(r), price: r.price_from, note: r.price_note, active: r.is_active }))
      : (await listMyServices(b.id)).map((s) => ({ id: s.id, label: s.name, price: s.price_from, note: s.price_note, active: s.is_active })),
  });
  const rows = items.data;

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = priceFrom.trim();
    const amount = trimmed ? parseMoney(trimmed) : null;
    if (trimmed && (amount === null || amount < 0 || amount > 5_000_000)) { setError('Enter an amount in kwacha, e.g. 450'); return; }
    if (priceNote.trim().length > 120) { setError('Keep the note under 120 characters'); return; }
    setError(null); setBusy(true); setStatus(null);
    try {
      await saveAvailability(b.id, { openingHours: parseOpeningHours(b.opening_hours), isMobileService: b.is_mobile_service, priceFrom: amount, priceNote: priceNote.trim() || null });
      if (uid) await queryClient.invalidateQueries({ queryKey: queryKeys.myBusiness(uid) });
      setStatus({ kind: 'success', text: 'Starting price saved.' });
    } catch (err) {
      setStatus({ kind: 'error', text: errorText(err, 'We couldn’t save your pricing.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={save}>
        <Card title="Starting price" description={`Shown on your directory card. Leave it empty to use your lowest ${isAgent ? 'route' : 'service'} price.`}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="From (ZMW, optional)" error={error ?? undefined}>{(id) => <Input id={id} inputMode="decimal" value={priceFrom} disabled={!editable} onChange={(e) => setPriceFrom(e.target.value)} placeholder={isAgent ? '15,000' : '450'} />}</Field>
            <Field label="Note (optional)">{(id) => <Input id={id} value={priceNote} disabled={!editable} onChange={(e) => setPriceNote(e.target.value)} placeholder={isAgent ? 'e.g. Agent fee, excluding duty' : 'e.g. Consultation fee'} maxLength={120} />}</Field>
          </div>
          {!editable && <p className="text-sm text-muted-foreground">Only the business owner or a manager can change the starting price.</p>}
          {status && <Status kind={status.kind}>{status.text}</Status>}
          {editable && <div><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save starting price</Button></div>}
        </Card>
      </form>
      <Card title={isAgent ? 'Route prices' : 'Service prices'} description={`Edit each price on the ${isAgent ? 'Routes' : 'Services'} page.`}>
        {items.isPending ? <Spinner /> : items.isError || !rows ? <ErrorState message="We couldn’t load your prices." onRetry={() => void items.refetch()} /> : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing listed yet.</p>
        ) : (
          <div className="grid gap-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0">
                <span className="min-w-0"><b className="block truncate">{r.label}</b>{r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}</span>
                <span className="shrink-0 font-semibold">{r.price != null ? formatPrice(r.price) : 'On request'}{!r.active && <Badge variant="outline" className="ml-2">Hidden</Badge>}</span>
              </div>
            ))}
          </div>
        )}
        <div><Button variant="outline" asChild><Link to={isAgent ? '/dashboard/routes' : '/dashboard/services'}>{isAgent ? 'Manage routes' : 'Manage services'}</Link></Button></div>
      </Card>
    </div>
  );
}
