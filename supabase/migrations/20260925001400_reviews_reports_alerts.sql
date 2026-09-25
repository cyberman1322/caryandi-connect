-- =============================================================================
-- Caryandi · 0014 · Review eligibility, alert e-mail outbox (Stage 9)
-- =============================================================================
-- Reviews (one per customer, only after contacting, ratings recalculated by the
-- database) and reports (in-app alert to every administrator) exist since
-- migration 0006. This adds:
--   * review_eligibility()  — tells the page whether to offer "Write a review"
--   * email_outbox          — queue of alert e-mails. The database never holds
--                             e-mail provider keys: the send-alert-emails Edge
--                             Function reads this queue with the service role
--                             and sends through the configured provider.
--   * scam reports queue an urgent e-mail to the Caryandi alerts address.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Review eligibility for the signed-in user.
-- Returns {status, review_id?}; status is one of
--   sign_in | own | not_contacted | already_reviewed | ok | not_found
-- -----------------------------------------------------------------------------
create or replace function public.review_eligibility(p_business_id uuid default null, p_seller_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me     uuid := auth.uid();
  v_review uuid;
begin
  if num_nonnulls(p_business_id, p_seller_id) <> 1 then
    raise exception 'Give a business or a seller' using errcode = '22023';
  end if;
  if v_me is null or not private.is_active_user() then
    return jsonb_build_object('status', 'sign_in');
  end if;

  if p_business_id is not null then
    if not private.is_business_public(p_business_id) then
      return jsonb_build_object('status', 'not_found');
    end if;
    if private.is_business_member(p_business_id) then
      return jsonb_build_object('status', 'own');
    end if;
    select id into v_review from public.reviews where reviewer_id = v_me and business_id = p_business_id;
    if v_review is not null then
      return jsonb_build_object('status', 'already_reviewed', 'review_id', v_review);
    end if;
    if not exists (
         select 1 from public.conversations c
         join public.conversation_participants p on p.conversation_id = c.id and p.profile_id = v_me
        where c.business_id = p_business_id) then
      return jsonb_build_object('status', 'not_contacted');
    end if;
  else
    if p_seller_id = v_me then
      return jsonb_build_object('status', 'own');
    end if;
    if not exists (select 1 from public.profiles where id = p_seller_id and account_status = 'active') then
      return jsonb_build_object('status', 'not_found');
    end if;
    select id into v_review from public.reviews where reviewer_id = v_me and seller_id = p_seller_id;
    if v_review is not null then
      return jsonb_build_object('status', 'already_reviewed', 'review_id', v_review);
    end if;
    if not exists (
         select 1 from public.conversation_participants a
         join public.conversation_participants b on b.conversation_id = a.conversation_id
        where a.profile_id = v_me and b.profile_id = p_seller_id) then
      return jsonb_build_object('status', 'not_contacted');
    end if;
  end if;
  return jsonb_build_object('status', 'ok');
end $$;

revoke execute on function public.review_eligibility(uuid, uuid) from public;
grant execute on function public.review_eligibility(uuid, uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Alert e-mail outbox (service role only).
-- to_email null = the platform alerts address configured on the Edge Function.
-- -----------------------------------------------------------------------------
create table if not exists public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  to_email    text check (to_email is null or to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  template    text not null check (template in ('scam_report', 'report')),
  subject     text not null check (char_length(subject) <= 200),
  body_text   text not null check (char_length(body_text) <= 10000),
  payload     jsonb not null default '{}',
  status      text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts    smallint not null default 0,
  last_error  text check (char_length(last_error) <= 1000),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index if not exists email_outbox_pending_idx on public.email_outbox (created_at) where status in ('pending', 'failed');

alter table public.email_outbox enable row level security;
-- No policies: only the service role (which bypasses RLS) can read or change it.
revoke all on public.email_outbox from anon, authenticated;
grant select, insert, update on public.email_outbox to service_role;

-- Every new report: in-app alert to all administrators (as before) and, for
-- scam reports, an urgent e-mail to the Caryandi alerts address. The reported
-- person is never notified, so a scammer is not tipped off.
create or replace function private.on_report_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r         record;
  v_reporter text;
  v_title   text := case when new.category = 'scam' then 'URGENT: scam report' else 'New report' end;
  v_summary text := initcap(replace(new.category::text, '_', ' ')) || ' — ' || new.target_type::text || ': ' || left(new.details, 200);
begin
  for r in select id from public.profiles where account_type = 'admin' and account_status = 'active' loop
    perform private.notify(r.id, 'report_update', v_title, v_summary,
      '/admin/reports', jsonb_build_object('report_id', new.id));
  end loop;

  if new.category = 'scam' then
    select full_name into v_reporter from public.profiles where id = new.reporter_id;
    insert into public.email_outbox (template, subject, body_text, payload)
    values (
      'scam_report',
      left('[Caryandi] URGENT scam report — ' || new.target_type::text, 200),
      left(
        'A user has reported a possible scam on Caryandi.' || E'\n\n'
        || 'Reported: ' || new.target_type::text || ' ' || new.target_id::text || E'\n'
        || 'Reported by: ' || coalesce(v_reporter, 'a signed-in user') || E'\n'
        || 'When: ' || to_char(new.created_at at time zone 'Africa/Lusaka', 'Dy DD Mon YYYY HH24:MI') || ' (Lusaka)' || E'\n\n'
        || 'Details:' || E'\n' || new.details || E'\n\n'
        || 'Review it in the admin area: /admin/reports', 10000),
      jsonb_build_object('report_id', new.id, 'target_type', new.target_type, 'target_id', new.target_id));
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Queue helpers for the send-alert-emails Edge Function (service role only).
-- Rows are claimed with SKIP LOCKED so two runs never send the same e-mail;
-- failures are retried up to 5 times; a row stuck in 'sending' for 15 minutes
-- (crashed run) is picked up again.
-- -----------------------------------------------------------------------------
create or replace function public.claim_email_batch(p_limit integer default 20)
returns setof public.email_outbox language sql volatile security definer set search_path = '' as $$
  update public.email_outbox o
     set status = 'sending', attempts = o.attempts + 1
   where o.id in (
     select id from public.email_outbox
      where (status in ('pending', 'failed') and attempts < 5)
         or (status = 'sending' and created_at < now() - interval '15 minutes' and attempts < 5)
      order by created_at
      limit greatest(1, least(p_limit, 100))
      for update skip locked)
  returning o.*;
$$;

create or replace function public.complete_email(p_id uuid, p_sent boolean, p_error text default null)
returns void language sql volatile security definer set search_path = '' as $$
  update public.email_outbox
     set status = case when p_sent then 'sent' else 'failed' end,
         sent_at = case when p_sent then now() end,
         last_error = case when p_sent then null else left(p_error, 1000) end
   where id = p_id;
$$;

revoke execute on function public.claim_email_batch(integer) from public, anon, authenticated;
revoke execute on function public.complete_email(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer) to service_role;
grant execute on function public.complete_email(uuid, boolean, text) to service_role;
