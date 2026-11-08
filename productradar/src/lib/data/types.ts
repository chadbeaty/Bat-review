// Row shapes used across the app (the subset of columns the code reads).

export type ProductRow = {
  id: string;
  canonical_name: string;
  slug: string;
  function_summary: string | null;
  description: string | null;
  category: string | null;
  physical_attributes: string[];
  visual_description: string | null;
  problem_solved: string | null;
  status: "new" | "tracking" | "saturated" | "not_a_product" | "merged";
  status_changed_at: string;
  merged_into: string | null;
  first_observed_at: string | null;
  first_observed_platform: string | null;
  first_observed_creator_id: string | null;
  first_observed_url: string | null;
  primary_image_url: string | null;
  est_supplier_cost_low: number | null;
  est_supplier_cost_high: number | null;
  est_shipping_cost: number | null;
  suggested_price_low: number | null;
  suggested_price_high: number | null;
  price_basis: string | null;
  ai_recommendation: string | null;
  ai_verdict: "test_now" | "watch" | "avoid" | "insufficient_data" | null;
  ai_risks: string[];
  ai_recommendation_at: string | null;
  ai_organic_score: number | null;
  ai_problem_score: number | null;
  ai_reasons: Record<string, string>;
  assessed_at: string | null;
  assessment_mentions: number | null;
  latest_score: number | null;
  latest_confidence: "high" | "medium" | "low" | null;
  latest_acceleration: number | null;
  latest_competition: number | null;
  latest_creators: number | null;
  scored_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatorRow = {
  id: string;
  platform: string;
  display_name: string;
  handle: string | null;
  channel_id: string | null;
  channel_url: string | null;
  uploads_playlist_id: string | null;
  subscriber_count: number | null;
  channel_title: string | null;
  verification_status: "verified" | "candidate" | "unresolved" | "rejected";
  verification_notes: string | null;
  verified_at: string | null;
  is_active: boolean;
  last_polled_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type VideoRow = {
  id: string;
  creator_id: string | null;
  platform: string;
  external_id: string;
  url: string;
  title: string | null;
  description: string | null;
  tags: string[];
  thumbnail_url: string | null;
  author_name: string | null;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  owner_notes: string | null;
  analysis_status: string;
  analysis_attempts: number;
  first_seen_at: string;
};

export type MentionRow = {
  id: string;
  product_id: string | null;
  video_id: string | null;
  creator_id: string | null;
  platform: string;
  url: string;
  author_name: string | null;
  mentioned_name: string;
  evidence_location: string | null;
  evidence_quote: string | null;
  mention_type: string;
  observed_at: string;
  detected_at: string;
  match_method: string;
  match_confidence: number | null;
};

export type ScoreRow = {
  id: string;
  product_id: string;
  scored_at: string;
  overall: number;
  early_momentum: number | null;
  demand_acceleration: number | null;
  competition: number | null;
  organic_video_potential: number | null;
  problem_solving: number | null;
  profit_potential: number | null;
  confidence: "high" | "medium" | "low";
  missing: string[];
  reasons: Record<string, string>;
  weights: Record<string, number>;
};

export type VideoIdeas = {
  hooks: string[];
  problem_solution: { title: string; concept: string }[];
  three_two_one: { title: string; concept: string };
  run_to_store: { title: string; concept: string };
  pov_demo: { title: string; concept: string };
  curiosity: { title: string; concept: string };
  before_after: { title: string; concept: string } | null;
  duration_seconds: number;
  first_frame: string;
  call_to_action: string;
  format_notes: string;
};
