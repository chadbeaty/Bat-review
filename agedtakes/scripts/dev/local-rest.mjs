// LOCAL PREVIEW ONLY. A tiny stand-in for Supabase's REST endpoint that answers the public read API
// (POST /rest/v1/rpc/api_* and search_archive) from a local Postgres database, running every query as the
// anonymous visitor role so Row Level Security applies exactly as in production.
//
// Use it to preview the public site without a Supabase project:
//   1. Load the stub, migrations and seed into a local database (see docs/LOCAL_DEVELOPMENT.md).
//   2. LOCAL_DATABASE_URL=postgres://... node scripts/dev/local-rest.mjs
//   3. NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-preview-anon-key-000000 npm run dev
// It never handles sign-in, writes or the service role. Do not deploy it.

import http from "node:http";
import pg from "pg";

const url = process.env.LOCAL_DATABASE_URL;
if (!url) {
  console.error("Set LOCAL_DATABASE_URL to your local Postgres database.");
  process.exit(1);
}
const port = Number(process.env.PORT ?? 54321);
const pool = new pg.Pool({ connectionString: url, max: 5 });

const ALLOWED = new Set(["api_home", "api_people", "api_person", "api_cases", "api_case", "api_predictions", "api_never_sell", "api_corrections", "api_filters", "api_sitemap", "search_archive"]);
const SET_RETURNING = new Set(["search_archive"]);

async function callRpc(fn, args) {
  const names = Object.keys(args).filter((k) => /^p_[a-z_]+$/.test(k));
  const params = names.map((k) => args[k]);
  const call = `public.${fn}(${names.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role anon");
    await client.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
    const sql = SET_RETURNING.has(fn) ? `select * from ${call}` : `select ${call} as result`;
    const res = await client.query(sql, params);
    await client.query("commit");
    return SET_RETURNING.has(fn) ? res.rows : res.rows[0]?.result ?? null;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

http
  .createServer(async (req, res) => {
    const match = req.url?.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
    if (!match || req.method !== "POST" || !ALLOWED.has(match[1])) {
      res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ message: "Not available in local preview" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const result = await callRpc(match[1], body ? JSON.parse(body) : {});
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ code: err.code, message: err.message }));
    }
  })
  .listen(port, () => console.log(`Local preview REST on http://localhost:${port} (anon role only)`));
