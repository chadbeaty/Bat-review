import { AppNav } from "@/components/AppNav";
import { requireMember } from "@/lib/auth/member";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <AppNav isOwner={member.role === "owner"} email={member.email} />
      </aside>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
