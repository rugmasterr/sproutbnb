import { serve } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { createApp } from './app.js'
import { isRelayConfigured, loadConfig } from './config.js'
import type { Relayer } from './relayer.js'
import { ShieldService } from './shield.js'
import { shortError } from './errors.js'
import { createRelayer, makePublicClient } from './wiring.js'

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))

async function main() {
  const cfg = loadConfig()
  let relayer: Relayer | undefined

  if (isRelayConfigured(cfg)) {
    const { chain, pub } = makePublicClient(cfg)
    try {
      const id = await pub.getChainId()
      if (id !== cfg.chainId) {
        cfg.invalid.push(`BSC_RPC_URL (chain id ${id}, expected CHAIN_ID ${cfg.chainId})`)
      } else {
        const code = await pub.getCode({ address: cfg.accountFactory! })
        if (!code || code === '0x') cfg.invalid.push('SPROUT_ACCOUNT_FACTORY (no contract code at this address)')
      }
    } catch (e) {
      // RPC down at boot: start anyway; requests surface RPC errors and recover when it is back.
      log('RPC check failed at startup (continuing)', { err: shortError(e) })
    }
    if (cfg.invalid.length === 0) {
      const { relayer: rel, tx } = createRelayer(cfg, pub, chain, log)
      tx.start()
      relayer = rel
      log('relayer configured', { chainId: cfg.chainId, relayer: rel.relayerAddress, factory: cfg.accountFactory })
    } else {
      log('relayer config invalid — idle mode', { invalid: cfg.invalid })
    }
  } else {
    log('relayer NOT configured — idle mode (/relay and /quote-gas return 503)', { missing: [...cfg.missing, ...cfg.invalid] })
  }

  const shield = new ShieldService(cfg)
  const app = createApp({
    cfg,
    relayer,
    shield,
    version: process.env.FLY_IMAGE_REF?.split(':').pop() ?? process.env.npm_package_version,
    getRemoteIp: (c) => {
      try {
        return getConnInfo(c).remote.address
      } catch {
        return undefined
      }
    },
    log,
  })

  const server = serve({ fetch: app.fetch, port: cfg.port, hostname: '0.0.0.0' }, (i) => log('listening', { port: i.port }))
  const shutdown = () => {
    log('shutting down')
    server.close()
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  console.error('fatal:', shortError(e))
  process.exit(1)
})
