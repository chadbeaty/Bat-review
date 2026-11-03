// Structured server logs (one JSON object per line, readable in Vercel's log viewer and any log drain), plus an
// error-tracking integration point. Never log secrets, tokens, email addresses or full request bodies.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const REDACT = /(key|token|secret|password|authorization|cookie|email)/i;

function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k)) out[k] = "[redacted]";
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else out[k] = v;
  }
  return out;
}

/** Hook for an error tracker (e.g. Sentry). Set by instrumentation when SENTRY_DSN is configured. */
let reporter: ((event: string, fields: Fields) => void) | null = null;
export function setErrorReporter(fn: typeof reporter) {
  reporter = fn;
}

function write(level: Level, event: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...redact(fields) });
  if (level === "error") {
    console.error(line);
    try {
      reporter?.(event, redact(fields));
    } catch {
      // Never let error reporting break the request.
    }
  } else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => (process.env.LOG_LEVEL === "debug" ? write("debug", event, fields) : undefined),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
