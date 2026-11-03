import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfig } from "@/lib/env";
import { estimateCost, type Usage } from "@/lib/ai/pricing";
import { log } from "@/lib/log";

// One place where the app talks to Claude. Server-side only; the API key never reaches a browser.
// Every call: checks the daily budget, asks for structured JSON validated against a Zod schema, handles refusals
// and truncation, and records an ai_runs row (tokens, estimated cost, output, errors) for the usage dashboard.

export type AgentName = "source_monitor" | "statement_extraction" | "historical_matching" | "evidence_assessment" | "investigation_draft" | "prediction_resolution" | "editorial_distribution";

/** The subset of the SDK the agents use, so tests can supply a fake. */
export type ClaudeLike = {
  beta: { messages: { parse: (params: never, options?: never) => Promise<unknown> } };
};

export type AgentCall<T extends z.ZodType> = {
  agent: AgentName;
  jobType: string;
  promptVersion: string;
  system: string;
  input: string;
  schema: T;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  researchJobId?: string | null;
  caseId?: string | null;
  inputSummary: string;
};

export type AgentResult<T> = { ok: true; data: T; runId: string | null; cost: number } | { ok: false; error: string; runId: string | null; retryable: boolean };

export class AiDisabledError extends Error {}

let sdk: Anthropic | null = null;
function defaultClient(): ClaudeLike {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiDisabledError("ANTHROPIC_API_KEY is not set");
  sdk ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 5 * 60_000 });
  return sdk as unknown as ClaudeLike;
}

async function budgetRemaining(db: SupabaseClient): Promise<{ ok: boolean; spent: number; budget: number }> {
  const [{ data: spent }, { data: setting }] = await Promise.all([
    db.rpc("ai_spend_today"),
    db.from("site_settings").select("value").eq("key", "ai_daily_budget_usd").maybeSingle(),
  ]);
  const budget = Number(setting?.value ?? 5);
  const s = Number(spent ?? 0);
  return { ok: s < budget, spent: s, budget };
}

type ParsedResponse = {
  id?: string;
  model?: string;
  stop_reason?: string | null;
  usage?: Usage;
  parsed_output?: unknown;
  content?: { type: string; text?: string }[];
};

export async function runAgent<T extends z.ZodType>(db: SupabaseClient, call: AgentCall<T>, client?: ClaudeLike): Promise<AgentResult<z.infer<T>>> {
  const model = aiConfig.model;
  const budget = await budgetRemaining(db);
  if (!budget.ok) {
    return { ok: false, error: `Daily AI budget reached ($${budget.spent.toFixed(2)} of $${budget.budget.toFixed(2)}). Raise it in Settings or wait until tomorrow (UTC).`, runId: null, retryable: false };
  }

  const { data: run } = await db.from("ai_runs").insert({
    job_type: call.jobType, agent: call.agent, model, prompt_version: call.promptVersion, research_job_id: call.researchJobId ?? null,
    case_id: call.caseId ?? null, input_summary: call.inputSummary.slice(0, 1000), status: "running",
  }).select("id").single();
  const runId = (run?.id as string | undefined) ?? null;
  const started = Date.now();

  const finish = async (fields: Record<string, unknown>) => {
    if (runId) await db.from("ai_runs").update({ ...fields, duration_ms: Date.now() - started }).eq("id", runId);
  };

  try {
    const c = client ?? defaultClient();
    const params = {
      model,
      max_tokens: call.maxTokens ?? 16000,
      // Server-side fallback: if a safety classifier declines, the API retries on a suitable model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: call.system,
      messages: [{ role: "user", content: call.input }],
      output_config: { format: betaZodOutputFormat(call.schema), effort: call.effort ?? "medium" },
    };
    const res = (await c.beta.messages.parse(params as never)) as ParsedResponse;
    const usage = res.usage ?? {};
    const cost = estimateCost(res.model ?? model, usage);
    const usageFields = {
      token_usage: usage, input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0,
      estimated_cost: cost, stop_reason: res.stop_reason ?? null, request_id: res.id ?? null, model: res.model ?? model,
    };

    if (res.stop_reason === "refusal") {
      await finish({ ...usageFields, status: "failed", error_message: "The model declined this request." });
      return { ok: false, error: "The model declined this request.", runId, retryable: false };
    }
    if (res.stop_reason === "max_tokens") {
      await finish({ ...usageFields, status: "failed", error_message: "Output was cut off (max_tokens)." });
      return { ok: false, error: "The AI output was cut off before it finished.", runId, retryable: true };
    }
    // Validate again here: the SDK parse is not the last line of defence.
    const checked = call.schema.safeParse(res.parsed_output);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      await finish({ ...usageFields, status: "rejected_output", error_message: `Schema validation failed at ${issue?.path.join(".")}: ${issue?.message}` });
      return { ok: false, error: "The AI response did not match the required format and was discarded.", runId, retryable: true };
    }
    await finish({ ...usageFields, status: "succeeded", output: checked.data as object, output_summary: summarize(checked.data) });
    return { ok: true, data: checked.data, runId, cost };
  } catch (err) {
    const retryable = !(err instanceof AiDisabledError) && !(err instanceof Anthropic.BadRequestError) && !(err instanceof Anthropic.AuthenticationError) && !(err instanceof Anthropic.PermissionDeniedError);
    const message =
      err instanceof AiDisabledError ? "AI research is not configured (ANTHROPIC_API_KEY missing)."
      : err instanceof Anthropic.AuthenticationError ? "The Anthropic API key was rejected."
      : err instanceof Anthropic.RateLimitError ? "Anthropic rate limit reached; will retry."
      : err instanceof Anthropic.APIError ? `Anthropic API error ${err.status ?? ""}`.trim()
      : err instanceof Error ? err.message : "Unknown AI error";
    log.error("ai_run_failed", { agent: call.agent, message });
    await finish({ status: "failed", error_message: message.slice(0, 2000) });
    return { ok: false, error: message, runId, retryable };
  }
}

function summarize(data: unknown): string {
  try {
    return JSON.stringify(data).slice(0, 500);
  } catch {
    return "";
  }
}
