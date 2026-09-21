# Caryandi — Supabase database (Stage 1)

Project: `vwfokikhcofkvwtyhbyp` · `https://vwfokikhcofkvwtyhbyp.supabase.co`

## How to apply

**Option A: SQL Editor (simplest)**
1. Supabase dashboard → **SQL Editor** → New query.
2. Paste the whole of `caryandi_stage1_all_in_one.sql` → **Run**.
   It runs as one transaction: if anything fails, nothing is applied.

**Option B: Supabase CLI**
```
supabase link --project-ref vwfokikhcofkvwtyhbyp
supabase db push
```
(applies `migrations/` in order)

Apply to a fresh project **once**. Later changes will come as new migration files.

## After applying

1. **Make yourself an administrator.** Sign up in the app first, then run this in the SQL Editor
   (admin can never be chosen at signup):
   ```sql
   update public.profiles set account_type = 'admin'
   where id = (select id from auth.users where email = 'YOUR-EMAIL');
   ```
2. **Leave the API "Exposed schemas" setting as `public`.** Internal functions live in the
   `private` schema on purpose, so the website can't call them. Don't expose it.
3. **Keys:** the frontend only ever gets the **anon** key. The service-role key must never go
   in frontend code, in `VITE_*` variables, or in GitHub.

## What's in it

| File | Contents |
|---|---|
| 0001 foundation_and_profiles | Enums, `private` helper schema, profiles, private contacts, signup trigger |
| 0002 businesses | Dealers, mechanics, servicing companies, parts sellers and import agents (one table), team members, business contacts, services, import routes |
| 0003 listings | Vehicles, images, private documents, parts, part categories, favourites, `vehicle_listings` / `part_listings` read views |
| 0004 verification | Optional verification: business once / private per car, selfie, admin-only decisions |
| 0005 messaging_meetups_contacts | Notifications, chat, meet-up requests, phone/WhatsApp reveal (signed-in, logged, rate-limited) |
| 0006 trust_admin_content | Reviews + server-calculated ratings, reports, scam investigation, admin actions, audit log, information articles |
| 0007 storage | Buckets (public photos; private documents and selfies) and file policies |
| 0008 explicit_grants | Exact API permissions, so every Supabase project behaves the same |

## Functions the frontend calls (RPC)

| Function | Who | Purpose |
|---|---|---|
| `start_conversation(target_type, target_id, message)` | signed in | "Send enquiry": opens or reuses a chat |
| `request_meetup(target_type, target_id, time, where, message)` | signed in | "Request meet-up": posts in the chat and notifies the seller |
| `respond_meetup(meetup_id, status, note)` | signed in | Seller accepts, declines or completes; buyer cancels |
| `get_contact(target_type, target_id)` | signed in | "Show contact": returns phone, WhatsApp and a wa.me link. Every reveal is logged |
| `vehicle_document_summary(vehicle_id)` | anyone | Which documents a car has (the files stay private) |
| `admin_*` | admins | Verification decisions, listing/account/business moderation, reports, scam details |

`target_type` is one of: `vehicle`, `part`, `service`, `import_route`, `business`, `profile`.

## Tests

`tests/run_tests.sh` applies every migration to a throwaway local Postgres (with a Supabase
stand-in) and runs 110 security scenarios. Never point it at the real project.
