// Reads emails from the local Supabase Mailpit inbox (http://127.0.0.1:54324).
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export async function latestLink(to: string, subjectIncludes: RegExp, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const { messages = [] } = (await res.json()) as { messages?: { ID: string; Subject: string }[] };
    const msg = messages.find((m) => subjectIncludes.test(m.Subject));
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { HTML: string; Text: string };
      const match = (full.HTML || full.Text).match(/href="([^"]+)"/) ?? full.Text.match(/(https?:\/\/\S+)/);
      if (match) return match[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to} matching ${subjectIncludes}`);
}

export async function mailpitAvailable(): Promise<boolean> {
  try {
    return (await fetch(`${MAILPIT}/api/v1/info`)).ok;
  } catch {
    return false;
  }
}
