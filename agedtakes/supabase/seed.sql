-- AGED TAKES — starting data.
--
-- 1. Categories.
-- 2. DEMO ONLY records: entirely fictional people, quotes, sources and outcomes so the site and the newsroom
--    can be explored before real investigations exist. Every row is flagged is_demo = true, every source URL is
--    on the reserved example.com domain, and the site labels them "DEMO ONLY — fictional". Turn them off in
--    Admin → Settings ("Show demo content") or delete them with Admin → Settings → "Delete demo data".
-- 3. Research candidates: real public figures the editors may research. They are NOT public, carry no
--    statements or claims, and appear only on the internal research list.

begin;
select set_config('agedtakes.seed_mode', 'on', true);
select set_config('agedtakes.actor', 'system:seed', true);

-- 1. Categories --------------------------------------------------------------------------------------------
insert into public.categories (slug, name, kind, sort_order, description) values
  ('crypto', 'Crypto personalities', 'person', 10, 'Founders, investors and commentators focused on digital assets.'),
  ('stock-market', 'Stock market commentators', 'person', 20, 'Broadcasters, analysts and writers who make public market calls.'),
  ('investors', 'Investors and billionaires', 'person', 30, 'Fund managers, allocators and prominent individual investors.'),
  ('finfluencers', 'Financial influencers', 'person', 40, 'Creators who publish investment opinions to large audiences.'),
  ('politicians', 'Politicians', 'person', 50, 'Elected officials and candidates, including financial disclosures.'),
  ('executives', 'Corporate executives', 'person', 60, 'CEOs and executives making public commitments about their companies.'),
  ('sports', 'Sports personalities', 'person', 70, 'Athletes, owners and commentators.'),
  ('entertainment', 'Entertainment figures', 'person', 80, 'Public figures from film, music and media.'),
  ('finance', 'Finance', 'industry', 10, null),
  ('technology', 'Technology', 'industry', 20, null),
  ('government', 'Government', 'industry', 30, null),
  ('media', 'Media', 'industry', 40, null),
  ('bitcoin', 'Bitcoin and digital assets', 'topic', 10, null),
  ('equities', 'Equities', 'topic', 20, null),
  ('macro', 'Macro and indexes', 'topic', 30, null),
  ('disclosures', 'Financial disclosures', 'topic', 40, null),
  ('corporate-commitments', 'Corporate commitments', 'topic', 50, null);

-- 2. DEMO ONLY ----------------------------------------------------------------------------------------------
-- People
insert into public.people (id, name, slug, occupation, organization, biography, status, is_demo) values
  ('d0000000-0000-4000-8000-000000000001', 'Dex Calloway', 'dex-calloway-demo', 'Crypto podcast host (fictional)', 'The Demo Stack Podcast',
   'DEMO ONLY. Dex Calloway is a fictional character created to demonstrate how Aged Takes records explicit investment commitments and on-chain activity. Nothing on this page describes a real person.', 'active', true),
  ('d0000000-0000-4000-8000-000000000002', 'Marla Quint', 'marla-quint-demo', 'Television stock commentator (fictional)', 'Demo Markets Network',
   'DEMO ONLY. Marla Quint is a fictional market commentator used to demonstrate how price-target predictions are recorded and resolved.', 'active', true),
  ('d0000000-0000-4000-8000-000000000003', 'Holt Brennan', 'holt-brennan-demo', 'Fund manager (fictional)', 'Brennan Demo Capital',
   'DEMO ONLY. Holt Brennan is a fictional fund manager used to demonstrate predictions that aged well and predictions still open.', 'active', true),
  ('d0000000-0000-4000-8000-000000000004', 'Ada Morrow', 'ada-morrow-demo', 'Member of a legislature (fictional)', 'Demo State Assembly',
   'DEMO ONLY. Ada Morrow is a fictional legislator used to demonstrate how Aged Takes treats financial disclosures, including the difference between a spouse''s transactions and the official''s own.', 'active', true),
  ('d0000000-0000-4000-8000-000000000005', 'Juno Park', 'juno-park-demo', 'Fintech chief executive (fictional)', 'DemoPay Inc.',
   'DEMO ONLY. Juno Park is a fictional chief executive used to demonstrate how corporate commitments are tracked and when a promise is recorded as kept.', 'active', true);

insert into public.person_categories (person_id, category_id)
select p.id, c.id from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'crypto'), ('d0000000-0000-4000-8000-000000000001', 'finfluencers'), ('d0000000-0000-4000-8000-000000000001', 'bitcoin'),
  ('d0000000-0000-4000-8000-000000000002', 'stock-market'), ('d0000000-0000-4000-8000-000000000002', 'media'), ('d0000000-0000-4000-8000-000000000002', 'equities'),
  ('d0000000-0000-4000-8000-000000000003', 'investors'), ('d0000000-0000-4000-8000-000000000003', 'finance'), ('d0000000-0000-4000-8000-000000000003', 'macro'),
  ('d0000000-0000-4000-8000-000000000004', 'politicians'), ('d0000000-0000-4000-8000-000000000004', 'government'), ('d0000000-0000-4000-8000-000000000004', 'disclosures'),
  ('d0000000-0000-4000-8000-000000000005', 'executives'), ('d0000000-0000-4000-8000-000000000005', 'technology'), ('d0000000-0000-4000-8000-000000000005', 'corporate-commitments')
) as v (person_id, slug)
join public.people p on p.id = v.person_id
join public.categories c on c.slug = v.slug;

-- Sources (all fictional, on example.com)
insert into public.evidence_sources (id, source_type, publisher, author, title, canonical_url, published_at, source_excerpt, reliability_notes, is_primary, verification_status, is_demo) values
  ('d1000000-0000-4000-8000-000000000001', 'podcast', 'The Demo Stack Podcast', 'Dex Calloway', 'Episode 112: Diamond hands forever (DEMO)', 'https://example.com/demo/demo-stack/episode-112', '2023-03-14 15:00:00+00',
   'DEMO transcript excerpt at 41:07 — "I will never sell a single coin of my DemoCoin. Not one. Not ever. My kids will inherit every coin."', 'Fictional demo source. Primary: the subject''s own show.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000002', 'social_post', 'Demo Social', 'Dex Calloway', 'Post identifying a personal wallet address (DEMO)', 'https://example.com/demo/social/dex-calloway/wallet-post', '2023-04-02 18:20:00+00',
   'DEMO — "For transparency, my cold wallet is demo1qxy...9f3k. Watch it. It never moves."', 'Fictional. The subject identified the address himself, so attribution is "claimed by subject".', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000003', 'blockchain_record', 'Demo Chain Explorer', null, 'Transaction 0xdemo7a1… from demo1qxy…9f3k (DEMO)', 'https://example.com/demo/explorer/tx/0xdemo7a1', '2026-06-18 09:12:00+00',
   'DEMO — 1,250 DemoCoin transferred from demo1qxy…9f3k to an address labeled by the explorer as a deposit address of Demo Exchange.', 'Fictional. A public ledger record proves the transfer; it does not show what happened after the deposit.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000004', 'video', 'Demo Markets Network', 'Marla Quint', 'Closing Bell Demo — 2 January 2024 (DEMO)', 'https://example.com/demo/dmn/closing-bell-2024-01-02', '2024-01-02 21:00:00+00',
   'DEMO transcript at 12:44 — "DemoCorp is going to be a five-hundred-dollar stock by the end of this year. Write it down."', 'Fictional demo broadcast.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000005', 'market_data', 'Demo Exchange Market Data', null, 'DemoCorp (DMCO) daily closing prices, 2024 (DEMO)', 'https://example.com/demo/market-data/dmco-2024', '2025-01-02 00:00:00+00',
   'DEMO — DMCO closed at $212.40 on 31 December 2024. 2024 high close: $268.10.', 'Fictional market data. Split-adjusted; no corporate actions during the period.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000006', 'interview', 'Demo Business Weekly', 'Staff', 'Holt Brennan on the year ahead (DEMO)', 'https://example.com/demo/dbw/holt-brennan-2025-outlook', '2025-01-06 12:00:00+00',
   'DEMO — "I expect the Demo 500 index to finish 2025 above 6,000. That''s my base case, not a hope."', 'Fictional interview.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000007', 'market_data', 'Demo Index Services', null, 'Demo 500 index official close, 31 December 2025 (DEMO)', 'https://example.com/demo/index/demo500-2025-close', '2025-12-31 22:00:00+00',
   'DEMO — The Demo 500 closed 2025 at 6,212.55.', 'Fictional official index level.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000008', 'congressional_disclosure', 'Demo State Assembly Ethics Office', null, 'Periodic transaction report, Ada Morrow, filed 14 May 2025 (DEMO)', 'https://example.com/demo/ethics/ptr-2025-05-14-morrow', '2025-05-14 00:00:00+00',
   'DEMO — Owner: SP (spouse). DemoCorp (DMCO) — Purchase — 3 April 2025 — $15,001 to $50,000.', 'Fictional official filing. Amounts are disclosed as ranges, not exact values.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000009', 'video', 'Demo Public Affairs TV', 'Ada Morrow', 'Town hall, 9 February 2025 (DEMO)', 'https://example.com/demo/dpatv/morrow-town-hall-2025-02-09', '2025-02-09 19:00:00+00',
   'DEMO transcript at 55:20 — "I don''t trade individual stocks. I think members shouldn''t."', 'Fictional demo broadcast.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000010', 'press_release', 'DemoPay Inc.', null, 'DemoPay treasury policy statement (DEMO)', 'https://example.com/demo/demopay/treasury-policy-2024', '2024-02-01 13:00:00+00',
   'DEMO — "We will not sell any of DemoPay''s DemoCoin treasury before January 1, 2026." — Juno Park, CEO', 'Fictional company announcement.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000011', 'official_filing', 'DemoPay Inc.', null, 'DemoPay annual report 2025, note 9: digital assets (DEMO)', 'https://example.com/demo/demopay/annual-report-2025', '2026-02-20 00:00:00+00',
   'DEMO — DemoCoin held: 4,000 units at 31 Dec 2023; 4,000 units at 31 Dec 2024; 4,000 units at 31 Dec 2025. No disposals during the period.', 'Fictional audited filing.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000012', 'video', 'The Demo Stack Podcast', 'Dex Calloway', 'Episode 201: Bear market survival (DEMO)', 'https://example.com/demo/demo-stack/episode-201', '2025-03-03 15:00:00+00',
   'DEMO transcript at 08:15 — "DemoCoin hits one hundred thousand dollars before 2026. I''d bet my house on it."', 'Fictional demo source.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000013', 'market_data', 'Demo CoinData', null, 'DemoCoin daily price history 2025 (DEMO)', 'https://example.com/demo/coindata/democoin-2025', '2026-01-01 00:00:00+00',
   'DEMO — DemoCoin 2025 high: $71,400 (UTC daily close). Close on 31 Dec 2025: $58,920.', 'Fictional market data.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000014', 'article', 'Demo Business Weekly', 'Staff', 'Brennan sees "a slow grind higher" for DemoCorp (DEMO)', 'https://example.com/demo/dbw/brennan-democorp-2027', '2026-05-12 12:00:00+00',
   'DEMO — "I think DemoCorp is a $400 stock by the end of 2027."', 'Fictional interview.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000015', 'video', 'Demo Markets Network', 'Marla Quint', 'Midday Demo — 10 March 2025 (DEMO)', 'https://example.com/demo/dmn/midday-2025-03-10', '2025-03-10 16:30:00+00',
   'DEMO transcript at 03:02 — "The Demo Tech index outperforms the Demo 500 this year, by a lot."', 'Fictional demo broadcast.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000016', 'market_data', 'Demo Index Services', null, 'Demo Tech and Demo 500 total returns, 2025 (DEMO)', 'https://example.com/demo/index/2025-returns', '2026-01-02 00:00:00+00',
   'DEMO — 2025 total return: Demo Tech +14.1%, Demo 500 +11.8%.', 'Fictional official index data.', true, 'verified', true),
  ('d1000000-0000-4000-8000-000000000017', 'interview', 'Demo Public Affairs TV', 'Ada Morrow', 'Statement from Rep. Morrow''s office (DEMO)', 'https://example.com/demo/dpatv/morrow-office-response', '2025-06-02 00:00:00+00',
   'DEMO — "My spouse manages a separate account. I have never traded individual stocks."', 'Fictional subject response.', true, 'verified', true);

-- Statements
insert into public.statements (id, person_id, exact_quote, normalized_summary, statement_type, asset_or_topic, published_at, source_id, source_timecode, context, verification_status, quote_verified_verbatim, visibility, is_demo) values
  ('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'I will never sell a single coin of my DemoCoin. Not one. Not ever.',
   'Explicit commitment never to sell any of his own DemoCoin.', 'explicit_commitment', 'DemoCoin', '2023-03-14 15:41:07+00', 'd1000000-0000-4000-8000-000000000001', '41:07',
   'Said in answer to a listener question about taking profits. He continued: "My kids will inherit every coin."', 'verified', true, 'public', true),
  ('d2000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'For transparency, my cold wallet is demo1qxy...9f3k. Watch it. It never moves.',
   'Identified a wallet address as his own personal cold wallet.', 'factual_claim', 'DemoCoin', '2023-04-02 18:20:00+00', 'd1000000-0000-4000-8000-000000000002', null,
   'Posted on his own verified account.', 'verified', true, 'public', true),
  ('d2000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'DemoCorp is going to be a five-hundred-dollar stock by the end of this year. Write it down.',
   'Predicted DemoCorp shares would reach $500 by 31 December 2024.', 'prediction', 'DemoCorp (DMCO)', '2024-01-02 21:12:44+00', 'd1000000-0000-4000-8000-000000000004', '12:44',
   'Said during a segment on technology stocks, without conditions.', 'verified', true, 'public', true),
  ('d2000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000003', 'I expect the Demo 500 index to finish 2025 above 6,000. That''s my base case, not a hope.',
   'Predicted the Demo 500 would close 2025 above 6,000.', 'prediction', 'Demo 500 index', '2025-01-06 12:00:00+00', 'd1000000-0000-4000-8000-000000000006', null,
   'Part of an annual outlook interview.', 'verified', true, 'public', true),
  ('d2000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000004', 'I don''t trade individual stocks. I think members shouldn''t.',
   'Said she does not trade individual stocks.', 'factual_claim', 'Stock trading by legislators', '2025-02-09 19:55:20+00', 'd1000000-0000-4000-8000-000000000009', '55:20',
   'Answering a constituent question about a proposed stock-trading ban.', 'verified', true, 'public', true),
  ('d2000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000005', 'We will not sell any of DemoPay''s DemoCoin treasury before January 1, 2026.',
   'Committed that the company would not sell its DemoCoin treasury before 1 January 2026.', 'explicit_commitment', 'DemoCoin (corporate treasury)', '2024-02-01 13:00:00+00', 'd1000000-0000-4000-8000-000000000010', null,
   'A company commitment about corporate holdings, not the CEO''s personal holdings.', 'verified', true, 'public', true),
  ('d2000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001', 'DemoCoin hits one hundred thousand dollars before 2026. I''d bet my house on it.',
   'Predicted DemoCoin would reach $100,000 before 1 January 2026.', 'prediction', 'DemoCoin', '2025-03-03 15:08:15+00', 'd1000000-0000-4000-8000-000000000012', '08:15',
   'Said during a discussion of market cycles.', 'verified', true, 'public', true),
  ('d2000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000003', 'I think DemoCorp is a $400 stock by the end of 2027.',
   'Predicted DemoCorp would reach $400 by the end of 2027.', 'prediction', 'DemoCorp (DMCO)', '2026-05-12 12:00:00+00', 'd1000000-0000-4000-8000-000000000014', null,
   'Interview about long-term holdings.', 'verified', true, 'public', true),
  ('d2000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000002', 'The Demo Tech index outperforms the Demo 500 this year, by a lot.',
   'Predicted Demo Tech would outperform the Demo 500 "by a lot" in 2025.', 'prediction', 'Demo Tech vs Demo 500', '2025-03-10 16:33:02+00', 'd1000000-0000-4000-8000-000000000015', '03:02',
   '"By a lot" was not defined.', 'verified', true, 'public', true);

-- Predictions
insert into public.predictions (id, person_id, statement_id, prediction_text, asset, asset_identifier, target_value, target_currency, target_direction, prediction_date, deadline,
  resolution_method, resolution_criteria, price_provider, status, outcome, outcome_source_id, resolved_at, visibility, is_demo) values
  ('d3000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003',
   'DemoCorp is going to be a five-hundred-dollar stock by the end of this year.', 'DemoCorp (DMCO)', 'DMCO', 500, 'USD', 'at_or_above', '2024-01-02', '2024-12-31',
   'Official closing price on the last trading day of 2024, split-adjusted.', 'Correct if DMCO closes at or above $500 on any trading day up to and including 31 Dec 2024.', 'manual',
   'resolved_incorrect', 'DMCO never closed at or above $500 in 2024. Highest close: $268.10. Close on 31 Dec 2024: $212.40.', 'd1000000-0000-4000-8000-000000000005', '2025-01-03 10:00:00+00', 'public', true),
  ('d3000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000004',
   'I expect the Demo 500 index to finish 2025 above 6,000.', 'Demo 500 index', 'DEMO500', 6000, 'USD', 'at_or_above', '2025-01-06', '2025-12-31',
   'Official index close on 31 December 2025.', 'Correct if the official close on 31 Dec 2025 is above 6,000.', 'manual',
   'resolved_correct', 'The Demo 500 closed 2025 at 6,212.55, above the 6,000 target.', 'd1000000-0000-4000-8000-000000000007', '2026-01-02 10:00:00+00', 'public', true),
  ('d3000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000007',
   'DemoCoin hits one hundred thousand dollars before 2026.', 'DemoCoin', 'democoin', 100000, 'USD', 'at_or_above', '2025-03-03', '2025-12-31',
   'UTC daily close from the configured price provider.', 'Correct if any UTC daily close is at or above $100,000 before 1 Jan 2026.', 'coingecko',
   'resolved_incorrect', 'DemoCoin''s highest UTC daily close in the window was $71,400.', 'd1000000-0000-4000-8000-000000000013', '2026-01-02 10:00:00+00', 'public', true),
  ('d3000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000008',
   'I think DemoCorp is a $400 stock by the end of 2027.', 'DemoCorp (DMCO)', 'DMCO', 400, 'USD', 'at_or_above', '2026-05-12', '2027-12-31',
   'Official closing price on the last trading day of 2027, split-adjusted.', 'Correct if DMCO closes at or above $400 on 31 Dec 2027.', 'manual',
   'open', null, null, null, 'public', true),
  ('d3000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000009',
   'The Demo Tech index outperforms the Demo 500 this year, by a lot.', 'Demo Tech vs Demo 500', null, null, null, 'other', '2025-03-10', '2025-12-31',
   'Compare 2025 total returns of both indexes.', 'Outperformance is measurable; "by a lot" was never defined, so only the direction can be scored.', 'manual',
   'partially_correct', 'Demo Tech returned +14.1% against +11.8% for the Demo 500. It outperformed, but by 2.3 points, which we do not treat as clearly "a lot".', 'd1000000-0000-4000-8000-000000000016', '2026-01-03 10:00:00+00', 'public', true);

insert into public.prediction_outcomes (prediction_id, result, observed_value, observed_currency, price_provider, asset_identifier, timezone, observation_time, methodology, original_target, evidence_source_id, proposed_by, status, confirmed_at) values
  ('d3000000-0000-4000-8000-000000000001', 'incorrect', 212.40, 'USD', 'manual', 'DMCO', 'America/New_York', '2024-12-31 21:00:00+00', 'Official close on the final trading day of 2024; highest close in the period also checked.', '$500 by end of 2024', 'd1000000-0000-4000-8000-000000000005', 'editor', 'confirmed', '2025-01-03 10:00:00+00'),
  ('d3000000-0000-4000-8000-000000000002', 'correct', 6212.55, 'USD', 'manual', 'DEMO500', 'America/New_York', '2025-12-31 21:00:00+00', 'Official index close on 31 Dec 2025.', 'Above 6,000 at end of 2025', 'd1000000-0000-4000-8000-000000000007', 'editor', 'confirmed', '2026-01-02 10:00:00+00'),
  ('d3000000-0000-4000-8000-000000000003', 'incorrect', 71400, 'USD', 'coingecko', 'democoin', 'UTC', '2025-12-31 23:59:00+00', 'Maximum UTC daily close between the statement date and 31 Dec 2025.', '$100,000 before 2026', 'd1000000-0000-4000-8000-000000000013', 'ai', 'confirmed', '2026-01-02 10:00:00+00'),
  ('d3000000-0000-4000-8000-000000000005', 'partially_correct', 2.3, 'pct_points', 'manual', null, 'UTC', '2025-12-31 23:59:00+00', 'Difference of 2025 total returns; magnitude term "by a lot" undefined.', 'Demo Tech outperforms Demo 500 by a lot in 2025', 'd1000000-0000-4000-8000-000000000016', 'editor', 'confirmed', '2026-01-03 10:00:00+00');

-- Wallet and on-chain activity (Dex Calloway) and disclosed transactions (Ada Morrow)
insert into public.wallets (id, chain, address, label, attributed_person_id, attribution_status, attribution_source_id, notes, visibility, is_demo) values
  ('d4000000-0000-4000-8000-000000000001', 'demochain', 'demo1qxy0000000000000000009f3k', 'Cold wallet identified by Dex Calloway', 'd0000000-0000-4000-8000-000000000001', 'claimed_by_subject', 'd1000000-0000-4000-8000-000000000002',
   'The subject identified this address himself in April 2023.', 'public', true);
insert into public.wallet_events (wallet_id, tx_hash, event_type, asset, amount, counterparty, counterparty_label, occurred_at, source_id, notes, visibility, is_demo) values
  ('d4000000-0000-4000-8000-000000000001', '0xdemo7a1', 'exchange_deposit', 'DemoCoin', 1250, 'demo1exchdeposit0000000000000', 'Deposit address labeled "Demo Exchange" by the explorer', '2026-06-18 09:12:00+00', 'd1000000-0000-4000-8000-000000000003',
   'A deposit to an exchange is not, by itself, a sale. The ledger does not show whether the coins were sold, lent, used as collateral or withdrawn again.', 'public', true);
insert into public.transactions (person_id, asset, asset_identifier, transaction_type, owner, amount_low, amount_high, currency, transaction_date, disclosed_at, filing_reference, source_id, verification_status, notes, visibility, is_demo) values
  ('d0000000-0000-4000-8000-000000000004', 'DemoCorp (DMCO)', 'DMCO', 'purchase', 'spouse', 15001, 50000, 'USD', '2025-04-03', '2025-05-14', 'PTR 2025-05-14 (demo)', 'd1000000-0000-4000-8000-000000000008', 'verified',
   'Disclosed as a spouse transaction. Disclosure ranges are not exact amounts.', 'public', true);

-- Cases
insert into public.cases (id, slug, person_id, primary_statement_id, prediction_id, title, summary, article_body, what_happened, limitations, case_type, status, evidence_confidence, editorial_conclusion,
  origin, legal_review, methodology_version, social_headline, social_post, newsletter_summary, seo_description, social_graphic_text, is_demo, published_at, approved_at, last_updated_at) values
  ('d5000000-0000-4000-8000-000000000001', 'dex-calloway-never-sell-wallet-moved-to-exchange-demo', 'd0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', null,
   '"Not one. Not ever." A wallet Dex Calloway calls his own just moved 1,250 DemoCoin to an exchange',
   'In 2023 Dex Calloway said he would never sell a single DemoCoin and published the address of his cold wallet. In June 2026 that wallet sent 1,250 DemoCoin to an exchange deposit address. The transfer is on the public ledger. A sale is not.',
   E'**DEMO ONLY — every person, quote, source and number in this case is fictional.**\n\nOn 14 March 2023, on episode 112 of his podcast, Dex Calloway answered a listener who asked when he would take profits: "I will never sell a single coin of my DemoCoin. Not one. Not ever." Three weeks later he posted a wallet address and said it was his cold wallet.\n\nOn 18 June 2026 the public ledger shows 1,250 DemoCoin leaving that address for an address the block explorer labels as a Demo Exchange deposit address.\n\n## What the evidence shows\n\nThe ledger record proves the transfer happened, from an address Calloway himself identified as his. That attribution matters: we do not attribute wallets to people because a third party says so.\n\n## What it does not show\n\nA deposit to an exchange is not a sale. Coins deposited to an exchange can be sold, but they can also be lent, posted as collateral, moved between accounts or withdrawn again. The ledger cannot tell us which. We have not seen any record of a trade.\n\n## Where that leaves the commitment\n\nCalloway''s 2023 promise was explicit and unconditional. The June 2026 transfer is the first movement out of the wallet he pointed readers to. Whether he kept his word depends on what happened after the deposit — a question only he or the exchange can answer. We asked him.',
   'On 18 June 2026, 1,250 DemoCoin moved from the wallet Calloway identified as his cold wallet to an exchange deposit address.',
   'The ledger shows a transfer, not a trade. We cannot see what happened on the exchange. The wallet may not hold all of Calloway''s DemoCoin.',
   'never_sell', 'published', 'verified',
   'Documented: an explicit never-sell commitment, and a later transfer of 1,250 DemoCoin from a self-identified wallet to an exchange. Not established: that any coins were sold.',
   'editor', '{"quotes_verbatim_and_sourced": true, "dates_verified": true, "context_included": true, "no_unsupported_accusation": true, "ownership_and_identity_established": true, "transfers_not_called_sales": true, "opinion_labeled_as_opinion": true, "right_of_reply_offered": true, "limitations_stated": true}',
   '1.0', 'He said "never". His wallet just moved. (DEMO)', 'DEMO: In 2023 Dex Calloway promised never to sell a single DemoCoin. A wallet he identified as his just sent 1,250 to an exchange. A deposit is not a sale — here''s what the record shows and what it doesn''t.',
   'A wallet the (fictional) podcaster Dex Calloway called his own moved 1,250 DemoCoin to an exchange. The record proves a transfer, not a sale.',
   'DEMO case: a self-identified wallet moved 1,250 DemoCoin to an exchange after a never-sell promise. What the ledger proves, and what it does not.',
   'NEVER SELL? A transfer is not a sale.', true, '2026-06-24 14:00:00+00', '2026-06-24 13:30:00+00', '2026-06-24 14:00:00+00'),
  ('d5000000-0000-4000-8000-000000000002', 'marla-quint-democorp-500-by-2024-demo', 'd0000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000001',
   '"Write it down": Marla Quint''s $500 DemoCorp call finished the year at $212',
   'On 2 January 2024 Marla Quint told viewers DemoCorp would be a $500 stock by year-end. It never closed above $268.10 and ended 2024 at $212.40.',
   E'**DEMO ONLY — every person, quote, source and number in this case is fictional.**\n\nOpening the first broadcast of 2024, Marla Quint made a specific, dated call: "DemoCorp is going to be a five-hundred-dollar stock by the end of this year. Write it down."\n\nWe did. The prediction had a clear target ($500), a clear asset (DMCO) and a clear deadline (31 December 2024), so it could be scored without interpretation.\n\n## Outcome\n\nDMCO''s highest close of 2024 was $268.10. It closed the year at $212.40, 58% short of the target. There were no stock splits or other corporate actions in the period that would change the comparison.\n\n## Context\n\nQuint did not attach conditions to the call. She later said on air that she still liked the company long term; that is an opinion, and we do not score it.',
   'DMCO closed 2024 at $212.40; the 2024 high close was $268.10.', 'Scored on official closing prices only; intraday highs were not considered. Quint''s later long-term opinion is not scored.',
   'prediction_aged_poorly', 'published', 'verified', 'Resolved incorrect: DMCO did not reach $500 by the stated deadline.',
   'editor', '{"quotes_verbatim_and_sourced": true, "dates_verified": true, "context_included": true, "no_unsupported_accusation": true, "ownership_and_identity_established": true, "transfers_not_called_sales": true, "opinion_labeled_as_opinion": true, "right_of_reply_offered": true, "limitations_stated": true}',
   '1.0', '"Write it down." We did. (DEMO)', 'DEMO: "DemoCorp is going to be a five-hundred-dollar stock by the end of this year." It closed 2024 at $212.40. Full record, sources and methodology inside.',
   'A (fictional) TV commentator''s $500 call on DemoCorp ended 2024 at $212.40.', 'DEMO case: a dated $500 price target for DemoCorp, scored against official 2024 closing prices.', 'TARGET $500. ACTUAL $212.', true, '2025-01-05 13:00:00+00', '2025-01-05 12:00:00+00', '2025-01-06 09:00:00+00'),
  ('d5000000-0000-4000-8000-000000000003', 'holt-brennan-demo-500-above-6000-demo', 'd0000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000004', 'd3000000-0000-4000-8000-000000000002',
   'Holt Brennan called the Demo 500 above 6,000 for 2025. It closed at 6,212',
   'In January 2025 Holt Brennan said his base case was the Demo 500 finishing the year above 6,000. It closed at 6,212.55.',
   E'**DEMO ONLY — every person, quote, source and number in this case is fictional.**\n\nIn an outlook interview published 6 January 2025, Brennan said: "I expect the Demo 500 index to finish 2025 above 6,000. That''s my base case, not a hope."\n\n## Outcome\n\nThe official close on 31 December 2025 was 6,212.55. The prediction is resolved correct.\n\n## How we scored it\n\nThe call named an index, a level and a date, which made it measurable. We used the official closing level, not intraday highs. Brennan''s other open prediction — DemoCorp at $400 by the end of 2027 — remains open and is not counted either way.',
   'The Demo 500 closed 2025 at 6,212.55.', 'One prediction does not make a track record; see the profile for the full denominator.',
   'prediction_aged_well', 'published', 'verified', 'Resolved correct: the index closed 2025 above the predicted level.',
   'editor', '{"quotes_verbatim_and_sourced": true, "dates_verified": true, "context_included": true, "no_unsupported_accusation": true, "ownership_and_identity_established": true, "transfers_not_called_sales": true, "opinion_labeled_as_opinion": true, "right_of_reply_offered": true, "limitations_stated": true}',
   '1.0', 'A call that aged well (DEMO)', 'DEMO: Holt Brennan''s base case was the Demo 500 above 6,000 at the end of 2025. It closed at 6,212.55.',
   'A (fictional) fund manager''s 2025 index call came true.', 'DEMO case: a 2025 index-level prediction that resolved correct.', 'CALLED IT: 6,000+', true, '2026-01-03 13:00:00+00', '2026-01-03 12:00:00+00', '2026-01-03 13:00:00+00'),
  ('d5000000-0000-4000-8000-000000000004', 'ada-morrow-spouse-democorp-disclosure-demo', 'd0000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000005', null,
   'Ada Morrow said she doesn''t trade individual stocks. Her disclosure lists a DemoCorp purchase — by her spouse',
   'Two months after telling a town hall "I don''t trade individual stocks," Ada Morrow''s periodic transaction report disclosed a purchase of DemoCorp shares owned by her spouse.',
   E'**DEMO ONLY — every person, quote, source and number in this case is fictional.**\n\nAt a 9 February 2025 town hall, asked about a proposed ban on stock trading by legislators, Morrow said: "I don''t trade individual stocks. I think members shouldn''t."\n\nOn 14 May 2025 she filed a periodic transaction report listing a 3 April 2025 purchase of DemoCorp stock worth between $15,001 and $50,000. The owner column on the filing reads "SP" — spouse.\n\n## What the filing shows\n\nThe report is an official record and we treat it as verified. It attributes the transaction to Morrow''s spouse, not to Morrow.\n\n## What it does not show\n\nThe filing does not show that Morrow directed the trade, and it does not make her town-hall statement — which was about her own trading — false on its face. Readers can weigh whether a household standard differs from a personal one.\n\n## Response\n\nMorrow''s office told us her spouse manages a separate account and that she has never traded individual stocks. We have included that response in full.',
   'A spouse-owned purchase of DemoCorp ($15,001–$50,000) was disclosed on 14 May 2025.',
   'Disclosure amounts are ranges. The filing does not show who made the investment decision.',
   'other', 'published', 'verified',
   'Documented: a spouse-owned DemoCorp purchase on an official disclosure. Not established: that Morrow herself traded, or that her statement was false.',
   'editor', '{"quotes_verbatim_and_sourced": true, "dates_verified": true, "context_included": true, "no_unsupported_accusation": true, "ownership_and_identity_established": true, "transfers_not_called_sales": true, "opinion_labeled_as_opinion": true, "right_of_reply_offered": true, "limitations_stated": true}',
   '1.0', 'Read the owner column (DEMO)', 'DEMO: A legislator said she doesn''t trade individual stocks. Her disclosure lists a DemoCorp purchase — owned by her spouse. Why that distinction matters.',
   'A (fictional) legislator''s disclosure shows a spouse-owned stock purchase.', 'DEMO case: why a spouse transaction on a disclosure is reported as exactly that.', 'OWNER: SPOUSE', true, '2025-06-05 13:00:00+00', '2025-06-05 12:00:00+00', '2025-06-05 13:00:00+00'),
  ('d5000000-0000-4000-8000-000000000005', 'demopay-treasury-no-sale-promise-kept-demo', 'd0000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000006', null,
   'DemoPay promised not to sell its DemoCoin before 2026. Its filings show it didn''t',
   'In February 2024 DemoPay CEO Juno Park committed that the company would not sell any of its DemoCoin treasury before 1 January 2026. The company''s audited annual report shows the same 4,000 units at the end of 2023, 2024 and 2025, with no disposals.',
   E'**DEMO ONLY — every person, quote, source and number in this case is fictional.**\n\nDemoPay''s February 2024 treasury policy statement quoted Park: "We will not sell any of DemoPay''s DemoCoin treasury before January 1, 2026."\n\n## Outcome\n\nNote 9 of the 2025 annual report lists 4,000 DemoCoin held at each year-end from 2023 to 2025 and states there were no disposals. The commitment was kept.\n\n## Scope\n\nThe commitment covered the company''s treasury, not Park''s personal holdings, and we have not assessed those.',
   'Audited filings show no disposals of the DemoCoin treasury through 31 December 2025.', 'Year-end balances cannot rule out a sale and repurchase within a year; the note''s "no disposals" statement covers that.',
   'kept_promise', 'published', 'verified', 'Kept: the audited record shows no sale of the treasury before the stated date.',
   'editor', '{"quotes_verbatim_and_sourced": true, "dates_verified": true, "context_included": true, "no_unsupported_accusation": true, "ownership_and_identity_established": true, "transfers_not_called_sales": true, "opinion_labeled_as_opinion": true, "right_of_reply_offered": true, "limitations_stated": true}',
   '1.0', 'A promise that held (DEMO)', 'DEMO: DemoPay said it wouldn''t sell its DemoCoin before 2026. The audited filings say it didn''t.',
   'A (fictional) company kept its no-sale treasury commitment.', 'DEMO case: a corporate no-sale commitment checked against audited filings.', 'PROMISE KEPT', true, '2026-02-25 13:00:00+00', '2026-02-25 12:00:00+00', '2026-02-25 13:00:00+00');

-- An AI-assisted draft waiting for review (not public), to demonstrate the newsroom workflow.
insert into public.cases (id, slug, person_id, primary_statement_id, prediction_id, title, summary, article_body, case_type, status, evidence_confidence, origin, ai_generated, ai_notes, is_demo) values
  ('d5000000-0000-4000-8000-000000000006', 'dex-calloway-100k-before-2026-demo', 'd0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000007', 'd3000000-0000-4000-8000-000000000003',
   'Dex Calloway said DemoCoin would hit $100,000 before 2026. Its best close was $71,400',
   'DRAFT (AI-assisted, DEMO). In March 2025 Calloway predicted DemoCoin would reach $100,000 before 2026. The highest UTC daily close in that window was $71,400.',
   E'**DEMO ONLY.** Draft generated to demonstrate the review workflow. It is not published.\n\nOn 3 March 2025 Calloway said: "DemoCoin hits one hundred thousand dollars before 2026. I''d bet my house on it." ...',
   'prediction_aged_poorly', 'needs_review', 'verified', 'ai', true,
   '{"reasoning_summary": "The statement is a dated, measurable price prediction. The resolution source is a configured price provider. The phrase \"I''d bet my house on it\" is a figure of speech and should not be reported as a literal wager.", "questions_for_editor": ["Should the headline quote the \"bet my house\" line? It is colourful but could be read literally.", "Confirm the price provider and daily-close convention match our methodology."], "limitations": ["Intraday highs were not checked."], "prompt_version": "draft-v1"}',
   true);

insert into public.case_evidence (case_id, evidence_source_id, evidence_role, classification, what_it_proves, what_it_does_not_prove, limitations, identity_established, sort_order) values
  ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'original_statement', 'verified', 'Calloway made an explicit, unconditional commitment never to sell his DemoCoin.', 'Anything about what he did afterwards.', null, true, 10),
  ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'supporting', 'verified', 'Calloway himself identified the wallet address as his.', 'That the wallet holds all of his DemoCoin.', null, true, 20),
  ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'outcome', 'verified', 'A transfer of 1,250 DemoCoin from that wallet to an exchange deposit address on 18 June 2026.', 'That any DemoCoin was sold. Exchange deposits can be held, lent, pledged or withdrawn.', 'The exchange label comes from the explorer, not the exchange.', true, 30),
  ('d5000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000004', 'original_statement', 'verified', 'The exact wording, date and lack of conditions of the prediction.', null, null, true, 10),
  ('d5000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000005', 'outcome', 'verified', 'DMCO did not close at or above $500 at any point in 2024.', null, 'Closing prices only.', true, 20),
  ('d5000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000006', 'original_statement', 'verified', 'The prediction''s wording and date.', null, null, true, 10),
  ('d5000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000007', 'outcome', 'verified', 'The official 2025 close was 6,212.55.', null, null, true, 20),
  ('d5000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000009', 'original_statement', 'verified', 'Morrow said she does not trade individual stocks.', null, null, true, 10),
  ('d5000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000008', 'disclosure', 'verified', 'A DemoCorp purchase disclosed with owner "spouse".', 'That Morrow made or directed the trade.', 'Amounts are disclosed as ranges.', true, 20),
  ('d5000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000017', 'subject_response', 'verified', 'Morrow''s office says the spouse manages a separate account.', 'Independent confirmation of how the account is managed.', null, true, 30),
  ('d5000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000010', 'original_statement', 'verified', 'The company''s dated, explicit no-sale commitment.', null, null, true, 10),
  ('d5000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000011', 'outcome', 'verified', 'No disposals of the DemoCoin treasury through 31 Dec 2025.', 'Anything about the CEO''s personal holdings.', null, true, 20),
  ('d5000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000012', 'original_statement', 'verified', 'The prediction''s wording and date.', null, null, true, 10),
  ('d5000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000013', 'outcome', 'verified', 'The highest 2025 UTC daily close was $71,400.', null, null, true, 20);

insert into public.case_timeline_events (case_id, occurred_at, label, description, kind, evidence_source_id) values
  ('d5000000-0000-4000-8000-000000000001', '2023-03-14 15:41:07+00', '"I will never sell a single coin"', 'Explicit commitment on episode 112 of his podcast.', 'statement', 'd1000000-0000-4000-8000-000000000001'),
  ('d5000000-0000-4000-8000-000000000001', '2023-04-02 18:20:00+00', 'Publishes his cold-wallet address', '"Watch it. It never moves."', 'statement', 'd1000000-0000-4000-8000-000000000002'),
  ('d5000000-0000-4000-8000-000000000001', '2026-06-18 09:12:00+00', '1,250 DemoCoin sent to an exchange deposit address', 'First outgoing transfer from the identified wallet.', 'action', 'd1000000-0000-4000-8000-000000000003'),
  ('d5000000-0000-4000-8000-000000000001', '2026-06-20 12:00:00+00', 'Aged Takes requests comment', 'Sent by email to the podcast''s published press address.', 'response', null),
  ('d5000000-0000-4000-8000-000000000002', '2024-01-02 21:12:44+00', '"$500 by the end of this year"', 'On-air prediction.', 'statement', 'd1000000-0000-4000-8000-000000000004'),
  ('d5000000-0000-4000-8000-000000000002', '2024-12-31 21:00:00+00', 'DMCO closes 2024 at $212.40', 'Deadline passes; target not reached.', 'market', 'd1000000-0000-4000-8000-000000000005'),
  ('d5000000-0000-4000-8000-000000000003', '2025-01-06 12:00:00+00', '"Above 6,000"', 'Outlook interview.', 'statement', 'd1000000-0000-4000-8000-000000000006'),
  ('d5000000-0000-4000-8000-000000000003', '2025-12-31 22:00:00+00', 'Demo 500 closes at 6,212.55', 'Target reached at the deadline.', 'market', 'd1000000-0000-4000-8000-000000000007'),
  ('d5000000-0000-4000-8000-000000000004', '2025-02-09 19:55:20+00', '"I don''t trade individual stocks"', 'Town hall answer.', 'statement', 'd1000000-0000-4000-8000-000000000009'),
  ('d5000000-0000-4000-8000-000000000004', '2025-04-03 00:00:00+00', 'Spouse-owned DemoCorp purchase', '$15,001–$50,000, per later filing.', 'action', 'd1000000-0000-4000-8000-000000000008'),
  ('d5000000-0000-4000-8000-000000000004', '2025-05-14 00:00:00+00', 'Periodic transaction report filed', null, 'disclosure', 'd1000000-0000-4000-8000-000000000008'),
  ('d5000000-0000-4000-8000-000000000004', '2025-06-02 00:00:00+00', 'Morrow''s office responds', null, 'response', 'd1000000-0000-4000-8000-000000000017'),
  ('d5000000-0000-4000-8000-000000000005', '2024-02-01 13:00:00+00', 'No-sale commitment announced', 'Treasury policy statement.', 'statement', 'd1000000-0000-4000-8000-000000000010'),
  ('d5000000-0000-4000-8000-000000000005', '2026-01-01 00:00:00+00', 'Commitment window ends', null, 'event', null),
  ('d5000000-0000-4000-8000-000000000005', '2026-02-20 00:00:00+00', 'Annual report confirms no disposals', null, 'disclosure', 'd1000000-0000-4000-8000-000000000011');

insert into public.subject_responses (case_id, outreach_status, contact_method, contacted_at, response_deadline, response_text, response_source, received_at) values
  ('d5000000-0000-4000-8000-000000000001', 'no_response', 'email', '2026-06-20 12:00:00+00', '2026-06-23 12:00:00+00', null, null, null),
  ('d5000000-0000-4000-8000-000000000002', 'declined_to_comment', 'press_office', '2025-01-03 15:00:00+00', '2025-01-04 15:00:00+00', null, null, null),
  ('d5000000-0000-4000-8000-000000000003', 'contact_attempted', 'email', '2026-01-02 15:00:00+00', null, null, null, null),
  ('d5000000-0000-4000-8000-000000000004', 'responded', 'press_office', '2025-05-28 15:00:00+00', '2025-06-02 15:00:00+00', 'My spouse manages a separate account. I have never traded individual stocks.', 'Statement from Rep. Morrow''s office (DEMO)', '2025-06-02 00:00:00+00'),
  ('d5000000-0000-4000-8000-000000000005', 'responded', 'press_office', '2026-02-21 15:00:00+00', null, 'We said we would hold, and we held.', 'Email from DemoPay communications (DEMO)', '2026-02-23 00:00:00+00');

insert into public.corrections (case_id, field, previous_text, corrected_text, reason, created_at) values
  ('d5000000-0000-4000-8000-000000000002', 'summary',
   'On 2 January 2024 Marla Quint told viewers DemoCorp would be a $500 stock by year-end. It never closed above $286.10 and ended 2024 at $212.40.',
   'On 2 January 2024 Marla Quint told viewers DemoCorp would be a $500 stock by year-end. It never closed above $268.10 and ended 2024 at $212.40.',
   'DEMO correction: the 2024 high close was transposed ($286.10). The correct figure from the market data source is $268.10.', '2025-01-06 09:00:00+00');

insert into public.editorial_reviews (case_id, decision, from_status, to_status, notes, created_at)
select id, 'approve', 'needs_review', 'approved', 'Demo seed approval.', approved_at from public.cases where is_demo and status = 'published'
union all
select id, 'publish', 'approved', 'published', 'Demo seed publication.', published_at from public.cases where is_demo and status = 'published';

-- 3. Research candidates (internal only; no statements, no claims) ----------------------------------------
insert into public.people (name, slug, status, biography) values
  ('Michael Saylor', 'michael-saylor', 'research_candidate', null),
  ('Cathie Wood', 'cathie-wood', 'research_candidate', null),
  ('Jim Cramer', 'jim-cramer', 'research_candidate', null),
  ('Warren Buffett', 'warren-buffett', 'research_candidate', null),
  ('Robert Kiyosaki', 'robert-kiyosaki', 'research_candidate', null),
  ('Anthony Pompliano', 'anthony-pompliano', 'research_candidate', null),
  ('Raoul Pal', 'raoul-pal', 'research_candidate', null),
  ('Nancy Pelosi', 'nancy-pelosi', 'research_candidate', null);

-- Example source monitors (disabled until an editor configures and enables them).
insert into public.monitored_sources (connector, label, config, enabled) values
  ('house_disclosures', 'House periodic transaction reports (current year)', '{"year": 2026}', false),
  ('sec_edgar', 'SEC EDGAR filings for a chosen filer (set the CIK)', '{"cik": "", "forms": ["4", "13F-HR", "8-K"]}', false),
  ('coingecko', 'CoinGecko prices for tracked assets', '{"ids": ["bitcoin"]}', false);

commit;
