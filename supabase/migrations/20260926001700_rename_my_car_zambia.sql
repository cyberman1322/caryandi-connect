-- =============================================================================
-- My Car Zambia · 0017 · Rename (was "Caryandi")
-- =============================================================================
-- The app is now called My Car Zambia. Rewrites the user-facing text inside
-- database functions and views (default name for new users, message
-- notifications, review errors, scam-alert e-mail text, age error) so it reads
-- "My Car Zambia". Only the text changes: each object is re-created from its
-- own current definition, keeping ownership, grants, SECURITY DEFINER,
-- search_path and view options. Internal names (schemas, tables, storage
-- buckets, local-storage keys) keep "caryandi".
-- =============================================================================

do $rename$
declare
  r record;
  v_def text;
begin
  -- Functions and trigger functions.
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.prokind = 'f'
       and p.prosrc like '%Caryandi%'
  loop
    v_def := pg_get_functiondef(r.oid);
    execute replace(v_def, 'Caryandi', 'My Car Zambia');
  end loop;

  -- Views (keeps options such as security_invoker).
  for r in
    select c.oid, n.nspname, c.relname, c.reloptions
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and pg_get_viewdef(c.oid) like '%Caryandi%'
  loop
    execute format('create or replace view %I.%I%s as %s',
      r.nspname, r.relname,
      case when r.reloptions is null then '' else ' with (' || array_to_string(r.reloptions, ', ') || ')' end,
      replace(pg_get_viewdef(r.oid), 'Caryandi', 'My Car Zambia'));
  end loop;
end
$rename$;

-- The placeholder name given to accounts that signed up without one.
update public.profiles set full_name = 'My Car Zambia user' where full_name = 'Caryandi user';
