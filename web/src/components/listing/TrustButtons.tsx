import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { MakeOfferForm } from "@/components/trust/OfferForms";
import { startConversation } from "@/app/messages/actions";
import { formatPrice } from "@/lib/format";
import { listingPath } from "@/lib/paths";

/** "Make offer": a form for signed-in buyers, a sign-in link for visitors. */
export async function OfferButton({ listingId, priceCents }: { listingId: string; priceCents: number }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(listingPath(listingId))}`} className="btn btn-outline">
        Make offer
      </Link>
    );
  }
  return <MakeOfferForm listingId={listingId} askingLabel={formatPrice(priceCents)} />;
}

/** "Message seller": starts or reopens the conversation for this listing. */
export async function MessageButton({ listingId }: { listingId: string }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(listingPath(listingId))}`} className="btn btn-outline">
        Message seller
      </Link>
    );
  }
  return (
    <form action={startConversation}>
      <input type="hidden" name="listingId" value={listingId} />
      <button type="submit" className="btn btn-outline w-full">
        Message seller
      </button>
    </form>
  );
}
