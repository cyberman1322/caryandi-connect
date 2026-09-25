-- =============================================================================
-- Caryandi · remove DEMO seed data
-- =============================================================================
-- Deletes every account whose e-mail ends in @demo.caryandi.invalid and
-- everything they created (businesses, listings, services, routes, chats,
-- reviews, reports, notifications). Real accounts are not touched, but chats
-- and reviews between real users and demo accounts are removed with them.
-- Photos: demo data has none. Run in the Supabase SQL editor.
-- =============================================================================
begin;

create temporary table demo_users on commit drop as
  select id from auth.users where email like '%@demo.caryandi.invalid';

delete from public.vehicles   where owner_id in (select id from demo_users);
delete from public.parts      where owner_id in (select id from demo_users);
delete from public.conversations c
 where c.created_by in (select id from demo_users)
    or exists (select 1 from public.conversation_participants p
                where p.conversation_id = c.id and p.profile_id in (select id from demo_users));
delete from public.businesses where owner_id in (select id from demo_users);
delete from auth.users        where id in (select id from demo_users);

commit;
