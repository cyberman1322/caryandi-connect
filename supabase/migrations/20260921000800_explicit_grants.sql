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
