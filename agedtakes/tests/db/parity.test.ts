// The newsroom UI and the database must agree on the workflow and the legal checklist.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";
import { CASE_STATUSES, canTransition } from "@/lib/editorial";
import { LEGAL_CHECKLIST } from "@/lib/editorial/legal";

const available = await canConnect();
const d = available ? describe : describe.skip;

d("TypeScript and SQL rules stay in sync", () => {
  const db = new TestDb();
  beforeAll(() => db.setup());
  afterAll(() => db.teardown());

  it("allows exactly the same case status transitions", async () => {
    const rows = await db.owner<{ f: string; t: string; ok: boolean }>(
      "select f, t, public.case_transition_allowed(f, t) as ok from unnest($1::text[]) f, unnest($1::text[]) t",
      [CASE_STATUSES as unknown as string[]]
    );
    const mismatches = rows.filter((r) => r.ok !== canTransition(r.f as never, r.t as never));
    expect(mismatches).toEqual([]);
  });

  it("uses the same legal checklist items", async () => {
    const [row] = await db.owner<{ items: string[] }>("select public.legal_checklist_items() as items");
    expect(row.items).toEqual(LEGAL_CHECKLIST.map((i) => i.key));
  });
});
