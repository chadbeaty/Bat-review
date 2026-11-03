import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { log } from "@/lib/log";
import type { CasePage, CaseCard, CorrectionItem, Filters, HomePage, Paged, PersonCard, PersonPage, Prediction, SearchResult, Statement } from "./types";

// Every public page reads through these functions. They call the public read API as an anonymous visitor, so
// Row Level Security guarantees that nothing unpublished can appear, whatever a caller passes in.

export class DataUnavailableError extends Error {}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const db = createPublicClient();
  if (!db) return null;
  const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== ""));
  const { data, error } = await db.rpc(fn, clean);
  if (error) {
    log.error("public_rpc_failed", { fn, code: error.code, message: error.message });
    throw new DataUnavailableError("The archive is temporarily unavailable.");
  }
  return data as T;
}

const page = (p: number | undefined, size: number) => ({ p_limit: size, p_offset: Math.max(0, ((p ?? 1) - 1) * size) });

export const getHome = cache(() => rpc<HomePage>("api_home"));
export const getFilters = cache(() => rpc<Filters>("api_filters"));
export const getPerson = cache((slug: string) => rpc<PersonPage>("api_person", { p_slug: slug }));
export const getCase = cache((slug: string) => rpc<CasePage>("api_case", { p_slug: slug }));
export const getNeverSell = cache(() => rpc<{ commitments: Statement[]; cases: CaseCard[] }>("api_never_sell"));
export const getSitemapData = () => rpc<{ people: { slug: string; updated_at: string }[]; cases: { slug: string; updated_at: string }[] }>("api_sitemap");

export const PEOPLE_PAGE_SIZE = 24;
export function listPeople(opts: { q?: string; category?: string; sort?: string; page?: number }) {
  return rpc<Paged<PersonCard>>("api_people", { p_query: opts.q, p_category: opts.category, p_sort: opts.sort ?? "recent", ...page(opts.page, PEOPLE_PAGE_SIZE) });
}

export const CASES_PAGE_SIZE = 20;
export function listCases(opts: { q?: string; person?: string; category?: string; type?: string; confidence?: string; resolved?: string; from?: string; to?: string; page?: number }) {
  return rpc<Paged<CaseCard>>("api_cases", {
    p_query: opts.q, p_person: opts.person, p_category: opts.category, p_type: opts.type, p_confidence: opts.confidence,
    p_resolved: opts.resolved, p_from: opts.from, p_to: opts.to, ...page(opts.page, CASES_PAGE_SIZE),
  });
}

export const PREDICTIONS_PAGE_SIZE = 30;
export function listPredictions(opts: { status?: string; person?: string; q?: string; page?: number }) {
  return rpc<Paged<Prediction> & { counts: Record<string, number> }>("api_predictions", {
    p_status: opts.status, p_person: opts.person, p_query: opts.q, ...page(opts.page, PREDICTIONS_PAGE_SIZE),
  });
}

export function listCorrections(pageNumber?: number) {
  return rpc<Paged<CorrectionItem>>("api_corrections", page(pageNumber, 50));
}

export async function searchArchive(q: string, kinds?: string[]): Promise<SearchResult[]> {
  if (!q.trim()) return [];
  return (await rpc<SearchResult[]>("search_archive", { p_query: q.slice(0, 200), p_kinds: kinds, p_limit: 40 })) ?? [];
}
