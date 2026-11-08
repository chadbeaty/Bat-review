// TEST ONLY. A small stand-in for the parts of supabase-js the background jobs use, backed by a real Postgres
// database that has the real migrations applied. Queries run as the service role (as the jobs do in production),
// so constraints, triggers and database functions behave exactly as they would on Supabase.
// Supported: select (with simple embedded relations), insert/update/upsert/delete, the filters and modifiers
// the app uses, count/head, single/maybeSingle, and rpc().

import pg, { type Client } from "pg";

pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric → number (PostgREST sends JSON numbers)
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // bigint → number
const ts = (v: string | null) => {
  if (v === null) return null;
  let s = v.replace(" ", "T");
  if (/[+-]\d\d$/.test(s)) s += ":00";
  return s;
};
pg.types.setTypeParser(1184, ts);
pg.types.setTypeParser(1114, ts);

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type Filter = { sql: (p: Param) => string };
type Param = (v: unknown) => string;

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`Unsafe identifier: ${s}`);
  return `"${s}"`;
};

type ColumnInfo = { type: string };
type Fk = { name: string; table: string; columns: string[]; refTable: string; refColumns: string[] };

export class PgSupabase {
  private cols = new Map<string, Map<string, ColumnInfo>>();
  private fks: Fk[] | null = null;
  constructor(private client: Client) {}

  async init() {
    await this.client.query("set role service_role");
    await this.client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
    await this.client.query("set timezone = 'UTC'");
    const { rows } = await this.client.query(`select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'`);
    for (const r of rows) {
      if (!this.cols.has(r.table_name)) this.cols.set(r.table_name, new Map());
      this.cols.get(r.table_name)!.set(r.column_name, { type: r.data_type });
    }
    const fk = await this.client.query(`
      select c.conname as name, t.relname as table, rt.relname as ref_table,
        array(select a.attname from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) as columns,
        array(select a.attname from unnest(c.confkey) k join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k) as ref_columns
      from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_class rt on rt.oid = c.confrelid
      join pg_namespace n on n.oid = t.relnamespace where c.contype = 'f' and n.nspname = 'public'`);
    this.fks = fk.rows.map((r) => ({ name: r.name, table: r.table, columns: r.columns, refTable: r.ref_table, refColumns: r.ref_columns }));
    return this;
  }

  from(table: string) {
    return new Query(this, table);
  }

  async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
    try {
      const { rows: meta } = await this.client.query(`select proretset, prorettype::regtype::text as rettype from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = $1 limit 1`, [fn]);
      if (!meta.length) return { data: null, error: { message: `function ${fn} not found` } };
      const names = Object.keys(args);
      const call = `public.${ident(fn)}(${names.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ")})`;
      const values = names.map((k) => args[k]);
      if (meta[0].proretset) {
        const { rows } = await this.client.query(`select * from ${call}`, values);
        return { data: rows, error: null };
      }
      const { rows } = await this.client.query(`select ${call} as r`, values);
      return { data: meta[0].rettype === "void" ? null : rows[0]?.r ?? null, error: null };
    } catch (e) {
      return { data: null, error: pgError(e) };
    }
  }

  columnType(table: string, col: string) {
    return this.cols.get(table)?.get(col)?.type;
  }
  hasTable(table: string) {
    return this.cols.has(table);
  }
  foreignKeys() {
    return this.fks ?? [];
  }
  query(text: string, values: unknown[]) {
    return this.client.query(text, values);
  }

  /** Lets the app code take this where it expects a SupabaseClient. */
  asClient<T>(): T {
    return this as unknown as T;
  }
}

function pgError(e: unknown): { message: string; code?: string } {
  const err = e as { message?: string; code?: string };
  return { message: err.message ?? String(e), code: err.code };
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

type Embed = { key: string; table: string; fk: string | null; cols: string };

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private limitN: number | null = null;
  private values: Row[] = [];
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private returning = false;
  private singleMode: "one" | "maybe" | null = null;
  private countMode = false;
  private head = false;

  constructor(private db: PgSupabase, private table: string) {}

  select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
    if (this.op === "select") this.columns = cols;
    else {
      this.returning = true;
      this.columns = cols;
    }
    if (opts.count) this.countMode = true;
    if (opts.head) this.head = true;
    return this;
  }
  insert(v: Row | Row[]) {
    this.op = "insert";
    this.values = Array.isArray(v) ? v : [v];
    return this;
  }
  upsert(v: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.values = Array.isArray(v) ? v : [v];
    this.upsertOpts = opts;
    return this;
  }
  update(v: Row) {
    this.op = "update";
    this.values = [v];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private add(sql: (p: Param) => string) {
    this.filters.push({ sql });
    return this;
  }
  eq(c: string, v: unknown) { return this.add((p) => `${ident(c)} = ${p(v)}`); }
  neq(c: string, v: unknown) { return this.add((p) => `${ident(c)} is distinct from ${p(v)}`); }
  gt(c: string, v: unknown) { return this.add((p) => `${ident(c)} > ${p(v)}`); }
  gte(c: string, v: unknown) { return this.add((p) => `${ident(c)} >= ${p(v)}`); }
  lt(c: string, v: unknown) { return this.add((p) => `${ident(c)} < ${p(v)}`); }
  lte(c: string, v: unknown) { return this.add((p) => `${ident(c)} <= ${p(v)}`); }
  in(c: string, v: unknown[]) { return this.add((p) => (v.length ? `${ident(c)} in (${v.map((x) => p(x)).join(", ")})` : "false")); }
  is(c: string, v: null | boolean) { return this.add(() => `${ident(c)} is ${v === null ? "null" : v ? "true" : "false"}`); }
  ilike(c: string, v: string) { return this.add((p) => `${ident(c)} ilike ${p(v)}`); }
  not(c: string, op: string, v: unknown) {
    if (op === "is") return this.add(() => `${ident(c)} is not ${v === null ? "null" : String(v)}`);
    if (op === "in") {
      const list = String(v).replace(/^\(|\)$/g, "").split(",").map((s) => s.trim());
      return this.add((p) => `${ident(c)} not in (${list.map((x) => p(x)).join(", ")})`);
    }
    throw new Error(`not(${op}) unsupported in test adapter`);
  }
  or(expr: string) {
    const parts = expr.split(",").map((part) => {
      const [c, op, ...rest] = part.split(".");
      const val = rest.join(".");
      return { c, op, val };
    });
    return this.add((p) =>
      `(${parts
        .map(({ c, op, val }) => {
          if (op === "is") return `${ident(c)} is ${val === "null" ? "null" : val}`;
          const sym = { eq: "=", lt: "<", lte: "<=", gt: ">", gte: ">=" }[op];
          if (!sym) throw new Error(`or(${op}) unsupported`);
          return `${ident(c)} ${sym} ${p(val)}`;
        })
        .join(" or ")})`,
    );
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push({ col, asc: opts.ascending !== false, nullsFirst: opts.nullsFirst });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  singleRow() {
    this.singleMode = "one";
    return this;
  }

  then<A = Result, B = never>(onOk?: ((r: Result) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(onOk, onErr);
  }

  private params: unknown[] = [];
  private p: Param = (v) => {
    this.params.push(v);
    return `$${this.params.length}`;
  };

  private where() {
    return this.filters.length ? ` where ${this.filters.map((f) => f.sql(this.p)).join(" and ")}` : "";
  }

  private encode(col: string, v: unknown) {
    const t = this.db.columnType(this.table, col);
    if (t === "jsonb" || t === "json") return v === null || v === undefined ? v : JSON.stringify(v);
    return v;
  }

  private parseColumns(): { plain: string; embeds: Embed[] } {
    const parts = splitTop(this.columns);
    const plain: string[] = [];
    const embeds: Embed[] = [];
    for (const part of parts) {
      const m = part.match(/^(?:([a-z_]+):)?([a-z_]+)(?:!([a-z_]+))?\(([\s\S]*)\)$/);
      if (m) embeds.push({ key: m[1] ?? m[2], table: m[2], fk: m[3] ?? null, cols: m[4] });
      else plain.push(part === "*" ? "*" : ident(part));
    }
    return { plain: plain.length ? plain.join(", ") : "*", embeds };
  }

  private async run(): Promise<Result> {
    this.params = [];
    try {
      let sql: string;
      let embeds: Embed[] = [];
      const ret = () => {
        if (!this.returning) return "";
        const parsed = this.parseColumns();
        embeds = parsed.embeds;
        return ` returning ${parsed.plain === "*" || embeds.length ? "*" : parsed.plain}`;
      };
      if (this.op === "select") {
        const parsed = this.parseColumns();
        embeds = parsed.embeds;
        if (this.head) {
          const { rows } = await this.db.query(`select count(*)::int as n from public.${ident(this.table)}${this.where()}`, this.params);
          return { data: null, error: null, count: rows[0].n };
        }
        sql = `select ${embeds.length ? "*" : parsed.plain} from public.${ident(this.table)}${this.where()}`;
        if (this.orders.length) sql += ` order by ${this.orders.map((o) => `${ident(o.col)} ${o.asc ? "asc" : "desc"}${o.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last"}`).join(", ")}`;
        if (this.limitN !== null) sql += ` limit ${Number(this.limitN)}`;
      } else if (this.op === "insert" || this.op === "upsert") {
        const keys = [...new Set(this.values.flatMap((v) => Object.keys(v)))];
        const rowsSql = this.values.map((v) => `(${keys.map((k) => (k in v ? this.p(this.encode(k, v[k])) : "default")).join(", ")})`).join(", ");
        sql = `insert into public.${ident(this.table)} (${keys.map(ident).join(", ")}) values ${rowsSql}`;
        if (this.op === "upsert") {
          const conflict = (this.upsertOpts.onConflict ?? "id").split(",").map((s) => ident(s.trim())).join(", ");
          const updates = keys.filter((k) => !(this.upsertOpts.onConflict ?? "id").split(",").map((s) => s.trim()).includes(k));
          sql += this.upsertOpts.ignoreDuplicates || !updates.length ? ` on conflict (${conflict}) do nothing` : ` on conflict (${conflict}) do update set ${updates.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}`;
        }
        sql += ret();
      } else if (this.op === "update") {
        const v = this.values[0];
        sql = `update public.${ident(this.table)} set ${Object.keys(v).map((k) => `${ident(k)} = ${this.p(this.encode(k, v[k]))}`).join(", ")}${this.where()}${ret()}`;
      } else {
        sql = `delete from public.${ident(this.table)}${this.where()}${ret()}`;
      }
      const res = await this.db.query(sql, this.params);
      let rows = res.rows as Row[];
      if (embeds.length) rows = await this.attach(rows, embeds);
      if (this.op !== "select" && !this.returning) return { data: null, error: null };
      if (this.singleMode) {
        if (rows.length > 1) return { data: null, error: { message: "multiple rows returned", code: "PGRST116" } };
        if (!rows.length) return this.singleMode === "one" ? { data: null, error: { message: "no rows returned", code: "PGRST116" } } : { data: null, error: null };
        return { data: rows[0], error: null };
      }
      return { data: rows, error: null, count: this.countMode ? rows.length : null };
    } catch (e) {
      return { data: null, error: pgError(e) };
    }
  }

  private async attach(rows: Row[], embeds: Embed[]): Promise<Row[]> {
    const fks = this.db.foreignKeys();
    for (const e of embeds) {
      const forward = fks.find((f) => f.table === this.table && f.refTable === e.table && (!e.fk || f.name === e.fk));
      const backward = !forward ? fks.find((f) => f.table === e.table && f.refTable === this.table && (!e.fk || f.name === e.fk)) : undefined;
      if (!forward && !backward) throw new Error(`No relationship between ${this.table} and ${e.table}`);
      const localCol = forward ? forward.columns[0] : backward!.refColumns[0];
      const remoteCol = forward ? forward.refColumns[0] : backward!.columns[0];
      const keys = [...new Set(rows.map((r) => r[localCol]).filter((v) => v !== null && v !== undefined))];
      let related: Row[] = [];
      if (keys.length) {
        const { rows: rr } = await this.db.query(`select * from public.${ident(e.table)} where ${ident(remoteCol)} = any($1)`, [keys]);
        related = rr;
      }
      const pick = (r: Row) => {
        if (e.cols.trim() === "*") return r;
        const o: Row = {};
        for (const c of splitTop(e.cols)) o[c] = r[c];
        return o;
      };
      for (const r of rows) {
        const matches = related.filter((x) => x[remoteCol] === r[localCol]).map(pick);
        r[e.key] = forward ? (matches[0] ?? null) : matches;
      }
    }
    if (this.columns.trim() !== "*" && !this.columns.includes("*")) {
      const wanted = splitTop(this.columns).map((c) => c.match(/^(?:([a-z_]+):)?([a-z_]+)/)!).map((m) => m[1] ?? m[2]);
      return rows.map((r) => Object.fromEntries(wanted.map((k) => [k, r[k]])));
    }
    return rows;
  }
}

// supabase-js calls it .single(); the class can't have a method and a field with that name, so alias it here.
(Query.prototype as unknown as { single: () => unknown }).single = Query.prototype.singleRow;

export async function connectPgSupabase(client: Client) {
  return new PgSupabase(client).init();
}
