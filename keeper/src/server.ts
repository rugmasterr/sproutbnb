import { createServer, type Server } from "node:http";
import { isAddress } from "viem";
import type { Keeper } from "./keeper.js";
import { claimsFor } from "./tasks/holders.js";
import { log } from "./log.js";

function json(res: import("node:http").ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(s);
}

/**
 * GET /healthz  — liveness: 200 whenever the process is up (also in idle "not configured" mode, so fly does
 *                 not restart-loop an unconfigured machine). Body says idle/running and whether the loop is stale.
 * GET /status   — full non-secret status (config, contracts, gas, pots, bridges, warnings, recent actions).
 * GET /claims/<vault>/<account> — fallback-distributor merkle proofs for the site.
 */
export function startServer(keeper: Keeper, port: number): Server {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "method not allowed" });

    if (path === "/healthz" || path === "/") {
      const s = keeper.status;
      const last = s.loop.lastEnd ? Date.parse(s.loop.lastEnd) : undefined;
      const stale =
        s.mode === "running" && last !== undefined && Date.now() - last > Math.max(45 * 60_000, keeper.cfg.loopIntervalMs * 20);
      // backoff can space loops up to 15 min apart, so only a much longer silence counts as stale
      return json(res, stale ? 503 : 200, {
        ok: !stale,
        service: s.service,
        mode: s.mode,
        reason: s.reason,
        dryRun: keeper.cfg.dryRun,
        loops: s.loop.count,
        lastLoopOk: s.loop.lastOk ?? null,
        stale,
      });
    }
    if (path === "/status") return json(res, 200, keeper.status);

    const m = /^\/claims\/(0x[0-9a-fA-F]{40})\/(0x[0-9a-fA-F]{40})$/.exec(path);
    if (m) {
      if (!keeper.store) return json(res, 503, { error: "not configured" });
      if (!isAddress(m[1]!, { strict: false }) || !isAddress(m[2]!, { strict: false })) return json(res, 400, { error: "bad address" });
      return json(res, 200, { vault: m[1], account: m[2], claims: claimsFor({ store: keeper.store }, m[1]!, m[2]!) });
    }
    return json(res, 404, { error: "not found" });
  });
  server.listen(port, "0.0.0.0", () => log.info("health server listening", { port }));
  return server;
}
