import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <div className="animate-rise max-w-2xl pb-12">
      <h1 className="display mt-3 text-[2.15rem] leading-[1.02] md:text-[2.6rem]">Privacy</h1>
      <div className="mt-5 space-y-5 text-[15px] leading-relaxed text-chalk-2">
        <p><span className="font-bold text-chalk">Video stays on your phone.</span> Camera frames are analyzed on your device. Swing clips are saved in your browser&apos;s storage on this phone and are never uploaded unless you choose to back them up.</p>
        <p><span className="font-bold text-chalk">The mic only listens for contact.</span> When &ldquo;Listen for contact&rdquo; is on, the app measures loudness in real time to hear bat-on-ball. Audio is never recorded, stored or sent.</p>
        <p><span className="font-bold text-chalk">Accounts are optional.</span> If you sign in, we store your email and sync your hitters (name, bats, height, level, positions, goals), your bats, your sessions and your swings (scores, numbers with their sources, tags, notes and the tracked body points used to replay them) so the same history shows on every device you sign in on. Video is never uploaded; it stays on the phone that recorded it. Each account can only ever see its own data; coaches can see a hitter only if that hitter&apos;s owner adds them to a team.</p>
        <p><span className="font-bold text-chalk">You own your data.</span> Export everything from Profile, delete any swing or its video, delete everything on this phone, or delete your account and everything synced to it.</p>
        <p><span className="font-bold text-chalk">No ads, no selling data.</span> We don&apos;t sell or share your data.</p>
      </div>
    </div>
  );
}
