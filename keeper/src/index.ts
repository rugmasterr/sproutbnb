import { loadConfig } from "./config.js";
import { Keeper } from "./keeper.js";
import { errMsg, log, setLogLevel } from "./log.js";
import { startServer } from "./server.js";

setLogLevel(process.env.LOG_LEVEL);
const cfg = loadConfig();
for (const p of cfg.problems) log.warn(`config: ${p}`);

const keeper = new Keeper(cfg);
const server = startServer(keeper, cfg.port);
keeper.start();

let stopping = false;
function shutdown(sig: string) {
  if (stopping) return;
  stopping = true;
  log.info("shutting down", { signal: sig });
  keeper.stop();
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 5000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (e) => log.error("unhandled rejection", { error: errMsg(e) }));
process.on("uncaughtException", (e) => log.error("uncaught exception", { error: errMsg(e) }));

// Watchdog: a loop that never returns (hung RPC / socket) would leave the keeper silently dead. Exit non-zero so
// fly restarts the machine (state is on the volume; every step is idempotent / resumable).
const watchdogMs = Math.max(10 * 60_000, Number(process.env.WATCHDOG_SEC ?? "1800") * 1000 || 1_800_000);
setInterval(() => {
  const l = keeper.status.loop;
  if (keeper.status.mode !== "running" || !l.lastStart) return;
  const started = Date.parse(l.lastStart);
  const ended = l.lastEnd ? Date.parse(l.lastEnd) : 0;
  if (ended < started && Date.now() - started > watchdogMs) {
    log.error("watchdog: keeper loop stuck — exiting for a restart", { loopStartedAt: l.lastStart, watchdogSec: watchdogMs / 1000 });
    try {
      keeper.stop();
    } finally {
      process.exit(1);
    }
  }
}, 60_000).unref();

if (cfg.once) {
  // RUN_ONCE: close the server after the first loop completes
  const iv = setInterval(() => {
    if (keeper.status.mode === "idle" || keeper.status.loop.lastEnd) {
      clearInterval(iv);
      shutdown("RUN_ONCE");
    }
  }, 250);
}
