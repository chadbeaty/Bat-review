import type { ReactNode } from "react";

// A deliberately small Markdown subset for article bodies: ## and ### headings, paragraphs, "- " lists,
// > quotes, **bold**, *italic* and [links](https://…). It builds React elements and never injects raw HTML,
// so text from editors or AI drafts cannot introduce scripts.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2]) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={key}>{m[3]}</em>);
    else if (m[4] && m[5]) out.push(<a key={key} href={m[5]} target="_blank" rel="noopener noreferrer nofollow">{m[4]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className = "prose-case" }: { source: string | null | undefined; className?: string }) {
  if (!source) return null;
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((raw, bi) => {
        const block = raw.trim();
        const key = `b${bi}`;
        if (!block) return null;
        if (block.startsWith("### ")) return <h3 key={key}>{inline(block.slice(4), key)}</h3>;
        if (block.startsWith("## ")) return <h2 key={key}>{inline(block.slice(3), key)}</h2>;
        if (block.startsWith("> ")) return <blockquote key={key}>{inline(block.replace(/^> ?/gm, ""), key)}</blockquote>;
        const lines = block.split("\n");
        if (lines.every((l) => /^[-*] /.test(l))) {
          return <ul key={key}>{lines.map((l, li) => <li key={li}>{inline(l.slice(2), `${key}-${li}`)}</li>)}</ul>;
        }
        return <p key={key}>{lines.flatMap((l, li) => (li ? [<br key={`br${li}`} />, ...inline(l, `${key}-${li}`)] : inline(l, `${key}-${li}`)))}</p>;
      })}
    </div>
  );
}
