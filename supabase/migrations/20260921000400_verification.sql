-- =============================================================================
-- Caryandi · 0004 · Verification (optional, earns the verified badge)
-- =============================================================================
-- Rules from the product brief:
--   * Verification is optional. Verified sellers earn a badge.
--   * Business sellers (dealers etc.) verify ONCE, using one of their cars.
--     Approval marks the business verified, and every vehicle listed under
--     that business shows the badge (see public.vehicle_listings).
--   * Private sellers verify PER VEHICLE.
--   * The seller takes a photo of themselves inside the app. The file is kept
--     in the private `verification` bucket and only admins can see it.
--   * Only administrators can approve or reject. Nobody approves themselves.
-- =============================================================================

create type public.verification_subject as enum ('business', 'vehicle');
create type public.admin_document_type as enum (
  'national_id', 'passport', 'business_registration', 'tax_certificate', 'other'
);

create table public.verification_requests (
  id                 uuid primary key default gen_random_uuid(),
  requester_id       uuid not null references public.profiles (id) on delete cascade,
  subject            public.verification_subject not null,
  business_id        uuid references public.businesses (id) on delete cascade,
  -- For a business: the car used to verify. For a private seller: the car being verified.
  vehicle_id         uuid references public.vehicles (id) on delete cascade,
  selfie_path        text not null check (char_length(selfie_path) <= 500),
  selfie_captured_at timestamptz not null,
  requester_notes    text check (char_length(requester_notes) <= 1000),
  status             public.verification_status not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  reviewed_by        uuid references public.profiles (id) on delete set null,
  review_notes       text check (char_length(review_notes) <= 2000),
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (
    (subject = 'business' and business_id is not null)
    or (subject = 'vehicle' and vehicle_id is not null and business_id is null)
  )
);

-- Only one open request per business / per vehicle at a time.
create unique index verification_one_pending_business
  on public.verification_requests (business_id) where status = 'pending' and subject = 'business';
create unique index verification_one_pending_vehicle
  on public.verification_requests (vehicle_id) where status = 'pending' and subject = 'vehicle';
create index verification_queue_idx on public.verification_requests (status, created_at);
create index verification_requester_idx on public.verification_requests (requester_id);

create trigger verification_requests_set_updated_at
  before update on public.verification_requests
  for each row execute function private.set_updated_at();

-- Supporting documents (ID, business registration …) in the private bucket.
create table public.verification_documents (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.verification_requests (id) on delete cascade,
  document_type public.admin_document_type not null,
  storage_path  text not null unique check (char_length(storage_path) <= 500),
  created_at    timestamptz not null default now()
);

create index verification_documents_request_idx on public.verification_documents (request_id);

-- -----------------------------------------------------------------------------
-- On submission: check the requester really controls the subject, then mark
-- the subject as pending. Runs as definer because users cannot write
-- verification_status themselves.
-- -----------------------------------------------------------------------------
create or replace function private.on_verification_submitted()
returns trigger language plpgsql security definer set search_path = '' as $$
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
    if not exists (select 1 from public.vehicles
                   where id = new.vehicle_id and owner_id = new.requester_id and deleted_at is null) then
      raise exception 'You can only verify your own vehicle' using errcode = '42501';
    end if;
    if exists (select 1 from public.vehicles where id = new.vehicle_id and business_id is not null) then
      raise exception 'Business listings are covered by business verification' using errcode = '23514';
    end if;
    if exists (select 1 from public.vehicles where id = new.vehicle_id and verification_status = 'approved') then
      raise exception 'This vehicle is already verified' using errcode = '23514';
    end if;
    perform private.begin_system_write();
    update public.vehicles set verification_status = 'pending' where id = new.vehicle_id;
    perform private.end_system_write();
  end if;
  return new;
end $$;

-- BEFORE insert so ownership is checked before any other constraint.
create trigger verification_requests_on_submit
  before insert on public.verification_requests
  for each row execute function private.on_verification_submitted();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.verification_requests  enable row level security;
alter table public.verification_documents enable row level security;

create policy "requesters and admins read verification requests"
  on public.verification_requests for select to authenticated
  using (requester_id = auth.uid() or private.is_admin());

create policy "users submit verification for their own listings"
  on public.verification_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and private.is_active_user()
    and split_part(selfie_path, '/', 1) = auth.uid()::text
  );

-- No update/delete policies: decisions only through public.review_verification().
revoke all on public.verification_requests from anon;
revoke insert, update, delete on public.verification_requests from authenticated;
grant insert (requester_id, subject, business_id, vehicle_id, selfie_path,
              selfie_captured_at, requester_notes)
  on public.verification_requests to authenticated;

create policy "requesters and admins read verification documents"
  on public.verification_documents for select to authenticated
  using (
    private.is_admin()
    or exists (select 1 from public.verification_requests r
               where r.id = request_id and r.requester_id = auth.uid())
  );

create policy "requesters attach documents to their pending request"
  on public.verification_documents for insert to authenticated
  with check (
    split_part(storage_path, '/', 1) = auth.uid()::text
    and exists (select 1 from public.verification_requests r
                where r.id = request_id and r.requester_id = auth.uid() and r.status = 'pending')
  );

revoke all on public.verification_documents from anon;
revoke update, delete on public.verification_documents from authenticated;
