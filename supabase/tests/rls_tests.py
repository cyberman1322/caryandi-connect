"""Scenario tests for the Caryandi migrations, run against a local Postgres
with the Supabase shim. Each step runs as a specific user (role authenticated
+ JWT sub), exactly as PostgREST would, and asserts success or rejection."""
import os, subprocess, sys, uuid

DB = ["psql", "-h", os.environ.get("PGHOST", "/tmp"), "-p", os.environ.get("PGPORT", "5499"), "-U", "postgres", "-d", "caryandi_test",
      "-v", "ON_ERROR_STOP=1", "-q", "-tA", "-X"]
results = []

def run(sql, user=None, role="authenticated"):
    pre = ""
    if role:
        pre = (f"set request.jwt.claim.sub = '{user or ''}';\n" if user else "") + f"set role {role};\n"
    p = subprocess.run(DB + ["-c", "begin;\n" + pre + sql + "\ncommit;"], capture_output=True, text=True)
    return p.returncode == 0, (p.stdout.strip() if p.returncode == 0 else p.stderr.strip())

def ok(name, sql, user=None, role="authenticated", expect=None):
    good, out = run(sql, user, role)
    passed = good and (expect is None or expect in out)
    results.append((passed, name, out if not passed else ""))
    return out

def denied(name, sql, user=None, role="authenticated", match=None):
    good, out = run(sql, user, role)
    passed = (not good and (match is None or match.lower() in out.lower())) or (good and out == "0")
    # "0" = statement ran but touched zero rows (RLS silently filtered it)
    results.append((passed, name, out if not passed else ""))

def admin(sql):
    good, out = run(sql, role=None)
    if not good:
        print("SETUP FAILED:", sql, out); sys.exit(1)
    return out

# ---------------------------------------------------------------- setup users
U = {k: str(uuid.uuid4()) for k in
     ["buyer", "seller", "dealer", "dealer_staff", "mechanic", "agent", "admin", "attacker"]}
meta = {
    "buyer":        ('{"full_name":"Natasha Mwale","account_type":"buyer"}'),
    "seller":       ('{"full_name":"Mwamba Jere","account_type":"private_seller","phone":"+260971234567"}'),
    "dealer":       ('{"full_name":"Chanda Phiri","account_type":"dealer","phone":"+260961112233"}'),
    "dealer_staff": ('{"full_name":"Brian Sakala","account_type":"dealer"}'),
    "mechanic":     ('{"full_name":"Joseph Banda","account_type":"mechanic","phone":"+260955443322"}'),
    "agent":        ('{"full_name":"Grace Tembo","account_type":"import_agent","phone":"+260977665544"}'),
    "admin":        ('{"full_name":"Caryandi Admin","account_type":"admin"}'),
    "attacker":     ('{"full_name":"Eve Attacker","account_type":"buyer"}'),
}
for k, m in meta.items():
    admin(f"insert into auth.users (id, email, raw_user_meta_data) values ('{U[k]}', '{k}@example.com', '{m}');")

ok("signup: 'admin' cannot be self-requested at signup (falls back to buyer)",
   f"select account_type from public.profiles where id = '{U['admin']}';", role=None, expect="buyer")
admin(f"update public.profiles set account_type = 'admin' where id = '{U['admin']}';")  # SQL editor step
ok("signup: profile + phone created from metadata",
   f"select phone from public.profile_contacts where profile_id = '{U['seller']}';", role=None, expect="+260971234567")

# ---------------------------------------------------------------- profiles
denied("profile: user cannot make themselves admin",
       "update public.profiles set account_type = 'admin' where id = auth.uid();", U["attacker"], match="admin")
denied("profile: user cannot unban/change own status (column not writable)",
       "update public.profiles set account_status = 'active' where id = auth.uid();", U["attacker"], match="permission denied")
denied("profile: user cannot edit someone else's profile",
       f"with u as (update public.profiles set full_name = 'Hacked' where id = '{U['seller']}' returning 1) select count(*) from u;",
       U["attacker"])
denied("contacts: phone numbers not readable by other users",
       f"select count(*) from public.profile_contacts where profile_id = '{U['seller']}';", U["attacker"])
denied("contacts: anonymous visitors cannot read contacts",
       "select count(*) from public.profile_contacts;", role="anon", match="permission denied")
ok("profile: user edits own name", "update public.profiles set full_name = 'Natasha M.' where id = auth.uid();", U["buyer"])

# ---------------------------------------------------------------- businesses
BIZ = ok("business: dealer creates dealer business",
         f"insert into public.businesses (owner_id, business_type, name, province, city) values "
         f"(auth.uid(), 'dealer', 'Autoworld Zambia', 'lusaka', 'Lusaka') returning id;", U["dealer"]).split("\n")[0]
denied("business: buyer cannot create a dealer business",
       "insert into public.businesses (owner_id, business_type, name) values (auth.uid(), 'dealer', 'Fake Motors');",
       U["attacker"], match="row-level security")
denied("business: owner cannot self-verify",
       f"update public.businesses set verification_status = 'approved' where id = '{BIZ}';", U["dealer"], match="permission denied")
ok("business: owner record added as team owner",
   f"select role from public.business_members where business_id = '{BIZ}' and profile_id = '{U['dealer']}';", role=None, expect="owner")
ok("business: owner adds staff member",
   f"insert into public.business_members (business_id, profile_id, role) values ('{BIZ}', '{U['dealer_staff']}', 'staff');", U["dealer"])
ok("business: owner sets business phone + WhatsApp",
   f"insert into public.business_contacts (business_id, phone, whatsapp_number) values ('{BIZ}', '+260211250000', '+260961112233');", U["dealer"])

MECH = ok("business: mechanic creates mechanic business",
          "insert into public.businesses (owner_id, business_type, name, province, city) values "
          "(auth.uid(), 'mechanic', 'Precision Auto Care', 'lusaka', 'Lusaka') returning id;", U["mechanic"]).split("\n")[0]
SVC = ok("services: mechanic adds a service",
         f"insert into public.services (business_id, name, price_from) values ('{MECH}', 'Pre-purchase inspection', 350) returning id;",
         U["mechanic"]).split("\n")[0]
denied("services: dealer cannot add services (wrong business type)",
       f"insert into public.services (business_id, name) values ('{BIZ}', 'Oil change');", U["dealer"], match="can only belong")
denied("services: other user cannot add a service to someone else's business",
       f"insert into public.services (business_id, name) values ('{MECH}', 'Fake');", U["attacker"], match="row-level security")

AGENT_BIZ = ok("business: import agent creates business",
               "insert into public.businesses (owner_id, business_type, name, city) values "
               "(auth.uid(), 'import_agent', 'Zambezi Auto Imports', 'Lusaka') returning id;", U["agent"]).split("\n")[0]
ROUTE = ok("routes: agent adds Japan → Durban → Lusaka route",
           f"insert into public.import_routes (business_id, origin_country, transit_port, destination_city, services, est_days_min, est_days_max) "
           f"values ('{AGENT_BIZ}', 'Japan', 'Durban', 'Lusaka', '{{sourcing,shipping,clearing}}', 45, 70) returning id;",
           U["agent"]).split("\n")[0]
ok("routes: agent adds direct Japan → Zambia route (no transit port)",
   f"insert into public.import_routes (business_id, origin_country, destination_city) values ('{AGENT_BIZ}', 'Japan', 'Lusaka');", U["agent"])

# ---------------------------------------------------------------- vehicles
VEH_FIELDS = ("make, model, year, price, condition, transmission, fuel_type, "
              "registration_status, duty_status, import_status, province, city")
PV = ok("vehicle: private seller lists a car (registered, duty unpaid)",
        f"insert into public.vehicles (owner_id, {VEH_FIELDS}) values (auth.uid(), 'Toyota', 'Vitz', 2019, 198000, "
        f"'used_good', 'automatic', 'petrol', 'registered', 'unpaid', 'imported', 'copperbelt', 'Kitwe') returning id;",
        U["seller"]).split("\n")[0]
ok("vehicle: seller publishes (has phone on file)",
   f"update public.vehicles set listing_status = 'active' where id = '{PV}';", U["seller"])
DV = ok("vehicle: dealer lists under business (unregistered, duty paid)",
        f"insert into public.vehicles (owner_id, business_id, {VEH_FIELDS}, listing_status) values (auth.uid(), '{BIZ}', "
        f"'Toyota', 'Harrier', 2020, 485000, 'used_excellent', 'automatic', 'petrol', 'unregistered', 'paid', 'imported', "
        f"'lusaka', 'Lusaka', 'active') returning id;", U["dealer"]).split("\n")[0]
DV2 = ok("vehicle: dealer staff lists another car for the business",
         f"insert into public.vehicles (owner_id, business_id, {VEH_FIELDS}, listing_status) values (auth.uid(), '{BIZ}', "
         f"'Isuzu', 'D-Max', 2021, 625000, 'used_good', 'manual', 'diesel', 'registered', 'paid', 'local', "
         f"'copperbelt', 'Ndola', 'active') returning id;", U["dealer_staff"]).split("\n")[0]
denied("vehicle: buyer account cannot create listings",
       f"insert into public.vehicles (owner_id, {VEH_FIELDS}) values (auth.uid(), 'Honda', 'Fit', 2015, 90000, "
       f"'used_good', 'automatic', 'petrol', 'registered', 'paid', 'local', 'lusaka', 'Lusaka');", U["attacker"], match="row-level security")
denied("vehicle: attacker cannot edit another seller's listing by changing the id",
       f"with u as (update public.vehicles set price = 1 where id = '{PV}' returning 1) select count(*) from u;", U["attacker"])
denied("vehicle: seller cannot mark own car verified",
       f"update public.vehicles set verification_status = 'approved' where id = '{PV}';", U["seller"], match="permission denied")
denied("vehicle: seller cannot set 'rejected'/'pending' (admin-only statuses)",
       f"update public.vehicles set listing_status = 'pending' where id = '{PV}';", U["seller"], match="only administrators")
denied("vehicle: seller cannot attach dealer business they don't belong to",
       f"insert into public.vehicles (owner_id, business_id, {VEH_FIELDS}) values (auth.uid(), '{BIZ}', 'Mazda', 'Demio', 2016, 80000, "
       f"'used_good', 'automatic', 'petrol', 'registered', 'paid', 'local', 'lusaka', 'Lusaka');", U["seller"], match="row-level security")
denied("vehicle: seller without a phone cannot publish",
       f"insert into public.vehicles (owner_id, business_id, {VEH_FIELDS}, listing_status) values (auth.uid(), null, "
       f"'Mazda', 'Demio', 2016, 80000, 'used_good', 'automatic', 'petrol', 'registered', 'paid', 'local', 'lusaka', 'Lusaka', 'active');",
       U["dealer_staff"], match="phone number")
ok("vehicle: anonymous visitor sees live listings via vehicle_listings",
   "select count(*) from public.vehicle_listings where listing_status = 'active';", role="anon", expect="3")
ok("vehicle: search by text works (trigram)",
   "select make||' '||model from public.vehicle_listings where search_text ilike '%harrier%';", role="anon", expect="Toyota Harrier")

# vehicle features (migration 0010)
ok("features: new listings start with no features",
   f"select cardinality(features) from public.vehicles where id = '{PV}';", U["seller"], expect="0")
ok("features: seller sets features on own listing",
   f"update public.vehicles set features = array['air_conditioning','reverse_camera','four_wheel_drive'] where id = '{PV}';", U["seller"])
ok("features: buyers see them on the public read model",
   f"select array_to_string(features, ',') from public.vehicle_listings where id = '{PV}';", role="anon",
   expect="air_conditioning,reverse_camera,four_wheel_drive")
denied("features: unknown feature codes are rejected",
       f"update public.vehicles set features = array['air_conditioning','free_fuel_for_life'] where id = '{PV}';", U["seller"],
       match="vehicles_features_valid")
denied("features: duplicates are rejected",
       f"update public.vehicles set features = array['abs','abs'] where id = '{PV}';", U["seller"], match="vehicles_features_valid")
denied("features: nulls are rejected",
       f"update public.vehicles set features = array['abs', null] where id = '{PV}';", U["seller"], match="vehicles_features_valid")
denied("features: attacker cannot change another seller's features",
       f"with u as (update public.vehicles set features = '{{}}' where id = '{PV}' returning 1) select count(*) from u;", U["attacker"])
ok("features: dealer staff can set features on a business listing",
   f"update public.vehicles set features = array['bluetooth','tow_bar'] where id = '{DV2}';", U["dealer_staff"])
ok("features: filter 'has reverse camera' finds only matching live cars",
   "select count(*) from public.vehicle_listings where listing_status = 'active' and features @> array['reverse_camera'];",
   role="anon", expect="1")

# images: path must be in own folder
ok("images: seller attaches photo from own folder",
   f"insert into public.vehicle_images (vehicle_id, storage_path, is_primary) values ('{PV}', '{U['seller']}/vitz/1.jpg', true);", U["seller"])
denied("images: seller cannot reference a file in someone else's folder",
       f"insert into public.vehicle_images (vehicle_id, storage_path) values ('{PV}', '{U['dealer']}/x.jpg');", U["seller"], match="row-level security")
ok("images: primary image shows in listing view",
   f"select primary_image_path from public.vehicle_listings where id = '{PV}';", role="anon", expect="vitz/1.jpg")

# documents: private
ok("docs: seller uploads registration document metadata",
   f"insert into public.vehicle_documents (vehicle_id, uploaded_by, document_type, storage_path) values "
   f"('{PV}', auth.uid(), 'registration_certificate', '{U['seller']}/vitz/reg.pdf');", U["seller"])
denied("docs: other users cannot read vehicle documents",
       f"select count(*) from public.vehicle_documents where vehicle_id = '{PV}';", U["attacker"])
ok("docs: public summary shows document type only",
   f"select document_type from public.vehicle_document_summary('{PV}');", role="anon", expect="registration_certificate")

# ---------------------------------------------------------------- verification
denied("verification: seller cannot verify someone else's car",
       f"insert into public.verification_requests (requester_id, subject, vehicle_id, selfie_path, selfie_captured_at) values "
       f"(auth.uid(), 'vehicle', '{PV}', '{U['attacker']}/selfie.jpg', now());", U["attacker"], match="own vehicle")
VR = ok("verification: private seller submits per-vehicle verification with in-app selfie",
        f"insert into public.verification_requests (requester_id, subject, vehicle_id, selfie_path, selfie_captured_at) values "
        f"(auth.uid(), 'vehicle', '{PV}', '{U['seller']}/selfie-1.jpg', now()) returning id;", U["seller"]).split("\n")[0]
ok("verification: vehicle now pending",
   f"select verification_status from public.vehicles where id = '{PV}';", role=None, expect="pending")
denied("verification: seller cannot approve own request (no update rights)",
       f"update public.verification_requests set status = 'approved' where id = '{VR}';", U["seller"], match="permission denied")
denied("verification: non-admin cannot call admin RPC",
       f"select public.admin_review_verification('{VR}', 'approved', 'ok');", U["seller"], match="administrator")
BVR = ok("verification: dealer verifies business once using one car",
         f"insert into public.verification_requests (requester_id, subject, business_id, vehicle_id, selfie_path, selfie_captured_at) values "
         f"(auth.uid(), 'business', '{BIZ}', '{DV}', '{U['dealer']}/selfie.jpg', now()) returning id;", U["dealer"]).split("\n")[0]
denied("verification: dealer staff (not manager) cannot submit business verification",
       f"insert into public.verification_requests (requester_id, subject, business_id, selfie_path, selfie_captured_at) values "
       f"(auth.uid(), 'business', '{BIZ}', '{U['dealer_staff']}/s.jpg', now());", U["dealer_staff"], match="manage")
ok("verification: admin approves business", f"select public.admin_review_verification('{BVR}', 'approved', 'Documents match');", U["admin"])
ok("verification: admin approves private car", f"select public.admin_review_verification('{VR}', 'approved', null);", U["admin"])
ok("verification: EVERY car of the verified business shows the badge (incl. the one not used to verify)",
   f"select count(*) from public.vehicle_listings where business_id = '{BIZ}' and is_verified;", role="anon", expect="2")
ok("verification: private car shows badge", f"select is_verified from public.vehicle_listings where id = '{PV}';", role="anon", expect="t")
ok("verification: requester notified", f"select count(*) from public.notifications where type = 'verification_update';", U["dealer"], expect="1")
ok("audit: decisions written to audit log", "select count(*) from public.admin_audit_log where action like 'verification.%';", U["admin"], expect="2")

# verification read model (migration 0011)
ok("verification view: requester sees own request with car registration + duty status",
   f"select vehicle_registration_status||'/'||vehicle_duty_status||'/'||status from public.verification_request_details where id = '{VR}';",
   U["seller"], expect="registered/unpaid/approved")
ok("verification view: dealer sees own business request labelled with the business name",
   f"select business_name from public.verification_request_details where id = '{BVR}';", U["dealer"], expect="Autoworld Zambia")
denied("verification view: other users see no requests",
       "select count(*) from public.verification_request_details;", U["attacker"])
denied("verification view: anonymous visitors are refused",
       "select count(*) from public.verification_request_details;", role="anon", match="permission denied")
ok("verification view: admin sees the whole queue with reviewer names",
   "select count(*) from public.verification_request_details where reviewer_name is not null;", U["admin"], expect="2")
denied("verification: approved car cannot be submitted again",
       f"insert into public.verification_requests (requester_id, subject, vehicle_id, selfie_path, selfie_captured_at) values "
       f"(auth.uid(), 'vehicle', '{PV}', '{U['seller']}/selfie-again.jpg', now());", U["seller"], match="already verified")
denied("verification: document cannot be attached to another user's request",
       f"insert into public.verification_documents (request_id, document_type, storage_path) values "
       f"('{VR}', 'national_id', '{U['attacker']}/doc.pdf');", U["attacker"], match="row-level security")
denied("audit: non-admins cannot read audit log", "select count(*) from public.admin_audit_log;", U["dealer"])

# ---------------------------------------------------------------- contact + chat + meetups
denied("contact: anonymous visitors cannot reveal phone numbers",
       f"select * from public.get_contact('vehicle', '{PV}');", role="anon", match="permission denied")
ok("contact: signed-in buyer gets private seller's phone + WhatsApp link",
   f"update public.profile_contacts set whatsapp_number = '+260971234567' where profile_id = auth.uid();", U["seller"])
ok("contact: reveal returns number and wa.me link",
   f"select phone || ' ' || whatsapp_link from public.get_contact('vehicle', '{PV}');", U["buyer"], expect="https://wa.me/260971234567")
ok("contact: dealer listing returns BUSINESS phone",
   f"select display_name || ' ' || phone from public.get_contact('vehicle', '{DV}');", U["buyer"], expect="Autoworld Zambia +260211250000")
ok("contact: reveal is logged for admins", "select count(*) from public.contact_reveals;", U["admin"], expect="2")
denied("contact: cannot contact your own listing",
       f"select * from public.get_contact('vehicle', '{PV}');", U["seller"], match="own listing")

CONV = ok("chat: buyer sends enquiry on private seller's car",
          f"select public.start_conversation('vehicle', '{PV}', 'Hi, is the Vitz still available?');", U["buyer"])
ok("chat: same enquiry again reuses the conversation",
   f"select public.start_conversation('vehicle', '{PV}', 'Hello again');", U["buyer"], expect=CONV)
ok("chat: seller sees the conversation + messages", f"select count(*) from public.messages where conversation_id = '{CONV}';", U["seller"], expect="2")
ok("chat: seller notified (collapsed to one notification)",
   "select count(*) from public.notifications where type = 'new_message';", U["seller"], expect="1")
ok("chat: seller replies", f"insert into public.messages (conversation_id, body) values ('{CONV}', 'Yes it is, come view it.');", U["seller"])
denied("chat: attacker cannot read the conversation",
       f"select count(*) from public.messages where conversation_id = '{CONV}';", U["attacker"])
denied("chat: attacker cannot post into it",
       f"insert into public.messages (conversation_id, body) values ('{CONV}', 'spam');", U["attacker"], match="row-level security")
denied("chat: cannot forge a meet-up message kind directly",
       f"insert into public.messages (conversation_id, body, kind) values ('{CONV}', 'fake', 'meetup_request');", U["buyer"], match="permission denied")

MEET = ok("meetup: buyer requests meet-up to view the car",
          f"select public.request_meetup('vehicle', '{PV}', now() + interval '2 days', 'Kitwe, Freedom Park', 'Can I bring a mechanic?');",
          U["buyer"])
ok("meetup: seller got a chat message about it",
   f"select body from public.messages where meetup_id = '{MEET}';", U["seller"], expect="would like to meet to view and inspect the 2019 Toyota Vitz")
ok("meetup: seller got a meetup notification",
   "select count(*) from public.notifications where type = 'meetup_request';", U["seller"], expect="1")
denied("meetup: buyer cannot accept their own request",
       f"select public.respond_meetup('{MEET}', 'accepted');", U["buyer"], match="only the seller")
ok("meetup: seller accepts", f"select public.respond_meetup('{MEET}', 'accepted', 'See you then');", U["seller"])
ok("meetup: buyer notified of acceptance", "select count(*) from public.notifications where type = 'meetup_update';", U["buyer"], expect="1")

M2 = ok("meetup: works for mechanic services too",
        f"select public.request_meetup('service', '{SVC}', now() + interval '1 day');", U["buyer"])
ok("meetup: mechanic receives service booking message",
   f"select body from public.messages where meetup_id = '{M2}';", U["mechanic"], expect="would like to book: Pre-purchase inspection")
M3 = ok("meetup: works for import agents",
        f"select public.request_meetup('import_route', '{ROUTE}');", U["buyer"])
ok("meetup: agent receives import consultation message",
   f"select body from public.messages where meetup_id = '{M3}';", U["agent"], expect="Japan via Durban → Lusaka")
M4 = ok("meetup: dealer listing — whole team is in the chat",
        f"select public.request_meetup('vehicle', '{DV2}');", U["buyer"])
ok("meetup: dealer staff can respond for the business",
   f"select public.respond_meetup('{M4}', 'accepted');", U["dealer_staff"])

# ---------------------------------------------------------------- favourites & reviews
ok("favourites: buyer saves a car", f"insert into public.favourites (profile_id, vehicle_id) values (auth.uid(), '{DV}');", U["buyer"])
denied("favourites: cannot save the same car twice",
       f"insert into public.favourites (profile_id, vehicle_id) values (auth.uid(), '{DV}');", U["buyer"], match="duplicate")
denied("favourites: others cannot see my saved cars", "select count(*) from public.favourites;", U["attacker"])

denied("reviews: cannot review a business you never contacted",
       f"insert into public.reviews (business_id, rating, body) values ('{MECH}', 1, 'bad');", U["attacker"], match="after contacting")
ok("reviews: buyer reviews mechanic after contacting", f"insert into public.reviews (business_id, rating, body) values ('{MECH}', 5, 'Great inspection');", U["buyer"])
denied("reviews: one review per business", f"insert into public.reviews (business_id, rating) values ('{MECH}', 5);", U["buyer"], match="duplicate")
ok("reviews: private seller review", f"insert into public.reviews (seller_id, rating) values ('{U['seller']}', 4);", U["buyer"])
ok("reviews: business rating recalculated server-side",
   f"select rating_avg || '/' || rating_count from public.businesses where id = '{MECH}';", role="anon", expect="5.00/1")
ok("reviews: seller rating recalculated", f"select rating_avg from public.profiles where id = '{U['seller']}';", role="anon", expect="4.00")
denied("reviews: client cannot set rating aggregates directly",
       f"update public.businesses set rating_avg = 5 where id = '{MECH}';", U["mechanic"], match="permission denied")
denied("reviews: cannot review yourself",
       f"insert into public.reviews (seller_id, rating) values ('{U['seller']}', 5);", U["seller"], match="yourself")

# ---------------------------------------------------------------- stage 3 read models
ok("sellers: directory lists the dealer (business) for anonymous visitors",
   f"select name || ':' || seller_kind || ':' || active_vehicle_count from public.vehicle_sellers where id = '{BIZ}';",
   role="anon", expect="Autoworld Zambia:business:2")
ok("sellers: directory lists private seller with a live listing",
   f"select seller_kind || ':' || active_vehicle_count from public.vehicle_sellers where id = '{U['seller']}';",
   role="anon", expect="private:1")
ok("sellers: mechanics are not in the vehicle seller directory",
   f"select count(*) from public.vehicle_sellers where id = '{MECH}';", role="anon", expect="0")
ok("sellers: buyers without listings are not in the directory",
   f"select count(*) from public.vehicle_sellers where id = '{U['buyer']}';", role="anon", expect="0")
ok("makes: live makes with counts",
   "select string_agg(make || '=' || listing_count, ',' order by make) from public.vehicle_make_counts;",
   role="anon", expect="Isuzu=1,Toyota=2")
ok("reviews: public feed shows reviewer as first name + initial",
   f"select reviewer_name || ' ' || rating from public.review_feed where business_id = '{MECH}';",
   role="anon", expect="Natasha M. 5")
ok("stats: dealer sees counts for business listings incl. staff's",
   "select (s->>'active_listings') || '/' || (s->>'times_saved') || '/' || (s->>'contact_requests_total') "
   "from (select public.my_dashboard_stats() s) x;", U["dealer"], expect="2/1/1")
ok("stats: buyer with no listings gets zeros",
   "select public.my_dashboard_stats()->>'active_listings';", U["buyer"], expect="0")
denied("stats: anonymous visitors cannot call dashboard stats",
       "select public.my_dashboard_stats();", role="anon", match="permission denied")

# ---------------------------------------------------------------- stage 3 app flows (same queries the app sends)
NV = ok("app: private seller creates a draft (createVehicle)",
        "insert into public.vehicles (owner_id, business_id, listing_status, make, model, year, price, condition, transmission, fuel_type, "
        "registration_status, duty_status, import_status, province, city) values (auth.uid(), null, 'draft', 'Honda', 'Fit', 2016, 98000, "
        "'used_good', 'automatic', 'petrol', 'registered', 'paid', 'imported', 'copperbelt', 'Ndola') returning id;", U["seller"]).split("\n")[0]
ok("app: draft is hidden from the public", f"select count(*) from public.vehicle_listings where id = '{NV}';", role="anon", expect="0")
ok("app: owner can load their draft (getMyVehicle)", f"select make from public.vehicles where id = '{NV}' and deleted_at is null;", U["seller"], expect="Honda")
ok("app: first photo registered as main (addVehiclePhotos)",
   f"insert into public.vehicle_images (vehicle_id, storage_path, position, is_primary) values ('{NV}', '{U['seller']}/vehicles-{NV}/a.jpg', 0, true);", U["seller"])
IMG2 = ok("app: second photo", f"insert into public.vehicle_images (vehicle_id, storage_path, position, is_primary) values "
          f"('{NV}', '{U['seller']}/vehicles-{NV}/b.jpg', 1, false) returning id;", U["seller"]).split("\n")[0]
denied("app: attacker cannot attach photos to someone else's car",
       f"insert into public.vehicle_images (vehicle_id, storage_path, position) values ('{NV}', '{U['attacker']}/x.jpg', 2);", U["attacker"], match="row-level security")
ok("app: change main photo in two steps (setPrimaryPhoto)",
   f"update public.vehicle_images set is_primary = false where vehicle_id = '{NV}' and is_primary; "
   f"update public.vehicle_images set is_primary = true where id = '{IMG2}'; "
   f"select storage_path from public.vehicle_images where vehicle_id = '{NV}' and is_primary;", U["seller"], expect="/b.jpg")
denied("app: attacker cannot change the main photo",
       f"with u as (update public.vehicle_images set is_primary = false where vehicle_id = '{NV}' returning 1) select count(*) from u;", U["attacker"])
denied("app: attacker cannot publish someone else's draft",
       f"with u as (update public.vehicles set listing_status = 'active' where id = '{NV}' returning 1) select count(*) from u;", U["attacker"])
ok("app: owner publishes (setVehicleStatus returns the row)",
   f"with u as (update public.vehicles set listing_status = 'active' where id = '{NV}' returning id) select count(*) from u;", U["seller"], expect="1")
ok("app: live listing uses the chosen main photo",
   f"select primary_image_path from public.vehicle_listings where id = '{NV}';", role="anon", expect="/b.jpg")
ok("app: search by word across make/model (searchVehicles)",
   "select count(*) from public.vehicle_listings where listing_status = 'active' and (search_text ilike '%fit%' or city ilike '%fit%');",
   role="anon", expect="1")
ok("app: owner edits details (updateVehicle)", f"update public.vehicles set price = 95000 where id = '{NV}';", U["seller"])
ok("app: soft delete returns the row to the owner (deleteVehicle)",
   f"with u as (update public.vehicles set deleted_at = now(), listing_status = 'archived' where id = '{NV}' returning id) select count(*) from u;",
   U["seller"], expect="1")
ok("app: deleted listing disappears from 'my listings'", f"select count(*) from public.vehicle_listings where id = '{NV}';", U["seller"], expect="0")
denied("app: deleted listing can no longer be edited",
       f"with u as (update public.vehicles set price = 1 where id = '{NV}' returning 1) select count(*) from u;", U["seller"])

admin("insert into auth.users (id, email, raw_user_meta_data) values "
      f"('{U['buyer'][:-4]}beef', 'newdealer@example.com', '{{\"full_name\":\"Lweendo Hamoonga\",\"account_type\":\"dealer\"}}');")
ND = U["buyer"][:-4] + "beef"
NB = ok("app: new dealer creates business with blank slug (saveMyBusiness)",
        "insert into public.businesses (owner_id, business_type, slug, name, province, city) values "
        "(auth.uid(), 'dealer', '', 'Kafue Road Motors', 'lusaka', 'Lusaka') returning id;", ND).split("\n")[0]
denied("app: a second business for the same owner is rejected (double submit)",
       "insert into public.businesses (owner_id, business_type, slug, name, province, city) values "
       "(auth.uid(), 'dealer', '', 'Kafue Road Motors', 'lusaka', 'Lusaka');", ND, match="businesses_one_per_owner")
ok("app: slug generated from the name", f"select slug from public.businesses where id = '{NB}';", ND, expect="kafue-road-motors")
ok("app: owner becomes a business member (getMyBusiness)", f"select role from public.business_members where business_id = '{NB}' and profile_id = auth.uid();", ND, expect="owner")
DV3 = ok("app: dealer adds a vehicle under the business",
         f"insert into public.vehicles (owner_id, business_id, listing_status, make, model, year, price, condition, transmission, fuel_type, "
         f"registration_status, duty_status, import_status, province, city) values (auth.uid(), '{NB}', 'draft', 'Mazda', 'CX-5', 2018, 310000, "
         f"'used_excellent', 'automatic', 'petrol', 'unregistered', 'unpaid', 'imported', 'lusaka', 'Lusaka') returning id;", ND).split("\n")[0]
denied("app: cannot publish before a business or personal phone exists",
       f"update public.vehicles set listing_status = 'active' where id = '{DV3}';", ND, match="phone number")
ok("app: business contacts upsert (saveMyBusiness)",
   f"insert into public.business_contacts (business_id, phone, whatsapp_number) values ('{NB}', '+260977000111', '+260977000111') "
   f"on conflict (business_id) do update set phone = excluded.phone, whatsapp_number = excluded.whatsapp_number;", ND)
ok("app: now the dealer can publish", f"update public.vehicles set listing_status = 'active' where id = '{DV3}';", ND)
ok("app: unregistered + duty unpaid filters work together",
   "select count(*) from public.vehicle_listings where registration_status = 'unregistered' and duty_status = 'unpaid';", role="anon", expect="1")
denied("app: dealer cannot list under another dealer's business",
       f"insert into public.vehicles (owner_id, business_id, make, model, year, price, condition, transmission, fuel_type, registration_status, "
       f"duty_status, import_status, province, city) values (auth.uid(), '{BIZ}', 'X', 'Y', 2020, 1, 'new', 'manual', 'petrol', 'registered', "
       f"'paid', 'local', 'lusaka', 'Lusaka');", ND, match="row-level security")
ok("app: new dealer appears in the seller directory by slug",
   "select seller_kind || ':' || active_vehicle_count from public.vehicle_sellers where slug like 'kafue-road-motors%';", role="anon", expect="business:1")
ok("app: buyer reveal of the new dealer uses the business number",
   f"select phone from public.get_contact('business', '{NB}');", U["buyer"], expect="+260977000111")

# ---------------------------------------------------------------- reports & scam flow
REP = ok("reports: buyer reports seller as scam",
         f"insert into public.reports (target_type, target_id, category, details) values "
         f"('vehicle', '{PV}', 'scam', 'Seller took a deposit and disappeared') returning id;", U["buyer"]).split("\n")[0]
ok("reports: admin gets urgent notification", "select title from public.notifications where type = 'report_update';", U["admin"], expect="URGENT")
denied("reports: other users cannot read the report", "select count(*) from public.reports;", U["attacker"])
denied("scam: details NOT released while report is still 'open'",
       f"select public.admin_get_scam_report_details('{REP}');", U["admin"], match="only available")
ok("scam: admin moves report to reviewing", f"select public.admin_update_report('{REP}', 'reviewing', 'Investigating');", U["admin"])
ok("scam: admin can now see the reported user's details (email, phone, meetups)",
   f"select public.admin_get_scam_report_details('{REP}')::text;", U["admin"], expect="seller@example.com")
denied("scam: non-admin can never call it", f"select public.admin_get_scam_report_details('{REP}');", U["buyer"], match="administrator")
ok("scam: admin bans the seller", f"select public.admin_set_account_status('{U['seller']}', 'banned', 'Confirmed scam');", U["admin"])
ok("ban: banned seller's listings disappear from the marketplace",
   f"select count(*) from public.vehicle_listings where id = '{PV}';", role="anon", expect="0")
denied("ban: banned user cannot post new messages",
       f"insert into public.messages (conversation_id, body) values ('{CONV}', 'hello?');", U["seller"], match="row-level security")
denied("admin: admin cannot ban themselves",
       f"select public.admin_set_account_status('{U['admin']}', 'banned', 'x');", U["admin"], match="own account")

# ---------------------------------------------------------------- storage
ok("storage: user uploads to own folder",
   f"insert into storage.objects (bucket_id, name) values ('vehicle-images', '{U['dealer']}/harrier/1.jpg');", U["dealer"])
denied("storage: user cannot upload into someone else's folder",
       f"insert into storage.objects (bucket_id, name) values ('vehicle-images', '{U['seller']}/evil.jpg');", U["dealer"], match="row-level security")
ok("storage: selfie uploaded to private verification bucket",
   f"insert into storage.objects (bucket_id, name) values ('verification', '{U['buyer']}/selfie.jpg');", U["buyer"])
denied("storage: other users cannot read verification selfies",
       f"select count(*) from storage.objects where bucket_id = 'verification';", U["attacker"])
ok("storage: admins can read verification selfies",
   "select count(*) from storage.objects where bucket_id = 'verification';", U["admin"], expect="1")
denied("storage: selfies cannot be deleted/overwritten once uploaded",
       f"with d as (delete from storage.objects where bucket_id = 'verification' returning 1) select count(*) from d;", U["buyer"])

# ---------------------------------------------------------------- content
ok("content: admin publishes an info article",
   "insert into public.info_articles (slug, category, title, body, is_published) values "
   "('registering-an-imported-car', 'registration', 'Registering an imported car', 'Steps…', true);", U["admin"])
denied("content: non-admin cannot write articles",
       "insert into public.info_articles (slug, category, title) values ('x-y', 'general', 'Hack');", U["buyer"], match="row-level security")
ok("content: public reads published articles", "select count(*) from public.info_articles;", role="anon", expect="1")

# ---------------------------------------------------------------- report
failed = [r for r in results if not r[0]]
for passed, name, out in results:
    print(("PASS " if passed else "FAIL ") + name + ("" if passed else f"\n     -> {out[:400]}"))
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
