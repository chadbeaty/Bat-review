import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sellerPath } from "@/lib/paths";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Profile settings", robots: { index: false } };

type Profile = {
  username: string;
  display_name: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  profile_photo_url: string | null;
};

export default async function ProfilePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/account/profile");
  const { data: profile } = await supabase.rpc("get_my_profile").single<Profile>();

  return (
    <div className="wrap grid max-w-2xl gap-6 py-10">
      <div className="grid gap-2">
        <p className="eyebrow">
          <Link href="/account" className="underline">
            Your account
          </Link>
        </p>
        <h1 className="display text-5xl font-bold">Profile settings</h1>
        <p className="text-ink-soft">
          Everything here except your ZIP code appears on your{" "}
          {profile?.username ? (
            <Link href={sellerPath(profile.username)} className="underline">
              public profile
            </Link>
          ) : (
            "public profile"
          )}{" "}
          and listings.
        </p>
      </div>
      <ProfileForm
        userId={auth.user.id}
        initial={{
          username: profile?.username ?? "",
          displayName: profile?.display_name ?? "",
          bio: profile?.bio ?? "",
          city: profile?.city ?? "",
          state: profile?.state ?? "",
          postalCode: profile?.postal_code ?? "",
        }}
        photoUrl={profile?.profile_photo_url ?? null}
      />
    </div>
  );
}
