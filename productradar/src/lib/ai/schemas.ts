import { z } from "zod";

// Structured-output schemas for each AI task. Every field is required (nullable where unknown), which is what
// Claude's structured outputs expect; the same schemas validate the response again in code.

export const MENTION_TYPES = ["organic_demo", "affiliate", "storefront", "paid_ad", "education", "discussion", "unknown"] as const;
export const EVIDENCE_LOCATIONS = ["title", "description", "tags", "thumbnail", "owner_notes", "page"] as const;

export const ExtractedProduct = z.object({
  name_as_mentioned: z.string().describe("The product name exactly as the source words it, or a short literal description if it is only shown"),
  suggested_canonical_name: z.string().describe("Plain generic name of the underlying product, no brand, 2-6 words, e.g. 'handheld bag sealer'"),
  function: z.string().describe("What the product actually does, one sentence"),
  physical_characteristics: z.array(z.string()).describe("Size, shape, material, power source, notable parts"),
  visual_description: z.string().describe("What it looks like, for telling look-alikes apart"),
  category: z.string().describe("Short category such as kitchen, pet, car, beauty tools, home, fitness, desk, outdoor, tech accessory"),
  alternate_names: z.array(z.string()).describe("Other names sellers plausibly use for this same product"),
  search_terms: z.array(z.string()).describe("Search phrases a shopper would type"),
  problem_solved: z.string().nullable().describe("The obvious problem it solves, or null if it is novelty only"),
  evidence_location: z.enum(EVIDENCE_LOCATIONS).describe("Where in the input the product appears"),
  evidence_quote: z.string().describe("Exact words from the input that refer to it; for thumbnail-only, a literal description of what is visible"),
  mention_type: z.enum(MENTION_TYPES).describe("organic_demo = shows/uses it; affiliate = links to buy for commission; storefront = sells it in their own store; paid_ad = labelled ad/sponsored; education = used as an example in a how-to; discussion = talked about"),
  stated_price_usd: z.number().nullable().describe("A price stated in the input, converted to USD only if the currency is clear, else null"),
  confidence: z.number().min(0).max(1).describe("How sure you are that this specific physical product is really featured"),
});
export type ExtractedProduct = z.infer<typeof ExtractedProduct>;

export const ExtractionSchema = z.object({
  videos: z.array(
    z.object({
      video_ref: z.string().describe("The ref given for the video in the input"),
      is_product_content: z.boolean().describe("True only if a specific physical product is featured"),
      products: z.array(ExtractedProduct),
      notes: z.string().nullable(),
    }),
  ),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const MatchSchema = z.object({
  decisions: z.array(
    z.object({
      item_ref: z.string(),
      match_product_id: z.string().nullable().describe("id of the existing product that is the same underlying product, or null"),
      same_function: z.boolean().describe("True only if the item and the chosen product do the same job"),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
});
export type MatchDecisions = z.infer<typeof MatchSchema>;

const Idea = z.object({ title: z.string(), concept: z.string() });

export const AssessmentSchema = z.object({
  canonical_name: z.string().describe("Best plain generic name for the product"),
  description: z.string().describe("Two or three sentences: what it is, who it is for"),
  function_summary: z.string(),
  problem_solved: z.string().nullable(),
  organic_video_potential: z.object({ score: z.number().min(0).max(100), reason: z.string() }),
  problem_solving_appeal: z.object({ score: z.number().min(0).max(100), reason: z.string() }),
  estimates: z.object({
    supplier_cost_low_usd: z.number().nullable().describe("Typical wholesale/supplier unit cost range, an estimate; null if you cannot reasonably estimate"),
    supplier_cost_high_usd: z.number().nullable(),
    shipping_cost_usd: z.number().nullable().describe("Typical per-unit shipping to US customers, an estimate"),
    suggested_price_low_usd: z.number().nullable(),
    suggested_price_high_usd: z.number().nullable(),
    basis: z.string().describe("How these estimates were reached and how uncertain they are"),
  }),
  recommendation: z.object({
    verdict: z.enum(["test_now", "watch", "avoid", "insufficient_data"]),
    summary: z.string().describe("Plain-English recommendation that cites the evidence provided and names what is unknown"),
    risks: z.array(z.string()),
  }),
  video_ideas: z.object({
    hooks: z.array(z.string()).describe("Exactly three short opening lines for TikTok"),
    problem_solution: z.array(Idea).describe("Exactly three problem/solution concepts"),
    three_two_one: Idea,
    run_to_store: Idea,
    pov_demo: Idea,
    curiosity: Idea,
    before_after: Idea.nullable().describe("Null if a before/after does not suit this product"),
    duration_seconds: z.number().int().min(5).max(90),
    first_frame: z.string(),
    call_to_action: z.string(),
    format_notes: z.string().describe("Which demonstration formats suit it and why; do not claim any format is viral"),
  }),
});
export type Assessment = z.infer<typeof AssessmentSchema>;
