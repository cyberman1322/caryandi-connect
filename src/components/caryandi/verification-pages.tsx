import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Clock, ExternalLink, FileText, Loader2, ShieldAlert, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-context';
import { ACCOUNT_TYPE_LABELS, isBusinessAccount } from '@/lib/auth/account-types';
import { BUSINESS_TYPE_LABELS, type MyBusiness } from '@/lib/business/business-service';
import { useMyBusiness, useUserId } from '@/lib/marketplace/hooks';
import { listMyVehicles, type VehicleCardData } from '@/lib/vehicles/vehicle-service';
import { DUTY_STATUSES, IMPORT_STATUSES, REGISTRATION_STATUSES, formatDate, labelOf, vehicleTitle } from '@/lib/vehicles/vehicle-options';
import {
  MAX_VERIFICATION_DOCUMENTS, VERIFICATION_DOCUMENT_LABELS, VERIFICATION_STATUS_LABELS, checkVerificationDocument,
  getVerificationFiles, listMyVerificationRequests, listVerificationQueue, reviewVerification, submitVerification,
  verificationSubjectLabel, type SubmitVerificationInput, type VerificationDocumentType, type VerificationRequest,
  type VerificationStatus,
} from '@/lib/verification/verification-service';
import { SelfieCapture, SelfieReviewNote, type CapturedSelfie } from './selfie-capture';
import { Card, Status } from './account-forms';
import { EmptyState, ErrorState } from './states';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

const verificationKeys = {
  mine: (uid: string) => ['verifications', 'mine', uid] as const,
  queue: (status: string) => ['verifications', 'queue', status] as const,
  files: (id: string) => ['verifications', 'files', id] as const,
};

function StatusBadge({ status }: { status: VerificationStatus | null | undefined }) {
  const s = status ?? 'unverified';
  const icon = s === 'approved' ? <BadgeCheck className="size-3.5" /> : s === 'pending' ? <Clock className="size-3.5" /> : s === 'rejected' ? <XCircle className="size-3.5" /> : null;
  const tone = s === 'approved' ? 'bg-success/10 text-success border-success/30' : s === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/30' : '';
  return <Badge variant="outline" className={`shrink-0 gap-1 ${tone}`}>{icon}{VERIFICATION_STATUS_LABELS[s]}</Badge>;
}

function Loading() {
  return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</div>;
}

/* =============================================================== seller side */

/** /dashboard/verification — businesses verify once, private sellers verify each car. */
export function SellerVerification() {
  const auth = useAuth();
  if (auth.status !== 'signed-in') return null;
  const type = auth.account.profile.account_type;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 content-start gap-6">
        {type === 'buyer' || type === 'admin'
          ? <Card title="Verification is for sellers" description="Buyers don’t need to verify. If you want to sell a car, switch to a private seller account from Add vehicle.">
              <Button asChild variant="outline"><Link to="/vehicles">Browse vehicles</Link></Button>
            </Card>
          : isBusinessAccount(type) ? <BusinessVerification /> : <PrivateSellerVerification />}
        <MyRequestHistory />
      </div>
      <aside className="grid content-start gap-4">
        <Card title="How verification works">
          <ul className="grid gap-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />Verification is optional, but verified listings show a badge buyers trust.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />Businesses verify once. The badge then appears on every vehicle the business lists.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />Private sellers verify each car separately.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />Your selfie and documents are private. Only Caryandi reviewers can see them.</li>
          </ul>
        </Card>
        <SelfieReviewNote />
      </aside>
    </div>
  );
}

function useMyRequests() {
  const uid = useUserId();
  return useQuery({ queryKey: verificationKeys.mine(uid ?? 'anon'), queryFn: listMyVerificationRequests, enabled: Boolean(uid) });
}

function BusinessVerification() {
  const business = useMyBusiness();
  const requests = useMyRequests();
  if (business.isPending) return <Loading />;
  if (business.isError) return <ErrorState message="We couldn’t load your business profile." onRetry={() => void business.refetch()} />;
  if (!business.data) {
    return (
      <Card title="Set up your business profile first" description="Verification applies to your business, so it needs a business profile.">
        <Button asChild><Link to="/dashboard/profile">Set up business profile</Link></Button>
      </Card>
    );
  }
  const b = business.data.business;
  const lastRejection = (requests.data ?? []).find((r) => r.subject === 'business' && r.business_id === b.id && r.status === 'rejected');
  const status = b.verification_status as VerificationStatus;

  return (
    <Card title={`Verify ${b.name}`} description={`${BUSINESS_TYPE_LABELS[b.business_type]} · one approval covers every listing under this business.`}>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={status} />{b.verified_at && status === 'approved' && <span className="text-sm text-muted-foreground">since {formatDate(b.verified_at)}</span>}</div>
      {status === 'approved' && <p className="mt-3 text-sm text-muted-foreground">Your business is verified. Every vehicle listed under it shows the verified badge.</p>}
      {status === 'pending' && <p className="mt-3 text-sm text-muted-foreground">Your request is with our review team. We’ll notify you as soon as it’s decided.</p>}
      {(status === 'unverified' || status === 'rejected') && (
        business.data.role === 'staff'
          ? <p className="mt-3 text-sm text-muted-foreground">Only the business owner or a manager can request verification.</p>
          : <>
              {status === 'rejected' && lastRejection?.review_notes && <div className="mt-3"><Status kind="error">Previous request not approved: {lastRejection.review_notes}</Status></div>}
              <div className="mt-5"><BusinessSubmit business={business.data} /></div>
            </>
      )}
    </Card>
  );
}

function BusinessSubmit({ business }: { business: MyBusiness }) {
  const uid = useUserId();
  const cars = useQuery({
    queryKey: ['verifications', 'business-cars', business.business.id],
    queryFn: () => listMyVehicles(business.business.id),
    enabled: Boolean(uid),
  });
  const [vehicleId, setVehicleId] = useState<string>('none');
  const own = (cars.data ?? []).filter((c) => c.business_id === business.business.id && c.id);
  const isDealer = business.business.business_type === 'dealer';
  return (
    <SubmitPanel
      target={{ subject: 'business', businessId: business.business.id, vehicleId: vehicleId === 'none' ? null : vehicleId }}
      suggestedDocs={['business_registration', 'national_id', 'tax_certificate']}
      intro={isDealer
        ? 'Take a selfie, add your PACRA business registration and, ideally, pick one of your cars for the reviewer to check.'
        : 'Take a selfie and add your PACRA business registration so our team can confirm the business is real.'}
    >
      {own.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="verify-car">Car used for verification {isDealer ? '(recommended)' : '(optional)'}</Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger id="verify-car"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No specific car</SelectItem>
              {own.map((c) => <SelectItem key={c.id} value={c.id!}>{vehicleTitle(c)} · {labelOf(REGISTRATION_STATUSES, c.registration_status)} · {labelOf(DUTY_STATUSES, c.duty_status)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </SubmitPanel>
  );
}

type CarState = { car: VehicleCardData; status: VerificationStatus; lastNotes: string | null };

function PrivateSellerVerification() {
  const uid = useUserId();
  const cars = useQuery({ queryKey: ['verifications', 'my-cars', uid ?? 'anon'], queryFn: () => listMyVehicles(null), enabled: Boolean(uid) });
  const requests = useMyRequests();
  const [open, setOpen] = useState<string | null>(null);

  if (cars.isPending || requests.isPending) return <Loading />;
  if (cars.isError || requests.isError) {
    return <ErrorState message="We couldn’t load your cars." onRetry={() => { void cars.refetch(); void requests.refetch(); }} />;
  }
  const states: CarState[] = (cars.data ?? [])
    .filter((c) => c.id && !c.business_id && c.listing_status !== 'archived')
    .map((car) => {
      const latest = (requests.data ?? []).find((r) => r.vehicle_id === car.id && r.subject === 'vehicle');
      const status: VerificationStatus = car.is_verified ? 'approved' : ((latest?.status as VerificationStatus | undefined) ?? 'unverified');
      return { car, status, lastNotes: latest?.status === 'rejected' ? latest.review_notes : null };
    });

  if (!states.length) {
    return (
      <Card title="Verify your cars" description="Private sellers verify each car separately.">
        <p className="text-sm text-muted-foreground">Add a car first. You can verify it once it’s saved.</p>
        <Button asChild className="mt-4"><Link to="/dashboard/add-vehicle">Add a vehicle</Link></Button>
      </Card>
    );
  }

  return (
    <Card title="Verify your cars" description="Each car is verified on its own. Verified cars show a badge on their listing.">
      <ul className="grid gap-3">
        {states.map(({ car, status, lastNotes }) => (
          <li key={car.id} className="rounded-lg border p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <b className="block truncate">{vehicleTitle(car)}</b>
                <p className="mt-1 text-sm text-muted-foreground">
                  {labelOf(REGISTRATION_STATUSES, car.registration_status)} · {labelOf(DUTY_STATUSES, car.duty_status)} · {labelOf(IMPORT_STATUSES, car.import_status)}
                </p>
              </div>
              <StatusBadge status={status} />
            </div>
            {lastNotes && <p className="mt-2 text-sm text-destructive">Not approved: {lastNotes}</p>}
            {(status === 'unverified' || status === 'rejected') && open !== car.id && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(car.id!)}>
                {status === 'rejected' ? 'Try again' : 'Verify this car'}
              </Button>
            )}
            {open === car.id && (
              <div className="mt-4 border-t pt-4">
                <SubmitPanel
                  target={{ subject: 'vehicle', vehicleId: car.id! }}
                  suggestedDocs={['national_id', 'passport', 'other']}
                  intro="Take a selfie and add your NRC or passport. The name should match the car’s registration or import papers."
                  onDone={() => setOpen(null)}
                  onCancel={() => setOpen(null)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

type DocDraft = { key: string; type: VerificationDocumentType; file: File };

function SubmitPanel({ target, suggestedDocs, intro, children, onDone, onCancel }: {
  target: SubmitVerificationInput;
  suggestedDocs: VerificationDocumentType[];
  intro: string;
  children?: ReactNode;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [selfie, setSelfie] = useState<CapturedSelfie | null>(null);
  const [docs, setDocs] = useState<DocDraft[]>([]);
  const [docType, setDocType] = useState<VerificationDocumentType>(suggestedDocs[0] ?? 'national_id');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addDoc = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkVerificationDocument(file);
    if (problem) { setError(problem); return; }
    if (docs.length >= MAX_VERIFICATION_DOCUMENTS) { setError(`Attach at most ${MAX_VERIFICATION_DOCUMENTS} documents.`); return; }
    setError(null);
    setDocs((d) => [...d, { key: crypto.randomUUID(), type: docType, file }]);
  };

  const submit = async () => {
    if (!selfie) { setError('Take your selfie first.'); return; }
    setBusy(true); setError(null);
    try {
      await submitVerification(target, selfie, docs.map(({ type, file }) => ({ type, file })), notes);
      toast.success('Verification submitted. We’ll notify you when it’s reviewed.');
      onDone?.();
    } catch (e) {
      setError(errorText(e, 'We couldn’t submit your verification.'));
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ['verifications'] });
      await queryClient.invalidateQueries({ queryKey: ['my-business'] });
      await queryClient.invalidateQueries({ queryKey: ['my-vehicles'] });
    }
  };

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">{intro}</p>
      {children}
      <SelfieCapture onChange={setSelfie} disabled={busy} />
      <div className="grid gap-3">
        <Label>Supporting documents (optional, up to {MAX_VERIFICATION_DOCUMENTS})</Label>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Select value={docType} onValueChange={(v) => setDocType(v as VerificationDocumentType)}>
            <SelectTrigger aria-label="Document type"><SelectValue /></SelectTrigger>
            <SelectContent>{suggestedDocs.map((t) => <SelectItem key={t} value={t}>{VERIFICATION_DOCUMENT_LABELS[t]}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" asChild disabled={busy || docs.length >= MAX_VERIFICATION_DOCUMENTS}>
            <label className="cursor-pointer"><FileText />Add document<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={addDoc} disabled={busy} /></label>
          </Button>
        </div>
        {docs.length > 0 && (
          <ul className="grid gap-2">
            {docs.map((d) => (
              <li key={d.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="min-w-0 truncate"><b>{VERIFICATION_DOCUMENT_LABELS[d.type]}</b> · {d.file.name}</span>
                <Button variant="ghost" size="icon" aria-label={`Remove ${d.file.name}`} disabled={busy} onClick={() => setDocs((all) => all.filter((x) => x.key !== d.key))}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">PDF or photo. Photos are shrunk and their location data removed before upload.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="verify-notes">Note for the reviewer (optional)</Label>
        <Textarea id="verify-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} placeholder="Anything that helps us check, e.g. the car is registered in my spouse’s name." />
      </div>
      {error && <Status kind="error">{error}</Status>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void submit()} disabled={busy || !selfie}>{busy && <Loader2 className="animate-spin" />}{busy ? 'Submitting…' : 'Submit for review'}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>}
      </div>
    </div>
  );
}

function MyRequestHistory() {
  const requests = useMyRequests();
  if (!requests.data?.length) return null;
  return (
    <Card title="Your verification requests">
      <ul className="grid gap-2">
        {requests.data.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b py-3 last:border-0">
            <div className="min-w-0">
              <b className="block truncate text-sm">{verificationSubjectLabel(r)}</b>
              <p className="text-xs text-muted-foreground">Submitted {r.created_at ? formatDate(r.created_at) : ''}{r.reviewed_at ? ` · decided ${formatDate(r.reviewed_at)}` : ''}</p>
              {r.review_notes && <p className="mt-1 text-sm text-muted-foreground">{r.review_notes}</p>}
            </div>
            <StatusBadge status={r.status as VerificationStatus} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* =============================================================== admin side */

const QUEUE_TABS: Array<['pending' | 'approved' | 'rejected', string]> = [['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Not approved']];

/** /admin/verifications — the approval queue. Decisions go through admin_review_verification (audited, notifies the seller). */
export function AdminVerifications() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queue = useQuery({ queryKey: verificationKeys.queue(tab), queryFn: () => listVerificationQueue(tab) });
  const selected = queue.data?.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap gap-2 border-b p-3">
          {QUEUE_TABS.map(([value, label]) => (
            <Button key={value} size="sm" variant={tab === value ? 'secondary' : 'ghost'} onClick={() => { setTab(value); setSelectedId(null); }}>{label}</Button>
          ))}
        </div>
        {queue.isPending ? <div className="p-5"><Loading /></div>
          : queue.isError ? <ErrorState message="We couldn’t load the queue." onRetry={() => void queue.refetch()} />
          : !queue.data.length ? <EmptyState title={tab === 'pending' ? 'Nothing waiting' : 'No requests yet'} body={tab === 'pending' ? 'New verification requests appear here.' : 'Decided requests appear here.'} />
          : (
            <ul>
              {queue.data.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelectedId(r.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-accent/50 ${selectedId === r.id ? 'bg-accent' : ''}`}>
                    <div className="min-w-0">
                      <b className="block truncate text-sm">{verificationSubjectLabel(r)}</b>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.subject === 'business' ? 'Business' : 'Private car'} · {r.requester_name} · {r.created_at ? formatDate(r.created_at) : ''} · {r.document_count ?? 0} document{r.document_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <StatusBadge status={r.status as VerificationStatus} />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>
      <div className="min-w-0">
        {selected ? <ReviewPanel key={selected.id} request={selected} onDecided={() => setSelectedId(null)} /> : (
          <div className="grid min-h-64 place-items-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Select a request to review its selfie and documents.</div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-1.5 text-sm"><span className="text-muted-foreground">{label}</span><span className="min-w-0 break-words">{children}</span></div>;
}

function ReviewPanel({ request: r, onDecided }: { request: VerificationRequest; onDecided: () => void }) {
  const queryClient = useQueryClient();
  const files = useQuery({ queryKey: verificationKeys.files(r.id ?? ''), queryFn: () => getVerificationFiles(r), staleTime: 4 * 60_000 });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = r.status === 'pending';

  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(decision); setError(null);
    try {
      await reviewVerification(r.id!, decision, notes);
      toast.success(decision === 'approved' ? 'Approved. The seller has been notified.' : 'Marked as not approved. The seller has been notified.');
      await queryClient.invalidateQueries({ queryKey: ['verifications'] });
      onDecided();
    } catch (e) {
      setError(errorText(e, 'We couldn’t save that decision.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><h2 className="truncate text-lg font-semibold">{verificationSubjectLabel(r)}</h2><p className="text-sm text-muted-foreground">{r.subject === 'business' ? 'Business verification (covers all its listings)' : 'Private seller, this car only'}</p></div>
        <StatusBadge status={r.status as VerificationStatus} />
      </div>
      <div className="mt-4 divide-y">
        <Row label="Requested by">{r.requester_name} · {r.requester_account_type ? ACCOUNT_TYPE_LABELS[r.requester_account_type] : ''}</Row>
        {r.subject === 'business' && <Row label="Business">{r.business_name}{r.business_type ? ` · ${BUSINESS_TYPE_LABELS[r.business_type]}` : ''}</Row>}
        {r.vehicle_id && (
          <Row label={r.subject === 'business' ? 'Car shown' : 'Car'}>
            <Link to="/vehicles/$vehicleId" params={{ vehicleId: r.vehicle_id }} className="inline-flex items-center gap-1 text-primary hover:underline">
              {[r.vehicle_year, r.vehicle_make, r.vehicle_model, r.vehicle_variant].filter(Boolean).join(' ')}<ExternalLink className="size-3.5" />
            </Link>
            <span className="block text-muted-foreground">{labelOf(REGISTRATION_STATUSES, r.vehicle_registration_status)} · {labelOf(DUTY_STATUSES, r.vehicle_duty_status)} · {labelOf(IMPORT_STATUSES, r.vehicle_import_status)}</span>
          </Row>
        )}
        <Row label="Submitted">{r.created_at ? formatDate(r.created_at) : '—'}{r.selfie_captured_at ? ` · selfie taken ${formatDate(r.selfie_captured_at)}` : ''}</Row>
        {r.requester_notes && <Row label="Seller’s note">{r.requester_notes}</Row>}
        {!pending && <Row label="Decision">{VERIFICATION_STATUS_LABELS[(r.status ?? 'pending') as VerificationStatus]}{r.reviewer_name ? ` by ${r.reviewer_name}` : ''}{r.reviewed_at ? ` · ${formatDate(r.reviewed_at)}` : ''}{r.review_notes ? `. ${r.review_notes}` : ''}</Row>}
      </div>

      <div className="mt-5 grid gap-3">
        <b className="text-sm">In-app selfie</b>
        {files.isPending ? <Loading /> : files.isError ? <p className="text-sm text-destructive">Couldn’t load the files.</p> : files.data.selfieUrl
          ? <a href={files.data.selfieUrl} target="_blank" rel="noreferrer noopener"><img src={files.data.selfieUrl} alt="Seller’s in-app selfie" className="aspect-[4/3] w-full rounded-md border object-cover" /></a>
          : <p className="text-sm text-destructive">The selfie file is missing. Don’t approve this request.</p>}
        {files.data && (files.data.documents.length ? (
          <ul className="grid gap-2">
            {files.data.documents.map((d) => (
              <li key={d.id}>{d.url
                ? <a href={d.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><FileText className="size-4" />{VERIFICATION_DOCUMENT_LABELS[d.type]}</a>
                : <span className="text-sm text-muted-foreground">{VERIFICATION_DOCUMENT_LABELS[d.type]} (unavailable)</span>}</li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No supporting documents attached.</p>)}
        <p className="text-xs text-muted-foreground">Links expire after 5 minutes. Check the face matches the documents and the name matches the car’s papers.</p>
      </div>

      {pending && (
        <div className="mt-5 grid gap-3 border-t pt-5">
          <Label htmlFor="review-notes">Note to the seller (required when not approving)</Label>
          <Textarea id="review-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy !== null} placeholder="e.g. The NRC photo is blurry. Please retake it in good light." />
          {error && <Status kind="error">{error}</Status>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void decide('approved')} disabled={busy !== null || !files.data?.selfieUrl}>{busy === 'approved' ? <Loader2 className="animate-spin" /> : <BadgeCheck />}Approve</Button>
            <Button variant="outline" onClick={() => void decide('rejected')} disabled={busy !== null}>{busy === 'rejected' ? <Loader2 className="animate-spin" /> : <ShieldAlert />}Not approved</Button>
          </div>
        </div>
      )}
    </section>
  );
}
