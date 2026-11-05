import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireStaff } from "@/lib/auth/staff";
import { areasFor } from "@/lib/auth/roles";

export const metadata: Metadata = { title: { default: "Newsroom", template: "%s · Newsroom · Aged Takes" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Every newsroom page checks the staff member on the server. Pages and actions check again for their own role.
  const staff = await requireStaff("researcher");
  const areas = areasFor(staff.role);
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-ink bg-paper-2/70 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <Link href="/admin" aria-label="Newsroom home"><Wordmark size="sm" /></Link>
          <span className="kicker">Newsroom</span>
        </div>
        <AdminNav areas={areas} />
        <div className="border-t border-rule px-4 py-4">
          <p className="meta truncate">{staff.user.email}</p>
          <p className="kicker mt-1">{staff.role}</p>
          <div className="mt-3 flex gap-2">
            <Link href="/" className="btn btn-ghost btn-sm">View site</Link>
            <form action="/auth/sign-out" method="post"><button className="btn btn-ghost btn-sm">Sign out</button></form>
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
