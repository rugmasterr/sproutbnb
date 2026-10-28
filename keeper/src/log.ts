/**
 * Structured JSON logger that never prints secrets.
 *
 * Every registered secret (private key, 1Click JWT, forwarder token, RPC URLs that may embed API keys) is
 * replaced by "[redacted]" in every message and field before it is written. Error objects are reduced to
 * their short message (viem errors otherwise dump request bodies and URLs).
 */

const secrets = new Set<string>();

export function registerSecret(value: string | undefined | null): void {
  if (!value) return;
  const v = value.trim();
  if (v.length < 6) return;
  secrets.add(v);
  // private keys are often present with and without 0x
  if (v.startsWith("0x")) secrets.add(v.slice(2));
}

export function redact(input: string): string {
  let out = input;
  for (const s of secrets) {
    if (out.includes(s)) out = out.split(s).join("[redacted]");
  }
  // Any 64-hex string that looks like a raw private key next to "key" words.
  out = out.replace(/(private[_ ]?key["'\s:=]+)(0x)?[0-9a-fA-F]{64}/gi, "$1[redacted]");
  // Bearer / API key headers.
  out = out.replace(/(authorization|x-api-key)(["'\s:=]+)(bearer\s+)?[^\s"',}]+/gi, "$1$2[redacted]");
  return out;
}

export function errMsg(e: unknown): string {
  if (e == null) return "unknown error";
  const anyE = e as { shortMessage?: string; message?: string; name?: string; cause?: unknown };
  let msg = anyE.shortMessage || anyE.message || String(e);
  // viem: surface the decoded custom error name if present
  const cause = anyE.cause as { data?: { errorName?: string; args?: unknown[] }; reason?: string } | undefined;
  if (cause?.data?.errorName) {
    const args = (cause.data.args ?? []).map((a) => (typeof a === "bigint" ? a.toString() : String(a))).join(", ");
    msg = `${cause.data.errorName}(${args})`;
  } else if (cause?.reason) {
    msg = `${msg} (${cause.reason})`;
  }
  // keep the first line only; viem appends multi-line request dumps
  msg = msg.split("\n")[0] ?? msg;
  return redact(msg).slice(0, 500);
}

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let minLevel: Level = (process.env.LOG_LEVEL as Level) in ORDER ? (process.env.LOG_LEVEL as Level) : "info";

export function setLogLevel(l: string | undefined) {
  if (l && l in ORDER) minLevel = l as Level;
}

function safe(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Error) return errMsg(v);
  if (typeof v === "string") return redact(v);
  if (Array.isArray(v)) return v.map(safe);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (/key|secret|token|jwt|password|authorization/i.test(k) && typeof val === "string" && !/^0x[0-9a-fA-F]{40}$/.test(val)) {
        o[k] = "[redacted]";
      } else {
        o[k] = safe(val);
      }
    }
    return o;
  }
  return v;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[minLevel]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg: redact(msg), ...(safe(fields ?? {}) as object) });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};
