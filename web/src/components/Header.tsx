import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { SearchBar } from "./SearchBar";
import { getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { CountPill, unreadNotificationCount } from "./NotificationBadge";
import { HeaderMenus } from "./HeaderMenus";
import { MenuIcon, UserIcon } from "./icons";
import { getBatsOnlyMode } from "@/lib/launch";
import { getCategories } from "@/lib/catalog";

const NAV = [
  { href: "/bats", label: "Shop bats" },
  { href: "/manufacturers", label: "Bat archive" },
  { href: "/price-guide", label: "Price guide" },
  { href: "/account/watchlist", label: "Watchlist" },
  { href: "/sell", label: "Sell" },
];

const MORE = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/buyer-protection", label: "Buyer protection" },
  { href: "/seller-guide", label: "Seller guide" },
  { href: "/compare", label: "Compare bats" },
  { href: "/faq", label: "FAQ" },
];

const ICON_BTN =
  "relative grid h-11 min-w-11 cursor-pointer list-none place-items-center border-2 border-ink bg-surface px-2 text-ink hover:bg-ink hover:text-surface";

export async function Header() {
  const [user, batsOnly] = await Promise.all([getCurrentUser(), getBatsOnlyMode()]);
  const unread = user ? await unreadNotificationCount() : 0;
  // Other categories appear in the menu only once the owner switches bats-only mode off.
  const otherCategories = batsOnly ? [] : (await getCategories()).filter((c) => c.slug !== "bats");
  return (
    <header className="sticky z-20 border-b-[3px] border-ink bg-paper/95 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <HeaderMenus />
      <div className="wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-2 lg:flex-nowrap lg:gap-x-4">
        <Wordmark className="order-1" />
        <nav aria-label="Main" className="order-2 hidden lg:flex">
          <ul className="flex items-center gap-0.5">
            {NAV.map((n) => (
              <li key={n.href} className={n.href === "/account/watchlist" ? "hidden 2xl:block" : undefined}>
                <Link href={n.href} className="navlink">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="order-3 w-full lg:min-w-[17rem] lg:flex-1">
          <SearchBar action="/bats" />
        </div>
        <div className="order-2 ml-auto flex items-center gap-2 lg:order-4 lg:ml-0">
          <details className="relative lg:hidden" data-header-menu>
            <summary className={ICON_BTN} aria-label="Menu">
              <MenuIcon size={22} />
            </summary>
            <div className="card absolute right-0 mt-2 grid max-h-[80vh] w-64 gap-1 overflow-y-auto p-2 shadow-lg">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="menu-item">
                  {n.label}
                </Link>
              ))}
              {otherCategories.map((c) => (
                <Link key={c.slug} href={`/shop/${c.slug}`} className="menu-item">
                  {c.name}
                </Link>
              ))}
              <hr className="chalk my-1" />
              {MORE.map((n) => (
                <Link key={n.href} href={n.href} className="menu-item text-sm">
                  {n.label}
                </Link>
              ))}
            </div>
          </details>
          <details className="relative" data-header-menu>
            <summary className={`${ICON_BTN} !inline-flex items-center justify-center gap-1.5 lg:px-3`} aria-label={user ? "Account menu" : "Sign in or join"}>
              <UserIcon size={22} />
              <span className="navlink !hidden !border-0 !p-0 lg:!inline">{user ? "Account" : "Sign in"}</span>
              {unread > 0 && <span className="absolute -right-1.5 -top-1.5"><CountPill count={unread} /></span>}
            </summary>
            <div className="card absolute right-0 mt-2 grid w-52 gap-1 p-2 shadow-lg">
              {user ? (
                <>
                  <Link href="/account" className="menu-item">
                    Dashboard
                  </Link>
                  <Link href="/account/watchlist" className="menu-item">
                    Watchlist
                  </Link>
                  <Link href="/messages" className="menu-item">
                    Messages
                  </Link>
                  <Link href="/account/offers" className="menu-item">
                    Offers
                  </Link>
                  <Link href="/account/notifications" className="menu-item">
                    Notifications
                    <CountPill count={unread} />
                  </Link>
                  <form action={signOut}>
                    <button type="submit" className="menu-item w-full text-left">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/sign-in" className="menu-item">
                    Sign in
                  </Link>
                  <Link href="/sign-up" className="menu-item">
                    Join
                  </Link>
                </>
              )}
            </div>
          </details>
          <Link href="/sell" className="btn btn-primary hidden !py-2 2xl:inline-flex">
            Sell your bat
          </Link>
        </div>
      </div>
    </header>
  );
}
