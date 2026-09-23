-- =============================================================================
-- Caryandi · 0009 · Marketplace read models (Stage 3)
-- =============================================================================
-- Additive and safe to re-run: CREATE OR REPLACE VIEW / FUNCTION and an
-- IF NOT EXISTS index.
-- Every view uses security_invoker, so the caller's row-level security still
-- decides which rows exist — the views only shape and aggregate public data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Seller directory: dealerships, import agents that sell cars, and private
-- sellers who currently have a live listing.
-- -----------------------------------------------------------------------------
create or replace view public.vehicle_sellers with (security_invoker = true) as
select
  'business'::text                              as seller_kind,
  b.id,
  b.slug,
  b.name,
  b.business_type::text                         as seller_type,
  b.province,
  b.city,
  b.area,
  b.logo_path                                   as image_path,
  b.description                                 as about,
  (b.verification_status = 'approved')          as is_verified,
  b.rating_avg,
  b.rating_count,
  (select count(*) from public.vehicles v
    where v.business_id = b.id and v.listing_status = 'active' and v.deleted_at is null) as active_vehicle_count,
  b.created_at
from public.businesses b
where b.is_active and b.deleted_at is null
  and (b.business_type = 'dealer'
       or (b.business_type = 'import_agent' and exists (
             select 1 from public.vehicles v
              where v.business_id = b.id and v.listing_status = 'active' and v.deleted_at is null)))
union all
select
  'private'::text,
  p.id,
  null::text,
  p.full_name,
  'private_seller'::text,
  p.province,
  p.city,
  null::text,
  p.avatar_path,
  p.bio,
  false,
  p.rating_avg,
  p.rating_count,
  (select count(*) from public.vehicles v
    where v.owner_id = p.id and v.business_id is null
      and v.listing_status = 'active' and v.deleted_at is null),
  p.created_at
from public.profiles p
where exists (select 1 from public.vehicles v
               where v.owner_id = p.id and v.business_id is null
                 and v.listing_status = 'active' and v.deleted_at is null);

-- -----------------------------------------------------------------------------
-- Makes that currently have live listings (search filter options).
-- -----------------------------------------------------------------------------
create or replace view public.vehicle_make_counts with (security_invoker = true) as
select min(v.make) as make, count(*) as listing_count
from public.vehicles v
where v.listing_status = 'active' and v.deleted_at is null
group by lower(v.make);

-- -----------------------------------------------------------------------------
-- Published reviews with a privacy-friendly reviewer name ("Natasha M.").
-- -----------------------------------------------------------------------------
create or replace view public.review_feed with (security_invoker = true) as
select
  r.id,
  r.business_id,
  r.seller_id,
  r.rating,
  r.body,
  r.created_at,
  trim(split_part(p.full_name, ' ', 1)
       || coalesce(' ' || nullif(left(split_part(p.full_name, ' ', 2), 1), '') || '.', '')) as reviewer_name
from public.reviews r
join public.profiles p on p.id = r.reviewer_id
where r.status = 'published';

-- -----------------------------------------------------------------------------
-- Dashboard numbers for the signed-in seller: only aggregate counts, only for
-- listings they own or manage as a business team member.
-- -----------------------------------------------------------------------------
create or replace function public.my_dashboard_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  with mine as (
    select v.id, v.listing_status
    from public.vehicles v
    where auth.uid() is not null
      and v.deleted_at is null
      and (v.owner_id = auth.uid()
           or (v.business_id is not null and exists (
                 select 1 from public.business_members m
                  where m.business_id = v.business_id and m.profile_id = auth.uid())))
  )
  select jsonb_build_object(
    'active_listings',        (select count(*) from mine where listing_status = 'active'),
    'draft_listings',         (select count(*) from mine where listing_status = 'draft'),
    'sold_listings',          (select count(*) from mine where listing_status = 'sold'),
    'times_saved',            (select count(*) from public.favourites f where f.vehicle_id in (select id from mine)),
    'contact_requests_7d',    (select count(*) from public.contact_reveals c
                                where c.target_type = 'vehicle' and c.target_id in (select id from mine)
                                  and c.created_at > now() - interval '7 days'),
    'contact_requests_total', (select count(*) from public.contact_reveals c
                                where c.target_type = 'vehicle' and c.target_id in (select id from mine)),
    'unread_notifications',   (select count(*) from public.notifications n
                                where n.recipient_id = auth.uid() and n.read_at is null)
  );
$$;

revoke execute on function public.my_dashboard_stats() from public, anon;
grant execute on function public.my_dashboard_stats() to authenticated;

grant select on public.vehicle_sellers, public.vehicle_make_counts, public.review_feed to anon, authenticated;

-- -----------------------------------------------------------------------------
-- One live business per owner. Every account has a single type, so a dealer
-- has one dealership; this stops a retried or double-submitted "create
-- business" from splitting a dealer's listings across two records.
-- -----------------------------------------------------------------------------
create unique index if not exists businesses_one_per_owner
  on public.businesses (owner_id) where deleted_at is null;
