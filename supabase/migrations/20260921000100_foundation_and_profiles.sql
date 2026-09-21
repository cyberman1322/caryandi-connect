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
