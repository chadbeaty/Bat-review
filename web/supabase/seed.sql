-- Reference data: categories, manufacturers, fees and site settings.
-- The bat catalog is in supabase/seed/catalog.sql, generated from ../data/bats.json by `npm run catalog:seed`.
-- Safe to run more than once.

insert into public.product_categories (name, slug, description, display_order, attribute_schema, required_photos) values
  ('Slow-pitch bats', 'bats', 'Used USSSA, USA (ASA), NSA, ISA and senior slow-pitch softball bats.', 1,
    '[
      {"key":"weight_oz","label":"Weight (oz)","type":"number","required":true,"options":[25,25.5,26,26.5,27,27.5,28,28.5,29,30]},
      {"key":"certification","label":"Stamps on the barrel","type":"multiselect","required":true,"options":["USSSA","USA","NSA","ISA","SSUSA","Other"]},
      {"key":"weighting_type","label":"Weighting","type":"select","required":true,"options":["balanced","endload","midload","other","unknown"]},
      {"key":"construction_type","label":"Construction","type":"select","required":false,"options":["one_piece","two_piece","unknown"]},
      {"key":"barrel_length_inches","label":"Barrel length (in)","type":"number","required":false},
      {"key":"length_inches","label":"Length (in)","type":"number","required":false,"default":34},
      {"key":"model_year","label":"Model year","type":"number","required":true}
    ]'::jsonb,
    '[
      {"type":"full","label":"Full bat"},{"type":"barrel","label":"Barrel"},{"type":"end_cap","label":"End cap"},
      {"type":"knob","label":"Knob"},{"type":"markings","label":"Model and certification markings"},{"type":"damage","label":"Any visible damage","optional":true}
    ]'::jsonb),
  ('Gloves', 'gloves', 'Fielding gloves and first base mitts.', 2,
    '[
      {"key":"size_inches","label":"Size (in)","type":"number","required":true},
      {"key":"throwing_hand","label":"Throwing hand","type":"select","required":true,"options":["right","left"]},
      {"key":"position","label":"Position","type":"select","required":false,"options":["infield","outfield","first_base","pitcher","utility"]},
      {"key":"web_type","label":"Web","type":"text","required":false},
      {"key":"leather","label":"Leather","type":"text","required":false}
    ]'::jsonb,
    '[{"type":"front","label":"Palm"},{"type":"back","label":"Back"},{"type":"label","label":"Model stamp"},{"type":"damage","label":"Any wear or damage","optional":true}]'::jsonb),
  ('Batting gloves', 'batting-gloves', 'Batting gloves for slow-pitch hitters.', 3,
    '[{"key":"size","label":"Size","type":"select","required":true,"options":["XS","S","M","L","XL","XXL"]},
      {"key":"pair","label":"Sold as","type":"select","required":true,"options":["pair","single"]}]'::jsonb,
    '[{"type":"front","label":"Palms"},{"type":"back","label":"Backs"}]'::jsonb),
  ('Bat and equipment bags', 'bags', 'Backpacks, wheeled bags and bat bags.', 4,
    '[{"key":"bag_type","label":"Type","type":"select","required":true,"options":["backpack","wheeled","duffle","tote","other"]},
      {"key":"bat_capacity","label":"Bats it holds","type":"number","required":false}]'::jsonb,
    '[{"type":"front","label":"Front"},{"type":"back","label":"Back"},{"type":"detail","label":"Inside"}]'::jsonb),
  ('Cleats and footwear', 'cleats', 'Molded and metal cleats, turf shoes.', 5,
    '[{"key":"size_us","label":"US size","type":"number","required":true},
      {"key":"cleat_type","label":"Cleat type","type":"select","required":true,"options":["molded","metal","turf","other"]},
      {"key":"fit","label":"Fit","type":"select","required":false,"options":["mens","womens","unisex"]}]'::jsonb,
    '[{"type":"front","label":"Side"},{"type":"detail","label":"Soles"}]'::jsonb),
  ('Protective equipment', 'protective', 'Face masks, helmets, shin guards and other protection.', 6,
    '[{"key":"item_type","label":"Item","type":"text","required":true},{"key":"size","label":"Size","type":"text","required":false}]'::jsonb,
    '[{"type":"front","label":"Front"},{"type":"label","label":"Size and certification label"}]'::jsonb),
  ('Apparel', 'apparel', 'Jerseys, pants, hats and team gear.', 7,
    '[{"key":"size","label":"Size","type":"text","required":true},{"key":"apparel_type","label":"Item","type":"text","required":true}]'::jsonb,
    '[{"type":"front","label":"Front"},{"type":"back","label":"Back"},{"type":"label","label":"Size tag"}]'::jsonb),
  ('Training equipment', 'training', 'Tees, nets, training bats and practice gear.', 8,
    '[{"key":"item_type","label":"Item","type":"text","required":true}]'::jsonb,
    '[{"type":"full","label":"Whole item"}]'::jsonb),
  ('Accessories', 'accessories', 'Grips, end caps, bat warmers and everything else.', 9,
    '[{"key":"item_type","label":"Item","type":"text","required":true}]'::jsonb,
    '[{"type":"full","label":"Whole item"}]'::jsonb)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description, display_order = excluded.display_order,
  attribute_schema = excluded.attribute_schema, required_photos = excluded.required_photos;

-- Manufacturer names are used only to identify products. No affiliation or endorsement is implied.
insert into public.manufacturers (name, slug, aliases, website_url) values
  ('Monsta', 'monsta', '{"monsta athletics"}', 'https://www.monstaathletics.com'),
  ('Miken', 'miken', '{}', 'https://miken.rawlings.com'),
  ('Worth', 'worth', '{}', 'https://worth.rawlings.com'),
  ('Anarchy', 'anarchy', '{}', null),
  ('Easton', 'easton', '{}', 'https://easton.rawlings.com'),
  ('DeMarini', 'demarini', '{"de marini","demarni","dimarini"}', 'https://www.demarini.com'),
  ('Louisville Slugger', 'louisville-slugger', '{"louisville","slugger","ls"}', 'https://www.slugger.com'),
  ('Dudley', 'dudley', '{}', null),
  ('Suncoast', 'suncoast', '{"sun coast"}', null),
  ('Juno', 'juno', '{}', null),
  ('Mizuno', 'mizuno', '{}', 'https://mizunousa.com'),
  ('Rawlings', 'rawlings', '{}', 'https://www.rawlings.com'),
  ('Victus', 'victus', '{}', null),
  ('Axe', 'axe', '{"axe bat","axebat"}', 'https://axebat.com'),
  ('Marucci', 'marucci', '{}', null),
  ('Combat', 'combat', '{"combat mfg"}', null),
  ('Anderson', 'anderson', '{"anderson bat"}', null),
  ('Boombah', 'boombah', '{}', null),
  ('Short Porch', 'short-porch', '{"shortporch"}', null),
  ('Other', 'other', '{}', null)
on conflict (slug) do update set name = excluded.name, aliases = excluded.aliases, website_url = excluded.website_url;

-- Fees from the business plan. Change them in the admin dashboard, never in code.
insert into public.fee_configuration (fee_name, fee_type, fee_value, description)
select * from (values
  ('seller_commission', 'percentage', 7.0, 'Marketplace commission charged to the seller on the item price of each completed sale'),
  ('featured_listing', 'fixed_cents', 399, 'Optional fee to feature a listing'),
  ('premium_seller_monthly', 'fixed_cents', 999, 'Premium seller membership, monthly (not offered until after launch)')
) as v(fee_name, fee_type, fee_value, description)
where not exists (select 1 from public.fee_configuration f where f.fee_name = v.fee_name);

insert into public.site_settings (key, value, description, is_public) values
  ('price_guide_min_sales', '5', 'Verified sales needed before an indicative sold-price range is shown', true),
  ('price_guide_full_sales', '10', 'Verified sales needed before a full sold-price average is shown', true),
  ('offer_expiry_hours', '48', 'How long an offer stays open', true),
  ('listing_expiry_days', '90', 'How long a published listing stays live before it expires', true),
  ('messages_per_minute_limit', '15', 'Messages a member can send per minute', false),
  ('premium_seller_enabled', 'false', 'Whether premium seller memberships are on sale', true),
  ('featured_listings_enabled', 'false', 'Whether sellers can buy featured placement', true)
on conflict (key) do nothing;
