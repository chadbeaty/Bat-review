import Link from "next/link";
import { HeartIcon } from "@/components/icons";
import { toggleFavorite } from "@/app/listings/actions";

/**
 * Save or unsave a listing. Works without JavaScript (a plain form post). Signed-out visitors get a link to
 * sign in that brings them back to the page they were on.
 */
export function FavoriteButton({
  listingId,
  signedIn,
  saved,
  next,
  compact = false,
  icon = false,
}: {
  listingId: string;
  signedIn: boolean;
  saved: boolean;
  next: string;
  compact?: boolean;
  /** A square 44px heart-only button, for cards. */
  icon?: boolean;
}) {
  if (icon) {
    const base = "grid h-11 w-11 place-items-center border-2 border-ink bg-surface text-ink hover:bg-ink hover:text-surface";
    if (!signedIn) {
      return (
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className={base} aria-label="Sign in to save this listing">
          <HeartIcon size={20} />
        </Link>
      );
    }
    return (
      <form action={toggleFavorite}>
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="next" value={next} />
        <button type="submit" className={base} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save this listing"}>
          <HeartIcon size={20} filled={saved} />
        </button>
      </form>
    );
  }
  const cls = `btn ${compact ? "btn-outline px-3 py-1.5 text-sm" : "btn-outline"}`;
  if (!signedIn) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className={cls}>
        <Heart filled={false} /> Save
      </Link>
    );
  }
  return (
    <form action={toggleFavorite}>
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className={cls} aria-pressed={saved}>
        <Heart filled={saved} /> {saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2 0 3.4 1.1 4.2 2.3h2C13.8 6.1 15.2 5 17.2 5c3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}
