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
