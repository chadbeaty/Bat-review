import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/admin/auth";
import { ADMIN_AREAS, hasAccess } from "@/lib/admin/roles";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Every page and action checks again; this check decides what the navigation shows.
  const staff = await requireStaff("any");
  const areas = ADMIN_AREAS.filter((a) => hasAccess(staff.roles, a.access));
  const groups = [...new Set(areas.map((a) => a.group))];

  return (
    <div className="wrap grid gap-6 py-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Admin" className="lg:sticky lg:top-4 lg:self-start">
        <details className="card group lg:hidden">
          <summary className="cursor-pointer px-4 py-3 font-semibold">Admin menu</summary>
          <AdminLinks areas={areas} groups={groups} />
        </details>
        <div className="hidden lg:block">
          <AdminLinks areas={areas} groups={groups} />
        </div>
        <p className="mt-3 px-1 text-xs text-ink-soft">
          Signed in as {staff.user.email} · {staff.roles.join(", ")}
        </p>
      </nav>
      <div className="grid min-w-0 content-start gap-6">{children}</div>
    </div>
  );
}

function AdminLinks({ areas, groups }: { areas: typeof ADMIN_AREAS; groups: string[] }) {
  return (
    <div className="grid gap-4 px-4 pb-4 lg:px-0">
      {groups.map((g) => (
        <div key={g} className="grid gap-1">
          <p className="eyebrow">{g}</p>
          <ul className="grid gap-0.5 text-sm">
            {areas
              .filter((a) => a.group === g)
              .map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="block rounded px-2 py-1 hover:bg-surface hover:underline">
                    {a.label}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
