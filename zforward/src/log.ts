/** JSON-line logger with secret redaction (seed words, tokens, RPC URLs with keys never reach the logs). */
const secrets = new Set<string>()

export function registerSecret(s?: string) {
  if (!s) return
  const t = s.trim()
  if (t.length >= 6) secrets.add(t)
  // Also redact individual seed words in multi-word secrets would be noisy; redact the full phrase and 4-word windows.
  const words = t.split(/\s+/)
  if (words.length >= 12) for (let i = 0; i + 4 <= words.length; i++) secrets.add(words.slice(i, i + 4).join(' '))
}

export function redact(s: string): string {
  let out = s
  for (const sec of secrets) if (out.includes(sec)) out = out.split(sec).join('[redacted]')
  return out
}

type Level = 'debug' | 'info' | 'warn' | 'error'
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
let min: Level = (process.env.LOG_LEVEL as Level) in order ? (process.env.LOG_LEVEL as Level) : 'info'
export const setLogLevel = (l: Level) => (min = l)

function emit(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (order[level] < order[min]) return
  const line = redact(JSON.stringify({ t: new Date().toISOString(), level, msg, ...(extra ?? {}) }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
  ;(level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n')
}

export const log = {
  debug: (m: string, e?: Record<string, unknown>) => emit('debug', m, e),
  info: (m: string, e?: Record<string, unknown>) => emit('info', m, e),
  warn: (m: string, e?: Record<string, unknown>) => emit('warn', m, e),
  error: (m: string, e?: Record<string, unknown>) => emit('error', m, e),
}

export const errMsg = (e: unknown) => redact(e instanceof Error ? e.message : String(e))
