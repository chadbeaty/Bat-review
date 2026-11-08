-- Product Radar: default settings, the connector registry and the seed creator list.
-- Creator identities were checked by hand on 2026-11-08 against each channel's public page and upload feed.
-- Only channels whose identity was clear are marked verified and active; everything else waits for the owner.

insert into public.app_settings (key, value) values
  ('scoring_weights', '{"early_momentum": 25, "demand_acceleration": 20, "competition": 20, "organic_video_potential": 15, "problem_solving": 10, "profit_potential": 10}'),
  ('alert_thresholds', '{"score": 80, "momentum_acceleration": 3, "momentum_min_mentions_72h": 3, "multi_source_min_platforms": 2, "low_competition_min_score": 70, "strong_demand_min_score": 60, "saturation_creators_7d": 8, "saturation_min_previous_score": 60, "rescore_change_points": 10}'),
  ('ai', '{"model": "claude-opus-5-5", "daily_budget_usd": 1.5, "monthly_budget_usd": 40, "assess_min_prelim_score": 40, "reassess_after_days": 3, "max_videos_per_run": 24}'),
  ('youtube', '{"poll_interval_hours": 4, "lookback_days": 14, "max_new_videos_per_creator": 10, "stats_refresh_days": 14}'),
  ('digest', '{"enabled": true, "top_n": 10}'),
  ('economics', '{"payment_pct": 0.029, "payment_fixed": 0.30, "refund_reserve_pct": 0.05, "other_pct": 0.03, "default_shipping": 4.0}'),
  ('fixed_costs', '{"vercel": 0, "supabase": 0, "resend": 0, "other": 0}')
on conflict (key) do nothing;

insert into public.sources (kind, name, status, notes) values
  ('youtube', 'YouTube Data API v3', 'active',
   'Official API, free 10,000 quota units/day. Uploads (1 unit per 50 videos), video details and stats (1 unit per 50). Transcripts of other people''s videos are not available: captions.download requires edit permission on the video.'),
  ('manual', 'Manual URL submissions', 'active',
   'URLs pasted by the owner. YouTube links are read through the official API; TikTok links through TikTok''s public oEmbed endpoint (which returns only the video id and embed, so your notes supply the description).'),
  ('tiktok', 'TikTok trend discovery', 'unavailable',
   'TikTok''s Research API is limited to non-commercial academic research, and Creative Center has no public API. Needs a licensed data provider (see docs/PLAN.md, Phase 2). Manual TikTok URL submission works today.'),
  ('instagram', 'Instagram Reels (Graph API hashtag search)', 'planned',
   'Official Instagram Graph API hashtag search: needs a Business/Creator account, a Meta app with Instagram Public Content Access approved in App Review, and allows 30 unique hashtags per rolling 7 days. Phase 2.'),
  ('reddit', 'Reddit communities', 'planned',
   'Reddit Data API requires OAuth and written approval for commercial use (paid contract). Phase 2, only with approval.'),
  ('amazon', 'Amazon (Creators API / licensed data)', 'unavailable',
   'PA-API 5 was retired in 2026; its successor, the Creators API, requires an approved Associates account with recent qualifying sales. Movers & Shakers has no official API and Amazon''s terms forbid scraping. Licensed option: Keepa API (from about EUR 49/month). Phase 3.'),
  ('aliexpress', 'AliExpress (Open Platform)', 'planned', 'AliExpress Open Platform / affiliate API requires an approved developer account. Phase 3.'),
  ('temu', 'Temu', 'unavailable', 'No public product data API found. Not monitored.'),
  ('google_shopping', 'Google Shopping (via licensed SERP API)', 'planned', 'No official public Google Shopping search API for this use. Licensed option: SerpApi (free 250 searches/month, paid from $25/month). Phase 3.'),
  ('google_trends', 'Google Trends', 'planned', 'Official Google Trends API is in invitation-only alpha. Licensed option: SerpApi Google Trends engine (shares the SerpApi quota). Phase 2.')
on conflict do nothing;

insert into public.creators (display_name, handle, channel_id, channel_url, channel_title, subscriber_count, verification_status, verification_notes, verified_at, is_active) values
  ('Smith Rees Business', '@SmithReesBusiness', 'UC0E_cp5S3QON12znn1VeOmA', 'https://www.youtube.com/channel/UC0E_cp5S3QON12znn1VeOmA', 'Smith Rees Business', 16900, 'verified',
   'Channel page and upload feed match: recent uploads about AI organic dropshipping (checked 2026-11-08).', now(), true),
  ('Omar / Lighttrok', '@lighttrok', 'UCiZqs_l_MOaEf_keGveOT3A', 'https://www.youtube.com/@lighttrok', 'Omar', 1280, 'candidate',
   'Handle @lighttrok belongs to a channel titled "Omar" (about 1.3K subscribers). Uploads could not be read to confirm it is the right person. Confirm before activating.', null, false),
  ('Esteban Poudrier', null, null, null, null, null, 'unresolved',
   '@estebanpoudrier is a 10-subscriber channel titled "EstePoudrier" with nothing identifying it as the dropshipping creator. Paste the correct channel URL.', null, false),
  ('TTPAnt', null, null, null, null, null, 'unresolved',
   '@ttpant resolves to a channel titled "ttmi" with no public uploads found. Paste the correct channel URL.', null, false),
  ('Duff', null, null, null, null, null, 'unresolved',
   '@duff is an unrelated channel ("DuffDoes", fractal art videos). Paste the correct channel URL.', null, false),
  ('Chris GPC', null, null, null, null, null, 'unresolved',
   '@chrisgpc exists but no public uploads were found to confirm identity. Paste the correct channel URL.', null, false),
  ('Kevin Martins', null, null, null, null, null, 'unresolved',
   '@kevinmartins exists but no uploads were found to confirm identity. Paste the correct channel URL.', null, false),
  ('Tim Ebert', null, null, null, null, null, 'unresolved',
   '@timebert exists but no uploads were found to confirm identity. Paste the correct channel URL.', null, false),
  ('Amin', null, null, null, null, null, 'unresolved',
   'Name too common to identify a channel. Paste the correct channel URL.', null, false),
  ('Raúl Romero', null, null, null, null, null, 'unresolved',
   '@raulromero exists but no uploads were found to confirm identity. Paste the correct channel URL.', null, false),
  ('Mani / Notmanii2x', '@notmanii2x', 'UCLW9GmLMt-571p5vdw7kd8A', 'https://www.youtube.com/@notmanii2x', 'Mani', 4840, 'verified',
   'Handle @notmanii2x matches; recent uploads about AI video and websites for ecommerce (checked 2026-11-08).', now(), true),
  ('Michael Bernstein', null, null, null, null, null, 'unresolved',
   '@MichaelBernstein is an unrelated 2-subscriber channel. The dropshipping educator''s channel was not found. Paste the correct channel URL.', null, false),
  ('Jordan Welch', '@JordanWelch', 'UC5deKm1RRbcoUIuLuSCFprg', 'https://www.youtube.com/@JordanWelch', 'Jordan Welch', 2020000, 'verified',
   'Channel page and upload feed match (about 2.0M subscribers, ecommerce content, checked 2026-11-08).', now(), true),
  ('AC Hampton', '@ACHampton', 'UC3qB4xFJkl0EYoTVbhnn0OQ', 'https://www.youtube.com/@ACHampton', 'Ac Hampton', null, 'candidate',
   'Handle @ACHampton resolves to channel UC3qB4xFJkl0EYoTVbhnn0OQ, the same id third-party stats sites list for AC Hampton. Upload feed was unavailable when checked. Confirm before activating.', null, false),
  ('Grant Zuco', null, null, null, null, null, 'unresolved',
   'No channel found under this name. Paste the correct channel URL.', null, false),
  ('Success With Sam', '@SuccessWithSam', 'UCLI_f0zfE2Q9EWoJe_cAwRw', 'https://www.youtube.com/@SuccessWithSam', 'Success With Sam', 516000, 'verified',
   'Channel matches (about 516K subscribers). Recent uploads are mostly AI-tool tutorials rather than products, so expect few product mentions.', now(), true),
  ('Sharif Mohsin', null, 'UC_KL_-8-6bnhQUOKoC6kADw', 'https://www.youtube.com/channel/UC_KL_-8-6bnhQUOKoC6kADw', 'Sharif Mohsin', null, 'verified',
   'Upload feed title and recent videos ("A.I Dropshipping", "$250 dropshipping") match (checked 2026-11-08).', now(), true),
  ('Paul Lee', null, null, null, null, null, 'unresolved',
   '@PaulLee is an unrelated 2-subscriber channel. Paste the correct channel URL.', null, false),
  ('Paul J Lipsky', '@PaulJLipsky', 'UCmeU2DYiVy80wMBGZzEWnbw', 'https://www.youtube.com/@PaulJLipsky', 'Paul J Lipsky', 338000, 'verified',
   'Channel matches (about 338K subscribers). Recent uploads are AI news, so expect few product mentions.', now(), true),
  ('Esteban Hype', '@EstebanHype', 'UC1GRAM_FZ3FeX8fF2l_TZ2Q', 'https://www.youtube.com/@EstebanHype', 'Esteban Hype - Ecommerce con IA en Latinoamerica', 28600, 'verified',
   'Channel matches (Spanish-language AI ecommerce, about 28.6K subscribers, checked 2026-11-08).', now(), true)
on conflict do nothing;
