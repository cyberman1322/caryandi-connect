-- =============================================================================
-- Caryandi · 0011 · Verification read model (Stage 6)
-- =============================================================================
-- One row per verification request with the labels the seller page and the
-- admin queue need (who asked, which business / car, the car's registration
-- and duty status, how many documents are attached, who decided).
--
-- security_invoker = true: the caller's row-level security applies to every
-- table underneath, so a seller sees only their own requests and an
-- administrator sees all of them. Nothing here can be written through the view.
-- =============================================================================

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
  rp.full_name                as reviewer_name
from public.verification_requests r
join public.profiles p on p.id = r.requester_id
left join public.businesses b on b.id = r.business_id
left join public.vehicles v on v.id = r.vehicle_id
left join public.profiles rp on rp.id = r.reviewed_by;

revoke all on public.verification_request_details from anon, public;
grant select on public.verification_request_details to authenticated;
