# Aged Takes — architecture

```
Browser ──► Vercel (Next.js 16)
             ├─ Public pages (server-rendered, ISR-cached) ──► Supabase public read API (api_* SQL functions, run as anon → RLS)
             ├─ Newsroom /admin (server components + server actions) ──► Supabase as the signed-in staff member (RLS + triggers)
             ├─ Cron endpoints /api/cron/* (bearer secret) ──► job runner ──► Supabase (service role) + Claude API + source connectors
             └─ Email ──► Resend
```

## Data model (supabase/migrations)
- **people**, **categories**, **person_categories** — tracked public figures. Status: draft, research_candidate, active (public), archived.
- **evidence_sources** (+ private **source_snapshots** with full text and SHA-256 hash) — provenance for every claim.
- **statements** — exact quotes with type (opinion / prediction / explicit commitment / documented action / factual claim), date precision, context, conditions, verification; public only when verified, dated and sourced.
- **predictions** + **prediction_outcomes** — original wording, target, currency, direction, deadline, resolution criteria, provider; outcomes are proposed (by editors, the system or AI) and confirmed only by editors.
- **cases** + **case_evidence** (role, classification, what it proves / doesn't, identity established) + **case_timeline_events** + **subject_responses** + **editorial_reviews** + **corrections**.
- **transactions**, **wallets**, **wallet_events** — documented activity with owner (self, spouse, entity…) and wallet attribution status.
- Operations: **monitored_sources**, **source_items**, **research_jobs**, **ingestion_jobs**, **ai_runs**, **submissions**, **newsletter_subscribers**, **newsletter_issues**, **user_follows**, **audit_logs**, **site_settings**, **methodology_versions**, **rate_limits**, **profiles**.

## Security model
1. **Public read API**: every public page calls one `api_*` function (SECURITY INVOKER) as the anonymous role, so RLS
   decides what's visible: published cases, active people, public statements/predictions, cited sources, confirmed outcomes,
   public corrections; demo rows only while demo content is on.
2. **Staff writes** use the staff member's own Supabase session. RLS requires an active staff role and two-step verification
   (`aal2`, unless an admin disables the requirement). `auth.uid()` attributes every change in the audit log.
3. **Jobs** use the service role. Triggers still apply: the service role cannot approve, publish, resolve predictions, make
   statements/predictions public or confirm outcomes — those require `auth.uid()` to be an editor.
4. **Editorial triggers** (`*_editorial_rules.sql`): transition table, approval preconditions (evidence, classification,
   legal checklist, summary/article), typed publish confirmation (`publish_case`), auto-demotion on edits after approval,
   correction-only edits to published cases (`correct_published_case`), immutable public predictions/statements
   (`correct_prediction`, `correct_statement`), early-resolution reasons, newsletter = published cases only, append-only
   audit/corrections/reviews.

## AI research engine (src/lib/ai, src/lib/jobs, src/lib/connectors)
| Agent | Input | Output | Safeguards in code |
| --- | --- | --- | --- |
| A. Source Monitor | Connector items | worth_extracting per item | Connectors respect robots.txt, paywalls, API terms |
| B. Statement Extraction | Stored source text + tracked people | Statements with exact quotes, type, dates, prediction details | Quote must appear verbatim in the source text; unknown speakers rejected; stored as internal + unverified |
| C. Historical Matching | New statement + person's history | Candidate stories with reasons it may not be a story | Accusatory terms flagged; opens cases only in research statuses |
| D. Evidence Assessment | Case file + source texts | Per-source classification, proves / doesn't prove, limitations | Conservative classification; only for cases still in research |
| E. Investigation Draft | Case file | Headline, summary, article, chronology, limitations, questions for editor | Quotes not found verbatim are flagged; stops at Needs review |
| F. Prediction Resolution | Prediction + price series or attached sources | Proposed outcome with methodology | Never "incorrect" before the deadline; editors confirm |
| G. Editorial Distribution | Approved case | Social headline/post, newsletter summary, SEO description, graphic text | Refuses unapproved cases; flags accusatory language |

All calls go through `runAgent` (`src/lib/ai/client.ts`): budget check → Claude (structured output, Zod) → validation →
`ai_runs` record. Tests: `tests/unit/ai.test.ts`, `tests/db/editorial.test.ts` ("AI-generated cases cannot be published without human approval").

## Adding a data source
Implement `SourceConnector` (`src/lib/connectors/types.ts`) and register it in `src/lib/connectors/index.ts`; add the id to
the `connector` check in `monitored_sources` with a new migration. Nothing else changes.

## Expanding beyond finance
Nothing in the schema is finance-specific: `asset_or_topic`, case types, categories and statement types work for
politicians, executives, athletes and entertainers. Add categories in the database and new case types with a migration.
