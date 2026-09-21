-- =============================================================================
-- Caryandi · 0006 · Reviews, reports (incl. scam reports), admin actions,
-- audit log, information content.
-- =============================================================================

create type public.review_status   as enum ('published', 'hidden');
create type public.report_status   as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.report_category as enum ('scam', 'misleading_listing', 'inappropriate_content', 'spam', 'other');
create type public.report_target   as enum ('vehicle', 'part', 'business', 'profile', 'review', 'message');

-- -----------------------------------------------------------------------------
-- Audit log (append-only; written only by admin functions)
-- -----------------------------------------------------------------------------
create table public.admin_audit_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text not null,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

create or replace function private.audit(
  p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'
) returns void language sql volatile security definer set search_path = '' as $$
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'));
$$;

create or replace function private.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
end $$;

alter table public.admin_audit_log enable row level security;
create policy "admins read the audit log"
  on public.admin_audit_log for select to authenticated using (private.is_admin());
revoke all on public.admin_audit_log from anon;
revoke insert, update, delete on public.admin_audit_log from authenticated;

-- -----------------------------------------------------------------------------
-- Reviews: of a business, or of a private seller (their profile).
-- One review per reviewer per target; editable by its author.
-- To keep reviews genuine, the reviewer must have chatted with the seller or
-- business on Caryandi first.
-- -----------------------------------------------------------------------------
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete cascade,
  seller_id   uuid references public.profiles (id)   on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (char_length(body) <= 2000),
  status      public.review_status not null default 'published',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (num_nonnulls(business_id, seller_id) = 1)
);

create unique index reviews_one_per_business on public.reviews (reviewer_id, business_id) where business_id is not null;
create unique index reviews_one_per_seller   on public.reviews (reviewer_id, seller_id)   where seller_id is not null;
create index reviews_business_idx on public.reviews (business_id, created_at desc) where status = 'published';
create index reviews_seller_idx   on public.reviews (seller_id, created_at desc)   where status = 'published';

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function private.set_updated_at();

create or replace function private.validate_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.seller_id = new.reviewer_id
     or (new.business_id is not null and exists (
           select 1 from public.business_members
            where business_id = new.business_id and profile_id = new.reviewer_id)) then
    raise exception 'You cannot review yourself or your own business' using errcode = '22023';
  end if;

  if new.business_id is not null and not exists (
       select 1 from public.conversations c
       join public.conversation_participants p on p.conversation_id = c.id and p.profile_id = new.reviewer_id
      where c.business_id = new.business_id) then
    raise exception 'You can review a business after contacting it on Caryandi' using errcode = '22023';
  end if;

  if new.seller_id is not null and not exists (
       select 1 from public.conversation_participants a
       join public.conversation_participants b on b.conversation_id = a.conversation_id
      where a.profile_id = new.reviewer_id and b.profile_id = new.seller_id) then
    raise exception 'You can review a seller after contacting them on Caryandi' using errcode = '22023';
  end if;

  return new;
end $$;

create trigger reviews_validate
  before insert on public.reviews
  for each row execute function private.validate_review();

-- Ratings are always recalculated from published reviews — never trusted
-- from the client and never incremented blindly.
create or replace function private.refresh_rating(p_business_id uuid, p_seller_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.begin_system_write();
  if p_business_id is not null then
    update public.businesses b
       set rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r
                                     where r.business_id = b.id and r.status = 'published'), 0),
           rating_count = (select count(*) from public.reviews r
                            where r.business_id = b.id and r.status = 'published')
     where b.id = p_business_id;
  end if;
  if p_seller_id is not null then
    update public.profiles p
       set rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r
                                     where r.seller_id = p.id and r.status = 'published'), 0),
           rating_count = (select count(*) from public.reviews r
                            where r.seller_id = p.id and r.status = 'published')
     where p.id = p_seller_id;
  end if;
  perform private.end_system_write();
end $$;

create or replace function private.on_review_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_name  text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.refresh_rating(old.business_id, old.seller_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.refresh_rating(new.business_id, new.seller_id);
  end if;

  if tg_op = 'INSERT' then
    select full_name into v_name from public.profiles where id = new.reviewer_id;
    if new.business_id is not null then
      select owner_id into v_owner from public.businesses where id = new.business_id;
    else
      v_owner := new.seller_id;
    end if;
    perform private.notify(v_owner, 'review_received',
      'New ' || new.rating || '-star review',
      coalesce(v_name, 'A customer') || coalesce(': ' || left(new.body, 140), ' left you a rating.'),
      '/dashboard/reviews', jsonb_build_object('review_id', new.id));
  end if;
  return null;
end $$;

create trigger reviews_after_change
  after insert or update or delete on public.reviews
  for each row execute function private.on_review_changed();

alter table public.reviews enable row level security;

create policy "public reads published reviews"
  on public.reviews for select to anon, authenticated
  using (status = 'published' or reviewer_id = auth.uid() or private.is_admin());

create policy "users write one review per seller"
  on public.reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and private.is_active_user());

create policy "authors edit their review"
  on public.reviews for update to authenticated
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());

create policy "authors delete their review"
  on public.reviews for delete to authenticated
  using (reviewer_id = auth.uid());

revoke insert, update, delete on public.reviews from anon;
revoke insert, update on public.reviews from authenticated;
grant insert (business_id, seller_id, rating, body) on public.reviews to authenticated;
grant update (rating, body) on public.reviews to authenticated;

-- -----------------------------------------------------------------------------
-- Reports
-- -----------------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type public.report_target   not null,
  target_id   uuid not null,
  category    public.report_category not null,
  details     text not null check (char_length(details) between 10 and 3000),
  status      public.report_status not null default 'open',
  admin_notes text check (char_length(admin_notes) <= 3000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index reports_queue_idx    on public.reports (status, created_at);
create index reports_target_idx   on public.reports (target_type, target_id);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function private.set_updated_at();

-- The profile a report is ultimately about (listing owner, business owner …).
create or replace function private.report_subject_profile(p_type public.report_target, p_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'vehicle'  then (select owner_id    from public.vehicles   where id = p_id)
    when 'part'     then (select owner_id    from public.parts      where id = p_id)
    when 'business' then (select owner_id    from public.businesses where id = p_id)
    when 'profile'  then (select id          from public.profiles   where id = p_id)
    when 'review'   then (select reviewer_id from public.reviews    where id = p_id)
    when 'message'  then (select sender_id   from public.messages   where id = p_id)
  end;
$$;

create or replace function private.validate_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recent bigint;
begin
  select count(*) into v_recent from public.reports
   where reporter_id = new.reporter_id and created_at > now() - interval '1 day';
  perform private.assert_rate_limit(v_recent, 10, 'reports today');

  if private.report_subject_profile(new.target_type, new.target_id) is null then
    raise exception 'The reported item was not found' using errcode = 'P0002';
  end if;

  -- Messages can only be reported by someone in that conversation.
  if new.target_type = 'message' and not exists (
       select 1 from public.messages m
       join public.conversation_participants p
         on p.conversation_id = m.conversation_id and p.profile_id = new.reporter_id
      where m.id = new.target_id) then
    raise exception 'The reported item was not found' using errcode = 'P0002';
  end if;
  return new;
end $$;

create trigger reports_validate
  before insert on public.reports
  for each row execute function private.validate_report();

-- Every new report notifies all administrators in the app. Scam reports are
-- flagged urgent. (Email delivery to the Caryandi inbox is added in the
-- notifications stage via a database webhook, so the email provider stays
-- configurable and no keys live in the database.)
create or replace function private.on_report_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select id from public.profiles where account_type = 'admin' and account_status = 'active' loop
    perform private.notify(r.id, 'report_update',
      case when new.category = 'scam' then 'URGENT: scam report' else 'New report' end,
      initcap(replace(new.category::text, '_', ' ')) || ' — ' || new.target_type::text || ': ' || left(new.details, 200),
      '/admin/reports', jsonb_build_object('report_id', new.id));
  end loop;
  return new;
end $$;

create trigger reports_after_insert
  after insert on public.reports
  for each row execute function private.on_report_created();

alter table public.reports enable row level security;

create policy "reporters and admins read reports"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid() or private.is_admin());

create policy "signed-in users file reports"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and private.is_active_user());

revoke all on public.reports from anon;
revoke insert, update, delete on public.reports from authenticated;
grant insert (target_type, target_id, category, details) on public.reports to authenticated;

-- -----------------------------------------------------------------------------
-- Information content (registration, importing, duty, documents,
-- warning lights, service intervals …). Managed by admins.
-- -----------------------------------------------------------------------------
create table public.info_articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category     text not null check (category in (
                 'registration', 'importing', 'duty_and_tax', 'documents',
                 'warning_lights', 'service_intervals', 'buying_safely', 'general')),
  title        text not null check (char_length(title) between 3 and 160),
  summary      text check (char_length(summary) <= 300),
  body         text not null default '' check (char_length(body) <= 50000),
  is_published boolean not null default false,
  published_at timestamptz,
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index info_articles_published_idx on public.info_articles (category, published_at desc) where is_published;

create or replace function private.info_articles_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  if new.is_published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

create trigger info_articles_before_write
  before insert or update on public.info_articles
  for each row execute function private.info_articles_before_write();

create trigger info_articles_set_updated_at
  before update on public.info_articles
  for each row execute function private.set_updated_at();

alter table public.info_articles enable row level security;

create policy "public reads published articles"
  on public.info_articles for select to anon, authenticated
  using (is_published or private.is_admin());

create policy "admins write articles (insert)"
  on public.info_articles for insert to authenticated with check (private.is_admin());
create policy "admins write articles (update)"
  on public.info_articles for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy "admins write articles (delete)"
  on public.info_articles for delete to authenticated using (private.is_admin());

revoke insert, update, delete on public.info_articles from anon;

-- =============================================================================
-- Admin RPCs. Each checks admin rights, writes the audit log and notifies the
-- affected user. These are the only way to make moderation decisions.
-- =============================================================================

-- Verification decision ------------------------------------------------------------
create or replace function public.admin_review_verification(
  p_request_id uuid, p_decision public.verification_status, p_notes text default null
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.verification_requests;
  v_label text;
begin
  perform private.require_admin();
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;

  select * into v from public.verification_requests where id = p_request_id for update;
  if v.id is null then
    raise exception 'Verification request not found' using errcode = 'P0002';
  end if;
  if v.status <> 'pending' then
    raise exception 'This request has already been decided' using errcode = '22023';
  end if;
  if v.requester_id = auth.uid() then
    raise exception 'Administrators cannot review their own verification' using errcode = '42501';
  end if;

  update public.verification_requests
     set status = p_decision, reviewed_by = auth.uid(), review_notes = p_notes, reviewed_at = now()
   where id = p_request_id;

  if v.subject = 'business' then
    update public.businesses
       set verification_status = p_decision,
           verified_at = case when p_decision = 'approved' then now() end
     where id = v.business_id
     returning name into v_label;
  else
    update public.vehicles set verification_status = p_decision where id = v.vehicle_id
     returning year || ' ' || make || ' ' || model into v_label;
  end if;

  perform private.audit('verification.' || p_decision::text, v.subject::text,
    coalesce(v.business_id, v.vehicle_id)::text,
    jsonb_build_object('request_id', v.id, 'notes', p_notes));

  perform private.notify(v.requester_id, 'verification_update',
    case when p_decision = 'approved' then 'Verification approved' else 'Verification not approved' end,
    case when p_decision = 'approved'
         then coalesce(v_label, 'Your listing') || ' now shows the verified badge.'
         else coalesce(v_label, 'Your request') || ' was not verified.' || coalesce(' ' || p_notes, '') end,
    '/dashboard/verification', jsonb_build_object('request_id', v.id));
end $$;

-- Listing moderation (vehicles and parts) -----------------------------------------
create or replace function public.admin_set_listing_status(
  p_listing_type text, p_listing_id uuid, p_status public.listing_status, p_reason text default null
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_label text;
begin
  perform private.require_admin();
  if p_listing_type = 'vehicle' then
    update public.vehicles set listing_status = p_status where id = p_listing_id
      returning owner_id, year || ' ' || make || ' ' || model into v_owner, v_label;
  elsif p_listing_type = 'part' then
    update public.parts set listing_status = p_status where id = p_listing_id
      returning owner_id, title into v_owner, v_label;
  else
    raise exception 'Unknown listing type' using errcode = '22023';
  end if;
  if v_owner is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  perform private.audit('listing.status', p_listing_type, p_listing_id::text,
    jsonb_build_object('status', p_status, 'reason', p_reason));
  perform private.notify(v_owner, 'listing_update', 'Listing status changed',
    v_label || ' is now ' || p_status::text || '.' || coalesce(' Reason: ' || p_reason, ''),
    '/dashboard/listings', jsonb_build_object('listing_type', p_listing_type, 'listing_id', p_listing_id));
end $$;

-- Account status (suspend / ban / reactivate) --------------------------------------
create or replace function public.admin_set_account_status(
  p_profile_id uuid, p_status public.account_status, p_reason text
) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_profile_id = auth.uid() then
    raise exception 'You cannot change your own account status' using errcode = '22023';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  update public.profiles set account_status = p_status where id = p_profile_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  perform private.audit('account.status', 'profile', p_profile_id::text,
    jsonb_build_object('status', p_status, 'reason', p_reason));
  perform private.notify(p_profile_id, 'account_update', 'Account status updated',
    'Your account is now ' || p_status::text || '.', '/settings');
end $$;

-- Business on/off --------------------------------------------------------------------
create or replace function public.admin_set_business_active(
  p_business_id uuid, p_active boolean, p_reason text
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  perform private.require_admin();
  update public.businesses set is_active = p_active where id = p_business_id returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  perform private.audit(case when p_active then 'business.activate' else 'business.deactivate' end,
    'business', p_business_id::text, jsonb_build_object('reason', p_reason));
  perform private.notify(v_owner, 'account_update',
    case when p_active then 'Business profile reactivated' else 'Business profile deactivated' end,
    p_reason, '/dashboard/profile');
end $$;

-- Review moderation ------------------------------------------------------------------
create or replace function public.admin_moderate_review(
  p_review_id uuid, p_status public.review_status, p_reason text default null
) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.reviews set status = p_status where id = p_review_id;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  perform private.audit('review.' || p_status::text, 'review', p_review_id::text,
    jsonb_build_object('reason', p_reason));
end $$;

-- Report handling ----------------------------------------------------------------------
create or replace function public.admin_update_report(
  p_report_id uuid, p_status public.report_status, p_notes text default null
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_reporter uuid;
begin
  perform private.require_admin();
  update public.reports
     set status = p_status,
         admin_notes = coalesce(p_notes, admin_notes),
         resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() end,
         resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
   where id = p_report_id
   returning reporter_id into v_reporter;
  if v_reporter is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  perform private.audit('report.' || p_status::text, 'report', p_report_id::text,
    jsonb_build_object('notes', p_notes));
  perform private.notify(v_reporter, 'report_update', 'Your report was updated',
    'Status: ' || p_status::text || '.', '/dashboard/notifications',
    jsonb_build_object('report_id', p_report_id));
end $$;

-- Scam investigation ---------------------------------------------------------------------
-- The reported user's identity and contact details are only released for a
-- SCAM report that an admin has moved to 'reviewing' or 'resolved'. Every
-- access is written to the audit log.
create or replace function public.admin_get_scam_report_details(p_report_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  rep       public.reports;
  v_subject uuid;
  v_result  jsonb;
begin
  perform private.require_admin();

  select * into rep from public.reports where id = p_report_id;
  if rep.id is null then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if rep.category <> 'scam' or rep.status not in ('reviewing', 'resolved') then
    raise exception 'User details are only available for scam reports under review' using errcode = '42501';
  end if;

  v_subject := private.report_subject_profile(rep.target_type, rep.target_id);

  select jsonb_build_object(
    'reported_user', jsonb_build_object(
      'profile_id', p.id, 'full_name', p.full_name, 'account_type', p.account_type,
      'account_status', p.account_status, 'city', p.city, 'province', p.province,
      'email', u.email, 'phone', pc.phone, 'whatsapp_number', pc.whatsapp_number,
      'joined', p.created_at),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'type', b.business_type,
                                          'phone', bc.phone, 'email', bc.email, 'address', b.address))
        from public.businesses b left join public.business_contacts bc on bc.business_id = b.id
       where b.owner_id = p.id), '[]'::jsonb),
    'verifications', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'subject', v.subject, 'status', v.status,
                                          'selfie_path', v.selfie_path, 'submitted', v.created_at))
        from public.verification_requests v where v.requester_id = p.id), '[]'::jsonb),
    'contact_between_reporter_and_user', coalesce((
      select jsonb_agg(jsonb_build_object('when', cr.created_at, 'target_type', cr.target_type,
                                          'target_id', cr.target_id))
        from public.contact_reveals cr
       where cr.viewer_id = rep.reporter_id and cr.owner_profile_id = p.id), '[]'::jsonb),
    'meetups_between_reporter_and_user', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'status', m.status, 'purpose', m.purpose,
                                          'proposed_time', m.proposed_time, 'created', m.created_at))
        from public.meetup_requests m
       where (m.requester_id = rep.reporter_id and m.recipient_id = p.id)
          or (m.requester_id = p.id and m.recipient_id = rep.reporter_id)), '[]'::jsonb)
  ) into v_result
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.profile_contacts pc on pc.profile_id = p.id
  where p.id = v_subject;

  perform private.audit('report.scam_details_accessed', 'report', p_report_id::text,
    jsonb_build_object('subject_profile_id', v_subject));

  return v_result;
end $$;

-- Admin RPC permissions (each also checks admin rights internally).
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_review_verification(uuid, public.verification_status, text)',
    'public.admin_set_listing_status(text, uuid, public.listing_status, text)',
    'public.admin_set_account_status(uuid, public.account_status, text)',
    'public.admin_set_business_active(uuid, boolean, text)',
    'public.admin_moderate_review(uuid, public.review_status, text)',
    'public.admin_update_report(uuid, public.report_status, text)',
    'public.admin_get_scam_report_details(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
