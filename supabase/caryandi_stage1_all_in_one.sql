-- Caryandi · Stage 1 database — all migrations in order, in ONE transaction.
-- Paste into Supabase → SQL Editor → Run. If anything fails, nothing is applied.
begin;

-- >>> 20260921000100_foundation_and_profiles.sql
-- =============================================================================
-- Caryandi · 0001 · Foundation: extensions, enums, private helpers, profiles
-- =============================================================================
-- Conventions used across every migration:
--   * public schema  = tables + the RPCs the frontend is allowed to call.
--   * private schema = internal helpers and trigger functions. It is NOT exposed
--     through the Supabase API, so nothing in it can be called as an RPC.
--   * Every table has RLS enabled. Columns users must not set themselves
--     (status, ratings, verification) are protected with column-level grants
--     and/or triggers, never by trusting the client.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.account_type as enum (
  'buyer', 'private_seller', 'dealer', 'mechanic',
  'servicing_company', 'parts_seller', 'import_agent', 'admin'
);
create type public.account_status as enum ('active', 'suspended', 'banned');

create type public.zambia_province as enum (
  'central', 'copperbelt', 'eastern', 'luapula', 'lusaka',
  'muchinga', 'northern', 'north_western', 'southern', 'western'
);

-- -----------------------------------------------------------------------------
-- Shared trigger: updated_at
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Profiles: one row per auth user. Public-facing identity only.
-- Phone / WhatsApp live in profile_contacts, which is never publicly readable.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  account_type   public.account_type   not null default 'buyer',
  account_status public.account_status not null default 'active',
  full_name      text not null check (char_length(full_name) between 2 and 120),
  avatar_path    text check (char_length(avatar_path) <= 500),
  province       public.zambia_province,
  city           text check (char_length(city) <= 80),
  bio            text check (char_length(bio) <= 1000),
  -- Maintained by triggers from reviews of this person as a private seller.
  rating_avg     numeric(3, 2) not null default 0,
  rating_count   integer       not null default 0,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create index profiles_account_type_idx on public.profiles (account_type);

-- Private contact details. Revealed to other users only through
-- public.get_contact(), which requires sign-in and logs every reveal.
create table public.profile_contacts (
  profile_id      uuid primary key references public.profiles (id) on delete cascade,
  phone           text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_number text check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  updated_at      timestamptz not null default now()
);

create trigger profile_contacts_set_updated_at
  before update on public.profile_contacts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so they can read profiles without
-- recursing through RLS; they only ever answer about the current user).
-- -----------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_type = 'admin' and account_status = 'active'
  );
$$;

create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_status = 'active'
  );
$$;

create or replace function private.current_account_type()
returns public.account_type language sql stable security definer set search_path = '' as $$
  select account_type from public.profiles where id = auth.uid();
$$;

create or replace function private.is_profile_active(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile_id and account_status = 'active'
  );
$$;

-- Internal "system write" flag. Trusted database functions (verification
-- decisions, rating aggregates) set it for the rest of the transaction so the
-- guard triggers below let their protected-column updates through. It cannot
-- be set from the API: only functions in the private schema call set_config.
create or replace function private.begin_system_write()
returns void language sql volatile set search_path = '' as $$
  select set_config('caryandi.system_write', 'on', true);
$$;

create or replace function private.end_system_write()
returns void language sql volatile set search_path = '' as $$
  select set_config('caryandi.system_write', 'off', true);
$$;

create or replace function private.is_system_write()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('caryandi.system_write', true), 'off') = 'on';
$$;

grant execute on function private.is_system_write() to anon, authenticated;

grant execute on function private.is_admin()               to anon, authenticated;
grant execute on function private.is_active_user()         to anon, authenticated;
grant execute on function private.current_account_type()   to anon, authenticated;
grant execute on function private.is_profile_active(uuid)  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Signup: create the profile automatically from auth metadata.
-- 'admin' can never be requested at signup; unknown values fall back to buyer.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_requested text := new.raw_user_meta_data ->> 'account_type';
  v_type      public.account_type := 'buyer';
  v_name      text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  v_phone     text := new.raw_user_meta_data ->> 'phone';
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

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Guard: only admins (or the SQL editor / service role, where auth.uid() is
-- null) may grant or remove the admin account type or change account status.
-- -----------------------------------------------------------------------------
create or replace function private.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.is_admin() or private.is_system_write() then
    return new;
  end if;

  if new.account_type is distinct from old.account_type
     and (new.account_type = 'admin' or old.account_type = 'admin') then
    raise exception 'Not allowed to change admin account type' using errcode = '42501';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'Not allowed to change account status' using errcode = '42501';
  end if;

  if new.rating_avg is distinct from old.rating_avg
     or new.rating_count is distinct from old.rating_count then
    raise exception 'Ratings are calculated by the system' using errcode = '42501';
  end if;

  return new;
end $$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- -----------------------------------------------------------------------------
-- RLS + grants
-- -----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.profile_contacts enable row level security;

-- Profiles: public identity is readable (seller pages, reviews), except banned
-- accounts, which only the owner and admins can see.
create policy "profiles are readable unless banned"
  on public.profiles for select to anon, authenticated
  using (account_status <> 'banned' or id = auth.uid() or private.is_admin());

create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid() or private.is_admin())
  with check (id = auth.uid() or private.is_admin());

-- Profiles are created by the signup trigger and removed with the auth user.
revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from anon;
revoke update on public.profiles from authenticated;
grant update (account_type, full_name, avatar_path, province, city, bio)
  on public.profiles to authenticated;

-- Contacts: owner and admins only. Other users go through get_contact().
create policy "owner reads own contacts"
  on public.profile_contacts for select to authenticated
  using (profile_id = auth.uid() or private.is_admin());

create policy "owner updates own contacts"
  on public.profile_contacts for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

revoke all on public.profile_contacts from anon;
revoke insert, delete on public.profile_contacts from authenticated;

-- >>> 20260921000200_businesses.sql
-- =============================================================================
-- Caryandi · 0002 · Businesses: dealers, mechanics, servicing companies,
-- parts sellers and import agents, plus their team members, services and
-- import routes.
-- =============================================================================
-- One `businesses` table with a `business_type` rather than five near-identical
-- tables: verification, reviews, meet-ups and contact reveal then all work the
-- same way for every kind of business. Type-specific data lives in its own
-- table (services, import_routes).
-- =============================================================================

create type public.business_type as enum (
  'dealer', 'mechanic', 'servicing_company', 'parts_seller', 'import_agent'
);
create type public.business_member_role as enum ('owner', 'manager', 'staff');
create type public.verification_status as enum ('unverified', 'pending', 'approved', 'rejected');

-- -----------------------------------------------------------------------------
-- Slug helper (used for readable URLs such as /sellers/autoworld-zambia)
-- -----------------------------------------------------------------------------
create or replace function private.slugify(p_text text)
returns text language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- -----------------------------------------------------------------------------
-- Businesses
-- -----------------------------------------------------------------------------
create table public.businesses (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete restrict,
  business_type       public.business_type not null,
  name                text not null check (char_length(name) between 2 and 120),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description         text check (char_length(description) <= 3000),
  logo_path           text check (char_length(logo_path) <= 500),
  cover_path          text check (char_length(cover_path) <= 500),
  -- Location (structured now; map search can be added later without changes)
  province            public.zambia_province,
  city                text check (char_length(city) <= 80),
  area                text check (char_length(area) <= 120),
  address             text check (char_length(address) <= 300),
  latitude            double precision check (latitude between -90 and 90),
  longitude           double precision check (longitude between -180 and 180),
  -- Service providers
  opening_hours       jsonb,
  is_mobile_service   boolean not null default false,
  price_from          numeric(12, 2) check (price_from >= 0),
  price_note          text check (char_length(price_note) <= 120),
  -- Set only by the verification workflow / admins
  verification_status public.verification_status not null default 'unverified',
  verified_at         timestamptz,
  rating_avg          numeric(3, 2) not null default 0,
  rating_count        integer       not null default 0,
  is_active           boolean       not null default true,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  deleted_at          timestamptz
);

create index businesses_owner_idx    on public.businesses (owner_id);
create index businesses_type_loc_idx on public.businesses (business_type, province, city)
  where deleted_at is null and is_active;

create or replace function private.businesses_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := left(private.slugify(new.name), 60) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  else
    new.slug := private.slugify(new.slug);
  end if;
  return new;
end $$;

create trigger businesses_before_insert
  before insert on public.businesses
  for each row execute function private.businesses_before_write();

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function private.set_updated_at();

-- Owners/managers must not be able to mark themselves verified, change
-- ratings or reactivate a business an admin has switched off.
create or replace function private.guard_business_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.is_admin() or private.is_system_write() then
    return new;
  end if;
  if new.verification_status is distinct from old.verification_status
     or new.verified_at     is distinct from old.verified_at
     or new.rating_avg      is distinct from old.rating_avg
     or new.rating_count    is distinct from old.rating_count
     or new.is_active       is distinct from old.is_active
     or new.owner_id        is distinct from old.owner_id
     or new.business_type   is distinct from old.business_type then
    raise exception 'Not allowed to change protected business fields' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger businesses_guard_update
  before update on public.businesses
  for each row execute function private.guard_business_update();

-- -----------------------------------------------------------------------------
-- Team members (dashboard/team). The owner is added automatically.
-- -----------------------------------------------------------------------------
create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id)   on delete cascade,
  role        public.business_member_role not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (business_id, profile_id)
);

create index business_members_profile_idx on public.business_members (profile_id);

create or replace function private.add_business_owner_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.business_members (business_id, profile_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

create trigger businesses_add_owner_member
  after insert on public.businesses
  for each row execute function private.add_business_owner_member();

create or replace function private.is_business_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id and profile_id = auth.uid()
  );
$$;

create or replace function private.is_business_manager(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id and profile_id = auth.uid()
      and role in ('owner', 'manager')
  );
$$;

create or replace function private.is_business_public(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.is_active and b.deleted_at is null
      and private.is_profile_active(b.owner_id)
  );
$$;

grant execute on function private.is_business_member(uuid)  to anon, authenticated;
grant execute on function private.is_business_manager(uuid) to anon, authenticated;
grant execute on function private.is_business_public(uuid)  to anon, authenticated;

-- Private contact details for the business (shop phone, WhatsApp, email).
create table public.business_contacts (
  business_id     uuid primary key references public.businesses (id) on delete cascade,
  phone           text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_number text check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  email           text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website         text check (website ~* '^https?://'),
  updated_at      timestamptz not null default now()
);

create trigger business_contacts_set_updated_at
  before update on public.business_contacts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Enforce that child rows attach to the right kind of business,
-- e.g. only import agents have import routes.
-- Usage: execute function private.assert_business_type('import_agent', ...)
-- -----------------------------------------------------------------------------
create or replace function private.assert_business_type()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_type text;
begin
  select business_type::text into v_type from public.businesses where id = new.business_id;
  if v_type is null or not (v_type = any (tg_argv)) then
    raise exception '% can only belong to: %', tg_table_name, array_to_string(tg_argv, ', ')
      using errcode = '23514';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Services offered by mechanics and servicing companies
-- -----------------------------------------------------------------------------
create table public.services (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  name             text not null check (char_length(name) between 2 and 120),
  description      text check (char_length(description) <= 2000),
  price_from       numeric(12, 2) check (price_from >= 0),
  price_note       text check (char_length(price_note) <= 120),
  duration_minutes integer check (duration_minutes between 5 and 10080),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index services_business_idx on public.services (business_id) where is_active;

create trigger services_business_type
  before insert or update of business_id on public.services
  for each row execute function private.assert_business_type('mechanic', 'servicing_company');

create trigger services_set_updated_at
  before update on public.services
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Import routes (Japan → Zambia, Durban → Zambia, Dar es Salaam → Zambia …)
-- Routes are data entered by agents, never hardcoded.
-- transit_port null = shipped directly / no named transit port.
-- -----------------------------------------------------------------------------
create table public.import_routes (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  origin_country   text not null check (char_length(origin_country) between 2 and 60),
  transit_port     text check (char_length(transit_port) between 2 and 80),
  destination_city text not null default 'Lusaka' check (char_length(destination_city) between 2 and 80),
  services         text[] not null default '{}',
  price_from       numeric(12, 2) check (price_from >= 0),
  price_note       text check (char_length(price_note) <= 120),
  est_days_min     integer check (est_days_min > 0),
  est_days_max     integer check (est_days_max > 0),
  notes            text check (char_length(notes) <= 2000),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (est_days_max is null or est_days_min is null or est_days_max >= est_days_min),
  check (cardinality(services) <= 20)
);

create index import_routes_business_idx on public.import_routes (business_id) where is_active;
create index import_routes_origin_idx   on public.import_routes (lower(origin_country), lower(transit_port)) where is_active;

create trigger import_routes_business_type
  before insert or update of business_id on public.import_routes
  for each row execute function private.assert_business_type('import_agent');

create trigger import_routes_set_updated_at
  before update on public.import_routes
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.businesses        enable row level security;
alter table public.business_members  enable row level security;
alter table public.business_contacts enable row level security;
alter table public.services          enable row level security;
alter table public.import_routes     enable row level security;

-- Businesses -------------------------------------------------------------------
create policy "public reads active businesses"
  on public.businesses for select to anon, authenticated
  using (
    (is_active and deleted_at is null and private.is_profile_active(owner_id))
    or private.is_business_member(id)
    or private.is_admin()
  );

-- A user can only create a business matching their account type,
-- e.g. a dealer account creates a dealer business.
create policy "users create a business for their account type"
  on public.businesses for insert to authenticated
  with check (
    owner_id = auth.uid()
    and private.is_active_user()
    and business_type::text = private.current_account_type()::text
  );

create policy "managers update their business"
  on public.businesses for update to authenticated
  using (private.is_business_manager(id) or private.is_admin())
  with check (private.is_business_manager(id) or private.is_admin());

revoke delete on public.businesses from anon, authenticated;  -- soft delete via deleted_at
revoke insert, update on public.businesses from anon;
revoke insert, update on public.businesses from authenticated;
grant insert (owner_id, business_type, name, slug, description, logo_path, cover_path,
              province, city, area, address, latitude, longitude,
              opening_hours, is_mobile_service, price_from, price_note)
  on public.businesses to authenticated;
grant update (name, description, logo_path, cover_path, province, city, area, address,
              latitude, longitude, opening_hours, is_mobile_service, price_from,
              price_note, deleted_at)
  on public.businesses to authenticated;

-- Members ----------------------------------------------------------------------
create policy "members see their team"
  on public.business_members for select to authenticated
  using (private.is_business_member(business_id) or private.is_admin());

create policy "managers add team members"
  on public.business_members for insert to authenticated
  with check (private.is_business_manager(business_id) and role <> 'owner');

create policy "managers change team roles"
  on public.business_members for update to authenticated
  using (private.is_business_manager(business_id) and role <> 'owner')
  with check (private.is_business_manager(business_id) and role <> 'owner');

create policy "managers remove members, members leave"
  on public.business_members for delete to authenticated
  using (role <> 'owner' and (private.is_business_manager(business_id) or profile_id = auth.uid()));

revoke all on public.business_members from anon;

-- Business contacts: team + admins. Everyone else uses get_contact().
create policy "team reads business contacts"
  on public.business_contacts for select to authenticated
  using (private.is_business_member(business_id) or private.is_admin());

create policy "managers set business contacts"
  on public.business_contacts for insert to authenticated
  with check (private.is_business_manager(business_id));

create policy "managers update business contacts"
  on public.business_contacts for update to authenticated
  using (private.is_business_manager(business_id))
  with check (private.is_business_manager(business_id));

revoke all on public.business_contacts from anon;
revoke delete on public.business_contacts from authenticated;

-- Services & import routes: public when active on a public business;
-- managed by the business team.
create policy "public reads active services"
  on public.services for select to anon, authenticated
  using ((is_active and private.is_business_public(business_id))
         or private.is_business_member(business_id) or private.is_admin());

create policy "team manages services (insert)"
  on public.services for insert to authenticated
  with check (private.is_business_member(business_id) and private.is_active_user());

create policy "team manages services (update)"
  on public.services for update to authenticated
  using (private.is_business_member(business_id))
  with check (private.is_business_member(business_id));

create policy "team manages services (delete)"
  on public.services for delete to authenticated
  using (private.is_business_member(business_id));

create policy "public reads active import routes"
  on public.import_routes for select to anon, authenticated
  using ((is_active and private.is_business_public(business_id))
         or private.is_business_member(business_id) or private.is_admin());

create policy "team manages import routes (insert)"
  on public.import_routes for insert to authenticated
  with check (private.is_business_member(business_id) and private.is_active_user());

create policy "team manages import routes (update)"
  on public.import_routes for update to authenticated
  using (private.is_business_member(business_id))
  with check (private.is_business_member(business_id));

create policy "team manages import routes (delete)"
  on public.import_routes for delete to authenticated
  using (private.is_business_member(business_id));

revoke insert, update, delete on public.services, public.import_routes from anon;

-- >>> 20260921000300_listings.sql
-- =============================================================================
-- Caryandi · 0003 · Listings: vehicles, vehicle images & documents, parts,
-- part images, favourites.
-- =============================================================================

create type public.listing_status as enum ('draft', 'pending', 'active', 'sold', 'archived', 'rejected');
create type public.vehicle_condition as enum ('new', 'used_excellent', 'used_good', 'used_fair', 'needs_repair');
create type public.transmission_type as enum ('automatic', 'manual');
create type public.fuel_type as enum ('petrol', 'diesel', 'hybrid', 'electric', 'other');
-- Registration and duty are independent answers, so every combination is valid.
create type public.registration_status as enum ('registered', 'unregistered');
create type public.duty_status as enum ('paid', 'unpaid');
create type public.import_status as enum ('local', 'imported');
create type public.part_condition as enum ('new', 'used', 'reconditioned');
create type public.vehicle_document_type as enum (
  'registration_certificate', 'import_declaration', 'duty_receipt', 'road_tax', 'other'
);

-- -----------------------------------------------------------------------------
-- Vehicles
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete restrict,
  -- Set when listed by a dealership; team members can then manage it.
  business_id         uuid references public.businesses (id) on delete restrict,
  make                text not null check (char_length(make)  between 1 and 60),
  model               text not null check (char_length(model) between 1 and 60),
  variant             text check (char_length(variant) <= 80),
  year                smallint not null check (year between 1950 and 2100),
  price               numeric(12, 2) not null check (price > 0),
  currency            char(3) not null default 'ZMW' check (currency = 'ZMW'),
  mileage_km          integer check (mileage_km between 0 and 3000000),
  condition           public.vehicle_condition not null,
  transmission        public.transmission_type not null,
  fuel_type           public.fuel_type not null,
  engine_size_cc      integer check (engine_size_cc between 50 and 20000),
  body_type           text check (char_length(body_type) <= 40),
  colour              text check (char_length(colour) <= 40),
  registration_status public.registration_status not null,
  duty_status         public.duty_status not null,
  import_status       public.import_status not null default 'local',
  province            public.zambia_province not null,
  city                text not null check (char_length(city) between 2 and 80),
  area                text check (char_length(area) <= 120),
  latitude            double precision check (latitude between -90 and 90),
  longitude           double precision check (longitude between -180 and 180),
  description         text check (char_length(description) <= 5000),
  listing_status      public.listing_status not null default 'draft',
  -- Per-vehicle verification (private sellers). Business listings inherit the
  -- business's verification instead — see public.vehicle_listings.
  verification_status public.verification_status not null default 'unverified',
  search_text         text generated always as (
                        lower(make || ' ' || model || ' ' || coalesce(variant, ''))
                      ) stored,
  published_at        timestamptz,
  sold_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index vehicles_owner_idx    on public.vehicles (owner_id);
create index vehicles_business_idx on public.vehicles (business_id) where business_id is not null;
create index vehicles_active_recent_idx on public.vehicles (published_at desc)
  where listing_status = 'active' and deleted_at is null;
create index vehicles_active_location_idx on public.vehicles (province, city)
  where listing_status = 'active' and deleted_at is null;
create index vehicles_active_price_idx on public.vehicles (price)
  where listing_status = 'active' and deleted_at is null;
create index vehicles_active_year_idx on public.vehicles (year)
  where listing_status = 'active' and deleted_at is null;
create index vehicles_active_make_model_idx on public.vehicles (lower(make), lower(model))
  where listing_status = 'active' and deleted_at is null;
create index vehicles_search_trgm_idx on public.vehicles
  using gin (search_text extensions.gin_trgm_ops);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Contact requirement: a seller must have a phone number on file before a
-- listing can go live, so buyers can always reach them.
-- -----------------------------------------------------------------------------
create or replace function private.seller_has_contact(p_owner_id uuid, p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profile_contacts
                 where profile_id = p_owner_id and phone is not null)
      or exists (select 1 from public.business_contacts
                 where p_business_id is not null and business_id = p_business_id and phone is not null);
$$;

-- -----------------------------------------------------------------------------
-- Listing status rules (shared by vehicles and parts):
--   * Sellers move their own listings between draft, active, sold, archived.
--   * 'pending' (moderation hold) and 'rejected' are set by admins only.
--   * A rejected listing can only go back to draft (after the seller edits it).
--   * Sellers cannot mark their own listing verified.
-- -----------------------------------------------------------------------------
create or replace function private.guard_listing_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_is_admin boolean := auth.uid() is null or private.is_admin() or private.is_system_write();
  v_old_status public.listing_status := case when tg_op = 'UPDATE' then old.listing_status end;
begin
  if not v_is_admin then
    if new.listing_status in ('pending', 'rejected')
       and new.listing_status is distinct from v_old_status then
      raise exception 'Only administrators can set a listing to %', new.listing_status
        using errcode = '42501';
    end if;
    if v_old_status in ('pending', 'rejected')
       and new.listing_status not in ('draft', 'archived')
       and new.listing_status is distinct from v_old_status then
      raise exception 'This listing is under review and can only be moved to draft or archived'
        using errcode = '42501';
    end if;
    if tg_table_name = 'vehicles' then
      if tg_op = 'INSERT' and new.verification_status <> 'unverified' then
        raise exception 'Verification is set by the verification process' using errcode = '42501';
      end if;
      if tg_op = 'UPDATE' and new.verification_status is distinct from old.verification_status then
        raise exception 'Verification is set by the verification process' using errcode = '42501';
      end if;
    end if;
    if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
      raise exception 'Listing owner cannot be changed' using errcode = '42501';
    end if;
  end if;

  if new.listing_status = 'active' and v_old_status is distinct from 'active' then
    if not private.seller_has_contact(new.owner_id, new.business_id) then
      raise exception 'Add a phone number to your profile before publishing a listing'
        using errcode = '23514';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;

  if new.listing_status = 'sold' and v_old_status is distinct from 'sold' then
    new.sold_at := now();
  end if;

  return new;
end $$;

create trigger vehicles_guard_write
  before insert or update on public.vehicles
  for each row execute function private.guard_listing_write();

-- -----------------------------------------------------------------------------
-- Vehicle images (files in the public `vehicle-images` bucket).
-- storage_path must live in the uploader's own folder: "<user id>/…".
-- -----------------------------------------------------------------------------
create table public.vehicle_images (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 500),
  position     smallint not null default 0 check (position between 0 and 49),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index vehicle_images_vehicle_idx on public.vehicle_images (vehicle_id, position);
create unique index vehicle_images_one_primary on public.vehicle_images (vehicle_id) where is_primary;

create or replace function private.limit_listing_images()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if tg_table_name = 'vehicle_images' then
    select count(*) into v_count from public.vehicle_images where vehicle_id = new.vehicle_id;
  else
    select count(*) into v_count from public.part_images where part_id = new.part_id;
  end if;
  if v_count >= tg_argv[0]::integer then
    raise exception 'A listing can have at most % photos', tg_argv[0] using errcode = '23514';
  end if;
  return new;
end $$;

create trigger vehicle_images_limit
  before insert on public.vehicle_images
  for each row execute function private.limit_listing_images('20');

-- -----------------------------------------------------------------------------
-- Vehicle documents (files in the PRIVATE `vehicle-documents` bucket).
-- Buyers see which documents exist (public.vehicle_document_summary), never
-- the files themselves.
-- -----------------------------------------------------------------------------
create table public.vehicle_documents (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.vehicles (id) on delete cascade,
  uploaded_by   uuid not null references public.profiles (id) on delete cascade,
  document_type public.vehicle_document_type not null,
  storage_path  text not null unique check (char_length(storage_path) <= 500),
  created_at    timestamptz not null default now()
);

create index vehicle_documents_vehicle_idx on public.vehicle_documents (vehicle_id);

-- -----------------------------------------------------------------------------
-- Ownership helper: can the current user manage this vehicle?
-- -----------------------------------------------------------------------------
create or replace function private.can_manage_vehicle(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.deleted_at is null
      and (v.owner_id = auth.uid()
           or (v.business_id is not null and private.is_business_member(v.business_id)))
  );
$$;

create or replace function private.is_vehicle_public(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id and v.listing_status in ('active', 'sold')
      and v.deleted_at is null and private.is_profile_active(v.owner_id)
  );
$$;

grant execute on function private.can_manage_vehicle(uuid) to anon, authenticated;
grant execute on function private.is_vehicle_public(uuid)  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Parts
-- -----------------------------------------------------------------------------
create table public.part_categories (
  id         smallint generated always as identity primary key,
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text not null unique,
  sort_order smallint not null default 0
);

insert into public.part_categories (slug, name, sort_order) values
  ('engine', 'Engine', 10),
  ('brakes', 'Brakes', 20),
  ('suspension', 'Suspension & steering', 30),
  ('electrical', 'Electrical', 40),
  ('lighting', 'Lighting', 50),
  ('transmission', 'Transmission & clutch', 60),
  ('cooling', 'Cooling', 70),
  ('filters-fluids', 'Filters & fluids', 80),
  ('tyres-wheels', 'Tyres & wheels', 90),
  ('body', 'Body panels & glass', 100),
  ('interior', 'Interior', 110),
  ('accessories', 'Accessories', 120),
  ('other', 'Other', 999);

create table public.parts (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles (id) on delete restrict,
  business_id        uuid references public.businesses (id) on delete restrict,
  category_id        smallint not null references public.part_categories (id),
  title              text not null check (char_length(title) between 3 and 120),
  description        text check (char_length(description) <= 3000),
  price              numeric(12, 2) not null check (price > 0),
  currency           char(3) not null default 'ZMW' check (currency = 'ZMW'),
  condition          public.part_condition not null,
  quantity           integer not null default 1 check (quantity between 0 and 100000),
  compatibility_note text check (char_length(compatibility_note) <= 500),
  province           public.zambia_province not null,
  city               text not null check (char_length(city) between 2 and 80),
  listing_status     public.listing_status not null default 'draft',
  search_text        text generated always as (lower(title)) stored,
  published_at       timestamptz,
  sold_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index parts_owner_idx on public.parts (owner_id);
create index parts_business_idx on public.parts (business_id) where business_id is not null;
create index parts_active_idx on public.parts (category_id, province, published_at desc)
  where listing_status = 'active' and deleted_at is null;
create index parts_search_trgm_idx on public.parts using gin (search_text extensions.gin_trgm_ops);

create trigger parts_set_updated_at
  before update on public.parts
  for each row execute function private.set_updated_at();

create trigger parts_guard_write
  before insert or update on public.parts
  for each row execute function private.guard_listing_write();

create table public.part_images (
  id           uuid primary key default gen_random_uuid(),
  part_id      uuid not null references public.parts (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 500),
  position     smallint not null default 0 check (position between 0 and 19),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index part_images_part_idx on public.part_images (part_id, position);
create unique index part_images_one_primary on public.part_images (part_id) where is_primary;

create trigger part_images_limit
  before insert on public.part_images
  for each row execute function private.limit_listing_images('10');

create or replace function private.can_manage_part(p_part_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.parts p
    where p.id = p_part_id and p.deleted_at is null
      and (p.owner_id = auth.uid()
           or (p.business_id is not null and private.is_business_member(p.business_id)))
  );
$$;

create or replace function private.is_part_public(p_part_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.parts p
    where p.id = p_part_id and p.listing_status in ('active', 'sold')
      and p.deleted_at is null and private.is_profile_active(p.owner_id)
  );
$$;

grant execute on function private.can_manage_part(uuid) to anon, authenticated;
grant execute on function private.is_part_public(uuid)  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Favourites (saved vehicles)
-- -----------------------------------------------------------------------------
create table public.favourites (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, vehicle_id)
);

create index favourites_vehicle_idx on public.favourites (vehicle_id);

-- -----------------------------------------------------------------------------
-- Public read model for vehicle search and detail pages.
-- security_invoker = true: the caller's RLS still applies to every row.
-- is_verified is computed here so the badge can never be set by a client:
--   business listing → the business is verified
--   private listing  → this vehicle's own verification was approved
-- -----------------------------------------------------------------------------
create view public.vehicle_listings with (security_invoker = true) as
select
  v.id, v.owner_id, v.business_id,
  v.make, v.model, v.variant, v.year, v.price, v.currency, v.mileage_km,
  v.condition, v.transmission, v.fuel_type, v.engine_size_cc, v.body_type, v.colour,
  v.registration_status, v.duty_status, v.import_status,
  v.province, v.city, v.area, v.latitude, v.longitude,
  v.description, v.listing_status, v.search_text,
  v.published_at, v.sold_at, v.created_at, v.updated_at,
  coalesce(b.verification_status = 'approved', false)
    or v.verification_status = 'approved'                       as is_verified,
  coalesce(b.name, p.full_name)                                 as seller_name,
  case when b.id is not null then b.business_type::text else 'private_seller' end as seller_type,
  b.slug                                                        as business_slug,
  coalesce(b.rating_avg, p.rating_avg)                          as seller_rating_avg,
  coalesce(b.rating_count, p.rating_count)                      as seller_rating_count,
  (select vi.storage_path from public.vehicle_images vi
    where vi.vehicle_id = v.id
    order by vi.is_primary desc, vi.position asc limit 1)       as primary_image_path
from public.vehicles v
join public.profiles p on p.id = v.owner_id
left join public.businesses b on b.id = v.business_id
where v.deleted_at is null;

create view public.part_listings with (security_invoker = true) as
select
  pt.id, pt.owner_id, pt.business_id, pt.category_id,
  c.slug as category_slug, c.name as category_name,
  pt.title, pt.description, pt.price, pt.currency, pt.condition, pt.quantity,
  pt.compatibility_note, pt.province, pt.city, pt.listing_status, pt.search_text,
  pt.published_at, pt.created_at, pt.updated_at,
  coalesce(b.name, p.full_name) as seller_name,
  b.slug as business_slug,
  coalesce(b.verification_status = 'approved', false) as is_verified,
  (select pi.storage_path from public.part_images pi
    where pi.part_id = pt.id
    order by pi.is_primary desc, pi.position asc limit 1) as primary_image_path
from public.parts pt
join public.part_categories c on c.id = pt.category_id
join public.profiles p on p.id = pt.owner_id
left join public.businesses b on b.id = pt.business_id
where pt.deleted_at is null;

-- Which documents a listing has — without exposing the files.
create or replace function public.vehicle_document_summary(p_vehicle_id uuid)
returns table (document_type public.vehicle_document_type, provided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.document_type, max(d.created_at)
  from public.vehicle_documents d
  where d.vehicle_id = p_vehicle_id
    and (private.is_vehicle_public(p_vehicle_id)
         or private.can_manage_vehicle(p_vehicle_id)
         or private.is_admin())
  group by d.document_type;
$$;

revoke execute on function public.vehicle_document_summary(uuid) from public;
grant  execute on function public.vehicle_document_summary(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.vehicles          enable row level security;
alter table public.vehicle_images    enable row level security;
alter table public.vehicle_documents enable row level security;
alter table public.part_categories   enable row level security;
alter table public.parts             enable row level security;
alter table public.part_images       enable row level security;
alter table public.favourites        enable row level security;

-- Vehicles -----------------------------------------------------------------------
create policy "public reads live vehicles; owners and admins read all"
  on public.vehicles for select to anon, authenticated
  using (
    (listing_status in ('active', 'sold') and deleted_at is null and private.is_profile_active(owner_id))
    or owner_id = auth.uid()
    or (business_id is not null and private.is_business_member(business_id))
    or private.is_admin()
  );

create policy "sellers create their own vehicles"
  on public.vehicles for insert to authenticated
  with check (
    owner_id = auth.uid()
    and private.is_active_user()
    and private.current_account_type() in ('private_seller', 'dealer', 'import_agent')
    and (business_id is null or private.is_business_member(business_id))
  );

create policy "sellers update their own vehicles"
  on public.vehicles for update to authenticated
  using (private.can_manage_vehicle(id) or private.is_admin())
  with check (
    (owner_id = auth.uid()
     or (business_id is not null and private.is_business_member(business_id))
     or private.is_admin())
  );

-- No hard deletes from the app; sellers archive or soft-delete (deleted_at).
revoke delete on public.vehicles from anon, authenticated;
revoke insert, update on public.vehicles from anon;

-- Vehicle images ----------------------------------------------------------------
create policy "public reads images of live vehicles"
  on public.vehicle_images for select to anon, authenticated
  using (private.is_vehicle_public(vehicle_id) or private.can_manage_vehicle(vehicle_id) or private.is_admin());

create policy "sellers add images to their vehicles"
  on public.vehicle_images for insert to authenticated
  with check (
    private.can_manage_vehicle(vehicle_id)
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );

create policy "sellers reorder images"
  on public.vehicle_images for update to authenticated
  using (private.can_manage_vehicle(vehicle_id))
  with check (private.can_manage_vehicle(vehicle_id));

create policy "sellers remove images"
  on public.vehicle_images for delete to authenticated
  using (private.can_manage_vehicle(vehicle_id) or private.is_admin());

revoke insert, update, delete on public.vehicle_images from anon;
revoke update on public.vehicle_images from authenticated;
grant update (position, is_primary) on public.vehicle_images to authenticated;

-- Vehicle documents: seller team + admins only ------------------------------------
create policy "sellers and admins read documents"
  on public.vehicle_documents for select to authenticated
  using (private.can_manage_vehicle(vehicle_id) or private.is_admin());

create policy "sellers add documents"
  on public.vehicle_documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and private.can_manage_vehicle(vehicle_id)
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );

create policy "sellers remove documents"
  on public.vehicle_documents for delete to authenticated
  using (private.can_manage_vehicle(vehicle_id));

revoke all on public.vehicle_documents from anon;
revoke update on public.vehicle_documents from authenticated;

-- Part categories: read-only reference data ---------------------------------------
create policy "anyone reads part categories"
  on public.part_categories for select to anon, authenticated using (true);
revoke insert, update, delete on public.part_categories from anon, authenticated;

-- Parts ---------------------------------------------------------------------------
create policy "public reads live parts; owners and admins read all"
  on public.parts for select to anon, authenticated
  using (
    (listing_status in ('active', 'sold') and deleted_at is null and private.is_profile_active(owner_id))
    or owner_id = auth.uid()
    or (business_id is not null and private.is_business_member(business_id))
    or private.is_admin()
  );

create policy "sellers create their own parts"
  on public.parts for insert to authenticated
  with check (
    owner_id = auth.uid()
    and private.is_active_user()
    and private.current_account_type() in ('parts_seller', 'private_seller', 'dealer', 'mechanic', 'servicing_company')
    and (business_id is null or private.is_business_member(business_id))
  );

create policy "sellers update their own parts"
  on public.parts for update to authenticated
  using (private.can_manage_part(id) or private.is_admin())
  with check (
    owner_id = auth.uid()
    or (business_id is not null and private.is_business_member(business_id))
    or private.is_admin()
  );

revoke delete on public.parts from anon, authenticated;
revoke insert, update on public.parts from anon;

create policy "public reads images of live parts"
  on public.part_images for select to anon, authenticated
  using (private.is_part_public(part_id) or private.can_manage_part(part_id) or private.is_admin());

create policy "sellers add part images"
  on public.part_images for insert to authenticated
  with check (private.can_manage_part(part_id) and split_part(storage_path, '/', 1) = auth.uid()::text);

create policy "sellers reorder part images"
  on public.part_images for update to authenticated
  using (private.can_manage_part(part_id))
  with check (private.can_manage_part(part_id));

create policy "sellers remove part images"
  on public.part_images for delete to authenticated
  using (private.can_manage_part(part_id) or private.is_admin());

revoke insert, update, delete on public.part_images from anon;
revoke update on public.part_images from authenticated;
grant update (position, is_primary) on public.part_images to authenticated;

-- Favourites ------------------------------------------------------------------------
create policy "users read their favourites"
  on public.favourites for select to authenticated
  using (profile_id = auth.uid());

create policy "users save live vehicles"
  on public.favourites for insert to authenticated
  with check (profile_id = auth.uid() and private.is_vehicle_public(vehicle_id));

create policy "users remove their favourites"
  on public.favourites for delete to authenticated
  using (profile_id = auth.uid());

revoke all on public.favourites from anon;
revoke update on public.favourites from authenticated;

-- Column-level write limits: sellers never write verification, timestamps or owner.
revoke insert, update on public.vehicles from authenticated;
grant insert (owner_id, business_id, make, model, variant, year, price, mileage_km, condition,
              transmission, fuel_type, engine_size_cc, body_type, colour, registration_status,
              duty_status, import_status, province, city, area, latitude, longitude,
              description, listing_status)
  on public.vehicles to authenticated;
grant update (business_id, make, model, variant, year, price, mileage_km, condition,
              transmission, fuel_type, engine_size_cc, body_type, colour, registration_status,
              duty_status, import_status, province, city, area, latitude, longitude,
              description, listing_status, deleted_at)
  on public.vehicles to authenticated;

revoke insert, update on public.parts from authenticated;
grant insert (owner_id, business_id, category_id, title, description, price, condition, quantity,
              compatibility_note, province, city, listing_status)
  on public.parts to authenticated;
grant update (business_id, category_id, title, description, price, condition, quantity,
              compatibility_note, province, city, listing_status, deleted_at)
  on public.parts to authenticated;

-- >>> 20260921000400_verification.sql
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

-- >>> 20260921000500_messaging_meetups_contacts.sql
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

-- >>> 20260921000600_trust_admin_content.sql
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

-- >>> 20260921000700_storage.sql
-- =============================================================================
-- Caryandi · 0007 · Storage buckets and file policies
-- =============================================================================
-- Every upload goes in the uploader's own folder:  <bucket>/<user id>/<file>
-- so ownership is checked from the path, not trusted from the client.
--
-- Public buckets (files served by public URL, e.g. listing photos):
--   avatars, business-media, vehicle-images, part-images
-- Private buckets (never public; owner + admins only, via signed URLs):
--   vehicle-documents  — registration / import / duty paperwork
--   verification       — in-app selfies and ID / business documents
--
-- Size and type limits are enforced by Storage itself (bucket settings below).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',           'avatars',           true,   5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('business-media',    'business-media',    true,   5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('vehicle-images',    'vehicle-images',    true,  10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('part-images',       'part-images',       true,   5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('vehicle-documents', 'vehicle-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('verification',      'verification',      false,  8388608, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets ----------------------------------------------------------------------
-- No SELECT policy for everyone: public URLs work without one, and leaving it
-- out stops people listing every file in the bucket through the API.
create policy "owners read their own public-bucket files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners upload to their folder in public buckets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.is_active_user()
  );

create policy "owners replace their files in public buckets"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners delete their files in public buckets"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('avatars', 'business-media', 'vehicle-images', 'part-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Vehicle documents (private) ------------------------------------------------------------
create policy "owners and admins read vehicle documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or private.is_admin())
  );

create policy "owners upload vehicle documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vehicle-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.is_active_user()
  );

create policy "owners delete vehicle documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Verification (private, write-once) --------------------------------------------------------
-- Users can add evidence but not overwrite or delete it once submitted.
create policy "owners and admins read verification files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'verification'
    and ((storage.foldername(name))[1] = auth.uid()::text or private.is_admin())
  );

create policy "owners upload verification files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.is_active_user()
  );

-- >>> 20260921000800_explicit_grants.sql
-- =============================================================================
-- Caryandi · 0008 · Explicit API grants
-- =============================================================================
-- Supabase projects differ in whether new tables are automatically granted to
-- the `anon` and `authenticated` API roles. This file states exactly which
-- table-level privileges each role gets, so the app behaves the same on any
-- project. RLS policies still decide WHICH rows; column-level grants in the
-- earlier migrations still decide WHICH columns can be written.
-- (Only privileges that are not column-restricted are granted here.)
-- =============================================================================

grant usage on schema public to anon, authenticated;

-- Readable by everyone (RLS filters to public rows) ------------------------------
grant select on
  public.profiles, public.businesses, public.services, public.import_routes,
  public.vehicles, public.vehicle_images, public.part_categories, public.parts,
  public.part_images, public.reviews, public.info_articles,
  public.vehicle_listings, public.part_listings
to anon, authenticated;

-- Signed-in users (RLS limits every one of these to their own rows) --------------
grant select, update on public.profile_contacts to authenticated;
grant select, insert, update, delete on public.business_members to authenticated;
grant select, insert, update on public.business_contacts to authenticated;
grant insert, update, delete on public.services, public.import_routes to authenticated;
grant insert, delete on public.vehicle_images, public.part_images to authenticated;
grant select, insert, delete on public.vehicle_documents to authenticated;
grant select, insert, delete on public.favourites to authenticated;
grant select, delete on public.notifications to authenticated;
grant select on public.conversations, public.conversation_participants,
                public.meetup_requests, public.messages to authenticated;
grant select on public.verification_requests to authenticated;
grant select, insert on public.verification_documents to authenticated;
grant delete on public.reviews to authenticated;
grant select on public.reports to authenticated;
grant insert, update, delete on public.info_articles to authenticated;  -- admins only via RLS
grant select on public.contact_reveals, public.admin_audit_log to authenticated;  -- admins only via RLS

-- Public RPCs used by anonymous visitors -----------------------------------------
grant execute on function public.vehicle_document_summary(uuid) to anon, authenticated;

commit;
