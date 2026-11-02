// Hand-collected posts, mainly from Facebook groups (Facebook has no API for group posts).
// Drop .json, .csv or .txt files into data/imports/. See data/imports/README.md for the formats.

import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";

const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || "").trim()])));
}

// Entries separated by a line of three dashes. Optional "url:", "date:", "source:" lines at the top of each entry.
export function parseText(text) {
  return text
    .split(/^\s*---\s*$/m)
    .map((block) => {
      const entry = {};
      const lines = block.trim().split("\n");
      while (lines.length && /^(url|date|source|group):/i.test(lines[0])) {
        const [, k, v] = lines.shift().match(/^(\w+):\s*(.*)$/);
        entry[k.toLowerCase()] = v.trim();
      }
      entry.text = lines.join("\n").trim();
      return entry;
    })
    .filter((e) => e.text);
}

export async function collectImports(dir, log) {
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => /\.(json|csv|txt)$/i.test(f) && !/^readme/i.test(f));
  } catch {
    return { docs: [], stats: { files: 0 } };
  }
  const docs = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf8");
    let entries = [];
    try {
      const ext = extname(file).toLowerCase();
      entries = ext === ".json" ? JSON.parse(raw) : ext === ".csv" ? parseCSV(raw) : parseText(raw);
    } catch (err) {
      log(`  ${file}: could not read (${err.message})`);
      continue;
    }
    for (const e of entries) {
      if (!e.text) continue;
      const date = e.date ? new Date(e.date) : null;
      docs.push({
        id: `import:${hash(e.url || e.text)}`,
        source: "import",
        sourceName: e.source || "Facebook",
        url: e.url || null,
        title: e.group || "",
        text: e.text,
        date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
        votes: Number(e.votes) || 0,
        softball: true,
      });
    }
    log(`  ${file}: ${entries.length} entries`);
  }
  return { docs, stats: { files: files.length, entries: docs.length } };
}
