import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { SearchBar } from "./SearchBar";
import { getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { CountPill, unreadNotificationCount } from "./NotificationBadge";
import { HeaderMenus } from "./HeaderMenus";

const NAV = [
  { href: "/shop", label: "Shop" },
  { href: "/bats", label: "Bats" },
  { href: "/sell", label: "Sell" },
  { href: "/price-guide", label: "Bat price guide" },
];

export async function Header() {
  const user = await getCurrentUser();
  const unread = user ? await unreadNotificationCount() : 0;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <HeaderMenus />
      <div className="wrap flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
        <Wordmark />
        <div className="order-3 w-full md:order-2 md:w-auto md:flex-1">
          <SearchBar />
        </div>
        <nav aria-label="Main" className="order-2 ml-auto flex items-center gap-1 md:order-3">
          <ul className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="rounded-md px-2.5 py-2 font-medium text-ink-soft hover:bg-surface hover:text-ink">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          {user ? (
            <details className="relative" data-header-menu>
              <summary className="cursor-pointer list-none rounded-md px-2.5 py-2 font-medium text-ink-soft hover:bg-surface hover:text-ink">
                Account
                <CountPill count={unread} />
              </summary>
              <div className="card absolute right-0 mt-2 grid w-48 gap-1 p-2 shadow-lg">
                <Link href="/account" className="rounded px-2 py-1.5 hover:bg-paper">
                  Dashboard
                </Link>
                <Link href="/messages" className="rounded px-2 py-1.5 hover:bg-paper">
                  Messages
                </Link>
                <Link href="/account/offers" className="rounded px-2 py-1.5 hover:bg-paper">
                  Offers
                </Link>
                <Link href="/account/notifications" className="rounded px-2 py-1.5 hover:bg-paper">
                  Notifications
                  <CountPill count={unread} />
                </Link>
                <form action={signOut}>
                  <button type="submit" className="w-full rounded px-2 py-1.5 text-left hover:bg-paper">
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          ) : (
            <>
              <Link href="/sign-in" className="rounded-md px-2.5 py-2 font-medium text-ink-soft hover:bg-surface hover:text-ink">
                Sign in
              </Link>
              <Link href="/sign-up" className="rounded-md px-2.5 py-2 font-medium text-ink-soft hover:bg-surface hover:text-ink">
                Join
              </Link>
            </>
          )}
          <Link href="/sell" className="btn btn-accent ml-1 hidden sm:inline-flex">
            Sell your gear
          </Link>
          <details className="relative lg:hidden" data-header-menu>
            <summary className="cursor-pointer list-none rounded-md px-2.5 py-2 font-medium text-ink" aria-label="Menu">
              Menu
            </summary>
            <ul className="card absolute right-0 mt-2 grid w-52 gap-1 p-2 shadow-lg">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="block rounded px-2 py-1.5 hover:bg-paper">
                    {n.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/sell" className="block rounded px-2 py-1.5 font-semibold hover:bg-paper">
                  Sell your gear
                </Link>
              </li>
            </ul>
          </details>
        </nav>
      </div>
    </header>
  );
}
