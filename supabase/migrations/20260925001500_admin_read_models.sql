-- =============================================================================
-- Caryandi · 0015 · Admin read models (Stage 10)
-- =============================================================================
-- Moderation decisions already go through audited admin RPCs (migration 0006).
-- This adds the read side the admin screens need. Every view is
-- security_invoker, so row-level security decides what each caller sees:
-- administrators see everything. Each view is also limited to administrators
-- explicitly, so no other account can use them to list the platform's data.
-- Contact details (e-mail, phone) are deliberately NOT exposed here; they are
-- released only through admin_get_scam_report_details for scam investigations.
-- =============================================================================

create or replace function public.admin_platform_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'users',                 (select count(*) from public.profiles),
    'users_7d',              (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'suspended_or_banned',   (select count(*) from public.profiles where account_status <> 'active'),
    'live_vehicles',         (select count(*) from public.vehicles where listing_status = 'active' and deleted_at is null),
    'live_parts',            (select count(*) from public.parts where listing_status = 'active' and deleted_at is null),
    'businesses',            (select count(*) from public.businesses where deleted_at is null),
    'pending_verifications', (select count(*) from public.verification_requests where status = 'pending'),
    'open_reports',          (select count(*) from public.reports where status in ('open', 'reviewing')),
    'open_scam_reports',     (select count(*) from public.reports where status in ('open', 'reviewing') and category = 'scam'),
    'reviews',               (select count(*) from public.reviews),
    'conversations_7d',      (select count(*) from public.conversations where created_at > now() - interval '7 days')
  );
end $$;

revoke execute on function public.admin_platform_stats() from public, anon;
grant execute on function public.admin_platform_stats() to authenticated;

-- Users with what they run on Caryandi.
create or replace view public.admin_users with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.account_type,
  p.account_status,
  p.province,
  p.city,
  p.created_at,
  p.rating_avg,
  p.rating_count,
  b.id   as business_id,
  b.name as business_name,
  b.slug as business_slug,
  (select count(*) from public.vehicles v
    where v.owner_id = p.id and v.deleted_at is null and v.listing_status = 'active')::int as live_vehicles,
  (select count(*) from public.parts pt
    where pt.owner_id = p.id and pt.deleted_at is null and pt.listing_status = 'active')::int as live_parts
from public.profiles p
left join lateral (
  select bb.id, bb.name, bb.slug from public.businesses bb
   where bb.owner_id = p.id and bb.deleted_at is null
   order by bb.created_at limit 1) b on true
where private.is_admin();

-- Businesses of every type, including inactive ones (admins only see those).
create or replace view public.admin_businesses with (security_invoker = true) as
select
  b.id,
  b.name,
  b.slug,
  b.business_type,
  b.province,
  b.city,
  b.verification_status,
  b.is_active,
  b.rating_avg,
  b.rating_count,
  b.created_at,
  b.owner_id,
  o.full_name     as owner_name,
  o.account_status as owner_status,
  (select count(*) from public.vehicles v
    where v.business_id = b.id and v.deleted_at is null and v.listing_status = 'active')::int as live_vehicles,
  (select count(*) from public.parts pt
    where pt.business_id = b.id and pt.deleted_at is null and pt.listing_status = 'active')::int as live_parts,
  (select count(*) from public.services s where s.business_id = b.id and s.is_active)::int      as active_services,
  (select count(*) from public.import_routes r where r.business_id = b.id and r.is_active)::int as active_routes
from public.businesses b
left join public.profiles o on o.id = b.owner_id
where b.deleted_at is null and private.is_admin();

-- Listings (vehicles and parts) for moderation.
create or replace view public.admin_listings with (security_invoker = true) as
select
  'vehicle'::text as listing_type,
  v.id,
  (v.year || ' ' || v.make || ' ' || v.model || coalesce(' ' || v.variant, '')) as title,
  v.price,
  v.listing_status,
  v.verification_status,
  v.province,
  v.city,
  v.owner_id,
  coalesce(b.name, p.full_name) as seller_name,
  v.created_at,
  v.published_at
from public.vehicles v
join public.profiles p on p.id = v.owner_id
left join public.businesses b on b.id = v.business_id
where v.deleted_at is null and private.is_admin()
union all
select
  'part'::text,
  pt.id,
  pt.title,
  pt.price,
  pt.listing_status,
  null::public.verification_status,
  pt.province,
  pt.city,
  pt.owner_id,
  coalesce(b.name, p.full_name),
  pt.created_at,
  pt.published_at
from public.parts pt
join public.profiles p on p.id = pt.owner_id
left join public.businesses b on b.id = pt.business_id
where pt.deleted_at is null and private.is_admin();

-- Reviews with who wrote them and who they are about (hidden ones too, for admins).
create or replace view public.admin_reviews with (security_invoker = true) as
select
  r.id,
  r.rating,
  r.body,
  r.status,
  r.created_at,
  r.updated_at,
  r.reviewer_id,
  rv.full_name                    as reviewer_name,
  r.business_id,
  r.seller_id,
  coalesce(b.name, s.full_name)   as subject_name,
  b.business_type                 as subject_business_type,
  b.slug                          as subject_slug
from public.reviews r
left join public.profiles rv on rv.id = r.reviewer_id
left join public.businesses b on b.id = r.business_id
left join public.profiles s on s.id = r.seller_id
where private.is_admin();

-- Reports with a readable label of what was reported.
create or replace view public.admin_reports with (security_invoker = true) as
select
  rp.id,
  rp.target_type,
  rp.target_id,
  rp.category,
  rp.details,
  rp.status,
  rp.admin_notes,
  rp.created_at,
  rp.updated_at,
  rp.resolved_at,
  rp.reporter_id,
  rep.full_name as reporter_name,
  rs.full_name  as resolved_by_name,
  case rp.target_type
    when 'vehicle'  then (select v.year || ' ' || v.make || ' ' || v.model from public.vehicles v where v.id = rp.target_id)
    when 'part'     then (select pt.title from public.parts pt where pt.id = rp.target_id)
    when 'business' then (select b.name from public.businesses b where b.id = rp.target_id)
    when 'profile'  then (select p.full_name from public.profiles p where p.id = rp.target_id)
    when 'review'   then (select 'Review: ' || left(coalesce(r.body, r.rating || ' stars'), 80) from public.reviews r where r.id = rp.target_id)
    when 'message'  then 'Chat message'
  end as target_label,
  (select count(*) from public.reports o
    where o.target_type = rp.target_type and o.target_id = rp.target_id)::int as reports_on_target
from public.reports rp
left join public.profiles rep on rep.id = rp.reporter_id
left join public.profiles rs  on rs.id = rp.resolved_by
where private.is_admin();

-- Recent admin actions (the audit log itself is admins-only by RLS).
create or replace view public.admin_audit_feed with (security_invoker = true) as
select l.id, l.action, l.target_type, l.target_id, l.details, l.created_at, p.full_name as admin_name
from public.admin_audit_log l
left join public.profiles p on p.id = l.admin_id
where private.is_admin();

revoke all on public.admin_users, public.admin_businesses, public.admin_listings,
              public.admin_reviews, public.admin_reports, public.admin_audit_feed from anon;
grant select on public.admin_users, public.admin_businesses, public.admin_listings,
                public.admin_reviews, public.admin_reports, public.admin_audit_feed to authenticated;
