-- =============================================================================
-- Caryandi · 0005 · Notifications, chat, meet-up requests, contact reveal
-- =============================================================================
-- Flow (the same for vehicles, parts, services, import routes and businesses):
--   1. Buyer opens a listing → "Send enquiry"  → public.start_conversation()
--      or "Show contact"                        → public.get_contact()
--        (phone + WhatsApp; sign-in required, every reveal is logged)
--   2. They chat in the in-app inbox (messages table).
--   3. "Request meet-up"                        → public.request_meetup()
--        posts a meet-up message in the chat and notifies the seller/provider.
--   4. Seller responds                          → public.respond_meetup()
-- Conversations, messages and meet-ups are visible to participants only.
-- =============================================================================

create type public.message_kind as enum ('text', 'meetup_request', 'meetup_update', 'system');
create type public.meetup_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'completed');

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type in (
                 'new_message', 'meetup_request', 'meetup_update', 'verification_update',
                 'listing_update', 'review_received', 'report_update', 'account_update')),
  title        text not null check (char_length(title) <= 150),
  body         text check (char_length(body) <= 500),
  link         text check (link ~ '^/'),
  data         jsonb not null default '{}',
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

-- Single entry point so new notification types stay easy to add.
create or replace function private.notify(
  p_recipient uuid, p_type text, p_title text,
  p_body text default null, p_link text default null, p_data jsonb default '{}'
) returns void language sql volatile security definer set search_path = '' as $$
  insert into public.notifications (recipient_id, type, title, body, link, data)
  values (p_recipient, p_type, left(p_title, 150), left(p_body, 500), p_link, coalesce(p_data, '{}'));
$$;

alter table public.notifications enable row level security;

create policy "users read their notifications"
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy "users mark their notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy "users delete their notifications"
  on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());

revoke all on public.notifications from anon;
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- Conversations
-- -----------------------------------------------------------------------------
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid not null references public.profiles (id) on delete cascade,
  business_id     uuid references public.businesses (id)    on delete set null,
  vehicle_id      uuid references public.vehicles (id)      on delete set null,
  part_id         uuid references public.parts (id)         on delete set null,
  service_id      uuid references public.services (id)      on delete set null,
  import_route_id uuid references public.import_routes (id) on delete set null,
  -- Snapshot of what the chat is about, e.g. "2020 Toyota Harrier Premium".
  subject_label   text not null check (char_length(subject_label) <= 200),
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  check (num_nonnulls(vehicle_id, part_id, service_id, import_route_id) <= 1)
);

create index conversations_created_by_idx on public.conversations (created_by, created_at desc);
create index conversations_vehicle_idx on public.conversations (vehicle_id) where vehicle_id is not null;

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id)      on delete cascade,
  last_read_at    timestamptz,
  is_archived     boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create index conversation_participants_profile_idx on public.conversation_participants (profile_id);

create or replace function private.is_conversation_participant(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and profile_id = auth.uid()
  );
$$;

grant execute on function private.is_conversation_participant(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Meet-up requests
-- -----------------------------------------------------------------------------
create table public.meetup_requests (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  requester_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id    uuid not null references public.profiles (id) on delete cascade,
  business_id     uuid references public.businesses (id)    on delete set null,
  vehicle_id      uuid references public.vehicles (id)      on delete set null,
  part_id         uuid references public.parts (id)         on delete set null,
  service_id      uuid references public.services (id)      on delete set null,
  import_route_id uuid references public.import_routes (id) on delete set null,
  purpose         text not null check (purpose in (
                    'vehicle_viewing', 'part_viewing', 'service_booking', 'import_consultation', 'general')),
  proposed_time   timestamptz,
  location_note   text check (char_length(location_note) <= 300),
  message         text check (char_length(message) <= 1000),
  status          public.meetup_status not null default 'pending',
  response_note   text check (char_length(response_note) <= 500),
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

create unique index meetup_one_pending_per_conversation
  on public.meetup_requests (conversation_id, requester_id) where status = 'pending';
create index meetup_recipient_idx on public.meetup_requests (recipient_id, status, created_at desc);
create index meetup_requester_idx on public.meetup_requests (requester_id, created_at desc);
create index meetup_business_idx  on public.meetup_requests (business_id, status) where business_id is not null;

create trigger meetup_requests_set_updated_at
  before update on public.meetup_requests
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Messages
-- -----------------------------------------------------------------------------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid default auth.uid() references public.profiles (id) on delete set null,
  kind            public.message_kind not null default 'text',
  body            text not null check (char_length(trim(body)) between 1 and 4000),
  meetup_id       uuid references public.meetup_requests (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- After every message: bump the conversation and notify the other side.
-- Chat notifications are collapsed: at most one unread "new message"
-- notification per conversation per 10 minutes.
create or replace function private.on_message_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_sender_name text;
  v_label       text;
  r             record;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;

  if new.kind <> 'text' then
    return new;  -- meet-up messages notify from their own RPCs
  end if;

  select full_name into v_sender_name from public.profiles where id = new.sender_id;
  select subject_label into v_label from public.conversations where id = new.conversation_id;

  for r in
    select cp.profile_id from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id and cp.profile_id <> new.sender_id
  loop
    if not exists (
      select 1 from public.notifications n
      where n.recipient_id = r.profile_id and n.type = 'new_message' and n.read_at is null
        and n.data ->> 'conversation_id' = new.conversation_id::text
        and n.created_at > now() - interval '10 minutes'
    ) then
      perform private.notify(
        r.profile_id, 'new_message',
        'New message from ' || coalesce(v_sender_name, 'a Caryandi user'),
        v_label || ': ' || left(new.body, 140),
        '/dashboard/messages?c=' || new.conversation_id,
        jsonb_build_object('conversation_id', new.conversation_id));
    end if;
  end loop;
  return new;
end $$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function private.on_message_created();

-- -----------------------------------------------------------------------------
-- Rate limiting helper (simple counts over a time window).
-- -----------------------------------------------------------------------------
create or replace function private.assert_rate_limit(p_count bigint, p_max integer, p_what text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_count >= p_max then
    raise exception 'Too many % — please try again later', p_what using errcode = '54000';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Resolve what a buyer is contacting: who receives it, which business, and a
-- human label. Only live/public targets can be contacted.
-- -----------------------------------------------------------------------------
create type private.contact_target as (
  recipient_id    uuid,
  business_id     uuid,
  vehicle_id      uuid,
  part_id         uuid,
  service_id      uuid,
  import_route_id uuid,
  label           text,
  purpose         text
);

create or replace function private.resolve_contact_target(p_target_type text, p_target_id uuid)
returns private.contact_target language plpgsql stable security definer set search_path = '' as $$
declare
  t private.contact_target;
begin
  case p_target_type
    when 'vehicle' then
      select v.owner_id, v.business_id, v.id, null, null, null,
             v.year || ' ' || v.make || ' ' || v.model || coalesce(' ' || v.variant, ''),
             'vehicle_viewing'
        into t
        from public.vehicles v
       where v.id = p_target_id and v.listing_status = 'active' and v.deleted_at is null
         and private.is_profile_active(v.owner_id);
    when 'part' then
      select p.owner_id, p.business_id, null, p.id, null, null, p.title, 'part_viewing'
        into t
        from public.parts p
       where p.id = p_target_id and p.listing_status = 'active' and p.deleted_at is null
         and private.is_profile_active(p.owner_id);
    when 'service' then
      select b.owner_id, b.id, null, null, s.id, null, s.name || ' — ' || b.name, 'service_booking'
        into t
        from public.services s join public.businesses b on b.id = s.business_id
       where s.id = p_target_id and s.is_active and private.is_business_public(b.id);
    when 'import_route' then
      select b.owner_id, b.id, null, null, null, r.id,
             r.origin_country || coalesce(' via ' || r.transit_port, '') || ' → ' || r.destination_city
               || ' (' || b.name || ')',
             'import_consultation'
        into t
        from public.import_routes r join public.businesses b on b.id = r.business_id
       where r.id = p_target_id and r.is_active and private.is_business_public(b.id);
    when 'business' then
      select b.owner_id, b.id, null, null, null, null, b.name, 'general'
        into t
        from public.businesses b
       where b.id = p_target_id and private.is_business_public(b.id);
    when 'profile' then
      select p.id, null, null, null, null, null, p.full_name, 'general'
        into t
        from public.profiles p
       where p.id = p_target_id and p.account_status = 'active';
    else
      raise exception 'Unknown contact target type: %', p_target_type using errcode = '22023';
  end case;

  if t.recipient_id is null then
    raise exception 'This listing is not available' using errcode = 'P0002';
  end if;
  if t.recipient_id = auth.uid()
     or (t.business_id is not null and private.is_business_member(t.business_id)) then
    raise exception 'You cannot contact your own listing' using errcode = '22023';
  end if;
  return t;
end $$;

-- -----------------------------------------------------------------------------
-- Find or create the conversation between the current user and a target.
-- -----------------------------------------------------------------------------
create or replace function private.get_or_create_conversation(t private.contact_target)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me   uuid := auth.uid();
  v_id   uuid;
  v_recent bigint;
begin
  select c.id into v_id
    from public.conversations c
    join public.conversation_participants me on me.conversation_id = c.id and me.profile_id = v_me
   where c.business_id     is not distinct from t.business_id
     and c.vehicle_id      is not distinct from t.vehicle_id
     and c.part_id         is not distinct from t.part_id
     and c.service_id      is not distinct from t.service_id
     and c.import_route_id is not distinct from t.import_route_id
     and exists (select 1 from public.conversation_participants o
                  where o.conversation_id = c.id and o.profile_id = t.recipient_id)
   order by c.created_at desc
   limit 1;

  if v_id is not null then
    return v_id;
  end if;

  select count(*) into v_recent from public.conversations
   where created_by = v_me and created_at > now() - interval '1 hour';
  perform private.assert_rate_limit(v_recent, 20, 'new conversations');

  insert into public.conversations
    (created_by, business_id, vehicle_id, part_id, service_id, import_route_id, subject_label)
  values
    (v_me, t.business_id, t.vehicle_id, t.part_id, t.service_id, t.import_route_id, left(t.label, 200))
  returning id into v_id;

  insert into public.conversation_participants (conversation_id, profile_id, last_read_at)
  values (v_id, v_me, now());

  -- The seller/provider, plus their team for business listings.
  insert into public.conversation_participants (conversation_id, profile_id)
  select v_id, t.recipient_id
  union
  select v_id, m.profile_id from public.business_members m
   where t.business_id is not null and m.business_id = t.business_id
  on conflict do nothing;

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- RPC: start (or reopen) a chat about a listing, optionally with a first message.
-- p_target_type: 'vehicle' | 'part' | 'service' | 'import_route' | 'business' | 'profile'
-- -----------------------------------------------------------------------------
create or replace function public.start_conversation(
  p_target_type text, p_target_id uuid, p_message text default null
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  t    private.contact_target;
  v_id uuid;
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Sign in to contact sellers' using errcode = '42501';
  end if;

  t := private.resolve_contact_target(p_target_type, p_target_id);
  v_id := private.get_or_create_conversation(t);

  if nullif(trim(p_message), '') is not null then
    insert into public.messages (conversation_id, sender_id, kind, body)
    values (v_id, auth.uid(), 'text', left(trim(p_message), 4000));
  end if;

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- RPC: request a meet-up. Posts a message in the chat and notifies the seller.
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

  -- Notify the seller/provider and, for businesses, their managers.
  for r in
    select t.recipient_id as profile_id
    union
    select m.profile_id from public.business_members m
     where t.business_id is not null and m.business_id = t.business_id and m.role in ('owner', 'manager')
  loop
    perform private.notify(
      r.profile_id, 'meetup_request', 'Meet-up request from ' || v_name, v_body,
      '/dashboard/requests', jsonb_build_object('meetup_id', v_meetup, 'conversation_id', v_conv));
  end loop;

  return v_meetup;
end $$;

-- -----------------------------------------------------------------------------
-- RPC: respond to a meet-up.
--   Seller side (recipient or their business team): accepted, declined, completed
--   Requester: cancelled
-- -----------------------------------------------------------------------------
create or replace function public.respond_meetup(
  p_meetup_id uuid, p_status public.meetup_status, p_note text default null
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me   uuid := auth.uid();
  m      public.meetup_requests;
  v_name text;
  v_body text;
  v_is_seller_side boolean;
  v_notify uuid;
begin
  if v_me is null or not private.is_active_user() then
    raise exception 'Sign in to respond' using errcode = '42501';
  end if;

  select * into m from public.meetup_requests where id = p_meetup_id for update;
  if m.id is null then
    raise exception 'Meet-up request not found' using errcode = 'P0002';
  end if;

  v_is_seller_side := m.recipient_id = v_me
    or (m.business_id is not null and private.is_business_member(m.business_id));

  if p_status in ('accepted', 'declined', 'completed') and not v_is_seller_side then
    raise exception 'Only the seller can % this meet-up', p_status using errcode = '42501';
  end if;
  if p_status = 'cancelled' and m.requester_id <> v_me and not v_is_seller_side then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status = 'pending' then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if not (
       (m.status = 'pending'  and p_status in ('accepted', 'declined', 'cancelled'))
    or (m.status = 'accepted' and p_status in ('completed', 'cancelled'))
  ) then
    raise exception 'Cannot change a % meet-up to %', m.status, p_status using errcode = '22023';
  end if;

  update public.meetup_requests
     set status = p_status, response_note = nullif(trim(p_note), ''), responded_at = now()
   where id = p_meetup_id;

  select full_name into v_name from public.profiles where id = v_me;
  v_body := v_name || case p_status
      when 'accepted'  then ' accepted the meet-up request.'
      when 'declined'  then ' declined the meet-up request.'
      when 'cancelled' then ' cancelled the meet-up.'
      when 'completed' then ' marked the meet-up as completed.'
    end || coalesce(E'\n' || nullif(trim(p_note), ''), '');

  insert into public.messages (conversation_id, sender_id, kind, body, meetup_id)
  values (m.conversation_id, v_me, 'meetup_update', left(v_body, 4000), m.id);

  v_notify := case when v_me = m.requester_id then m.recipient_id else m.requester_id end;
  perform private.notify(v_notify, 'meetup_update', 'Meet-up ' || p_status::text, v_body,
    '/dashboard/messages?c=' || m.conversation_id,
    jsonb_build_object('meetup_id', m.id, 'conversation_id', m.conversation_id));
end $$;

-- -----------------------------------------------------------------------------
-- Contact reveal: phone + WhatsApp, for signed-in users only, rate-limited and
-- logged. The log lets an administrator see who contacted whom if a scam is
-- reported, without making numbers scrapeable by anonymous visitors.
-- -----------------------------------------------------------------------------
create table public.contact_reveals (
  id               bigint generated always as identity primary key,
  viewer_id        uuid not null references public.profiles (id) on delete cascade,
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  business_id      uuid references public.businesses (id) on delete set null,
  target_type      text not null,
  target_id        uuid not null,
  created_at       timestamptz not null default now()
);

create index contact_reveals_viewer_idx on public.contact_reveals (viewer_id, created_at desc);
create index contact_reveals_owner_idx  on public.contact_reveals (owner_profile_id, created_at desc);

alter table public.contact_reveals enable row level security;
create policy "admins read contact reveal log"
  on public.contact_reveals for select to authenticated using (private.is_admin());
revoke all on public.contact_reveals from anon;
revoke insert, update, delete on public.contact_reveals from authenticated;

create or replace function public.get_contact(p_target_type text, p_target_id uuid)
returns table (display_name text, phone text, whatsapp_number text, whatsapp_link text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  t        private.contact_target;
  v_me     uuid := auth.uid();
  v_recent bigint;
  v_phone  text;
  v_wa     text;
  v_name   text;
begin
  if v_me is null or not private.is_active_user() then
    raise exception 'Sign in to see contact details' using errcode = '42501';
  end if;

  select count(*) into v_recent from public.contact_reveals
   where viewer_id = v_me and created_at > now() - interval '1 hour';
  perform private.assert_rate_limit(v_recent, 30, 'contact requests');

  t := private.resolve_contact_target(p_target_type, p_target_id);

  if t.business_id is not null then
    select bc.phone, bc.whatsapp_number, b.name into v_phone, v_wa, v_name
      from public.businesses b
      left join public.business_contacts bc on bc.business_id = b.id
     where b.id = t.business_id;
  end if;

  if v_phone is null and v_wa is null then
    select pc.phone, pc.whatsapp_number, coalesce(v_name, p.full_name) into v_phone, v_wa, v_name
      from public.profiles p
      left join public.profile_contacts pc on pc.profile_id = p.id
     where p.id = t.recipient_id;
  end if;

  insert into public.contact_reveals (viewer_id, owner_profile_id, business_id, target_type, target_id)
  values (v_me, t.recipient_id, t.business_id, p_target_type, p_target_id);

  return query select
    v_name, v_phone, v_wa,
    case when v_wa is not null then 'https://wa.me/' || regexp_replace(v_wa, '\D', '', 'g') end;
end $$;

-- -----------------------------------------------------------------------------
-- RLS for chat tables. No direct inserts into conversations or meet-ups:
-- those go through the RPCs above.
-- -----------------------------------------------------------------------------
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.meetup_requests           enable row level security;
alter table public.messages                  enable row level security;

create policy "participants read conversations"
  on public.conversations for select to authenticated
  using (private.is_conversation_participant(id));

create policy "participants see who is in the conversation"
  on public.conversation_participants for select to authenticated
  using (private.is_conversation_participant(conversation_id));

create policy "participants update their own read state"
  on public.conversation_participants for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "participants read meet-ups"
  on public.meetup_requests for select to authenticated
  using (
    requester_id = auth.uid() or recipient_id = auth.uid()
    or private.is_conversation_participant(conversation_id)
  );

create policy "participants read messages"
  on public.messages for select to authenticated
  using (private.is_conversation_participant(conversation_id));

create policy "participants send text messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and private.is_active_user()
    and private.is_conversation_participant(conversation_id)
  );

revoke all on public.conversations, public.conversation_participants,
              public.meetup_requests, public.messages from anon;
revoke insert, update, delete on public.conversations from authenticated;
revoke insert, update, delete on public.meetup_requests from authenticated;
revoke insert, delete on public.conversation_participants from authenticated;
revoke update on public.conversation_participants from authenticated;
grant update (last_read_at, is_archived) on public.conversation_participants to authenticated;
revoke insert, update, delete on public.messages from authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;

-- RPC permissions: signed-in users only.
revoke execute on function public.start_conversation(text, uuid, text) from public, anon;
revoke execute on function public.request_meetup(text, uuid, timestamptz, text, text) from public, anon;
revoke execute on function public.respond_meetup(uuid, public.meetup_status, text) from public, anon;
revoke execute on function public.get_contact(text, uuid) from public, anon;
grant execute on function public.start_conversation(text, uuid, text) to authenticated;
grant execute on function public.request_meetup(text, uuid, timestamptz, text, text) to authenticated;
grant execute on function public.respond_meetup(uuid, public.meetup_status, text) to authenticated;
grant execute on function public.get_contact(text, uuid) to authenticated;
