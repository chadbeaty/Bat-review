import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { readFlash } from "@/lib/admin/action";
import { hasAccess, STAFF_ROLES } from "@/lib/admin/roles";
import { uuid } from "@/lib/admin/validation";
import { AdminTitle, Badge, Flash, ReturnTo, SubmitButton, Table, dateTime, param } from "@/components/admin/ui";
import { confirmBan, setAccountStatus, setRole } from "../actions";

export const metadata: Metadata = { title: "Member" };

export default async function UserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const staff = await requireStaff("any", `/admin/users/${id}`);
  if (!uuid.safeParse(id).success) notFound();
  const sp = await searchParams;
  const db = adminDb();
  const [{ data: profile }, { data: roleRows }, { count: listingCount }, { data: audit }] = await Promise.all([
    db.from("profiles").select("id, username, display_name, email, city, state, account_status, seller_verified, identity_verified, created_at").eq("id", id).maybeSingle(),
    db.from("user_roles").select("role, created_at").eq("user_id", id),
    db.from("equipment_listings").select("id", { count: "exact", head: true }).eq("seller_id", id).eq("listing_status", "active"),
    db.from("audit_logs").select("id, action, actor_user_id, metadata, created_at").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!profile) notFound();
  const roles = (roleRows ?? []).map((r) => r.role as string);
  const path = `/admin/users/${id}`;
  const canModerate = hasAccess(staff.roles, ["moderator"]);
  const isAdmin = staff.roles.includes("admin");
  const self = staff.user.id === id;
  const confirmingBan = param(sp, "confirm") === "ban";

  return (
    <>
      <p className="text-sm">
        <Link href="/admin/users" className="underline">
          Members
        </Link>
      </p>
      <AdminTitle title={`@${profile.username}`} intro={profile.display_name ?? undefined}>
        <Badge tone={profile.account_status === "active" ? "good" : "bad"}>{profile.account_status}</Badge>
      </AdminTitle>
      <Flash flash={readFlash(sp)} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card grid content-start gap-2 p-4">
          <h2 className="font-semibold">Profile</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-soft">Email</dt>
            <dd className="break-all">{profile.email}</dd>
            <dt className="text-ink-soft">Location</dt>
            <dd>{[profile.city, profile.state].filter(Boolean).join(", ") || "Not set"}</dd>
            <dt className="text-ink-soft">Joined</dt>
            <dd>{dateTime(profile.created_at)}</dd>
            <dt className="text-ink-soft">Active listings</dt>
            <dd>{listingCount ?? 0}</dd>
            <dt className="text-ink-soft">Seller verified</dt>
            <dd>{profile.seller_verified ? "Yes" : "No"}</dd>
            <dt className="text-ink-soft">Identity verified</dt>
            <dd>{profile.identity_verified ? "Yes (Stripe)" : "No"}</dd>
            <dt className="text-ink-soft">Staff roles</dt>
            <dd>{roles.join(", ") || "None"}</dd>
          </dl>
        </section>

        {canModerate && !self && (
          <section className="card grid content-start gap-3 p-4">
            <h2 className="font-semibold">Account status</h2>
            {profile.account_status === "active" && (
              <form action={setAccountStatus} className="grid gap-2">
                <ReturnTo path={path} />
                <input type="hidden" name="userId" value={id} />
                <input type="hidden" name="status" value="suspended" />
                <label className="field text-sm">
                  <span>Reason (recorded in the audit log)</span>
                  <input name="reason" className="input" maxLength={500} />
                </label>
                <p className="text-xs text-ink-soft">Suspended members can still sign in and see their orders, but can&apos;t publish listings.</p>
                <p>
                  <SubmitButton tone="outline">Suspend member</SubmitButton>
                </p>
              </form>
            )}
            {profile.account_status === "suspended" && (
              <form action={setAccountStatus}>
                <ReturnTo path={path} />
                <input type="hidden" name="userId" value={id} />
                <input type="hidden" name="status" value="active" />
                <SubmitButton>Reactivate member</SubmitButton>
              </form>
            )}
            {profile.account_status === "banned" && isAdmin && (
              <form action={setAccountStatus}>
                <ReturnTo path={path} />
                <input type="hidden" name="userId" value={id} />
                <input type="hidden" name="status" value="active" />
                <SubmitButton tone="outline">Lift ban (admin)</SubmitButton>
              </form>
            )}
            {profile.account_status !== "banned" &&
              (confirmingBan ? (
                <form action={confirmBan} className="grid gap-2 rounded-md border border-danger/40 bg-danger/5 p-3">
                  <ReturnTo path={path} />
                  <input type="hidden" name="userId" value={id} />
                  <p className="text-sm font-semibold text-danger">Ban @{profile.username}?</p>
                  <p className="text-sm">A ban is for fraud, stolen or counterfeit goods, or serious abuse. Only an admin can lift it.</p>
                  <label className="field text-sm">
                    <span>Reason</span>
                    <input name="reason" required minLength={5} maxLength={500} className="input" />
                  </label>
                  <label className="field text-sm">
                    <span>Type the username to confirm</span>
                    <input name="confirmUsername" required autoComplete="off" className="input" />
                  </label>
                  <p className="flex gap-2">
                    <SubmitButton tone="danger">Confirm ban</SubmitButton>
                    <Link href={path} className="btn btn-outline px-3 py-1.5 text-sm">
                      Cancel
                    </Link>
                  </p>
                </form>
              ) : (
                <p>
                  <Link href={`${path}?confirm=ban`} className="text-sm text-danger underline">
                    Ban this member…
                  </Link>
                </p>
              ))}
          </section>
        )}

        {isAdmin && (
          <section className="card grid content-start gap-3 p-4">
            <h2 className="font-semibold">Staff roles</h2>
            <p className="text-xs text-ink-soft">Admins can do everything. Moderators handle listings, reports and the catalog. Support handles members and messages.</p>
            <ul className="grid gap-2">
              {STAFF_ROLES.map((role) => {
                const has = roles.includes(role);
                const locked = self && role === "admin" && has;
                return (
                  <li key={role} className="flex items-center justify-between gap-3">
                    <span className="capitalize">{role}</span>
                    {locked ? (
                      <span className="text-xs text-ink-soft">You can&apos;t remove your own admin role</span>
                    ) : (
                      <form action={setRole}>
                        <ReturnTo path={path} />
                        <input type="hidden" name="userId" value={id} />
                        <input type="hidden" name="role" value={role} />
                        <input type="hidden" name="grant" value={has ? "false" : "true"} />
                        <SubmitButton tone="outline">{has ? `Remove ${role}` : `Make ${role}`}</SubmitButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <section className="grid gap-2">
        <h2 className="font-semibold">Recent staff actions on this member</h2>
        {(audit ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">None yet.</p>
        ) : (
          <Table label="Audit entries">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {(audit ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{dateTime(a.created_at)}</td>
                  <td className="font-mono">{a.action}</td>
                  <td className="font-mono text-xs break-all">{JSON.stringify(a.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
