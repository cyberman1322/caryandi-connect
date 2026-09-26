-- =============================================================================
-- Caryandi · 0016 · Optional vehicle verification + terms / 18+ consent
-- =============================================================================
-- Product decisions (Sept 2026):
--   * Listing is never blocked by verification. Dealers and private sellers can
--     list as many cars as they like.
--   * Any car (private OR dealer) can be verified on its own, with the car's
--     documents only (no selfie). Verification stays optional.
--   * Badges are separate:
--       vehicle_listings.is_verified         -> this car's documents were checked
--       vehicle_listings.seller_is_verified  -> the dealer/business is verified
--     (Business verification itself is unchanged and still uses a selfie.)
--   * Changing a verified car's make / model / variant / year removes its badge.
--   * Every user must confirm they are 18+ and accept the Terms of Use and
--     Privacy Policy before listing, starting conversations, creating a business
--     or requesting verification. Recorded in private-by-default profile_consents.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Document types for cars.
-- -----------------------------------------------------------------------------
alter type public.admin_document_type add value if not exists 'registration_book';
alter type public.admin_document_type add value if not exists 'import_papers';
alter type public.admin_document_type add value if not exists 'customs_clearance';
alter type public.admin_document_type add value if not exists 'police_clearance';

-- -----------------------------------------------------------------------------
-- 2. Terms / age consent.
-- -----------------------------------------------------------------------------
create or replace function private.current_terms_version()
returns text language sql immutable set search_path = '' as $$ select '2026-09-26'::text $$;

create table if not exists public.profile_consents (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  terms_version     text not null check (char_length(terms_version) <= 20),
  terms_accepted_at timestamptz not null default now(),
  age_confirmed_at  timestamptz not null default now()
);

alter table public.profile_consents enable row level security;
create policy "users read their own consent"
  on public.profile_consents for select to authenticated
  using (profile_id = auth.uid() or private.is_admin());
revoke all on public.profile_consents from anon, public;
revoke insert, update, delete on public.profile_consents from authenticated;
grant select on public.profile_consents to authenticated;

create or replace function private.has_accepted_terms(p_profile_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profile_consents c
                 where c.profile_id = p_profile_id
                   and c.terms_version = private.current_terms_version());
$$;
grant execute on function private.has_accepted_terms(uuid) to authenticated;

/** Called by the app when a signed-in user ticks "I am 18 or older and accept…". */
create or replace function public.accept_terms(p_version text, p_confirm_adult boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first' using errcode = '42501';
  end if;
  if p_confirm_adult is not true then
    raise exception 'You must be 18 or older to use Caryandi' using errcode = '22023';
  end if;
  if p_version is distinct from private.current_terms_version() then
    raise exception 'Please reload the page to see the latest terms' using errcode = '22023';
  end if;
  insert into public.profile_consents (profile_id, terms_version, terms_accepted_at, age_confirmed_at)
  values (auth.uid(), p_version, now(), now())
  on conflict (profile_id) do update
    set terms_version = excluded.terms_version,
        terms_accepted_at = excluded.terms_accepted_at,
        age_confirmed_at = excluded.age_confirmed_at;
end $$;
revoke all on function public.accept_terms(text, boolean) from public, anon;
grant execute on function public.accept_terms(text, boolean) to authenticated;

-- Signup: record consent when the sign-up form sent it (the form requires it).
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_requested text := new.raw_user_meta_data ->> 'account_type';
  v_type      public.account_type := 'buyer';
  v_name      text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  v_phone     text := new.raw_user_meta_data ->> 'phone';
  v_terms     text := new.raw_user_meta_data ->> 'terms_version';
  v_adult     text := new.raw_user_meta_data ->> 'confirmed_adult';
begin
  if v_requested in ('buyer', 'private_seller', 'dealer', 'mechanic',
                     'servicing_company', 'parts_seller', 'import_agent') then
    v_type := v_requested::public.account_type;
  end if;

  if char_length(v_name) < 2 then
    v_name := 'Caryandi user';
  end if;

  insert into public.profiles (id, account_type, full_name)
  values (new.id, v_type, left(v_name, 120));

  insert into public.profile_contacts (profile_id, phone)
  values (new.id, case when v_phone ~ '^\+[1-9][0-9]{7,14}$' then v_phone end);

  if v_adult = 'true' and v_terms = private.current_terms_version() then
    insert into public.profile_consents (profile_id, terms_version) values (new.id, v_terms);
  end if;

  return new;
end $$;

-- Enforcement: the actions that put content in front of other people.
create or replace function private.require_terms()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin() and not private.is_system_write()
     and not private.has_accepted_terms(auth.uid()) then
    raise exception 'Please confirm you are 18 or older and accept the Terms of Use first'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists vehicles_require_terms on public.vehicles;
create trigger vehicles_require_terms before insert on public.vehicles
  for each row execute function private.require_terms();
drop trigger if exists parts_require_terms on public.parts;
create trigger parts_require_terms before insert on public.parts
  for each row execute function private.require_terms();
drop trigger if exists businesses_require_terms on public.businesses;
create trigger businesses_require_terms before insert on public.businesses
  for each row execute function private.require_terms();
drop trigger if exists conversations_require_terms on public.conversations;
create trigger conversations_require_terms before insert on public.conversations
  for each row execute function private.require_terms();
drop trigger if exists verification_requests_require_terms on public.verification_requests;
create trigger verification_requests_require_terms before insert on public.verification_requests
  for each row execute function private.require_terms();

-- -----------------------------------------------------------------------------
-- 3. Vehicle verification: documents only, any car (private or dealer).
-- -----------------------------------------------------------------------------
alter table public.verification_requests alter column selfie_path drop not null;
alter table public.verification_requests alter column selfie_captured_at drop not null;
alter table public.verification_requests
  drop constraint if exists verification_business_needs_selfie;
alter table public.verification_requests
  add constraint verification_business_needs_selfie
  check (subject <> 'business' or (selfie_path is not null and selfie_captured_at is not null));

create or replace function private.on_verification_submitted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_vehicle public.vehicles;
begin
  if new.subject = 'business' then
    if not exists (select 1 from public.business_members
                   where business_id = new.business_id and profile_id = new.requester_id
                     and role in ('owner', 'manager')) then
      raise exception 'You can only verify a business you manage' using errcode = '42501';
    end if;
    if exists (select 1 from public.businesses where id = new.business_id and verification_status = 'approved') then
      raise exception 'This business is already verified' using errcode = '23514';
    end if;
    if new.vehicle_id is not null and not exists (
         select 1 from public.vehicles where id = new.vehicle_id and business_id = new.business_id) then
      raise exception 'The vehicle used for verification must belong to this business' using errcode = '23514';
    end if;
    perform private.begin_system_write();
    update public.businesses set verification_status = 'pending' where id = new.business_id;
    perform private.end_system_write();
  else
    select * into v_vehicle from public.vehicles where id = new.vehicle_id and deleted_at is null;
    if v_vehicle.id is null
       or not (v_vehicle.owner_id = new.requester_id
               or (v_vehicle.business_id is not null and exists (
                     select 1 from public.business_members m
                      where m.business_id = v_vehicle.business_id and m.profile_id = new.requester_id
                        and m.role in ('owner', 'manager')))) then
      raise exception 'You can only verify a car you own or manage' using errcode = '42501';
    end if;
    if v_vehicle.verification_status = 'approved' then
      raise exception 'This vehicle is already verified' using errcode = '23514';
    end if;
    perform private.begin_system_write();
    update public.vehicles set verification_status = 'pending' where id = new.vehicle_id;
    perform private.end_system_write();
  end if;
  return new;
end $$;

-- Direct inserts are for business verification only; cars go through the RPC below.
drop policy if exists "users submit verification for their own listings" on public.verification_requests;
create policy "users submit verification for their own listings"
  on public.verification_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and private.is_active_user()
    and subject = 'business'
    and split_part(selfie_path, '/', 1) = auth.uid()::text
  );

/**
 * Submits one car for verification with its documents (1–4), in one step.
 * p_documents: [{"type": "registration_book", "path": "<uid>/request-docs/<file>"}, …]
 * Files must already be uploaded to the private `verification` bucket by the caller.
 */
create or replace function public.submit_vehicle_verification(
  p_vehicle_id uuid, p_documents jsonb, p_notes text default null
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  d     jsonb;
  v_count int;
begin
  if v_uid is null or not private.is_active_user() then
    raise exception 'Please sign in to continue' using errcode = '42501';
  end if;
  -- Ownership first, so people get the right message (the insert trigger re-checks it).
  if not exists (select 1 from public.vehicles v
                  where v.id = p_vehicle_id and v.deleted_at is null
                    and (v.owner_id = v_uid
                         or (v.business_id is not null and exists (
                               select 1 from public.business_members m
                                where m.business_id = v.business_id and m.profile_id = v_uid
                                  and m.role in ('owner', 'manager'))))) then
    raise exception 'You can only verify a car you own or manage' using errcode = '42501';
  end if;
  if jsonb_typeof(p_documents) <> 'array' then
    raise exception 'Attach at least one document' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_documents);
  if v_count < 1 then
    raise exception 'Attach at least one document, such as the registration book or import papers' using errcode = '22023';
  end if;
  if v_count > 4 then
    raise exception 'Attach at most 4 documents' using errcode = '22023';
  end if;
  for d in select * from jsonb_array_elements(p_documents) loop
    if coalesce(d ->> 'type', '') not in ('registration_book', 'import_papers', 'customs_clearance',
                                          'police_clearance', 'other') then
      raise exception 'Unknown document type' using errcode = '22023';
    end if;
    if split_part(coalesce(d ->> 'path', ''), '/', 1) <> v_uid::text
       or char_length(d ->> 'path') > 500
       or not exists (select 1 from storage.objects o
                       where o.bucket_id = 'verification' and o.name = d ->> 'path') then
      raise exception 'A document upload is missing. Please attach it again' using errcode = '22023';
    end if;
  end loop;

  insert into public.verification_requests (requester_id, subject, vehicle_id, requester_notes)
  values (v_uid, 'vehicle', p_vehicle_id, nullif(left(trim(coalesce(p_notes, '')), 1000), ''))
  returning id into v_id;

  insert into public.verification_documents (request_id, document_type, storage_path)
  select v_id, (e ->> 'type')::public.admin_document_type, e ->> 'path'
    from jsonb_array_elements(p_documents) e;

  return v_id;
end $$;
revoke all on function public.submit_vehicle_verification(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_vehicle_verification(uuid, jsonb, text) to authenticated;

/** For the seller's chat screen: can I verify this car, and where is it at? */
create or replace function public.my_vehicle_verification(p_vehicle_id uuid)
returns table (can_verify boolean, status public.verification_status)
language sql stable security definer set search_path = '' as $$
  select (v.owner_id = auth.uid()
          or (v.business_id is not null and exists (
                select 1 from public.business_members m
                 where m.business_id = v.business_id and m.profile_id = auth.uid()
                   and m.role in ('owner', 'manager')))) as can_verify,
         v.verification_status
    from public.vehicles v
   where v.id = p_vehicle_id and v.deleted_at is null
     and (v.owner_id = auth.uid()
          or (v.business_id is not null and private.is_business_member(v.business_id)));
$$;
revoke all on function public.my_vehicle_verification(uuid) from public, anon;
grant execute on function public.my_vehicle_verification(uuid) to authenticated;

-- A verified car whose identity details change loses its badge.
create or replace function private.reset_vehicle_verification_on_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.verification_status = 'approved'
     and (new.make, new.model, new.variant, new.year) is distinct from (old.make, old.model, old.variant, old.year) then
    new.verification_status := 'unverified';
  end if;
  return new;
end $$;
drop trigger if exists vehicles_zz_reset_verification on public.vehicles;
-- "zz": runs after vehicles_guard_write, which rejects seller-made status changes.
create trigger vehicles_zz_reset_verification before update on public.vehicles
  for each row execute function private.reset_vehicle_verification_on_change();

-- Admin decision: cars need at least one document, businesses need the selfie.
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
  if p_decision = 'approved' and v.subject = 'vehicle'
     and not exists (select 1 from public.verification_documents where request_id = v.id) then
    raise exception 'A car can only be approved after its documents have been checked' using errcode = '22023';
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

-- Admin queue: show which business a dealer's car belongs to (appended column).
create or replace view public.verification_request_details with (security_invoker = true) as
select
  r.id,
  r.requester_id,
  r.subject,
  r.business_id,
  r.vehicle_id,
  r.selfie_path,
  r.selfie_captured_at,
  r.requester_notes,
  r.status,
  r.review_notes,
  r.reviewed_at,
  r.created_at,
  p.full_name                 as requester_name,
  p.account_type              as requester_account_type,
  b.name                      as business_name,
  b.business_type,
  b.verification_status       as business_verification_status,
  v.year                      as vehicle_year,
  v.make                      as vehicle_make,
  v.model                     as vehicle_model,
  v.variant                   as vehicle_variant,
  v.registration_status       as vehicle_registration_status,
  v.duty_status               as vehicle_duty_status,
  v.import_status             as vehicle_import_status,
  v.listing_status            as vehicle_listing_status,
  (select count(*) from public.verification_documents d where d.request_id = r.id)::int as document_count,
  rp.full_name                as reviewer_name,
  vb.name                     as vehicle_business_name
from public.verification_requests r
join public.profiles p on p.id = r.requester_id
left join public.businesses b on b.id = r.business_id
left join public.vehicles v on v.id = r.vehicle_id
left join public.businesses vb on vb.id = v.business_id
left join public.profiles rp on rp.id = r.reviewed_by;

-- -----------------------------------------------------------------------------
-- 4. Separate badges on the public read model.
-- -----------------------------------------------------------------------------
create or replace view public.vehicle_listings with (security_invoker = true) as
select
  v.id, v.owner_id, v.business_id,
  v.make, v.model, v.variant, v.year, v.price, v.currency, v.mileage_km,
  v.condition, v.transmission, v.fuel_type, v.engine_size_cc, v.body_type, v.colour,
  v.registration_status, v.duty_status, v.import_status,
  v.province, v.city, v.area, v.latitude, v.longitude,
  v.description, v.listing_status, v.search_text,
  v.published_at, v.sold_at, v.created_at, v.updated_at,
  (v.verification_status = 'approved')                          as is_verified,
  coalesce(b.name, p.full_name)                                 as seller_name,
  case when b.id is not null then b.business_type::text else 'private_seller' end as seller_type,
  b.slug                                                        as business_slug,
  coalesce(b.rating_avg, p.rating_avg)                          as seller_rating_avg,
  coalesce(b.rating_count, p.rating_count)                      as seller_rating_count,
  (select vi.storage_path from public.vehicle_images vi
    where vi.vehicle_id = v.id
    order by vi.is_primary desc, vi.position asc limit 1)       as primary_image_path,
  v.features,
  coalesce(b.verification_status = 'approved', false)           as seller_is_verified
from public.vehicles v
join public.profiles p on p.id = v.owner_id
left join public.businesses b on b.id = v.business_id
where v.deleted_at is null;
