import { getSupabase } from '@/lib/supabase/client';
import type { Enums, Views } from '@/lib/supabase/database.types';
import { ServiceError } from '@/lib/vehicles/vehicle-service';
import type { ContactTarget } from '@/lib/marketplace/engagement-service';

/**
 * In-app enquiries, chat and meet-up / booking requests.
 * Conversations are created only through the start_conversation and
 * request_meetup database functions, which check that the listing is live and
 * that you are not contacting yourself. Row-level security keeps every
 * conversation visible to its participants only.
 */

export type InboxRow = Views<'inbox'>;
export type ThreadMessage = Views<'conversation_messages'>;
export type MeetupDetail = Views<'meetup_request_details'>;
export type MeetupStatus = Enums<'meetup_status'>;

export const MAX_MESSAGE_LENGTH = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MEETUP_STATUS_LABELS: Record<MeetupStatus, string> = {
  pending: 'Waiting for reply',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

export const MEETUP_PURPOSE_LABELS: Record<string, string> = {
  vehicle_viewing: 'Vehicle viewing',
  part_viewing: 'Part viewing',
  service_booking: 'Service booking',
  import_consultation: 'Import consultation',
  general: 'Meet-up',
};

function fail(message: string, cause?: unknown): never {
  if (cause) console.error(message, cause);
  throw new ServiceError(message);
}

/** Turns the database's own rule violations into text a user can act on. */
function friendly(error: { code?: string; message?: string }, fallback: string): string {
  const msg = error.message ?? '';
  if (error.code === '54000' || /too many/i.test(msg)) return 'You’re sending a lot right now. Please wait a few minutes and try again.';
  if (/own listing/i.test(msg)) return 'This is your own listing.';
  if (/not available/i.test(msg)) return 'This listing is no longer available.';
  if (/pending meet-up/i.test(msg)) return 'You already have a request waiting for a reply on this listing.';
  if (/future/i.test(msg)) return 'Choose a time in the future.';
  if (/sign in/i.test(msg) || error.code === '42501') return 'Please sign in to continue.';
  if (/only the seller|not allowed|cannot change/i.test(msg)) return 'This request can’t be changed like that any more.';
  return fallback;
}

async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) fail('Please sign in to continue.');
  return id;
}

/* ------------------------------------------------------------------ starting a conversation */

export async function startEnquiry(target: ContactTarget, id: string, message: string): Promise<string> {
  const text = message.trim();
  if (!text) fail('Write a short message first.');
  if (text.length > MAX_MESSAGE_LENGTH) fail('Your message is too long.');
  const { data, error } = await getSupabase().rpc('start_conversation', { p_target_type: target, p_target_id: id, p_message: text });
  if (error || !data) fail(error ? friendly(error, 'We couldn’t send your enquiry. Please try again.') : 'We couldn’t send your enquiry.', error);
  return data;
}

export type MeetupTarget = Exclude<ContactTarget, 'profile'>;

export async function requestMeetup(
  target: MeetupTarget,
  id: string,
  input: { proposedTime: Date | null; locationNote: string; message: string },
): Promise<string> {
  if (input.proposedTime && input.proposedTime.getTime() < Date.now()) fail('Choose a time in the future.');
  const location = input.locationNote.trim().slice(0, 300);
  const message = input.message.trim().slice(0, 1000);
  const { data, error } = await getSupabase().rpc('request_meetup', {
    p_target_type: target,
    p_target_id: id,
    ...(input.proposedTime ? { p_proposed_time: input.proposedTime.toISOString() } : {}),
    ...(location ? { p_location_note: location } : {}),
    ...(message ? { p_message: message } : {}),
  });
  if (error || !data) fail(error ? friendly(error, 'We couldn’t send your request. Please try again.') : 'We couldn’t send your request.', error);
  return data;
}

/* ------------------------------------------------------------------ inbox */

export type InboxFilter = { received?: boolean; archived?: boolean };

export async function listInbox(filter: InboxFilter = {}): Promise<InboxRow[]> {
  let query = getSupabase().from('inbox').select('*').eq('is_archived', Boolean(filter.archived));
  if (filter.received) query = query.eq('started_by_me', false);
  const { data, error } = await query.order('last_message_at', { ascending: false }).limit(100);
  if (error) fail('We couldn’t load your messages.', error);
  return data ?? [];
}

export async function unreadMessageCount(): Promise<number> {
  const { data, error } = await getSupabase().from('inbox').select('unread_count').eq('is_archived', false).gt('unread_count', 0);
  if (error) return 0;
  return (data ?? []).reduce((sum, r) => sum + (r.unread_count ?? 0), 0);
}

export async function getThread(conversationId: string): Promise<{ conversation: InboxRow; messages: ThreadMessage[] } | null> {
  if (!UUID.test(conversationId)) return null;
  const supabase = getSupabase();
  const [c, m] = await Promise.all([
    supabase.from('inbox').select('*').eq('id', conversationId).maybeSingle(),
    supabase.from('conversation_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(200),
  ]);
  if (c.error || m.error) fail('We couldn’t load this conversation.', c.error ?? m.error);
  if (!c.data) return null;
  return { conversation: c.data, messages: (m.data ?? []).reverse() };
}

export async function sendMessage(conversationId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;
  if (text.length > MAX_MESSAGE_LENGTH) fail('Your message is too long.');
  const { error } = await getSupabase().from('messages').insert({ conversation_id: conversationId, body: text });
  if (error) fail(friendly(error, 'Your message wasn’t sent. Please try again.'), error);
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await getSupabase().rpc('mark_conversation_read', { p_conversation_id: conversationId });
  if (error) console.error('mark read failed', error);
}

export async function setConversationArchived(conversationId: string, archived: boolean): Promise<void> {
  const uid = await currentUserId();
  const { data, error } = await getSupabase()
    .from('conversation_participants')
    .update({ is_archived: archived })
    .eq('conversation_id', conversationId)
    .eq('profile_id', uid)
    .select('conversation_id');
  if (error || !data?.length) fail('We couldn’t update this conversation.', error);
}

/* ------------------------------------------------------------------ meet-up / booking requests */

export async function listMeetups(direction: 'received' | 'sent'): Promise<MeetupDetail[]> {
  const { data, error } = await getSupabase()
    .from('meetup_request_details')
    .select('*')
    .eq('is_mine', direction === 'sent')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) fail('We couldn’t load requests.', error);
  return data ?? [];
}

export async function respondMeetup(meetupId: string, status: Exclude<MeetupStatus, 'pending'>, note: string): Promise<void> {
  const trimmed = note.trim().slice(0, 500);
  const { error } = await getSupabase().rpc('respond_meetup', {
    p_meetup_id: meetupId,
    p_status: status,
    ...(trimmed ? { p_note: trimmed } : {}),
  });
  if (error) fail(friendly(error, 'We couldn’t update this request.'), error);
}

/** Which responses the current user may give (mirrors respond_meetup's rules). */
export function meetupActions(m: { status: MeetupStatus | null; is_mine: boolean | null }): Array<Exclude<MeetupStatus, 'pending'>> {
  if (m.is_mine) return m.status === 'pending' || m.status === 'accepted' ? ['cancelled'] : [];
  if (m.status === 'pending') return ['accepted', 'declined'];
  if (m.status === 'accepted') return ['completed', 'cancelled'];
  return [];
}
