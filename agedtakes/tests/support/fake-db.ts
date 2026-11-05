// A minimal stand-in for the Supabase client: chainable query builders that resolve to canned rows, and a log of
// every insert/update/rpc so tests can assert what the code tried to write.

type Row = Record<string, unknown>;
export type Call = { table: string; op: "insert" | "update" | "upsert" | "delete" | "select"; values?: unknown; filters: [string, unknown][] };

export function fakeDb(tables: Record<string, Row[]> = {}, rpc: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];
  function builder(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    let pushed = false;
    const record = () => {
      if (!pushed) {
        calls.push(call);
        pushed = true;
      }
    };
    const rows = () => {
      let r = tables[table] ?? [];
      for (const [k, v] of call.filters) r = r.filter((x) => x[k] === v);
      return r;
    };
    const result = () => {
      record();
      if (call.op === "insert" || call.op === "upsert") {
        const v = Array.isArray(call.values) ? call.values : [call.values];
        return { data: v.map((x, i) => ({ id: `new-${table}-${calls.length}-${i}`, ...(x as Row) })), error: null };
      }
      return { data: rows(), error: null };
    };
    const b: Record<string, unknown> = {};
    const chain = (...names: string[]) => names.forEach((n) => (b[n] = () => b));
    chain("select", "order", "limit", "neq", "in", "gte", "lte", "not", "or", "ilike", "is");
    b.eq = (k: string, v: unknown) => {
      call.filters.push([k, v]);
      return b;
    };
    for (const op of ["insert", "update", "upsert", "delete"] as const) {
      b[op] = (values?: unknown) => {
        call.op = op;
        call.values = values;
        return b;
      };
    }
    b.single = async () => {
      const r = result();
      const first = Array.isArray(r.data) ? r.data[0] : r.data;
      return { data: first ?? null, error: first ? null : { message: "not found" } };
    };
    b.maybeSingle = async () => {
      const r = result();
      return { data: (Array.isArray(r.data) ? r.data[0] : r.data) ?? null, error: null };
    };
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return b;
  }
  const db = {
    from: (table: string) => builder(table),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return { data: rpc[fn] ?? null, error: null };
    },
  };
  return { db: db as never, calls, rpcCalls };
}
