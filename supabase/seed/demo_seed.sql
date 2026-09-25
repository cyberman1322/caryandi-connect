-- =============================================================================
-- Caryandi · DEMO SEED DATA (for testing only — remove before launch)
-- =============================================================================
-- Fills an empty Caryandi database with realistic, clearly fictional Zambian
-- sample data so every page and dashboard can be tried end to end:
--   2 dealers (Lusaka, Kitwe) · 2 private sellers · 2 mechanics
--   1 servicing company · 1 parts seller · 2 import agents · 1 buyer
--   vehicles, parts, services, opening hours, import routes, one enquiry chat.
--
-- Safety:
--   * Every demo account uses an e-mail ending in  @demo.caryandi.invalid
--     (".invalid" can never receive mail) and has NO password, so nobody can
--     sign in as a demo account.
--   * Every demo business and listing says "Demo" in its description.
--   * Nothing is marked verified — the badge only comes from the real
--     verification process.
--   * No photos are added (listings show the "No photo yet" tile).
--   * Remove everything with  supabase/seed/remove_demo_seed.sql
--
-- Run once in the Supabase SQL editor. Running it twice is refused.
-- =============================================================================

do $seed$
declare
  demo_note constant text := 'Demo listing for testing Caryandi — not a real offer.';
  u jsonb := '{}'::jsonb;         -- key -> user id
  b jsonb := '{}'::jsonb;         -- key -> business id
  v_id uuid;
  v_conv uuid;
  r record;

begin
  if exists (select 1 from auth.users where email like '%@demo.caryandi.invalid') then
    raise exception 'Demo data is already loaded. Run remove_demo_seed.sql first to reload it.';
  end if;

  -- ------------------------------------------------------------------ accounts
  for r in select * from (values
    ('dealer_lsk',   'Chanda Mulenga',   'dealer',            '+260971000101', 'lusaka',     'Lusaka'),
    ('dealer_ktw',   'Bwalya Kasonde',   'dealer',            '+260961000102', 'copperbelt', 'Kitwe'),
    ('private_1',    'Mutale Chileshe',  'private_seller',    '+260971000103', 'lusaka',     'Lusaka'),
    ('private_2',    'Namwinga Sakala',  'private_seller',    '+260951000104', 'southern',   'Livingstone'),
    ('mech_lsk',     'Joseph Tembo',     'mechanic',          '+260971000105', 'lusaka',     'Lusaka'),
    ('mech_ndl',     'Kelvin Mwansa',    'mechanic',          '+260961000106', 'copperbelt', 'Ndola'),
    ('service_co',   'Precious Banda',   'servicing_company', '+260971000107', 'lusaka',     'Lusaka'),
    ('parts_1',      'Emmanuel Zulu',    'parts_seller',      '+260971000108', 'lusaka',     'Lusaka'),
    ('agent_1',      'Grace Phiri',      'import_agent',      '+260971000109', 'lusaka',     'Lusaka'),
    ('agent_2',      'Moses Lungu',      'import_agent',      '+260961000110', 'copperbelt', 'Kitwe'),
    ('buyer_1',      'Thandiwe Mwale',   'buyer',             '+260971000111', 'lusaka',     'Lusaka')
  ) as t(k, full_name, account_type, phone, province, city)
  loop
    v_id := gen_random_uuid();
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_id, 'authenticated', 'authenticated', replace(r.k, '_', '.') || '@demo.caryandi.invalid', '', now(),
            '{"provider":"email","providers":["email"],"demo":true}'::jsonb,
            jsonb_build_object('full_name', r.full_name, 'account_type', r.account_type, 'phone', r.phone),
            now(), now());
    update public.profiles set province = r.province::public.zambia_province, city = r.city,
           bio = 'Demo account for testing Caryandi.' where id = v_id;
    u := u || jsonb_build_object(r.k, v_id);
  end loop;

  -- ------------------------------------------------------------------ businesses
  for r in select * from (values
    ('dealer_lsk', 'dealer_lsk', 'dealer',            'Kafue Road Motors',        'lusaka',     'Lusaka',      'Chilenje',     'Plot 21, Kafue Road',            '+260971000101'),
    ('dealer_ktw', 'dealer_ktw', 'dealer',            'Copperbelt Auto Traders',  'copperbelt', 'Kitwe',       'Parklands',    'Freedom Avenue',                 '+260961000102'),
    ('mech_lsk',   'mech_lsk',   'mechanic',          'Tembo Auto Repairs',       'lusaka',     'Lusaka',      'Woodlands',    'Off Chindo Road',                '+260971000105'),
    ('mech_ndl',   'mech_ndl',   'mechanic',          'Mwansa Mobile Mechanics',  'copperbelt', 'Ndola',       'Kansenshi',    null,                             '+260961000106'),
    ('service_co', 'service_co', 'servicing_company', 'Great East Service Centre','lusaka',     'Lusaka',      'Kalingalinga', 'Great East Road',                '+260971000107'),
    ('parts_1',    'parts_1',    'parts_seller',      'Zulu Spares & Parts',      'lusaka',     'Lusaka',      'Kamwala',      'Lumumba Road',                   '+260971000108'),
    ('agent_1',    'agent_1',    'import_agent',      'Phiri Vehicle Imports',    'lusaka',     'Lusaka',      'Rhodes Park',  'Addis Ababa Drive',              '+260971000109'),
    ('agent_2',    'agent_2',    'import_agent',      'Northern Link Clearing',   'copperbelt', 'Kitwe',       'Nkana East',   null,                             '+260961000110')
  ) as t(k, owner_key, business_type, name, province, city, area, address, phone)
  loop
    insert into public.businesses (owner_id, business_type, name, description, province, city, area, address)
    values ((u ->> r.owner_key)::uuid, r.business_type::public.business_type, r.name,
            'Demo business for testing Caryandi — not a real company.', r.province::public.zambia_province, r.city, r.area, r.address)
    returning id into v_id;
    insert into public.business_contacts (business_id, phone, whatsapp_number)
    values (v_id, r.phone, r.phone)
    on conflict (business_id) do update set phone = excluded.phone, whatsapp_number = excluded.whatsapp_number;
    b := b || jsonb_build_object(r.k, v_id);
  end loop;

  -- Opening hours, mobile service and starting prices for service providers.
  update public.businesses set
    opening_hours = '{"mon":{"open":"08:00","close":"17:00"},"tue":{"open":"08:00","close":"17:00"},"wed":{"open":"08:00","close":"17:00"},"thu":{"open":"08:00","close":"17:00"},"fri":{"open":"08:00","close":"17:00"},"sat":{"open":"08:00","close":"13:00"},"sun":null}',
    price_from = 350, price_note = 'Diagnostics from'
  where id = (b ->> 'mech_lsk')::uuid;
  update public.businesses set
    opening_hours = '{"mon":{"open":"07:30","close":"18:00"},"tue":{"open":"07:30","close":"18:00"},"wed":{"open":"07:30","close":"18:00"},"thu":{"open":"07:30","close":"18:00"},"fri":{"open":"07:30","close":"18:00"},"sat":{"open":"08:00","close":"14:00"},"sun":null}',
    is_mobile_service = true
  where id = (b ->> 'mech_ndl')::uuid;
  update public.businesses set
    opening_hours = '{"mon":{"open":"08:00","close":"17:30"},"tue":{"open":"08:00","close":"17:30"},"wed":{"open":"08:00","close":"17:30"},"thu":{"open":"08:00","close":"17:30"},"fri":{"open":"08:00","close":"17:30"},"sat":{"open":"08:30","close":"12:30"},"sun":null}'
  where id = (b ->> 'service_co')::uuid;
  update public.businesses set price_from = 15000, price_note = 'Agent fee, excluding duty and shipping'
  where id = (b ->> 'agent_1')::uuid;

  -- ------------------------------------------------------------------ services
  insert into public.services (business_id, name, description, price_from, price_note, duration_minutes)
  select (b ->> k)::uuid, name, descr, price, note, mins from (values
    ('mech_lsk', 'Computer diagnostics',       'OBD scan and fault report.',                 350,  'Per vehicle',              45),
    ('mech_lsk', 'Minor service',              'Oil, oil filter and a 20-point check.',      950,  'Labour; oil and filter extra', 90),
    ('mech_lsk', 'Brake pads (front)',         'Fit front pads, check discs and fluid.',     450,  'Labour only',              60),
    ('mech_lsk', 'Pre-purchase inspection',    'Check a car before you buy it.',             600,  null,                       90),
    ('mech_ndl', 'Call-out diagnostics',       'We come to you within Ndola.',               400,  'Includes call-out',        60),
    ('mech_ndl', 'Battery replacement',        'Test and replace on site.',                  250,  'Labour; battery extra',    30),
    ('mech_ndl', 'Suspension repairs',         'Bushes, links and shocks.',                  null, 'Quoted after inspection', null),
    ('service_co', 'Full service',             'Engine oil, filters, plugs and inspection.', 1800, 'Most sedans',              180),
    ('service_co', 'Wheel alignment',          'Four-wheel alignment.',                      400,  null,                       45),
    ('service_co', 'Air-con regas',            'Leak test and regas.',                       650,  null,                       60)
  ) as t(k, name, descr, price, note, mins);

  -- ------------------------------------------------------------------ import routes
  insert into public.import_routes (business_id, origin_country, transit_port, destination_city, services, price_from, price_note, est_days_min, est_days_max, notes)
  select (b ->> k)::uuid, origin, port, dest, svc, price, note, dmin, dmax, notes from (values
    ('agent_1', 'Japan', 'Durban', 'Lusaka', array['Vehicle sourcing','Auction bidding','Shipping','Port clearing','Transit to Zambia','ZRA registration'], 15000, 'Agent fee', 45, 70, 'Demo route for testing.'),
    ('agent_1', 'Japan', 'Dar es Salaam', 'Lusaka', array['Vehicle sourcing','Shipping','Port clearing','Transit to Zambia'], 14000, 'Agent fee', 50, 80, 'Demo route for testing.'),
    ('agent_2', 'United Kingdom', 'Walvis Bay', 'Kitwe', array['Shipping','Port clearing','Customs & duty processing','Delivery to your door'], 18000, null, 40, 60, 'Demo route for testing.'),
    ('agent_2', 'South Africa', null, 'Kitwe', array['Vehicle sourcing','Customs & duty processing','Number plates'], 9000, null, 10, 21, 'Demo route for testing.')
  ) as t(k, origin, port, dest, svc, price, note, dmin, dmax, notes);

  -- ------------------------------------------------------------------ vehicles
  insert into public.vehicles (owner_id, business_id, make, model, variant, year, price, mileage_km, condition, transmission, fuel_type,
                               engine_size_cc, body_type, colour, registration_status, duty_status, import_status, province, city, area,
                               description, features, listing_status)
  select (u ->> owner)::uuid, (b ->> biz)::uuid, make, model, variant, yr, price, km, cond::public.vehicle_condition,
         trans::public.transmission_type, fuel::public.fuel_type, cc, body, colour, reg::public.registration_status,
         duty::public.duty_status, imp::public.import_status, prov::public.zambia_province, city, area,
         demo_note || ' ' || descr, feats, 'active'
  from (values
    ('dealer_lsk', 'dealer_lsk', 'Toyota', 'Harrier', '2.0 Premium', 2017, 385000, 68000, 'used_excellent', 'automatic', 'petrol', 1986, 'SUV', 'Pearl white', 'registered', 'paid', 'imported', 'lusaka', 'Lusaka', 'Chilenje', 'Recently serviced, two keys.', array['air_conditioning','power_windows','reverse_camera','keyless_entry']),
    ('dealer_lsk', 'dealer_lsk', 'Toyota', 'Hilux', '2.8 GD-6 Double Cab', 2019, 720000, 91000, 'used_good', 'manual', 'diesel', 2755, 'Pickup', 'Silver', 'registered', 'paid', 'local', 'lusaka', 'Lusaka', 'Chilenje', 'Tow bar and canopy.', array['air_conditioning','power_steering','four_wheel_drive']),
    ('dealer_lsk', 'dealer_lsk', 'Honda', 'Fit', 'Hybrid', 2015, 118000, 102000, 'used_good', 'automatic', 'hybrid', 1496, 'Hatchback', 'Blue', 'registered', 'paid', 'imported', 'lusaka', 'Lusaka', 'Chilenje', 'Economical town car.', array['air_conditioning','power_windows']),
    ('dealer_ktw', 'dealer_ktw', 'Nissan', 'X-Trail', '2.0 XT', 2016, 265000, 84000, 'used_good', 'automatic', 'petrol', 1997, 'SUV', 'Black', 'registered', 'paid', 'imported', 'copperbelt', 'Kitwe', 'Parklands', 'Full-time 4WD.', array['air_conditioning','cruise_control','four_wheel_drive']),
    ('dealer_ktw', 'dealer_ktw', 'Toyota', 'Corolla', '1.5 G', 2014, 135000, 121000, 'used_fair', 'automatic', 'petrol', 1496, 'Sedan', 'Grey', 'registered', 'paid', 'imported', 'copperbelt', 'Kitwe', 'Parklands', 'Minor scratches on rear bumper.', array['air_conditioning','power_windows']),
    ('dealer_ktw', 'dealer_ktw', 'Mitsubishi', 'Pajero Sport', '2.4 DI-D', 2018, 540000, 76000, 'used_excellent', 'automatic', 'diesel', 2442, 'SUV', 'White', 'unregistered', 'unpaid', 'imported', 'copperbelt', 'Kitwe', 'Parklands', 'Newly arrived, duty not yet paid.', array['air_conditioning','leather_seats','reverse_camera','four_wheel_drive'])
  ) as t(owner, biz, make, model, variant, yr, price, km, cond, trans, fuel, cc, body, colour, reg, duty, imp, prov, city, area, descr, feats);

  insert into public.vehicles (owner_id, make, model, variant, year, price, mileage_km, condition, transmission, fuel_type,
                               engine_size_cc, body_type, colour, registration_status, duty_status, import_status, province, city, area,
                               description, features, listing_status)
  values
    ((u ->> 'private_1')::uuid, 'Toyota', 'Vitz', '1.0 F', 2012, 72000, 138000, 'used_good', 'automatic', 'petrol', 996, 'Hatchback', 'Red',
     'registered', 'paid', 'imported', 'lusaka', 'Lusaka', 'Kabulonga', demo_note || ' Selling because I am relocating.', array['air_conditioning'], 'active'),
    ((u ->> 'private_2')::uuid, 'Toyota', 'Land Cruiser Prado', 'TX 2.7', 2011, 410000, 185000, 'used_good', 'automatic', 'petrol', 2694, 'SUV', 'Beige',
     'registered', 'paid', 'local', 'southern', 'Livingstone', null, demo_note || ' Well maintained, full service history.', array['air_conditioning','four_wheel_drive','third_row_seats'], 'active');

  -- ------------------------------------------------------------------ parts
  insert into public.parts (owner_id, business_id, category_id, title, description, price, condition, quantity, compatibility_note, province, city, listing_status)
  select (u ->> 'parts_1')::uuid, (b ->> 'parts_1')::uuid, c.id, t.title, demo_note, t.price, t.cond::public.part_condition, t.qty, t.compat, 'lusaka', 'Lusaka', 'active'
  from (values
    ('brakes',         'Front brake pads',               450,  'new',           12, 'Toyota Corolla, Axio, Allion 2007–2019'),
    ('filters-fluids', 'Oil filter (genuine)',           120,  'new',           40, 'Most Toyota 1.3–1.8 petrol engines'),
    ('lighting',       'Headlight assembly (left)',      1850, 'used',          1,  'Toyota Harrier 2014–2017'),
    ('suspension',     'Front shock absorbers (pair)',   2600, 'reconditioned', 2,  'Toyota Hilux 2016–2021')
  ) as t(cat, title, price, cond, qty, compat)
  join public.part_categories c on c.slug = t.cat;

  -- ------------------------------------------------------------------ one enquiry so inboxes are not empty
  insert into public.conversations (created_by, business_id, vehicle_id, subject_label)
  select (u ->> 'buyer_1')::uuid, v.business_id, v.id, v.year || ' ' || v.make || ' ' || v.model || coalesce(' ' || v.variant, '')
    from public.vehicles v where v.owner_id = (u ->> 'dealer_lsk')::uuid and v.model = 'Harrier'
  returning id into v_conv;
  insert into public.conversation_participants (conversation_id, profile_id, last_read_at)
  values (v_conv, (u ->> 'buyer_1')::uuid, now()), (v_conv, (u ->> 'dealer_lsk')::uuid, null);
  insert into public.messages (conversation_id, sender_id, body)
  values (v_conv, (u ->> 'buyer_1')::uuid, 'Hello, is the Harrier still available? Can I view it on Saturday morning?'),
         (v_conv, (u ->> 'dealer_lsk')::uuid, 'Yes, it is. Saturday from 09:00 works — we are on Kafue Road in Chilenje.');

  raise notice 'Demo data loaded.';
end
$seed$;
