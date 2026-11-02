import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { searchTerm } from "@/lib/admin/validation";
import { AdminTitle, Badge, Empty, Pager, Table, dateOnly, pageNumber, param } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Members" };

const PAGE_SIZE = 50;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireStaff("any", "/admin/users");
  const params = await searchParams;
  const q = searchTerm(param(params, "q"));
  const status = ["active", "suspended", "banned"].includes(param(params, "status")) ? param(params, "status") : "";
  const page = pageNumber(params);

  const db = adminDb();
  let query = db
    .from("profiles")
    .select("id, username, display_name, email, account_status, seller_verified, created_at")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (q) query = query.or(`username.ilike.%${q}%,email.ilike.%${q}%`);
  if (status) query = query.eq("account_status", status);
  const { data, error } = await query;
  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const ids = rows.map((r) => r.id);
  const { data: roleRows } = ids.length ? await db.from("user_roles").select("user_id, role").in("user_id", ids) : { data: [] };
  const roles = new Map<string, string[]>();
  for (const r of roleRows ?? []) roles.set(r.user_id, [...(roles.get(r.user_id) ?? []), r.role]);

  return (
    <>
      <AdminTitle title="Members" intro="Search by username or email. Open a member to suspend them or change staff roles." />
      <form className="flex flex-wrap items-end gap-3" role="search">
        <label className="field">
          <span className="text-sm">Username or email</span>
          <input name="q" defaultValue={q} className="input w-64" />
        </label>
        <label className="field">
          <span className="text-sm">Status</span>
          <select name="status" defaultValue={status} className="input">
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </label>
        <button className="btn btn-primary">Search</button>
      </form>

      {error ? (
        <p className="text-danger">Search failed: {error.message}</p>
      ) : rows.length === 0 ? (
        <Empty>No members match.</Empty>
      ) : (
        <Table label="Members">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Status</th>
              <th>Roles</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/admin/users/${u.id}`} className="font-medium underline">
                    @{u.username}
                  </Link>
                  {u.display_name && <span className="block text-xs text-ink-soft">{u.display_name}</span>}
                </td>
                <td className="break-all">{u.email}</td>
                <td>
                  <Badge tone={u.account_status === "active" ? "good" : "bad"}>{u.account_status}</Badge>
                </td>
                <td>{(roles.get(u.id) ?? []).join(", ") || "—"}</td>
                <td className="whitespace-nowrap">{dateOnly(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager basePath="/admin/users" params={{ q, status }} page={page} hasMore={(data ?? []).length > PAGE_SIZE} />
    </>
  );
}
