-- =============================================================================
-- Caryandi · 0012 · Service providers directory (Stage 7)
-- =============================================================================
-- Mechanics, servicing companies and import agents, with the summary the
-- directory cards and profile pages need: what they offer, from what price,
-- which import routes they run, verification and ratings.
--
-- security_invoker = true: row-level security on businesses, services and
-- import_routes still applies, so visitors only see active businesses and
-- their active services / routes.
-- =============================================================================

-- Opening hours: {"mon": {"open": "08:00", "close": "17:00"}, "sun": null, ...}
-- A missing day or null means closed. Times are 24-hour Zambian time.
create or replace function private.opening_hours_valid(h jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select h is null or (
    jsonb_typeof(h) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(h) as k
       where k not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'))
    and not exists (
      select 1 from jsonb_each(h) as e
       where not (
         jsonb_typeof(e.value) = 'null'
         or (jsonb_typeof(e.value) = 'object'
             and (select count(*) from jsonb_object_keys(e.value)) = 2
             and (e.value ->> 'open')  ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
             and (e.value ->> 'close') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
             and (e.value ->> 'open') < (e.value ->> 'close'))))
  );
$$;

grant execute on function private.opening_hours_valid(jsonb) to authenticated, service_role;

alter table public.businesses drop constraint if exists businesses_opening_hours_valid;
alter table public.businesses
  add constraint businesses_opening_hours_valid check (private.opening_hours_valid(opening_hours));

create or replace view public.service_providers with (security_invoker = true) as
select
  b.id,
  b.slug,
  b.name,
  b.business_type,
  b.description,
  b.province,
  b.city,
  b.area,
  b.address,
  b.latitude,
  b.longitude,
  b.logo_path,
  b.cover_path,
  b.opening_hours,
  b.is_mobile_service,
  b.price_from,
  b.price_note,
  (b.verification_status = 'approved') as is_verified,
  b.rating_avg,
  b.rating_count,
  b.created_at,
  coalesce((
    select array_agg(s.name order by s.price_from nulls last, s.name)
      from (select sv.name, sv.price_from
              from public.services sv
             where sv.business_id = b.id and sv.is_active
             order by sv.price_from nulls last, sv.name
             limit 8) s), '{}'::text[])                                     as service_names,
  (select count(*) from public.services sv
    where sv.business_id = b.id and sv.is_active)::int                       as service_count,
  (select min(sv.price_from) from public.services sv
    where sv.business_id = b.id and sv.is_active)                            as min_service_price,
  coalesce((
    select array_agg(x.label order by x.label)
      from (select r.origin_country || coalesce(' → ' || r.transit_port, '') || ' → ' || r.destination_city as label
              from public.import_routes r
             where r.business_id = b.id and r.is_active
             order by r.origin_country
             limit 8) x), '{}'::text[])                                      as route_labels,
  (select count(*) from public.import_routes r
    where r.business_id = b.id and r.is_active)::int                         as route_count,
  (select min(r.price_from) from public.import_routes r
    where r.business_id = b.id and r.is_active)                              as min_route_price
from public.businesses b
where b.is_active
  and b.deleted_at is null
  and b.business_type in ('mechanic', 'servicing_company', 'import_agent');

grant select on public.service_providers to anon, authenticated;
