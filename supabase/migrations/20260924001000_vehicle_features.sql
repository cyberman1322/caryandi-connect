-- =============================================================================
-- Vehicle features (air conditioning, reverse camera, 4x4 …) chosen by the
-- seller for each listing.
--
-- Stored as feature codes from a fixed catalogue rather than free text, so
-- buyers can later filter on them and the vehicle page never shows invented
-- or misspelled features. To add a feature: add its code to
-- private.vehicle_feature_codes() here AND to VEHICLE_FEATURES in
-- src/lib/vehicles/vehicle-options.ts.
-- =============================================================================

create or replace function private.vehicle_feature_codes()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array[
    -- Comfort & convenience
    'air_conditioning', 'climate_control', 'power_steering', 'power_windows',
    'central_locking', 'keyless_entry', 'push_button_start', 'cruise_control',
    'leather_seats', 'electric_seats', 'heated_seats', 'sunroof', 'third_row_seats',
    -- Safety & security
    'abs', 'airbags', 'stability_control', 'reverse_camera', 'parking_sensors',
    'camera_360', 'lane_assist', 'alarm_immobiliser',
    -- Technology
    'bluetooth', 'navigation', 'touchscreen', 'apple_carplay_android_auto', 'usb_aux',
    -- Exterior & capability
    'alloy_wheels', 'four_wheel_drive', 'tow_bar', 'roof_rails', 'fog_lights',
    'led_headlights', 'bull_bar', 'canopy'
  ]::text[];
$$;

-- Every code must be in the catalogue, with no duplicates and no nulls.
create or replace function private.vehicle_features_valid(features text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select features is not null
     and array_position(features, null) is null
     and features <@ private.vehicle_feature_codes()
     and cardinality(features) = (select count(distinct f) from unnest(features) as f);
$$;

-- New functions in private get no EXECUTE by default; the check constraint runs
-- as the person saving the listing, so sellers need these.
grant execute on function private.vehicle_feature_codes() to authenticated, service_role;
grant execute on function private.vehicle_features_valid(text[]) to authenticated, service_role;

alter table public.vehicles
  add column if not exists features text[] not null default '{}';

-- Sellers write vehicles through column-level grants (see 0003); add the new column.
grant insert (features), update (features) on public.vehicles to authenticated;

alter table public.vehicles
  drop constraint if exists vehicles_features_valid;
alter table public.vehicles
  add constraint vehicles_features_valid check (private.vehicle_features_valid(features));

-- Ready for "has 4x4 / has reverse camera" filters on search.
create index if not exists vehicles_features_idx on public.vehicles using gin (features)
  where listing_status = 'active' and deleted_at is null;

-- Expose features on the public read model (appended, so existing columns keep their order).
create or replace view public.vehicle_listings with (security_invoker = true) as
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
    order by vi.is_primary desc, vi.position asc limit 1)       as primary_image_path,
  v.features
from public.vehicles v
join public.profiles p on p.id = v.owner_id
left join public.businesses b on b.id = v.business_id
where v.deleted_at is null;
