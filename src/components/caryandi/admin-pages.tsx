import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, BarChart3, Car, Eye, FileText, Loader2, Pencil, Plus, Search, ShieldCheck, Star, Trash2, Users, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ACCOUNT_TYPE_LABELS } from '@/lib/auth/account-types';
import { BUSINESS_TYPE_LABELS } from '@/lib/business/business-service';
import { REPORT_CATEGORIES, timeAgo } from '@/lib/marketplace/engagement-service';
import { listVerificationQueue, verificationSubjectLabel } from '@/lib/verification/verification-service';
import { LISTING_STATUS_LABELS, PROVINCES, formatDate, formatPrice, labelOf } from '@/lib/vehicles/vehicle-options';
import {
  ARTICLE_CATEGORIES, deleteArticle, getPlatformStats, getScamDetails, listArticles, listAuditFeed, listBusinesses, listListings, listReports,
  listReviews, listUsers, moderateReview, saveArticle, setAccountStatus, setBusinessActive, setListingStatus, slugify, updateReport,
  validateArticle, type AccountStatus, type AccountType, type AdminReport, type ArticleInput, type BusinessType, type InfoArticle,
  type ListingStatus, type ReportStatus,
} from '@/lib/admin/admin-service';
import { EmptyState, ErrorState } from './states';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const ANY = 'any';
const Spinner = () => <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

function useDebounced(value: string, ms = 300): string {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Toolbar({ q, setQ, placeholder, children }: { q: string; setQ: (v: string) => void; placeholder: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={80} /></div>
      {children}
    </div>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: ReadonlyArray<readonly [string, string]> }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value={ANY}>{label}: all</SelectItem>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function TableShell({ children, state }: { children: ReactNode; state: { isPending: boolean; isError: boolean; empty: boolean; retry: () => void; emptyTitle: string } }) {
  if (state.isPending) return <Spinner />;
  if (state.isError) return <div className="p-3"><ErrorState message="We couldn’t load this list." onRetry={state.retry} /></div>;
  if (state.empty) return <div className="p-3"><EmptyState title={state.emptyTitle} body="Try another search or filter." /></div>;
  return <div className="overflow-x-auto">{children}</div>;
}

/** Confirmation with a reason the affected person is told about (and that goes into the audit log). */
function ReasonDialog({ open, title, description, confirm, destructive, requireReason = true, busy, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; confirm: string; destructive?: boolean; requireReason?: boolean; busy: boolean;
  onCancel: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="admin-reason">{requireReason ? 'Reason (shown to the user and kept in the audit log)' : 'Note (optional)'}</Label>
          <Textarea id="admin-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={busy || (requireReason && !reason.trim())} onClick={() => onConfirm(reason)}>{busy && <Loader2 className="animate-spin" />}{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function statusBadge(status: string | null | undefined) {
  const s = status ?? '';
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    ['active', 'approved', 'published', 'resolved'].includes(s) ? 'default'
      : ['banned', 'rejected', 'hidden'].includes(s) ? 'destructive'
      : ['pending', 'open', 'reviewing', 'suspended'].includes(s) ? 'secondary' : 'outline';
  return <Badge variant={variant} className="capitalize">{s.replace(/_/g, ' ') || '—'}</Badge>;
}

/* =============================================================== overview */

const AREAS: ReadonlyArray<readonly [string, string]> = [
  ['Users', '/admin/users'], ['Dealers', '/admin/dealers'], ['Private sellers', '/admin/sellers'], ['Mechanics', '/admin/mechanics'],
  ['Servicing companies', '/admin/servicing-companies'], ['Parts sellers', '/admin/parts-sellers'], ['Import agents', '/admin/import-agents'],
  ['Vehicles & parts', '/admin/vehicles'], ['Verification requests', '/admin/verifications'], ['Reports', '/admin/reports'],
  ['Reviews', '/admin/reviews'], ['Information content', '/admin/content'],
];

export function AdminOverview() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: getPlatformStats, refetchInterval: 60_000 });
  const verifications = useQuery({ queryKey: ['admin', 'verifications', 'pending', 5], queryFn: () => listVerificationQueue('pending', 5) });
  const reports = useQuery({ queryKey: ['admin', 'reports', 'active'], queryFn: () => listReports({ status: 'active' }) });
  const audit = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => listAuditFeed(10) });
  const s = stats.data;
  const tiles: Array<[string, number | undefined, LucideIcon, string]> = [
    ['Total users', s?.users, Users, `${s?.users_7d ?? 0} new this week`],
    ['Live vehicles', s?.live_vehicles, Car, `${s?.live_parts ?? 0} live parts`],
    ['Pending checks', s?.pending_verifications, ShieldCheck, 'Verification requests waiting'],
    ['Open reports', s?.open_reports, FileText, `${s?.open_scam_reports ?? 0} scam reports`],
  ];
  if (stats.isError) return <ErrorState message="We couldn’t load platform numbers." onRetry={() => void stats.refetch()} />;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, value, Icon, note]) => (
          <div className="rounded-lg border bg-card p-5" key={label}>
            <Icon className="size-5 text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold">{stats.isPending ? '—' : (value ?? 0).toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>
      {(s?.open_scam_reports ?? 0) > 0 && (
        <Link to="/admin/reports" className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm font-medium text-destructive">
          <AlertTriangle className="size-5" />{s?.open_scam_reports} scam report{s?.open_scam_reports === 1 ? '' : 's'} need attention
        </Link>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="grid gap-6">
          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Recent verification requests</h2><Button variant="link" size="sm" asChild><Link to="/admin/verifications">Open queue</Link></Button></div>
            {verifications.isPending ? <Spinner /> : verifications.isError ? <p className="mt-3 text-sm text-destructive">Couldn’t load.</p> : verifications.data.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nothing waiting.</p> : (
              <ul className="mt-3 divide-y">{verifications.data.map((v) => <li key={v.id} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate"><b>{v.requester_name}</b> · {verificationSubjectLabel(v)}</span><span className="shrink-0 text-muted-foreground">{v.created_at ? timeAgo(v.created_at) : ''}</span></li>)}</ul>
            )}
          </section>
          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Open reports</h2><Button variant="link" size="sm" asChild><Link to="/admin/reports">Open reports</Link></Button></div>
            {reports.isPending ? <Spinner /> : reports.isError ? <p className="mt-3 text-sm text-destructive">Couldn’t load.</p> : reports.data.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No open reports.</p> : (
              <ul className="mt-3 divide-y">{reports.data.slice(0, 6).map((r) => <li key={r.id} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate">{r.category === 'scam' && <Badge variant="destructive" className="mr-2">Scam</Badge>}{r.target_label ?? r.target_type}</span><span className="shrink-0 text-muted-foreground">{r.created_at ? timeAgo(r.created_at) : ''}</span></li>)}</ul>
            )}
          </section>
        </div>
        <div className="grid gap-6 self-start">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="font-semibold">Platform areas</h2>
            <div className="mt-3">{AREAS.map(([label, to]) => <Link key={to} to={to as never} className="flex justify-between border-b py-2 text-sm last:border-0 hover:text-primary"><span>{label}</span><Badge variant="outline">Manage</Badge></Link>)}</div>
          </section>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold"><BarChart3 className="size-4" />Recent admin actions</h2>
            {audit.isPending ? <Spinner /> : audit.isError || audit.data.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No actions recorded yet.</p> : (
              <ul className="mt-3 space-y-2 text-sm">{audit.data.map((a) => <li key={a.id}><b>{a.admin_name ?? 'Admin'}</b> · {(a.action ?? '').replace(/[._]/g, ' ')} <span className="text-muted-foreground">({a.target_type}) · {a.created_at ? timeAgo(a.created_at) : ''}</span></li>)}</ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/* =============================================================== users */

const ACCOUNT_STATUSES: ReadonlyArray<readonly [AccountStatus, string]> = [['active', 'Active'], ['suspended', 'Suspended'], ['banned', 'Banned']];

export function AdminUsers({ fixedType }: { fixedType?: AccountType }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [type, setType] = useState<string>(fixedType ?? ANY);
  const [status, setStatus] = useState<string>(ANY);
  const search = useDebounced(q);
  const key = ['admin', 'users', search, type, status] as const;
  const users = useQuery({
    queryKey: key,
    queryFn: () => listUsers({
      ...(search ? { q: search } : {}),
      ...(type !== ANY ? { type: type as AccountType } : {}),
      ...(status !== ANY ? { status: status as AccountStatus } : {}),
    }),
  });
  const [action, setAction] = useState<{ id: string; name: string; to: AccountStatus } | null>(null);
  const change = useMutation({
    mutationFn: ({ id, to, reason }: { id: string; to: AccountStatus; reason: string }) => setAccountStatus(id, to, reason),
    onSuccess: (_d, { to }) => { toast.success(to === 'active' ? 'Account reactivated.' : to === 'banned' ? 'Account banned.' : 'Account suspended.'); setAction(null); void queryClient.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast.error(errorText(e, 'That didn’t work.')),
  });
  const types = (Object.entries(ACCOUNT_TYPE_LABELS) as Array<[AccountType, string]>);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Toolbar q={q} setQ={setQ} placeholder="Search by name, town or business">
        {!fixedType && <FilterSelect value={type} onChange={setType} label="Type" options={types} />}
        <FilterSelect value={status} onChange={setStatus} label="Status" options={ACCOUNT_STATUSES} />
      </Toolbar>
      <TableShell state={{ isPending: users.isPending, isError: users.isError, empty: (users.data ?? []).length === 0, retry: () => void users.refetch(), emptyTitle: 'No users found' }}>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead>Listings</TableHead><TableHead>Joined</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>
            {(users.data ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell><div className="min-w-40"><b>{u.full_name}</b>{u.business_name && <span className="block text-xs text-muted-foreground">{u.business_name}</span>}</div></TableCell>
                <TableCell>{u.account_type ? ACCOUNT_TYPE_LABELS[u.account_type] : '—'}</TableCell>
                <TableCell>{[u.city, labelOf(PROVINCES, u.province)].filter((x) => x && x !== '—').join(', ') || '—'}</TableCell>
                <TableCell>{(u.live_vehicles ?? 0) + (u.live_parts ?? 0)}</TableCell>
                <TableCell className="whitespace-nowrap">{u.created_at ? formatDate(u.created_at) : '—'}</TableCell>
                <TableCell>{statusBadge(u.account_status)}</TableCell>
                <TableCell className="text-right">
                  {u.account_type === 'admin' ? <span className="text-xs text-muted-foreground">Administrator</span> : u.account_status === 'active' ? (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => u.id && setAction({ id: u.id, name: u.full_name ?? 'user', to: 'suspended' })}>Suspend</Button>
                      <Button size="sm" variant="destructive" onClick={() => u.id && setAction({ id: u.id, name: u.full_name ?? 'user', to: 'banned' })}>Ban</Button>
                    </div>
                  ) : <Button size="sm" variant="outline" onClick={() => u.id && setAction({ id: u.id, name: u.full_name ?? 'user', to: 'active' })}>Reactivate</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
      <ReasonDialog open={Boolean(action)} busy={change.isPending} destructive={action?.to !== 'active'}
        title={action ? `${action.to === 'active' ? 'Reactivate' : action.to === 'banned' ? 'Ban' : 'Suspend'} ${action.name}?` : ''}
        description={action?.to === 'banned' ? 'Banned users cannot sign in to use Caryandi, and their listings are hidden.' : action?.to === 'suspended' ? 'Suspended users cannot post or message until reactivated.' : 'The account will work normally again.'}
        confirm={action?.to === 'active' ? 'Reactivate' : action?.to === 'banned' ? 'Ban account' : 'Suspend account'}
        onCancel={() => setAction(null)} onConfirm={(reason) => action && change.mutate({ id: action.id, to: action.to, reason })} />
    </div>
  );
}

/* =============================================================== businesses */

const VERIFICATION_FILTER: ReadonlyArray<readonly [string, string]> = [['approved', 'Verified'], ['pending', 'Under review'], ['unverified', 'Not verified'], ['rejected', 'Not approved']];

export function AdminBusinesses({ type }: { type: BusinessType }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [verification, setVerification] = useState<string>(ANY);
  const [active, setActive] = useState<string>(ANY);
  const search = useDebounced(q);
  const list = useQuery({
    queryKey: ['admin', 'businesses', type, search, verification, active],
    queryFn: () => listBusinesses({ type, ...(search ? { q: search } : {}), ...(verification !== ANY ? { verification } : {}), ...(active !== ANY ? { active: active === 'yes' } : {}) }),
  });
  const [action, setAction] = useState<{ id: string; name: string; to: boolean } | null>(null);
  const change = useMutation({
    mutationFn: ({ id, to, reason }: { id: string; to: boolean; reason: string }) => setBusinessActive(id, to, reason),
    onSuccess: (_d, { to }) => { toast.success(to ? 'Business reactivated.' : 'Business hidden from the marketplace.'); setAction(null); void queryClient.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast.error(errorText(e, 'That didn’t work.')),
  });
  const profileLink = (b: { slug: string | null; business_type: BusinessType | null }) => {
    if (!b.slug) return null;
    if (b.business_type === 'dealer') return <Link to="/sellers/$sellerId" params={{ sellerId: b.slug }} className="text-xs text-primary">View profile</Link>;
    if (b.business_type === 'import_agent') return <Link to="/agents/$agentId" params={{ agentId: b.slug }} className="text-xs text-primary">View profile</Link>;
    if (b.business_type === 'mechanic' || b.business_type === 'servicing_company') return <Link to="/services/$serviceId" params={{ serviceId: b.slug }} className="text-xs text-primary">View profile</Link>;
    return null;
  };
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Toolbar q={q} setQ={setQ} placeholder={`Search ${BUSINESS_TYPE_LABELS[type].toLowerCase()}s by name, town or owner`}>
        <FilterSelect value={verification} onChange={setVerification} label="Verification" options={VERIFICATION_FILTER} />
        <FilterSelect value={active} onChange={setActive} label="Visible" options={[['yes', 'Visible'], ['no', 'Hidden']]} />
      </Toolbar>
      <TableShell state={{ isPending: list.isPending, isError: list.isError, empty: (list.data ?? []).length === 0, retry: () => void list.refetch(), emptyTitle: `No ${BUSINESS_TYPE_LABELS[type].toLowerCase()}s found` }}>
        <Table>
          <TableHeader><TableRow><TableHead>Business</TableHead><TableHead>Owner</TableHead><TableHead>Location</TableHead><TableHead>Activity</TableHead><TableHead>Rating</TableHead><TableHead>Verification</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((b) => (
              <TableRow key={b.id}>
                <TableCell><div className="min-w-44"><b>{b.name}</b>{!b.is_active && <Badge variant="destructive" className="ml-2">Hidden</Badge>}<span className="block">{profileLink(b)}</span></div></TableCell>
                <TableCell><span className="whitespace-nowrap">{b.owner_name}</span>{b.owner_status && b.owner_status !== 'active' && <span className="block">{statusBadge(b.owner_status)}</span>}</TableCell>
                <TableCell>{[b.city, labelOf(PROVINCES, b.province)].filter((x) => x && x !== '—').join(', ') || '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {type === 'import_agent' ? `${b.active_routes ?? 0} routes` : type === 'mechanic' || type === 'servicing_company' ? `${b.active_services ?? 0} services` : type === 'parts_seller' ? `${b.live_parts ?? 0} parts` : `${b.live_vehicles ?? 0} vehicles`}
                </TableCell>
                <TableCell>{(b.rating_count ?? 0) > 0 ? <span className="inline-flex items-center gap-1"><Star className="size-4 fill-warning text-warning" />{Number(b.rating_avg).toFixed(1)} ({b.rating_count})</span> : '—'}</TableCell>
                <TableCell>{statusBadge(b.verification_status)}</TableCell>
                <TableCell className="text-right">
                  {b.is_active
                    ? <Button size="sm" variant="outline" onClick={() => b.id && setAction({ id: b.id, name: b.name ?? 'business', to: false })}>Hide</Button>
                    : <Button size="sm" variant="outline" onClick={() => b.id && setAction({ id: b.id, name: b.name ?? 'business', to: true })}>Reactivate</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
      <ReasonDialog open={Boolean(action)} busy={change.isPending} destructive={action?.to === false}
        title={action ? `${action.to ? 'Reactivate' : 'Hide'} ${action.name}?` : ''}
        description={action?.to ? 'The business and its listings become visible again.' : 'The business profile and its services disappear from the marketplace. The owner is notified.'}
        confirm={action?.to ? 'Reactivate' : 'Hide business'} onCancel={() => setAction(null)} onConfirm={(reason) => action && change.mutate({ id: action.id, to: action.to, reason })} />
    </div>
  );
}

/* =============================================================== listings */

const LISTING_FILTER = Object.entries(LISTING_STATUS_LABELS) as Array<[ListingStatus, string]>;

export function AdminListings() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'vehicle' | 'part'>('vehicle');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(ANY);
  const search = useDebounced(q);
  const list = useQuery({
    queryKey: ['admin', 'listings', kind, search, status],
    queryFn: () => listListings({ type: kind, ...(search ? { q: search } : {}), ...(status !== ANY ? { status: status as ListingStatus } : {}) }),
  });
  const [action, setAction] = useState<{ id: string; title: string; to: ListingStatus } | null>(null);
  const change = useMutation({
    mutationFn: ({ id, to, reason }: { id: string; to: ListingStatus; reason: string }) => setListingStatus(kind, id, to, reason),
    onSuccess: () => { toast.success('Listing updated — the seller has been notified.'); setAction(null); void queryClient.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast.error(errorText(e, 'That didn’t work.')),
  });
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b p-3"><Tabs value={kind} onValueChange={(v) => setKind(v as 'vehicle' | 'part')}><TabsList><TabsTrigger value="vehicle">Vehicles</TabsTrigger><TabsTrigger value="part">Parts</TabsTrigger></TabsList></Tabs></div>
      <Toolbar q={q} setQ={setQ} placeholder="Search by title, seller or town"><FilterSelect value={status} onChange={setStatus} label="Status" options={LISTING_FILTER} /></Toolbar>
      <TableShell state={{ isPending: list.isPending, isError: list.isError, empty: (list.data ?? []).length === 0, retry: () => void list.refetch(), emptyTitle: 'No listings found' }}>
        <Table>
          <TableHeader><TableRow><TableHead>Listing</TableHead><TableHead>Seller</TableHead><TableHead>Price</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell><div className="min-w-48"><b>{l.title}</b><span className="block text-xs text-muted-foreground">Added {l.created_at ? formatDate(l.created_at) : '—'}</span>
                  {l.id && (kind === 'vehicle' ? <Link to="/vehicles/$vehicleId" params={{ vehicleId: l.id }} className="text-xs text-primary">Open</Link> : <Link to="/parts/$partId" params={{ partId: l.id }} className="text-xs text-primary">Open</Link>)}</div></TableCell>
                <TableCell>{l.seller_name}</TableCell>
                <TableCell className="whitespace-nowrap">{formatPrice(l.price)}</TableCell>
                <TableCell>{l.city || labelOf(PROVINCES, l.province)}</TableCell>
                <TableCell>{statusBadge(l.listing_status)}</TableCell>
                <TableCell className="text-right">
                  {l.listing_status === 'rejected' || l.listing_status === 'archived'
                    ? <Button size="sm" variant="outline" onClick={() => l.id && setAction({ id: l.id, title: l.title ?? 'listing', to: 'draft' })}>Return to seller</Button>
                    : <Button size="sm" variant="destructive" onClick={() => l.id && setAction({ id: l.id, title: l.title ?? 'listing', to: 'rejected' })}>Take down</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>
      <ReasonDialog open={Boolean(action)} busy={change.isPending} destructive={action?.to === 'rejected'} requireReason={action?.to === 'rejected'}
        title={action ? (action.to === 'rejected' ? `Take down “${action.title}”?` : `Return “${action.title}” to the seller?`) : ''}
        description={action?.to === 'rejected' ? 'The listing is hidden from buyers and marked as not approved. The seller is told why.' : 'The listing goes back to the seller’s drafts so they can fix it and publish again.'}
        confirm={action?.to === 'rejected' ? 'Take down' : 'Return to drafts'} onCancel={() => setAction(null)} onConfirm={(reason) => action && change.mutate({ id: action.id, to: action.to, reason })} />
    </div>
  );
}

/* =============================================================== reviews */

export function AdminReviews() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(ANY);
  const search = useDebounced(q);
  const list = useQuery({ queryKey: ['admin', 'reviews', search, status], queryFn: () => listReviews({ ...(search ? { q: search } : {}), ...(status === 'published' || status === 'hidden' ? { status } : {}) }) });
  const [action, setAction] = useState<{ id: string; to: 'hidden' | 'published' } | null>(null);
  const change = useMutation({
    mutationFn: ({ id, to, reason }: { id: string; to: 'hidden' | 'published'; reason: string }) => moderateReview(id, to, reason),
    onSuccess: (_d, { to }) => { toast.success(to === 'hidden' ? 'Review hidden; the rating was recalculated.' : 'Review published again.'); setAction(null); void queryClient.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast.error(errorText(e, 'That didn’t work.')),
  });
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Toolbar q={q} setQ={setQ} placeholder="Search reviews, reviewers or businesses"><FilterSelect value={status} onChange={setStatus} label="Status" options={[['published', 'Published'], ['hidden', 'Hidden']]} /></Toolbar>
      {list.isPending ? <Spinner /> : list.isError ? <div className="p-3"><ErrorState message="We couldn’t load reviews." onRetry={() => void list.refetch()} /></div> : list.data.length === 0 ? <div className="p-3"><EmptyState title="No reviews found" body="Reviews appear here as customers leave them." /></div> : (
        <ul className="divide-y">
          {list.data.map((r) => (
            <li key={r.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex" aria-label={`${r.rating} out of 5`}>{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`size-4 ${i < (r.rating ?? 0) ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`} />)}</span>
                  {statusBadge(r.status)}
                  <span className="text-sm"><b>{r.reviewer_name}</b> about <b>{r.subject_name}</b></span>
                </div>
                {r.body && <p className="mt-2 whitespace-pre-line text-sm">{r.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{r.created_at ? formatDate(r.created_at) : ''}</p>
              </div>
              <div>{r.status === 'published'
                ? <Button size="sm" variant="outline" onClick={() => r.id && setAction({ id: r.id, to: 'hidden' })}><Eye />Hide</Button>
                : <Button size="sm" variant="outline" onClick={() => r.id && setAction({ id: r.id, to: 'published' })}>Publish</Button>}</div>
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog open={Boolean(action)} busy={change.isPending} requireReason={action?.to === 'hidden'} destructive={action?.to === 'hidden'}
        title={action?.to === 'hidden' ? 'Hide this review?' : 'Publish this review again?'}
        description={action?.to === 'hidden' ? 'Hidden reviews are removed from the profile and the rating is recalculated. Kept in the audit log.' : 'The review is shown on the profile again and counted in the rating.'}
        confirm={action?.to === 'hidden' ? 'Hide review' : 'Publish'} onCancel={() => setAction(null)} onConfirm={(reason) => action && change.mutate({ id: action.id, to: action.to, reason })} />
    </div>
  );
}

/* =============================================================== reports */

const REPORT_STATUS_TABS = [['active', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed']] as const;

export function AdminReports() {
  const [tab, setTab] = useState<(typeof REPORT_STATUS_TABS)[number][0]>('active');
  const list = useQuery({ queryKey: ['admin', 'reports', tab], queryFn: () => listReports({ status: tab }) });
  const [selected, setSelected] = useState<AdminReport | null>(null);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b p-3"><Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}><TabsList>{REPORT_STATUS_TABS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList></Tabs></div>
      {list.isPending ? <Spinner /> : list.isError ? <div className="p-3"><ErrorState message="We couldn’t load reports." onRetry={() => void list.refetch()} /></div> : list.data.length === 0 ? <div className="p-3"><EmptyState title="No reports here" body={tab === 'active' ? 'Nothing waiting for review.' : 'Nothing yet.'} /></div> : (
        <ul className="divide-y">
          {list.data.map((r) => (
            <li key={r.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {r.category === 'scam' ? <Badge variant="destructive">Scam</Badge> : <Badge variant="outline">{labelOf(REPORT_CATEGORIES, r.category)}</Badge>}
                  {statusBadge(r.status)}
                  <b className="truncate">{r.target_label ?? r.target_type}</b>
                  <span className="text-xs text-muted-foreground">({r.target_type})</span>
                  {(r.reports_on_target ?? 0) > 1 && <Badge variant="secondary">{r.reports_on_target} reports on this</Badge>}
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm">{r.details}</p>
                <p className="mt-1 text-xs text-muted-foreground">By {r.reporter_name ?? 'a user'} · {r.created_at ? timeAgo(r.created_at) : ''}</p>
              </div>
              <div><Button size="sm" variant="outline" onClick={() => setSelected(r)}>Review</Button></div>
            </li>
          ))}
        </ul>
      )}
      {selected && <ReportDialog key={selected.id} report={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function TargetLink({ r }: { r: AdminReport }) {
  if (!r.target_id) return null;
  if (r.target_type === 'vehicle') return <Link to="/vehicles/$vehicleId" params={{ vehicleId: r.target_id }} className="text-sm text-primary">Open the listing</Link>;
  if (r.target_type === 'part') return <Link to="/parts/$partId" params={{ partId: r.target_id }} className="text-sm text-primary">Open the listing</Link>;
  return null;
}

function ReportDialog({ report: r, onClose }: { report: AdminReport; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(r.admin_notes ?? '');
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);
  const update = useMutation({
    mutationFn: (status: ReportStatus) => updateReport(r.id ?? '', status, notes),
    onSuccess: (_d, status) => { toast.success(`Report marked ${status}. The reporter has been told.`); void queryClient.invalidateQueries({ queryKey: ['admin'] }); if (status !== 'reviewing') onClose(); },
    onError: (e) => toast.error(errorText(e, 'That didn’t work.')),
  });
  const investigate = useMutation({
    mutationFn: () => getScamDetails(r.id ?? ''),
    onSuccess: (d) => setDetails(d),
    onError: (e) => toast.error(errorText(e, 'We couldn’t load the investigation details.')),
  });
  const canInvestigate = r.category === 'scam' && (r.status === 'reviewing' || r.status === 'resolved');
  const user = (details?.['reported_user'] ?? null) as Record<string, unknown> | null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{r.category === 'scam' ? 'Scam report' : 'Report'} — {r.target_label ?? r.target_type}</DialogTitle>
          <DialogDescription>Reported by {r.reporter_name ?? 'a user'} {r.created_at ? timeAgo(r.created_at) : ''}. The reported person is not told who reported them.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm">{r.details}</p>
          <TargetLink r={r} />
          {r.category === 'scam' && (
            <div className="rounded-md border p-3 text-sm">
              <b>Investigation</b>
              {!canInvestigate ? <p className="mt-1 text-muted-foreground">Move the report to “Reviewing” to see the reported user’s identity and contact details. Every look is recorded in the audit log.</p> : details ? (
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                  {user && (['full_name', 'account_type', 'account_status', 'email', 'phone', 'whatsapp_number', 'city'] as const).map((k) => <div key={k} className="contents"><dt className="text-muted-foreground">{k.replace(/_/g, ' ')}</dt><dd className="break-words">{String(user[k] ?? '—')}</dd></div>)}
                  <dt className="text-muted-foreground">verifications</dt><dd>{Array.isArray(details['verifications']) ? details['verifications'].length : 0}</dd>
                  <dt className="text-muted-foreground">meet-ups with reporter</dt><dd>{Array.isArray(details['meetups_between_reporter_and_user']) ? details['meetups_between_reporter_and_user'].length : 0}</dd>
                  <dt className="text-muted-foreground">contact reveals by reporter</dt><dd>{Array.isArray(details['contact_between_reporter_and_user']) ? details['contact_between_reporter_and_user'].length : 0}</dd>
                </dl>
              ) : <Button className="mt-2" size="sm" variant="outline" disabled={investigate.isPending} onClick={() => investigate.mutate()}>{investigate.isPending && <Loader2 className="animate-spin" />}Show reported user details</Button>}
              {user?.['profile_id'] && <p className="mt-2 text-xs text-muted-foreground">To suspend or ban this user, use Users and search for their name.</p>}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="report-notes">Admin notes</Label>
            <Textarea id="report-notes" rows={3} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you checked and what you did" />
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {r.status === 'open' && <Button variant="outline" disabled={update.isPending} onClick={() => update.mutate('reviewing')}>Start reviewing</Button>}
          <Button variant="outline" disabled={update.isPending} onClick={() => update.mutate('dismissed')}>Dismiss</Button>
          <Button disabled={update.isPending} onClick={() => update.mutate('resolved')}>{update.isPending && <Loader2 className="animate-spin" />}Mark resolved</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =============================================================== content */

const emptyArticle: ArticleInput = { slug: '', category: 'general', title: '', summary: '', body: '', isPublished: false };

export function AdminContent() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['admin', 'articles'], queryFn: listArticles });
  const [editing, setEditing] = useState<InfoArticle | 'new' | null>(null);
  const [deleting, setDeleting] = useState<InfoArticle | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => deleteArticle(id),
    onSuccess: () => { toast.success('Article deleted.'); setDeleting(null); void queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] }); },
    onError: (e) => toast.error(errorText(e, 'That didn’t work.')),
  });
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEditing('new')}><Plus />New article</Button></div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <TableShell state={{ isPending: list.isPending, isError: list.isError, empty: (list.data ?? []).length === 0, retry: () => void list.refetch(), emptyTitle: 'No articles yet' }}>
          <Table>
            <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {(list.data ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell><b>{a.title}</b><span className="block text-xs text-muted-foreground">/information/{a.slug}</span></TableCell>
                  <TableCell>{labelOf(ARTICLE_CATEGORIES, a.category)}</TableCell>
                  <TableCell>{a.is_published ? <Badge>Published</Badge> : <Badge variant="outline">Draft</Badge>}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(a.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {a.is_published && <Button size="icon" variant="ghost" asChild aria-label="View"><Link to="/information/$slug" params={{ slug: a.slug }}><Eye /></Link></Button>}
                      <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(a)}><Pencil /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label="Delete" onClick={() => setDeleting(a)}><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </div>
      {editing && <ArticleDialog article={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <Dialog open={Boolean(deleting)} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete “{deleting?.title}”?</DialogTitle><DialogDescription>This removes the article from the site. To take it offline temporarily, unpublish it instead.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>Keep it</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>{remove.isPending && <Loader2 className="animate-spin" />}Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ArticleDialog({ article, onClose }: { article: InfoArticle | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState<ArticleInput>(() => article
    ? { slug: article.slug, category: article.category, title: article.title, summary: article.summary ?? '', body: article.body, isPublished: article.is_published }
    : emptyArticle);
  const [slugTouched, setSlugTouched] = useState(Boolean(article));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ArticleInput>) => setV((x) => ({ ...x, ...patch }));

  async function save() {
    const problems = validateArticle(v);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true); setError(null);
    try {
      await saveArticle(v, article?.id);
      toast.success(v.isPublished ? 'Article published.' : 'Draft saved.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] });
      onClose();
    } catch (e) {
      setError(errorText(e, 'We couldn’t save the article.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{article ? 'Edit article' : 'New article'}</DialogTitle><DialogDescription>Plain text. Start a line with “## ” for a heading and “- ” for a bullet point. Check facts (fees, rules) with the official source before publishing.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label htmlFor="art-title">Title</Label><Input id="art-title" value={v.title} maxLength={160} onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />{errors['title'] && <p className="text-xs text-destructive">{errors['title']}</p>}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="art-slug">Web address</Label><Input id="art-slug" value={v.slug} maxLength={100} onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase() }); }} /><p className="text-xs text-muted-foreground">/information/{v.slug || '…'}</p>{errors['slug'] && <p className="text-xs text-destructive">{errors['slug']}</p>}</div>
            <div className="grid gap-2"><Label>Category</Label><Select value={v.category} onValueChange={(c) => set({ category: c })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ARTICLE_CATEGORIES.map(([c, l]) => <SelectItem key={c} value={c}>{l}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="art-summary">Summary (optional)</Label><Input id="art-summary" value={v.summary} maxLength={300} onChange={(e) => set({ summary: e.target.value })} />{errors['summary'] && <p className="text-xs text-destructive">{errors['summary']}</p>}</div>
          <div className="grid gap-2"><Label htmlFor="art-body">Article</Label><Textarea id="art-body" rows={14} maxLength={50000} value={v.body} onChange={(e) => set({ body: e.target.value })} />{errors['body'] && <p className="text-xs text-destructive">{errors['body']}</p>}</div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.isPublished} onCheckedChange={(c) => set({ isPublished: c === true })} />Published (visible to everyone)</label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

