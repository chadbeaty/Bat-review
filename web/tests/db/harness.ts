// Test harness: builds a throwaway Postgres database from the real migrations, then runs queries as a
// specific user, an anonymous visitor, or the server, the same way Supabase's API would.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const ROOT = join(__dirname, "..", "..", "supabase");
export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/postgres?host=/tmp";

export type Actor = { id: string } | "anon" | "service";

function sqlFiles(): string[] {
  const migrations = readdirSync(join(ROOT, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(ROOT, "migrations", f));
  return [join(ROOT, "tests", "supabase_stub.sql"), ...migrations, join(ROOT, "seed.sql"), join(ROOT, "seed", "catalog.sql")];
}

export async function canConnect(): Promise<boolean> {
  const c = new Client({ connectionString: ADMIN_URL });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

export class TestDb {
  name = `mp_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  client!: Client;

  async setup() {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`create database ${this.name}`);
    await admin.end();
    this.client = new Client({ connectionString: ADMIN_URL.replace(/\/postgres(\?|$)/, `/${this.name}$1`) });
    await this.client.connect();
    await this.client.query("set client_min_messages = warning");
    for (const file of sqlFiles()) await this.client.query(readFileSync(file, "utf8"));
  }

  async teardown() {
    await this.client?.end();
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`drop database if exists ${this.name} with (force)`);
    await admin.end();
  }

  /** Creates an auth user (which also creates their profile through the signup trigger). */
  async createUser(meta: Record<string, unknown> = {}): Promise<{ id: string }> {
    const id = randomUUID();
    await this.client.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
      id,
      `${id.slice(0, 8)}@example.test`,
      meta,
    ]);
    return { id };
  }

  /** Runs a query as the given actor inside its own transaction, like a single API request. */
  async as<T = Record<string, unknown>>(actor: Actor, text: string, params: unknown[] = []): Promise<T[]> {
    const role = actor === "anon" ? "anon" : actor === "service" ? "service_role" : "authenticated";
    const claims = actor === "anon" || actor === "service" ? { role } : { sub: actor.id, role };
    await this.client.query("begin");
    try {
      await this.client.query(`set local role ${role}`);
      await this.client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      const res = await this.client.query(text, params);
      await this.client.query("commit");
      return res.rows as T[];
    } catch (err) {
      await this.client.query("rollback");
      throw err;
    }
  }

  /** Runs SQL as the database owner (like a migration or the Supabase dashboard). */
  async owner<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    return (await this.client.query(text, params)).rows as T[];
  }
}
