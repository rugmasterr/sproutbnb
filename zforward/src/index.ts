/**
 * Sprout shield forwarder (zforward) entry point.
 * Idle mode when ZCASH_SEED / WALLET_DIR / LIGHTWALLETD_URL (or FORWARDER_TOKEN) are missing: the HTTP API still
 * serves /healthz and /status, registration answers 503, no wallet process is ever started.
 */
import { BscProof, NoProof, type ProofChecker } from './bsc.js'
import { configStatus, loadConfig } from './config.js'
import { createApi } from './api.js'
import { Engine } from './engine.js'
import { errMsg, log } from './log.js'
import { HttpOneClick } from './oneclick.js'
import { Store } from './store.js'
import type { WalletAdapter } from './wallet/adapter.js'
import { DevtoolWallet } from './wallet/devtool.js'
import { MockWallet } from './wallet/mock.js'

const cfg = loadConfig()
const cs = configStatus(cfg)
const store = new Store(cfg.stateFile)

let wallet: WalletAdapter | undefined
if (process.env.WALLET_KIND === 'mock') {
  if (cfg.network === 'mainnet' && process.env.NODE_ENV === 'production') throw new Error('WALLET_KIND=mock is not allowed in production')
  wallet = new MockWallet()
  log.warn('MOCK wallet in use — no real ZEC is moved')
} else if (cs.walletConfigured && cs.apiConfigured) {
  wallet = new DevtoolWallet({
    bin: cfg.devtoolBin,
    walletDir: cfg.walletDir!,
    identityFile: process.env.WALLET_IDENTITY || undefined,
    server: cfg.lightwalletd!,
    connection: cfg.devtoolConnection,
    network: cfg.network,
    seed: cfg.seed!,
    birthday: cfg.birthday,
    timeoutMs: cfg.walletTimeoutMs,
  })
}

let proof: ProofChecker | undefined
if (cfg.onchainProof === 'off') {
  proof = NoProof
  log.warn('ONCHAIN_PROOF=off — payouts are NOT checked against BSC CashOut/BridgedOut events')
} else if (cfg.bscRpcUrl && (cfg.terminalAddress || cfg.payoutsAddress)) {
  proof = new BscProof(cfg.bscRpcUrl, { terminal: cfg.terminalAddress, payouts: cfg.payoutsAddress })
}

const engine = new Engine({
  cfg,
  store,
  wallet,
  oneClick: new HttpOneClick(cfg.oneClickBase, cfg.oneClickJwt),
  proof,
  pauseSends: process.env.PAUSE_SENDS === '1',
})

const server = createApi(engine, { token: cfg.token, adminToken: cfg.adminToken, network: cfg.network, maxPayoutZat: cfg.maxPayoutZat })
server.listen(cfg.port, cfg.host, () => {
  log.info('sprout-zforward listening', {
    port: cfg.port,
    host: cfg.host,
    mode: engine.mode,
    network: cfg.network,
    missing: cs.missing,
    lightwalletd: cfg.lightwalletd ?? null,
  })
  if (!wallet) log.warn('idle mode: shield forwarder not configured', { missing: cs.missing })
})

let timer: NodeJS.Timeout | undefined
async function loop() {
  try {
    await engine.tick()
  } catch (e) {
    log.error('loop error', { error: errMsg(e) })
  }
  timer = setTimeout(loop, cfg.tickMs)
}
if (wallet) void loop()

function shutdown(sig: string) {
  log.info('shutting down', { sig })
  if (timer) clearTimeout(timer)
  server.close()
  try {
    store.save()
  } catch {}
  // Give an in-flight wallet call a moment; state was persisted before any send started.
  setTimeout(() => process.exit(0), 2000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
