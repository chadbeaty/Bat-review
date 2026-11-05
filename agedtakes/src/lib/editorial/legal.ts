// Legal review checklist for potentially defamatory material. Every item must be confirmed by an editor before
// a case can be approved; the database refuses approval otherwise (legal_checklist_items() in the migrations).

export const LEGAL_CHECKLIST = [
  { key: "quotes_verbatim_and_sourced", label: "Every quotation is verbatim and linked to its original source", help: "Open each source. Paraphrases are never shown in quotation marks." },
  { key: "dates_verified", label: "Every date is verified against the source", help: "Statement dates, transaction dates and deadlines." },
  { key: "context_included", label: "The surrounding context is included", help: "Conditions, jokes, hypotheticals and the question being answered." },
  { key: "no_unsupported_accusation", label: "No accusation goes beyond the evidence", help: "No 'liar', 'fraud', 'hypocrite' or 'criminal' unless substantiated and reviewed." },
  { key: "ownership_and_identity_established", label: "Identity and ownership are established, not assumed", help: "Wallets, accounts and holdings are attributed only on the subject's own claim or independent verification." },
  { key: "transfers_not_called_sales", label: "Transfers, deposits and spouse/fund transactions are described exactly", help: "A wallet transfer is not a sale; an exchange deposit is not a trade; a spouse's or fund's trade is not the person's own." },
  { key: "opinion_labeled_as_opinion", label: "Opinion, prediction, promise and editorial interpretation are clearly distinguished", help: "General bullishness is not an explicit commitment." },
  { key: "right_of_reply_offered", label: "The subject was offered a right of reply (or the attempt is recorded)", help: "Record outreach in the Response section." },
  { key: "limitations_stated", label: "Limitations and what the evidence does not prove are stated", help: "Every case says what is not established." },
] as const;

export type LegalKey = (typeof LEGAL_CHECKLIST)[number]["key"];

export function checklistComplete(review: Record<string, unknown> | null | undefined): boolean {
  return LEGAL_CHECKLIST.every((i) => review?.[i.key] === true);
}

export function checklistProgress(review: Record<string, unknown> | null | undefined) {
  const done = LEGAL_CHECKLIST.filter((i) => review?.[i.key] === true).length;
  return { done, total: LEGAL_CHECKLIST.length };
}
