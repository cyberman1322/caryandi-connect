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
