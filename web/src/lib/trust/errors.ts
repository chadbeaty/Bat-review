// Turns database errors from messaging, offers and disputes into messages a member can act on.

type DbError = { message?: string; code?: string } | null | undefined;

export function friendlyDbError(error: DbError, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  const message = error.message ?? "";
  const code = error.code ?? "";
  if (code === "54000" || /too quickly/i.test(message)) return "You are sending messages too quickly. Wait a minute and try again.";
  if (/not accepting messages/i.test(message)) return "This member is not accepting messages from you.";
  if (/row-level security/i.test(message)) return "You can't do that. The other member may have blocked you, or the listing isn't available.";
  if (code === "23505" && /offers_one_open_per_buyer/.test(message)) return "You already have an open offer on this listing. Withdraw it first to make a new one.";
  if (code === "23505") return "That was already done.";
  if (["22023", "42501", "P0002"].includes(code) && message) return message;
  return fallback;
}
