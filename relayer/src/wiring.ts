import { createPublicClient, defineChain, http, type Chain, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import type { Config } from './config.js'
import { Relayer } from './relayer.js'
import { TxManager } from './txmanager.js'

export type Log = (msg: string, extra?: Record<string, unknown>) => void

export function chainFor(id: number, rpc: string): Chain {
  const base =
    id === 56
      ? bsc
      : id === 97
        ? bscTestnet
        : defineChain({ id, name: `chain-${id}`, nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } })
  return { ...base, rpcUrls: { default: { http: [rpc] } } }
}

export function makePublicClient(cfg: Config): { chain: Chain; pub: PublicClient } {
  const chain = chainFor(cfg.chainId, cfg.rpcUrl!)
  const pub = createPublicClient({ chain, transport: http(cfg.rpcUrl, { timeout: 20_000, retryCount: 2 }) }) as PublicClient
  return { chain, pub }
}

/** Wire TxManager + Relayer for a configured Config (caller checked isRelayConfigured). */
export function createRelayer(cfg: Config, pub: PublicClient, chain: Chain, log?: Log): { relayer: Relayer; tx: TxManager } {
  const signer = privateKeyToAccount(cfg.privateKey!)
  let rel: Relayer | undefined
  const tx = new TxManager(pub, signer, chain, {
    maxGasPriceWei: cfg.maxGasPriceWei,
    minGasPriceWei: cfg.minGasPriceWei,
    gasPriceBumpBps: cfg.gasPriceBumpBps,
    stuckAfterMs: cfg.stuckAfterMs,
    replaceBumpBps: cfg.replaceBumpBps,
    monitorIntervalMs: cfg.monitorIntervalMs,
    onFinal: (r) => rel?.onFinal(r),
    log,
  })
  rel = new Relayer(cfg, pub, chain, tx)
  return { relayer: rel, tx }
}
