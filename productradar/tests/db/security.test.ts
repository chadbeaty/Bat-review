import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canConnect, TestDb } from "./harness";

// Migrations, Row Level Security and the database functions, on a real Postgres built from the migrations.

const db = new TestDb();
let available = false;

beforeAll(async () => {
  available = await canConnect();
  if (available) await db.setup();
});
afterAll(async () => {
  if (available) await db.teardown();
});

const maybe = (name: string, fn: () => Promise<void>) => it(name, async (ctx) => (available ? fn() : ctx.skip()));

async function product(name: string, slug = name.replace(/\s+/g, "-")) {
  const [p] = await db.owner<{ id: string }>("insert into products (canonical_name, slug) values ($1, $2) returning id", [name, slug]);
  await db.owner("insert into product_aliases (product_id, alias, alias_normalized, source) values ($1, $2, $2, 'mention')", [p.id, name]);
  return p.id;
}

describe("seed data", () => {
  maybe("only verified creators are active, and the constraint enforces it", async () => {
    const rows = await db.owner<{ verification_status: string; is_active: boolean }>("select verification_status, is_active from creators");
    expect(rows.length).toBe(20);
    expect(rows.filter((r) => r.is_active).every((r) => r.verification_status === "verified")).toBe(true);
    await expect(db.owner("update creators set is_active = true where verification_status = 'unresolved'")).rejects.toThrow(/creators_active_needs_verified/);
  });

  maybe("default settings exist and scoring weights add to 100", async () => {
    const [w] = await db.owner<{ value: Record<string, number> }>("select value from app_settings where key = 'scoring_weights'");
    expect(Object.values(w.value).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("row level security", () => {
  maybe("anonymous visitors and signed-in strangers see nothing", async () => {
    await product("magnetic bag sealer");
    const stranger = await db.createUser();
    for (const actor of ["anon" as const, stranger]) {
      expect(await db.as(actor, "select * from products")).toHaveLength(0);
      expect(await db.as(actor, "select * from creators")).toHaveLength(0);
      expect(await db.as(actor, "select * from app_settings")).toHaveLength(0);
    }
  });

  maybe("members can read research data but not change settings or creators", async () => {
    const member = await db.createUser("member");
    expect((await db.as(member, "select * from products")).length).toBeGreaterThan(0);
    expect(await db.as(member, "update app_settings set value = '{}'::jsonb where key = 'ai' returning key")).toHaveLength(0);
    expect(await db.as(member, "update creators set is_active = false returning id")).toHaveLength(0);
    await expect(db.as(member, "insert into creators (display_name) values ('x')")).rejects.toThrow(/row-level security/);
  });

  maybe("the owner can change settings, and the change is audited", async () => {
    const owner = await db.createUser("owner");
    const rows = await db.as(owner, `update app_settings set value = jsonb_set(value, '{daily_budget_usd}', '2') where key = 'ai' returning key`);
    expect(rows).toHaveLength(1);
    const audit = await db.owner<{ actor_id: string; entity: string }>("select actor_id, entity from audit_log where entity = 'app_settings' order by created_at desc limit 1");
    expect(audit[0]).toMatchObject({ actor_id: owner.id, entity: "app_settings" });
  });

  maybe("watchlists are private to each person", async () => {
    const a = await db.createUser("member");
    const b = await db.createUser("member");
    const pid = await product("heated eyelash curler");
    await db.as(a, "insert into watchlists (user_id, product_id, status) values ($1, $2, 'testing')", [a.id, pid]);
    expect(await db.as(b, "select * from watchlists")).toHaveLength(0);
    await expect(db.as(b, "insert into watchlists (user_id, product_id) values ($1, $2)", [a.id, pid])).rejects.toThrow(/row-level security/);
    expect(await db.as(a, "select * from watchlists")).toHaveLength(1);
  });

  maybe("members cannot promote themselves to owner", async () => {
    const m = await db.createUser("member");
    await expect(db.as(m, "update users set role = 'owner' where id = $1", [m.id])).rejects.toThrow(/row-level security/);
  });

  maybe("rate limit table is not reachable by signed-in users", async () => {
    const m = await db.createUser("member");
    expect(await db.as(m, "select * from rate_limits")).toHaveLength(0);
  });
});

describe("database functions", () => {
  maybe("bootstrap_owner only works while no owner exists", async () => {
    const fresh = new TestDb();
    await fresh.setup();
    try {
      const first = await fresh.createUser();
      const second = await fresh.createUser();
      expect((await fresh.as("service", "select bootstrap_owner($1, $2) as ok", [first.id, first.email]))[0].ok).toBe(true);
      expect((await fresh.as("service", "select bootstrap_owner($1, $2) as ok", [second.id, second.email]))[0].ok).toBe(false);
      const owners = await fresh.owner("select id from users where role = 'owner'");
      expect(owners).toEqual([{ id: first.id }]);
      await expect(fresh.as("anon", "select bootstrap_owner($1, $2)", [second.id, second.email])).rejects.toThrow(/permission denied/);
    } finally {
      await fresh.teardown();
    }
  });

  maybe("match_product_candidates finds products sold under similar names, ignoring search terms", async () => {
    const pid = await product("handheld bag sealer");
    await db.owner("insert into product_aliases (product_id, alias, alias_normalized, source) values ($1, 'kitchen gadget', 'kitchen gadget', 'search_term')", [pid]);
    const rows = await db.as<{ product_id: string; similarity: number }>("service", "select * from match_product_candidates(array['mini handheld bag sealer'], 5)");
    expect(rows[0].product_id).toBe(pid);
    const viaSearchTerm = await db.as<{ product_id: string }>("service", "select * from match_product_candidates(array['kitchen gadget'], 5)");
    expect(viaSearchTerm.map((r) => r.product_id)).not.toContain(pid);
  });

  maybe("merge_products moves mentions, names and watchlists, and only the owner may run it", async () => {
    const owner = await db.createUser("owner");
    const member = await db.createUser("member");
    const keep = await product("portable blender bottle");
    const dup = await product("usb rechargeable juicer cup");
    await db.owner("insert into product_mentions (product_id, platform, url, mentioned_name, observed_at) values ($1, 'youtube', 'https://youtu.be/x', 'juicer cup', now() - interval '2 days')", [dup]);
    await db.owner("insert into watchlists (user_id, product_id) values ($1, $2)", [member.id, dup]);
    await expect(db.as(member, "select merge_products($1, $2)", [dup, keep])).rejects.toThrow(/Only the owner/);
    await db.as(owner, "select merge_products($1, $2)", [dup, keep]);
    const [p] = await db.owner<{ status: string; merged_into: string }>("select status, merged_into from products where id = $1", [dup]);
    expect(p).toEqual({ status: "merged", merged_into: keep });
    expect(await db.owner("select id from product_mentions where product_id = $1", [keep])).toHaveLength(1);
    const aliases = await db.owner<{ alias: string }>("select alias from product_aliases where product_id = $1", [keep]);
    expect(aliases.map((a) => a.alias)).toContain("usb rechargeable juicer cup");
    expect(await db.owner("select 1 from watchlists where product_id = $1", [keep])).toHaveLength(1);
    const [first] = await db.owner<{ first_observed_platform: string }>("select first_observed_platform from products where id = $1", [keep]);
    expect(first.first_observed_platform).toBe("youtube");
  });

  maybe("only one running job per lock key", async () => {
    await db.owner("insert into ingestion_jobs (job_type, lock_key) values ('ingest_cycle', 'ingest_cycle')");
    await expect(db.owner("insert into ingestion_jobs (job_type, lock_key) values ('ingest_cycle', 'ingest_cycle')")).rejects.toThrow(/ingestion_jobs_one_running/);
    await db.owner("update ingestion_jobs set status = 'succeeded' where lock_key = 'ingest_cycle'");
    await db.owner("insert into ingestion_jobs (job_type, lock_key) values ('ingest_cycle', 'ingest_cycle')");
    await db.owner("delete from ingestion_jobs");
  });

  maybe("rate limiter counts within a window", async () => {
    const hit = async () => (await db.as<{ ok: boolean }>("service", "select hit_rate_limit('t:1', 2, 60) as ok"))[0].ok;
    expect([await hit(), await hit(), await hit()]).toEqual([true, true, false]);
  });

  maybe("alerts are unique per fingerprint, so repeats are impossible", async () => {
    const pid = await product("led shower head");
    await db.owner("insert into product_alerts (product_id, alert_type, fingerprint) values ($1, 'score_80', 'x:score:8')", [pid]);
    await expect(db.owner("insert into product_alerts (product_id, alert_type, fingerprint) values ($1, 'score_80', 'x:score:8')", [pid])).rejects.toThrow(/duplicate key/);
  });
});
