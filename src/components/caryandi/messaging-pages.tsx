import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, CalendarClock, CheckCircle2, Loader2, MapPin, MessageSquare, Send, Undo2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/auth-context';
import { useSignInRedirect, useUserId } from '@/lib/marketplace/hooks';
import { timeAgo, type ContactTarget } from '@/lib/marketplace/engagement-service';
import {
  MAX_MESSAGE_LENGTH, MEETUP_PURPOSE_LABELS, MEETUP_STATUS_LABELS, getThread, listInbox, listMeetups, markConversationRead, meetupActions,
  requestMeetup, respondMeetup, sendMessage, setConversationArchived, startEnquiry,
  type InboxRow, type MeetupDetail, type MeetupStatus, type MeetupTarget, type ThreadMessage,
} from '@/lib/messaging/messaging-service';
import { EmptyState, ErrorState } from './states';
import { ReportDialog } from './engagement-widgets';
import { VerifyCarPrompt } from './verify-car-prompt';

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export const messagingKeys = {
  inbox: (uid: string, received: boolean, archived: boolean) => ['inbox', uid, received, archived] as const,
  thread: (id: string) => ['thread', id] as const,
  meetups: (uid: string, direction: string) => ['meetups', uid, direction] as const,
};

/** "Sat 27 Sep, 14:00" in Zambian time. */
export function formatLusakaDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

const ACTION_LABELS: Record<Exclude<MeetupStatus, 'pending'>, string> = {
  accepted: 'Accept', declined: 'Decline', completed: 'Mark as done', cancelled: 'Cancel request',
};

function statusVariant(status: MeetupStatus | null): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'accepted') return 'default';
  if (status === 'pending') return 'secondary';
  return 'outline';
}

/* =============================================================== inbox */

/**
 * Two-pane inbox. `received` shows only conversations other people started
 * with you (sellers' "Enquiries"); otherwise everything.
 */
export function Inbox({ received = false, conversationId, basePath }: { received?: boolean; conversationId?: string | undefined; basePath?: '/dashboard/messages' | '/dashboard/enquiries' | '/dashboard/requests' }) {
  const uid = useUserId();
  const navigate = useNavigate();
  const [archived, setArchived] = useState(false);
  const inbox = useQuery({
    queryKey: messagingKeys.inbox(uid ?? 'anon', received, archived),
    queryFn: () => listInbox({ received, archived }),
    enabled: Boolean(uid),
    refetchInterval: 30_000,
  });
  const path = basePath ?? (received ? '/dashboard/enquiries' : '/dashboard/messages');
  const open = (id: string | undefined) => void navigate({ to: path, search: id ? { c: id } : {} });

  const list = (
    <section className="min-w-0 rounded-lg border bg-card">
      <div className="border-b p-3">
        <Tabs value={archived ? 'archived' : 'inbox'} onValueChange={(v) => setArchived(v === 'archived')}>
          <TabsList><TabsTrigger value="inbox">Inbox</TabsTrigger><TabsTrigger value="archived">Archived</TabsTrigger></TabsList>
        </Tabs>
      </div>
      {inbox.isPending ? <div className="grid place-items-center p-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        : inbox.isError ? <div className="p-3"><ErrorState message="We couldn’t load your messages." onRetry={() => void inbox.refetch()} /></div>
        : inbox.data.length === 0 ? (
          <div className="p-3"><EmptyState
            title={archived ? 'Nothing archived' : received ? 'No enquiries yet' : 'No messages yet'}
            body={received ? 'When buyers message you about a listing, the conversation appears here.' : 'Send an enquiry from any vehicle, part or service page and the conversation appears here.'} /></div>
        ) : (
          <ul className="divide-y">
            {inbox.data.map((c) => <InboxItem key={c.id} c={c} active={c.id === conversationId} onOpen={() => open(c.id ?? undefined)} />)}
          </ul>
        )}
    </section>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className={conversationId ? 'hidden lg:block' : ''}>{list}</div>
      <div className={conversationId ? '' : 'hidden lg:block'}>
        {conversationId
          ? <Thread key={conversationId} conversationId={conversationId} onBack={() => open(undefined)} />
          : <div className="grid min-h-80 place-items-center rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground"><div><MessageSquare className="mx-auto mb-2 size-8" />Choose a conversation to read it.</div></div>}
      </div>
    </div>
  );
}

function InboxItem({ c, active, onOpen }: { c: InboxRow; active: boolean; onOpen: () => void }) {
  const unread = (c.unread_count ?? 0) > 0;
  const preview = c.last_kind === 'meetup_request' ? 'Meet-up request' : c.last_kind === 'meetup_update' ? 'Meet-up update' : c.last_body ?? '';
  return (
    <li>
      <button type="button" onClick={onOpen} className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 p-4 text-left hover:bg-accent/40 ${active ? 'bg-accent/60' : ''}`}>
        <span className="grid size-10 place-items-center rounded-full bg-accent font-semibold text-primary">{(c.counterpart_name ?? '?').charAt(0).toUpperCase()}</span>
        <span className="min-w-0">
          <span className={`block truncate text-sm ${unread ? 'font-bold' : 'font-medium'}`}>{c.counterpart_name}</span>
          <span className="block truncate text-xs text-muted-foreground">{c.subject_label}</span>
          <span className={`mt-0.5 block truncate text-sm ${unread ? 'text-foreground' : 'text-muted-foreground'}`}>{c.last_from_me ? 'You: ' : ''}{preview}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          {c.last_message_at && <span className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(c.last_message_at)}</span>}
          {unread && <Badge className="h-5 min-w-5 justify-center px-1.5">{c.unread_count}</Badge>}
        </span>
      </button>
    </li>
  );
}

function Thread({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const uid = useUserId();
  const queryClient = useQueryClient();
  const thread = useQuery({ queryKey: messagingKeys.thread(conversationId), queryFn: () => getThread(conversationId), refetchInterval: 15_000 });
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const count = thread.data?.messages.length ?? 0;
  const unread = thread.data?.conversation.unread_count ?? 0;

  // Mark read when opened and whenever new messages arrive while open.
  useEffect(() => {
    if (!thread.data || unread === 0) return;
    void markConversationRead(conversationId).then(() => queryClient.invalidateQueries({ queryKey: ['inbox'] }));
  }, [conversationId, count, unread, thread.data, queryClient]);
  // Keep the newest message in view (scrolls the message list only, not the page).
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [count]);

  const send = useMutation({
    mutationFn: (body: string) => sendMessage(conversationId, body),
    onSuccess: async () => {
      setDraft('');
      await queryClient.invalidateQueries({ queryKey: messagingKeys.thread(conversationId) });
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
    onError: (e) => toast.error(errorText(e, 'Your message wasn’t sent.')),
  });
  const archive = useMutation({
    mutationFn: (value: boolean) => setConversationArchived(conversationId, value),
    onSuccess: async (_d, value) => {
      toast.success(value ? 'Conversation archived.' : 'Moved back to your inbox.');
      await queryClient.invalidateQueries({ queryKey: ['inbox'] });
      await queryClient.invalidateQueries({ queryKey: messagingKeys.thread(conversationId) });
    },
    onError: (e) => toast.error(errorText(e, 'That didn’t work.')),
  });

  if (thread.isPending) return <div className="grid min-h-80 place-items-center rounded-lg border"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (thread.isError) return <ErrorState message="We couldn’t load this conversation." onRetry={() => void thread.refetch()} />;
  if (!thread.data) return <EmptyState title="Conversation not found" body="It may have been removed, or it isn’t yours." />;
  const { conversation: c, messages } = thread.data;
  const lastFromOther = [...messages].reverse().find((m) => !m.is_mine && m.sender_id);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (text && !send.isPending) send.mutate(text);
  };

  return (
    <section className="flex min-h-[32rem] flex-col rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b p-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{c.counterpart_name}</h2>
          <p className="truncate text-xs text-muted-foreground">{c.subject_label}</p>
        </div>
        <SubjectLink c={c} />
        <Button variant="ghost" size="sm" disabled={archive.isPending} onClick={() => archive.mutate(!c.is_archived)}>
          {c.is_archived ? <><Undo2 />Unarchive</> : <><Archive />Archive</>}
        </Button>
      </header>
      <div ref={scrollRef} className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.map((m) => <MessageBubble key={m.id} m={m} uid={uid} conversationId={conversationId} />)}
      </div>
      {!c.started_by_me && c.vehicle_id && <VerifyCarPrompt vehicleId={c.vehicle_id} />}
      <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
        <Label htmlFor="message-draft" className="sr-only">Message</Label>
        <Textarea id="message-draft" rows={2} value={draft} maxLength={MAX_MESSAGE_LENGTH} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }}
          placeholder="Write a message…" className="min-h-10 flex-1 resize-none" />
        <Button type="submit" disabled={!draft.trim() || send.isPending} aria-label="Send">{send.isPending ? <Loader2 className="animate-spin" /> : <Send />}</Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
        <p className="text-xs text-muted-foreground">Never pay a deposit before you’ve seen the vehicle or part in person.</p>
        {lastFromOther?.id && <ReportDialog target="message" id={lastFromOther.id} subject={`this conversation with ${c.counterpart_name ?? 'this user'}`} />}
      </div>
    </section>
  );
}

function SubjectLink({ c }: { c: InboxRow }) {
  if (c.vehicle_id) return <Button variant="outline" size="sm" asChild><Link to="/vehicles/$vehicleId" params={{ vehicleId: c.vehicle_id }}>View listing</Link></Button>;
  if (c.part_id) return <Button variant="outline" size="sm" asChild><Link to="/parts/$partId" params={{ partId: c.part_id }}>View part</Link></Button>;
  return null;
}

function MessageBubble({ m, uid, conversationId }: { m: ThreadMessage; uid: string | null; conversationId: string }) {
  const mine = Boolean(m.is_mine);
  const isMeetup = m.kind === 'meetup_request';
  const isUpdate = m.kind === 'meetup_update' || m.kind === 'system';
  if (isUpdate) {
    return <p className="mx-auto max-w-md rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground whitespace-pre-line">{m.body}{m.created_at && <span className="block">{timeAgo(m.created_at)}</span>}</p>;
  }
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted'} ${isMeetup ? 'border-2 border-primary/40' : ''}`}>
        {!mine && <b className="block text-xs">{m.sender_name}</b>}
        {isMeetup && <span className={`mb-1 flex items-center gap-1 text-xs font-semibold ${mine ? '' : 'text-primary'}`}><CalendarClock className="size-3.5" />Meet-up request</span>}
        <p className="whitespace-pre-line break-words">{m.body}</p>
        {isMeetup && m.meetup_status && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(m.meetup_status)}>{MEETUP_STATUS_LABELS[m.meetup_status]}</Badge>
            {m.meetup_id && <MeetupActionButtons meetupId={m.meetup_id} status={m.meetup_status} isMine={m.meetup_requester_id === uid} conversationId={conversationId} compact />}
          </div>
        )}
        {m.created_at && <span className={`mt-1 block text-[11px] ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{timeAgo(m.created_at)}</span>}
      </div>
    </div>
  );
}

/* =============================================================== meet-up / booking requests */

function MeetupActionButtons({ meetupId, status, isMine, conversationId, compact = false }: {
  meetupId: string; status: MeetupStatus; isMine: boolean; conversationId?: string | null; compact?: boolean;
}) {
  const uid = useUserId();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<Exclude<MeetupStatus, 'pending'> | null>(null);
  const [note, setNote] = useState('');
  const actions = meetupActions({ status, is_mine: isMine });
  const respond = useMutation({
    mutationFn: ({ next, text }: { next: Exclude<MeetupStatus, 'pending'>; text: string }) => respondMeetup(meetupId, next, text),
    onSuccess: async (_d, { next }) => {
      toast.success(next === 'accepted' ? 'Accepted — they’ve been notified.' : next === 'declined' ? 'Declined.' : next === 'completed' ? 'Marked as done.' : 'Request cancelled.');
      setConfirming(null); setNote('');
      if (uid) {
        void queryClient.invalidateQueries({ queryKey: ['meetups', uid] });
      }
      if (conversationId) void queryClient.invalidateQueries({ queryKey: messagingKeys.thread(conversationId) });
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
    onError: (e) => toast.error(errorText(e, 'We couldn’t update this request.')),
  });
  if (!actions.length) return null;
  return (
    <>
      {actions.map((a) => (
        <Button key={a} type="button" size={compact ? 'sm' : 'default'} variant={a === 'accepted' || a === 'completed' ? (compact ? 'secondary' : 'default') : 'outline'}
          className={compact ? 'h-7 px-2 text-xs' : ''} disabled={respond.isPending} onClick={() => setConfirming(a)}>
          {a === 'accepted' || a === 'completed' ? <CheckCircle2 /> : <XCircle />}{ACTION_LABELS[a]}
        </Button>
      ))}
      <Dialog open={Boolean(confirming)} onOpenChange={(o) => { if (!o) setConfirming(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirming ? ACTION_LABELS[confirming] : ''}</DialogTitle>
            <DialogDescription>Add a short note if it helps (optional). The other person sees it in the chat.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={confirming === 'accepted' ? 'e.g. See you at 10:00 at our yard in Woodlands.' : confirming === 'declined' ? 'e.g. The car is no longer available that day — can you do Friday?' : ''} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Back</Button>
            <Button disabled={respond.isPending} onClick={() => confirming && respond.mutate({ next: confirming, text: note })}>{respond.isPending && <Loader2 className="animate-spin" />}Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MeetupRequests({ defaultDirection = 'received' }: { defaultDirection?: 'received' | 'sent' }) {
  const uid = useUserId();
  const [direction, setDirection] = useState<'received' | 'sent'>(defaultDirection);
  const q = useQuery({ queryKey: messagingKeys.meetups(uid ?? 'anon', direction), queryFn: () => listMeetups(direction), enabled: Boolean(uid), refetchInterval: 60_000 });
  const pending = (q.data ?? []).filter((m) => m.status === 'pending').length;
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <Tabs value={direction} onValueChange={(v) => setDirection(v as 'received' | 'sent')}>
          <TabsList><TabsTrigger value="received">Received</TabsTrigger><TabsTrigger value="sent">Sent by me</TabsTrigger></TabsList>
        </Tabs>
        {direction === 'received' && pending > 0 && <Badge variant="secondary">{pending} waiting for your reply</Badge>}
      </div>
      {q.isPending ? <div className="grid place-items-center p-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        : q.isError ? <div className="p-3"><ErrorState message="We couldn’t load requests." onRetry={() => void q.refetch()} /></div>
        : q.data.length === 0 ? <div className="p-3"><EmptyState title={direction === 'received' ? 'No requests yet' : 'You haven’t sent any requests'} body={direction === 'received' ? 'Viewing and booking requests from customers appear here.' : 'Request a viewing or booking from any listing or profile page.'} /></div>
        : <ul className="divide-y">{q.data.map((m) => <MeetupItem key={m.id} m={m} />)}</ul>}
    </section>
  );
}

function MeetupItem({ m }: { m: MeetupDetail }) {
  const who = m.is_mine ? m.recipient_name : m.requester_name;
  return (
    <li className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <b className="truncate">{who}</b>
          <Badge variant={statusVariant(m.status)}>{m.status ? MEETUP_STATUS_LABELS[m.status] : ''}</Badge>
          <span className="text-xs text-muted-foreground">{MEETUP_PURPOSE_LABELS[m.purpose ?? ''] ?? 'Meet-up'}</span>
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">{m.subject_label}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1"><CalendarClock className="size-4 text-muted-foreground" />{m.proposed_time ? formatLusakaDateTime(m.proposed_time) : 'Time to be agreed'}</span>
          {m.location_note && <span className="flex items-center gap-1"><MapPin className="size-4 text-muted-foreground" />{m.location_note}</span>}
        </div>
        {m.message && <p className="mt-2 whitespace-pre-line text-sm">“{m.message}”</p>}
        {m.response_note && <p className="mt-2 text-sm text-muted-foreground">Reply: {m.response_note}</p>}
        {m.created_at && <p className="mt-2 text-xs text-muted-foreground">Requested {timeAgo(m.created_at)}</p>}
      </div>
      <div className="flex flex-wrap items-start gap-2 sm:flex-col sm:items-end">
        {m.id && m.status && <MeetupActionButtons meetupId={m.id} status={m.status} isMine={Boolean(m.is_mine)} conversationId={m.conversation_id} />}
        {m.conversation_id && <Button variant="ghost" size="sm" asChild><Link to="/dashboard/messages" search={{ c: m.conversation_id }}><MessageSquare />Open chat</Link></Button>}
      </div>
    </li>
  );
}

/* =============================================================== entry points on listing pages */

const MEETUP_COPY: Record<MeetupTarget, { button: string; title: string; hint: string }> = {
  vehicle: { button: 'Request a viewing', title: 'Request a viewing', hint: 'Suggest when and where you’d like to see the vehicle. The seller can accept or suggest another time.' },
  part: { button: 'Arrange collection', title: 'Arrange to see the part', hint: 'Suggest when and where to meet. The seller can accept or suggest another time.' },
  service: { button: 'Request a booking', title: 'Request a booking', hint: 'Suggest a time. The business confirms or suggests another time.' },
  import_route: { button: 'Book a consultation', title: 'Book an import consultation', hint: 'Suggest a time to talk through your import.' },
  business: { button: 'Request a booking', title: 'Request a booking', hint: 'Suggest a time. The business confirms or suggests another time.' },
};

/**
 * "Send enquiry" (+ optional viewing/booking request) for a listing or profile.
 * Signed-out visitors are sent to sign in first.
 */
export function EnquiryActions({ target, id, defaultMessage, meetup = true }: { target: ContactTarget; id: string; defaultMessage: string; meetup?: boolean }) {
  const auth = useAuth();
  const goToSignIn = useSignInRedirect();
  const navigate = useNavigate();
  const [open, setOpen] = useState<'enquiry' | 'meetup' | null>(null);
  const [message, setMessage] = useState(defaultMessage);
  const [when, setWhen] = useState('');
  const [where, setWhere] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canMeet = meetup && target !== 'profile';
  const copy = canMeet ? MEETUP_COPY[target as MeetupTarget] : null;

  const begin = (kind: 'enquiry' | 'meetup') => {
    if (auth.status === 'loading') return;
    if (auth.status !== 'signed-in') { toast('Sign in to message sellers', { description: 'Your conversations are kept in your Caryandi inbox.' }); goToSignIn(); return; }
    setError(null); setOpen(kind);
  };

  const done = (conversationOrMeetup: string, kind: 'enquiry' | 'meetup') => {
    setOpen(null);
    toast.success(kind === 'enquiry' ? 'Message sent.' : 'Request sent — you’ll be notified when they reply.', {
      action: kind === 'enquiry' ? { label: 'Open chat', onClick: () => void navigate({ to: '/dashboard/messages', search: { c: conversationOrMeetup } }) } : { label: 'View requests', onClick: () => void navigate({ to: '/dashboard/messages' }) },
    });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (open === 'enquiry') {
        done(await startEnquiry(target, id, message), 'enquiry');
      } else if (open === 'meetup' && canMeet) {
        const time = when ? new Date(when) : null;
        if (time && Number.isNaN(time.getTime())) throw new Error('Choose a valid date and time.');
        done(await requestMeetup(target as MeetupTarget, id, { proposedTime: time, locationNote: where, message: message === defaultMessage ? '' : message }), 'meetup');
      }
    } catch (err) {
      setError(errorText(err, 'That didn’t work. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  const minTime = useMinDateTime();
  return (
    <div className="mt-2 grid gap-2">
      <Button variant="outline" className="w-full" onClick={() => begin('enquiry')}><MessageSquare />Send a message</Button>
      {copy && <Button variant="outline" className="w-full" onClick={() => begin('meetup')}><CalendarClock />{copy.button}</Button>}
      <Dialog open={Boolean(open)} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{open === 'meetup' && copy ? copy.title : 'Send a message'}</DialogTitle>
              <DialogDescription>{open === 'meetup' && copy ? copy.hint : 'Your message goes to their Caryandi inbox; replies come back to yours.'}</DialogDescription>
            </DialogHeader>
            {open === 'meetup' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="meetup-when">When (optional)</Label><Input id="meetup-when" type="datetime-local" min={minTime} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
                <div className="grid gap-2"><Label htmlFor="meetup-where">Where (optional)</Label><Input id="meetup-where" maxLength={300} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. Manda Hill car park" /></div>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="enquiry-message">{open === 'meetup' ? 'Message (optional)' : 'Message'}</Label>
              <Textarea id="enquiry-message" rows={4} maxLength={open === 'meetup' ? 1000 : MAX_MESSAGE_LENGTH} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
              <Button type="submit" disabled={busy || (open === 'enquiry' && !message.trim())}>{busy && <Loader2 className="animate-spin" />}{open === 'meetup' ? 'Send request' : 'Send'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Earliest selectable time for datetime-local inputs (now, device time, minute precision). */
function useMinDateTime(): string {
  const [min, setMin] = useState('');
  useEffect(() => {
    const d = new Date(Date.now() + 5 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    setMin(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }, []);
  return min;
}


