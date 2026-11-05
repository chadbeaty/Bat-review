import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage() {
  const supabase = await createClient();
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!supabase || !data.user) redirect("/sign-in?next=/account");
  const [{ data: profile }, { data: follows }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle(),
    supabase.from("user_follows").select("person:people(name, slug)").eq("user_id", data.user.id),
  ]);
  const people = (follows ?? []).map((f) => f.person as unknown as { name: string; slug: string } | null).filter(Boolean) as { name: string; slug: string }[];
  return (
    <div className="wrap max-w-2xl py-14">
      <p className="kicker mb-2 !text-red">Your account</p>
      <h1 className="headline text-4xl">{data.user.email}</h1>
      {isStaffRole(profile?.role) && (
        <div className="mt-6 border border-ink p-5">
          <p>You are on the newsroom staff ({profile?.role}).</p>
          <div className="mt-3 flex gap-2"><Link href="/admin" className="btn">Open the newsroom</Link><Link href="/account/security" className="btn btn-ghost">Two-step verification</Link></div>
        </div>
      )}
      <h2 className="headline mt-10 border-b border-ink pb-2 text-2xl">People you follow</h2>
      {people.length === 0 ? <p className="mt-3 text-ink-2">You aren&apos;t following anyone yet. <Link href="/people" className="link">Browse people</Link>.</p> : (
        <ul className="mt-3 space-y-2">{people.map((p) => <li key={p.slug}><Link href={`/people/${p.slug}`} className="link">{p.name}</Link></li>)}</ul>
      )}
      <form action="/auth/sign-out" method="post" className="mt-10"><button className="btn btn-ghost">Sign out</button></form>
    </div>
  );
}
