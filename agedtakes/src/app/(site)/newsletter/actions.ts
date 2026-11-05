"use server";

import { redirect } from "next/navigation";
import { confirmSubscription, unsubscribe } from "@/lib/newsletter";

export async function confirmAction(form: FormData) {
  const result = await confirmSubscription(String(form.get("id") ?? ""), String(form.get("token") ?? ""));
  redirect(`/newsletter/confirm?result=${result}`);
}

export async function unsubscribeAction(form: FormData) {
  const ok = await unsubscribe(String(form.get("id") ?? ""), String(form.get("token") ?? ""));
  redirect(`/newsletter/unsubscribe?result=${ok ? "done" : "invalid"}`);
}
