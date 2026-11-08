import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateCost, type Usage } from "@/lib/ai/pricing";
import { loadSettings } from "@/lib/settings";
import { log } from "@/lib/log";

// The one place the app talks to Claude. Server-side only; the API key never reaches a browser.
// Every call checks the daily and monthly AI budgets, asks for JSON validated against a Zod schema, handles
// refusals and truncation, and records an ai_runs row (tokens and estimated cost) for the usage dashboard.

export type AiTask = "extract_products" | "match_products" | "assess_product";

/** The subset of the SDK used here, so tests can supply a fake. */
export type ClaudeLike = { beta: { messages: { parse: (params: never, options?: never) => Promise<unknown> } } };

export type ContentBlock = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };

export type AiCall<T extends z.ZodType> = {
  task: AiTask;
  system: string;
  content: ContentBlock[];
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  inputSummary: string;
};

export type AiResult<T> =
  | { ok: true; data: T; runId: string | null; cost: number }
  | { ok: false; error: string; runId: string | null; retryable: boolean; budget?: boolean };

class AiDisabledError extends Error {}

let sdk: Anthropic | null = null;
let testClient: ClaudeLike | null = null;

/** Tests inject a fake Claude client here. */
export function setClaudeClientForTests(client: ClaudeLike | null) {
  testClient = client;
}

function defaultClient(): ClaudeLike {
  if (testClient) return testClient;
  if (!process.env.ANTHROPIC_API_KEY) throw new AiDisabledError("ANTHROPIC_API_KEY is not set");
  sdk ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 4 * 60_000 });
  return sdk as unknown as ClaudeLike;
}

export function aiConfigured(): boolean {
  return Boolean(testClient || process.env.ANTHROPIC_API_KEY);
}

export function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}
export function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function aiBudget(db: SupabaseClient) {
  const settings = await loadSettings(db);
  const [{ data: day }, { data: month }] = await Promise.all([
    db.rpc("ai_spend_since", { p_since: startOfUtcDay() }),
    db.rpc("ai_spend_since", { p_since: startOfUtcMonth() }),
  ]);
  const spentToday = Number(day ?? 0);
  const spentMonth = Number(month ?? 0);
  return {
    model: settings.ai.model,
    spentToday,
    spentMonth,
    dailyBudget: settings.ai.daily_budget_usd,
    monthlyBudget: settings.ai.monthly_budget_usd,
    ok: spentToday < settings.ai.daily_budget_usd && spentMonth < settings.ai.monthly_budget_usd,
  };
}

type ParsedResponse = { id?: string; model?: string; stop_reason?: string | null; usage?: Usage; parsed_output?: unknown };

export async function runAi<T extends z.ZodType>(db: SupabaseClient, call: AiCall<T>): Promise<AiResult<z.infer<T>>> {
  const budget = await aiBudget(db);
  if (!budget.ok) {
    return {
      ok: false, retryable: false, budget: true, runId: null,
      error: `AI budget reached (today $${budget.spentToday.toFixed(2)} of $${budget.dailyBudget.toFixed(2)}, this month $${budget.spentMonth.toFixed(2)} of $${budget.monthlyBudget.toFixed(2)}). Work resumes when the budget resets, or raise it in Settings.`,
    };
  }
  const model = budget.model;
  const { data: run } = await db
    .from("ai_runs")
    .insert({ task: call.task, model, status: "running", input_summary: call.inputSummary.slice(0, 1000) })
    .select("id")
    .single();
  const runId = (run?.id as string | undefined) ?? null;
  const started = Date.now();
  const finish = async (fields: Record<string, unknown>) => {
    if (runId) await db.from("ai_runs").update({ ...fields, duration_ms: Date.now() - started }).eq("id", runId);
  };

  try {
    const c = defaultClient();
    const params = {
      model,
      max_tokens: call.maxTokens ?? 16000,
      // If a safety classifier declines, the API retries on a suitable model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: call.system,
      messages: [{ role: "user", content: call.content }],
      output_config: { format: betaZodOutputFormat(call.schema), effort: call.effort ?? "low" },
    };
    const res = (await c.beta.messages.parse(params as never)) as ParsedResponse;
    const usage = res.usage ?? {};
    const cost = estimateCost(res.model ?? model, usage);
    const usageFields = {
      input_tokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
      output_tokens: usage.output_tokens ?? 0,
      estimated_cost: cost,
      stop_reason: res.stop_reason ?? null,
      request_id: res.id ?? null,
      model: res.model ?? model,
    };
    if (res.stop_reason === "refusal") {
      await finish({ ...usageFields, status: "failed", error_message: "The model declined this request." });
      return { ok: false, error: "The model declined this request.", runId, retryable: false };
    }
    if (res.stop_reason === "max_tokens") {
      await finish({ ...usageFields, status: "failed", error_message: "Output was cut off (max_tokens)." });
      return { ok: false, error: "The AI output was cut off before it finished.", runId, retryable: true };
    }
    // Validate again: the SDK parse is not the last line of defence.
    const checked = call.schema.safeParse(res.parsed_output);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      await finish({ ...usageFields, status: "rejected_output", error_message: `Schema validation failed at ${issue?.path.join(".")}: ${issue?.message}` });
      return { ok: false, error: "The AI response did not match the required format and was discarded.", runId, retryable: true };
    }
    await finish({ ...usageFields, status: "succeeded" });
    return { ok: true, data: checked.data, runId, cost };
  } catch (err) {
    const retryable =
      !(err instanceof AiDisabledError) &&
      !(err instanceof Anthropic.BadRequestError) &&
      !(err instanceof Anthropic.AuthenticationError) &&
      !(err instanceof Anthropic.PermissionDeniedError);
    const message =
      err instanceof AiDisabledError ? "AI is not configured (ANTHROPIC_API_KEY missing)."
      : err instanceof Anthropic.AuthenticationError ? "The Anthropic API key was rejected."
      : err instanceof Anthropic.RateLimitError ? "Anthropic rate limit reached; will retry."
      : err instanceof Anthropic.APIError ? `Anthropic API error ${err.status ?? ""}`.trim()
      : err instanceof Error ? err.message : "Unknown AI error";
    log.error("ai_run_failed", { task: call.task, message });
    await finish({ status: "failed", error_message: message.slice(0, 2000) });
    return { ok: false, error: message, runId, retryable };
  }
}
