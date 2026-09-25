-- =============================================================================
-- Caryandi · 0013 · Inbox read models, read receipts, message rate limit (Stage 8)
-- =============================================================================
-- The chat tables, start_conversation / request_meetup / respond_meetup and
-- notifications already exist (migration 0005). This adds what the dashboard
-- inbox needs:
--   * inbox                  — one row per conversation for the current user
--   * conversation_messages  — messages with sender name and meet-up state
--   * meetup_request_details — meet-up / booking requests with names
--   * mark_conversation_read — server-timed read receipt
--   * a per-user message rate limit (anti-spam)
-- All views are security_invoker, so participants-only RLS still applies.
-- =============================================================================

create or replace view public.inbox with (security_invoker = true) as
select
  c.id,
  c.subject_label,
  c.business_id,
  c.vehicle_id,
  c.part_id,
  c.service_id,
  c.import_route_id,
  c.created_by,
  (c.created_by = auth.uid())                                   as started_by_me,
  c.last_message_at,
  c.created_at,
  me.last_read_at,
  me.is_archived,
  lm.body                                                        as last_body,
  lm.kind                                                        as last_kind,
  (lm.sender_id = auth.uid())                                    as last_from_me,
  (select count(*) from public.messages m
    where m.conversation_id = c.id
      and m.sender_id is distinct from auth.uid()
      and (me.last_read_at is null or m.created_at > me.last_read_at))::int as unread_count,
  case
    when c.created_by = auth.uid() then coalesce(b.name, other.full_name, 'Seller')
    else coalesce(creator.full_name, 'Caryandi user')
  end                                                            as counterpart_name
from public.conversations c
join public.conversation_participants me
  on me.conversation_id = c.id and me.profile_id = auth.uid()
left join lateral (
  select m.body, m.kind, m.sender_id
    from public.messages m
   where m.conversation_id = c.id
   order by m.created_at desc
   limit 1) lm on true
left join public.businesses b on b.id = c.business_id
left join public.profiles creator on creator.id = c.created_by
left join lateral (
  select p.full_name
    from public.conversation_participants o
    join public.profiles p on p.id = o.profile_id
   where o.conversation_id = c.id and o.profile_id <> auth.uid()
   order by o.joined_at
   limit 1) other on true;

create or replace view public.conversation_messages with (security_invoker = true) as
select
  m.id,
  m.conversation_id,
  m.sender_id,
  (m.sender_id = auth.uid())  as is_mine,
  p.full_name                 as sender_name,
  m.kind,
  m.body,
  m.meetup_id,
  mr.status                   as meetup_status,
  mr.proposed_time            as meetup_proposed_time,
  mr.requester_id             as meetup_requester_id,
  m.created_at
from public.messages m
left join public.profiles p on p.id = m.sender_id
left join public.meetup_requests mr on mr.id = m.meetup_id;

create or replace view public.meetup_request_details with (security_invoker = true) as
select
  mr.id,
  mr.conversation_id,
  mr.requester_id,
  mr.recipient_id,
  mr.business_id,
  mr.vehicle_id,
  mr.part_id,
  mr.service_id,
  mr.import_route_id,
  mr.purpose,
  mr.proposed_time,
  mr.location_note,
  mr.message,
  mr.status,
  mr.response_note,
  mr.responded_at,
  mr.created_at,
  (mr.requester_id = auth.uid())  as is_mine,
  c.subject_label,
  req.full_name                   as requester_name,
  coalesce(b.name, rec.full_name) as recipient_name
from public.meetup_requests mr
join public.conversations c on c.id = mr.conversation_id
left join public.profiles req on req.id = mr.requester_id
left join public.profiles rec on rec.id = mr.recipient_id
left join public.businesses b on b.id = mr.business_id;

revoke all on public.inbox, public.conversation_messages, public.meetup_request_details from anon;
grant select on public.inbox, public.conversation_messages, public.meetup_request_details to authenticated;

-- Read receipt with the server's clock (a phone with the wrong time must not
-- hide new messages).
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.conversation_participants
     set last_read_at = now()
   where conversation_id = p_conversation_id and profile_id = auth.uid();
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Anti-spam: at most 60 messages per user in any 10 minutes. Meet-up system
-- messages are written by the RPCs (which have their own limits).
create or replace function private.limit_messages()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recent bigint;
begin
  if new.kind = 'text' and new.sender_id is not null then
    select count(*) into v_recent from public.messages
     where sender_id = new.sender_id and created_at > now() - interval '10 minutes';
    perform private.assert_rate_limit(v_recent, 60, 'messages');
  end if;
  return new;
end $$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function private.limit_messages();

-- -----------------------------------------------------------------------------
-- request_meetup: same as migration 0005, except the notification links to the
-- dashboard page the recipient's account type can open.
-- -----------------------------------------------------------------------------
create or replace function public.request_meetup(
  p_target_type   text,
  p_target_id     uuid,
  p_proposed_time timestamptz default null,
  p_location_note text default null,
  p_message       text default null
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  t          private.contact_target;
  v_me       uuid := auth.uid();
  v_conv     uuid;
  v_meetup   uuid;
  v_name     text;
  v_body     text;
  v_recent   bigint;
  v_link     text;
  r          record;
begin
  if v_me is null or not private.is_active_user() then
    raise exception 'Sign in to request a meet-up' using errcode = '42501';
  end if;
  if p_proposed_time is not null and p_proposed_time < now() then
    raise exception 'Choose a meet-up time in the future' using errcode = '22023';
  end if;

  select count(*) into v_recent from public.meetup_requests
   where requester_id = v_me and created_at > now() - interval '1 day';
  perform private.assert_rate_limit(v_recent, 15, 'meet-up requests today');

  t := private.resolve_contact_target(p_target_type, p_target_id);
  v_conv := private.get_or_create_conversation(t);

  if exists (select 1 from public.meetup_requests
              where conversation_id = v_conv and requester_id = v_me and status = 'pending') then
    raise exception 'You already have a pending meet-up request for this listing' using errcode = '23505';
  end if;

  insert into public.meetup_requests
    (conversation_id, requester_id, recipient_id, business_id, vehicle_id, part_id,
     service_id, import_route_id, purpose, proposed_time, location_note, message)
  values
    (v_conv, v_me, t.recipient_id, t.business_id, t.vehicle_id, t.part_id,
     t.service_id, t.import_route_id, t.purpose, p_proposed_time,
     nullif(trim(p_location_note), ''), nullif(trim(p_message), ''))
  returning id into v_meetup;

  select full_name into v_name from public.profiles where id = v_me;

  v_body := v_name || case t.purpose
      when 'vehicle_viewing'     then ' would like to meet to view and inspect the ' || t.label || '.'
      when 'part_viewing'        then ' would like to meet to see the ' || t.label || '.'
      when 'service_booking'     then ' would like to book: ' || t.label || '.'
      when 'import_consultation' then ' would like to meet to discuss an import: ' || t.label || '.'
      else ' would like to meet (' || t.label || ').'
    end
    || coalesce(E'\nProposed time: ' ||
         to_char(p_proposed_time at time zone 'Africa/Lusaka', 'Dy DD Mon YYYY, HH24:MI'), '')
    || coalesce(E'\nWhere: ' || nullif(trim(p_location_note), ''), '')
    || coalesce(E'\n' || nullif(trim(p_message), ''), '');

  insert into public.messages (conversation_id, sender_id, kind, body, meetup_id)
  values (v_conv, v_me, 'meetup_request', left(v_body, 4000), v_meetup);

  -- Mechanics and servicing companies manage these under "Service requests";
  -- everyone else under "Enquiries".
  v_link := case
    when exists (select 1 from public.businesses b
                  where b.id = t.business_id and b.business_type in ('mechanic', 'servicing_company'))
      then '/dashboard/requests'
    else '/dashboard/enquiries'
  end;

  -- Notify the seller/provider and, for businesses, their managers.
  for r in
    select t.recipient_id as profile_id
    union
    select m.profile_id from public.business_members m
     where t.business_id is not null and m.business_id = t.business_id and m.role in ('owner', 'manager')
  loop
    perform private.notify(
      r.profile_id, 'meetup_request', 'Meet-up request from ' || v_name, v_body,
      v_link, jsonb_build_object('meetup_id', v_meetup, 'conversation_id', v_conv));
  end loop;

  return v_meetup;
end $$;

revoke execute on function public.request_meetup(text, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.request_meetup(text, uuid, timestamptz, text, text) to authenticated;
