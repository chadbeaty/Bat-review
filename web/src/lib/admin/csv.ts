// CSV building for admin exports. Pure functions, so they can be unit tested.

export type CsvValue = string | number | boolean | null | undefined | Date | string[];

/**
 * One CSV cell. Quotes cells containing commas, quotes or line breaks (RFC 4180), and stops spreadsheet
 * formula injection: a cell starting with =, +, -, @, tab or carriage return is prefixed with a single quote
 * so Excel, Sheets and Numbers show it as text instead of running it.
 */
export function csvCell(value: CsvValue): string {
  if (value == null) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (Array.isArray(value)) s = value.join("; ");
  else s = String(value);
  if (typeof value === "string" || Array.isArray(value)) {
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  }
  if (/[",\r\n]/.test(s) || s !== s.trim()) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** A whole CSV document with a header row. Lines end with CRLF, as RFC 4180 specifies. */
export function toCsv<T extends Record<string, CsvValue>>(columns: { key: keyof T & string; header: string }[], rows: T[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** A safe download filename, for example "listings-2026-11-02.csv". */
export function csvFilename(kind: string, now = new Date()): string {
  return `${kind.replace(/[^a-z0-9-]/gi, "")}-${now.toISOString().slice(0, 10)}.csv`;
}
