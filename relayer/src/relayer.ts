/**
 * Relay service: /quote-gas and /relay business logic.
 *
 * Safety design (the relayer EOA pays gas up front; it is only reimbursed if the batch succeeds on-chain):
 *  - Only genuine Sprout accounts: `account` must equal SproutAccountFactory.getAddress(qx, qy) (read from the chain).
 *    Deployed accounts must report owner() == (qx, qy). So the target is always our audited account code.
 *  - First use: ONE atomic transaction `factory.createAccountAndExecute(qx, qy, calls, ...)` — deploy + execute + fee in
 *    the same tx; never a bare createAccount the relayer would pay for without reimbursement.
 *  - feeRecipient must be the relayer EOA; gasFee must cover fresh estimate × gas price × (1 + RELAY_MIN_MARGIN).
 *  - Off-chain WebAuthn verification of the exact challenge (chain id, account, on-chain nonce, deadline, fee,
 *    recipient, calls) before anything else touches the RPC heavily; then eth_estimateGas simulates the real tx.
 *  - One in-flight tx per Sprout account; accounts whose txs revert on-chain repeatedly are paused.
 *  - Global caps: pending txs, gas per tx, gas price, minimum relayer balance.
 */
import {
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  encodeFunctionData,
  getAddress,
} from 'viem'
import { ACCOUNT_ABI, FACTORY_ABI } from './abi.js'
import { computeChallenge, type Call, type WebAuthnSig } from './challenge.js'
import type { Config } from './config.js'
import { describeRevert, extractRevertData, shortError } from './errors.js'
import { SIM_ACCOUNT_RUNTIME } from './simBytecode.js'
import { GasPriceTooHigh, type TxManager, type TxRecord } from './txmanager.js'
import { HttpError, type QuoteRequest, type RelayRequest } from './validate.js'
import { isOnCurve, verifyWebAuthn } from './webauthn.js'

const ZERO32 = `0x${'0'.repeat(64)}` as Hex

/** A realistic-size placeholder signature so the simulated calldata costs about what the real one will. */
const DUMMY_SIG: WebAuthnSig = {
  authenticatorData: `0x${'49'.repeat(32)}0500000000`,
  clientDataJSON:
    '{"type":"webauthn.get","challenge":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","origin":"https://sproutbnb.cash","crossOrigin":false,"other_keys_can_be_added_here":"do not compare clientDataJSON against a template. See https://goo.gl/yabPex"}',
  challengeIndex: 23n,
  typeIndex: 1n,
  r: (1n << 255n) + 12345n,
  s: (1n << 254n) + 6789n,
}

const bps = (v: bigint, b: number) => (v * BigInt(10_000 + Math.round(b))) / 10_000n
const nowSec = () => BigInt(Math.floor(Date.now() / 1000))

type ResolvedAccount = { account: Address; qx: Hex; qy: Hex; deployed: boolean; nonce: bigint }

export class Relayer {
  private addrCache = new Map<string, Address>() // `${qx}${qy}` -> counterfactual address (immutable mapping)
  private inflight = new Map<Address, Hex | 'reserving'>()
  private strikes = new Map<string, number[]>() // `a:<account>` / `ip:<ip>` -> timestamps of on-chain reverts
  private losses: { t: number; wei: bigint }[] = [] // unreimbursed gas (reverts, cancellations)

  constructor(
    private cfg: Config,
    private pub: PublicClient,
    private chain: Chain,
    private tx: TxManager,
  ) {}

  get relayerAddress(): Address {
    return this.tx.address
  }

  /** Called by the TxManager when a tx is final. */
  onFinal = (r: TxRecord) => {
    if (this.inflight.get(r.sproutAccount) === r.id) this.inflight.delete(r.sproutAccount)
    // Unreimbursed gas: a reverted batch (fee not paid) or a cancellation self-transfer.
    if (r.status === 'reverted' || r.status === 'cancelled') {
      this.losses.push({ t: Date.now(), wei: r.costWei ?? r.gas * r.gasPrice })
    }
    if (r.status === 'reverted') {
      this.strike(`a:${r.sproutAccount}`)
      if (r.clientIp) this.strike(`ip:${r.clientIp}`)
    }
  }

  private strike(key: string) {
    const list = (this.strikes.get(key) ?? []).filter((t) => Date.now() - t < 3600_000)
    list.push(Date.now())
    this.strikes.set(key, list)
    if (this.strikes.size > 50_000) {
      for (const [k, v] of this.strikes) if (!v.some((t) => Date.now() - t < 3600_000)) this.strikes.delete(k)
    }
  }

  private strikeCount(key: string) {
    return (this.strikes.get(key) ?? []).filter((t) => Date.now() - t < 3600_000).length
  }

  /** BNB lost to reverts/cancellations in the last hour. */
  lossLastHour(): bigint {
    const from = Date.now() - 3600_000
    this.losses = this.losses.filter((l) => l.t > from)
    return this.losses.reduce((s, l) => s + l.wei, 0n)
  }

  private checkStrikes(account: Address, ip?: string) {
    if (this.strikeCount(`a:${account}`) >= 3) {
      throw new HttpError(429, 'this account had 3 transactions revert on-chain in the last hour; paused for up to 1h')
    }
    if (ip && this.cfg.ipStrikeLimit > 0 && this.strikeCount(`ip:${ip}`) >= this.cfg.ipStrikeLimit) {
      throw new HttpError(429, 'too many transactions from this network reverted on-chain in the last hour; paused for up to 1h')
    }
  }

  private async counterfactual(qx: Hex, qy: Hex): Promise<Address> {
    const k = `${qx}${qy}`
    const hit = this.addrCache.get(k)
    if (hit) return hit
    const a = getAddress(
      await this.pub.readContract({ address: this.cfg.accountFactory!, abi: FACTORY_ABI, functionName: 'getAddress', args: [qx, qy] }),
    )
    if (this.addrCache.size > 50_000) this.addrCache.clear()
    this.addrCache.set(k, a)
    return a
  }

  /** Establish (account, key, deployed, nonce) and prove it is a genuine Sprout account for that key. */
  async resolve(account: Address, qx?: Hex, qy?: Hex): Promise<ResolvedAccount> {
    const code = await this.pub.getCode({ address: account })
    const deployed = !!code && code !== '0x'
    if (deployed) {
      const [oqx, oqy] = await this.pub
        .readContract({ address: account, abi: ACCOUNT_ABI, functionName: 'owner' })
        .catch(() => {
          throw new HttpError(400, 'account is a contract but not a Sprout account')
        })
      if (qx && (oqx.toLowerCase() !== qx || oqy.toLowerCase() !== qy)) throw new HttpError(400, 'qx/qy do not match the account owner')
      const kx = oqx.toLowerCase() as Hex
      const ky = oqy.toLowerCase() as Hex
      if (kx === ZERO32) throw new HttpError(400, 'account is not initialized')
      if ((await this.counterfactual(kx, ky)) !== account) throw new HttpError(400, 'account was not created by the configured SproutAccountFactory')
      const nonce = await this.pub.readContract({ address: account, abi: ACCOUNT_ABI, functionName: 'nonce' })
      return { account, qx: kx, qy: ky, deployed, nonce }
    }
    if (!qx || !qy) throw new HttpError(400, 'account is not deployed yet: qx and qy (the passkey public key) are required')
    if (!isOnCurve(qx, qy)) throw new HttpError(400, 'qx/qy is not a valid P-256 public key')
    if ((await this.counterfactual(qx, qy)) !== account) {
      throw new HttpError(400, 'account does not match factory.getAddress(qx, qy) for the configured SproutAccountFactory')
    }
    return { account, qx, qy, deployed, nonce: 0n }
  }

  private buildTx(r: ResolvedAccount, calls: Call[], deadline: bigint, gasFee: bigint, feeRecipient: Address, sig: WebAuthnSig) {
    if (r.deployed) {
      return {
        to: r.account,
        data: encodeFunctionData({ abi: ACCOUNT_ABI, functionName: 'executeBatch', args: [calls, deadline, gasFee, feeRecipient, sig] }),
      }
    }
    return {
      to: this.cfg.accountFactory!,
      data: encodeFunctionData({
        abi: FACTORY_ABI,
        functionName: 'createAccountAndExecute',
        args: [r.qx, r.qy, calls, deadline, gasFee, feeRecipient, sig],
      }),
    }
  }

  private async gasPrice(): Promise<bigint> {
    try {
      return await this.tx.gasPrice()
    } catch (e) {
      if (e instanceof GasPriceTooHigh) throw new HttpError(503, e.message)
      throw new HttpError(502, `RPC error reading gas price: ${shortError(e)}`)
    }
  }

  private async estimate(p: { to: Address; data: Hex; stateOverride?: { address: Address; code: Hex }[] }): Promise<bigint> {
    try {
      return await this.pub.estimateGas({ account: this.tx.address, to: p.to, data: p.data, stateOverride: p.stateOverride })
    } catch (e) {
      const data = extractRevertData(e)
      const msg = shortError(e)
      if (data || /revert/i.test(msg)) throw new HttpError(422, `simulation reverted: ${data ? describeRevert(data) : msg}`)
      throw new HttpError(502, `RPC error during simulation: ${msg}`)
    }
  }

  // ---------------------------------------------------------------------------------------------- /quote-gas

  async quote(q: QuoteRequest) {
    const r = await this.resolve(q.account, q.qx, q.qy)
    const deadline = nowSec() + BigInt(this.cfg.deadlineSuggestSec)
    const gasPrice = await this.gasPrice()
    const feeRecipient = this.tx.address

    // Simulate the calls with SimAccount code at the account address (no signature needed). For an undeployed account
    // this goes through factory.createAccountAndExecute: createAccount() sees code at the address and returns early.
    const sim = this.buildTx(r, q.calls, deadline, 0n, feeRecipient, DUMMY_SIG)
    let method: 'simulated' | 'heuristic' = 'simulated'
    let simGas: bigint
    try {
      simGas = await this.estimate({ ...sim, stateOverride: [{ address: r.account, code: SIM_ACCOUNT_RUNTIME }] })
    } catch (e) {
      if (e instanceof HttpError && e.status === 422) throw e
      // RPC without state-override support: conservative heuristic.
      method = 'heuristic'
      simGas = 60_000n + 180_000n * BigInt(q.calls.length)
    }
    const gas = simGas + this.cfg.verifyOverheadGas + (r.deployed ? 0n : this.cfg.deployOverheadGas)
    if (gas > this.cfg.maxGasPerTx) throw new HttpError(422, `batch needs ~${gas} gas, above the relayer limit ${this.cfg.maxGasPerTx}`)
    const gasFee = bps(gas * gasPrice, this.cfg.quoteMarginBps)

    // Balance sanity: account must hold the call values + fee (unless the calls bring BNB in, e.g. a sell).
    const balance = await this.pub.getBalance({ address: r.account })
    const outValue = q.calls.reduce((s, c) => s + c.value, 0n)
    let warning: string | undefined
    if (balance < outValue + gasFee) {
      if (method === 'simulated') {
        const withFee = this.buildTx(r, q.calls, deadline, gasFee, feeRecipient, DUMMY_SIG)
        await this.estimate({ ...withFee, stateOverride: [{ address: r.account, code: SIM_ACCOUNT_RUNTIME }] }) // throws 422 InsufficientBalanceForFee
      } else {
        warning = `account balance ${balance} wei may not cover call values ${outValue} + gas fee ${gasFee}`
      }
    }

    return {
      gasFee: gasFee.toString(),
      feeRecipient,
      deadline: deadline.toString(),
      chainId: this.chain.id,
      account: r.account,
      deployed: r.deployed,
      nonce: r.nonce.toString(),
      gasLimit: gas.toString(),
      gasPrice: gasPrice.toString(),
      marginBps: this.cfg.quoteMarginBps,
      method,
      balance: balance.toString(),
      ...(warning ? { warning } : {}),
    }
  }

  // ---------------------------------------------------------------------------------------------- /relay

  async relay(q: RelayRequest, clientIp?: string) {
    const now = nowSec()
    if (q.feeRecipient !== this.tx.address) throw new HttpError(400, `feeRecipient must be the relayer address ${this.tx.address}`)
    if (q.deadline < now + BigInt(this.cfg.deadlineMinSec)) throw new HttpError(400, 'deadline is in the past or too close — re-sign with a fresh quote')
    if (q.deadline > now + BigInt(this.cfg.deadlineMaxSec)) throw new HttpError(400, `deadline is more than ${this.cfg.deadlineMaxSec}s in the future`)
    this.checkStrikes(q.account, clientIp)
    // Griefing circuit breaker: batches can pass simulation and still revert on-chain (state changed in between), and
    // the relayer pays for those. Past the hourly loss budget only established accounts (nonce > 0) are served; past
    // twice the budget, nobody is until the window drains.
    const lost = this.lossLastHour()
    const budget = this.cfg.revertBudgetWei
    if (budget > 0n && lost >= 2n * budget) {
      throw new HttpError(503, 'relayer paused: too many reverted transactions in the last hour, try again later', { code: 'revert-budget' })
    }
    if (this.inflight.has(q.account)) throw new HttpError(409, 'a transaction for this account is still pending; wait for it to confirm')
    if (this.tx.pendingCount >= this.cfg.maxPendingTxs) throw new HttpError(503, 'relayer is busy, try again shortly')

    this.inflight.set(q.account, 'reserving')
    let rec: TxRecord | undefined
    try {
      const r = await this.resolve(q.account, q.qx, q.qy)
      if (budget > 0n && lost >= budget && r.nonce === 0n) {
        throw new HttpError(503, 'relayer is only serving established accounts right now (too many reverts in the last hour), try again later', {
          code: 'revert-budget',
        })
      }

      const challenge = computeChallenge({
        chainId: this.chain.id,
        account: r.account,
        nonce: r.nonce,
        deadline: q.deadline,
        gasFee: q.gasFee,
        feeRecipient: q.feeRecipient,
        calls: q.calls,
      })
      const v = verifyWebAuthn(challenge, q.sig, r.qx, r.qy)
      if (!v.ok) throw new HttpError(401, `signature rejected: ${v.reason}`, { challenge, nonce: r.nonce.toString() })

      const [gasPrice, relayerBalance] = await Promise.all([this.gasPrice(), this.pub.getBalance({ address: this.tx.address })])
      if (relayerBalance < this.cfg.minRelayerBalanceWei) throw new HttpError(503, 'relayer is out of gas funds; try again later')

      const t = this.buildTx(r, q.calls, q.deadline, q.gasFee, q.feeRecipient, q.sig)
      const est = await this.estimate(t) // full simulation with the real signature + real code
      if (est > this.cfg.maxGasPerTx) throw new HttpError(422, `batch needs ${est} gas, above the relayer limit ${this.cfg.maxGasPerTx}`)
      const required = bps(est * gasPrice, this.cfg.relayMinMarginBps)
      if (q.gasFee < required) {
        throw new HttpError(400, `gasFee too low: need at least ${required} wei at the current gas price — request a new quote`, {
          code: 'fee-too-low',
          required: required.toString(),
        })
      }
      // Gas limit: headroom over the estimate, but never more gas than the signed fee pays for at this price, so even a
      // batch that burns its whole gas limit costs the relayer at most gasFee (which it is paid when the batch succeeds).
      // +10% (+5k) is enough over an exact estimate that is then re-checked with eth_call at that very limit, and it
      // leaves the rest of the quote margin for one or two gas-price bumps if the tx gets stuck (see TxManager.replace).
      let gasLimit = (est * 11n) / 10n + 5_000n
      const feeCovered = gasPrice > 0n ? q.gasFee / gasPrice : this.cfg.maxGasPerTx
      if (gasLimit > feeCovered) gasLimit = feeCovered
      if (gasLimit > this.cfg.maxGasPerTx) gasLimit = this.cfg.maxGasPerTx
      if (gasLimit < est) throw new HttpError(400, 'gasFee too low for the gas this batch needs', { code: 'fee-too-low', required: required.toString() })
      if (relayerBalance < gasLimit * gasPrice) throw new HttpError(503, 'relayer balance too low for this transaction')

      // eth_estimateGas only proves success at the estimate; a gas-sensitive call can still fail at a different limit.
      // Re-run the exact transaction with the exact gas limit we will send.
      try {
        await this.pub.call({ account: this.tx.address, to: t.to, data: t.data, gas: gasLimit, gasPrice })
      } catch (e) {
        const data = extractRevertData(e)
        const msg = shortError(e)
        if (data || /revert|out of gas/i.test(msg)) throw new HttpError(422, `simulation reverted at the gas limit: ${data ? describeRevert(data) : msg}`)
        throw new HttpError(502, `RPC error during simulation: ${msg}`)
      }

      rec = await this.tx
        .send({
          ...t,
          gas: gasLimit,
          gasPrice,
          sproutAccount: r.account,
          deadline: q.deadline,
          clientIp,
          // Replacements may raise the price while the EXPECTED cost (estimate × price) stays within the fee. Only a
          // batch that also burns its whole +10% headroom while stuck could cost more, and then by at most ~10% of the fee.
          maxPrice: q.gasFee / est,
        })
        .catch((e) => {
          throw new HttpError(502, `broadcast failed: ${shortError(e)}`)
        })
      this.inflight.set(q.account, rec.id)
      return {
        txHash: rec.id,
        id: rec.id,
        status: 'submitted' as const,
        account: r.account,
        deployed: r.deployed,
        accountNonce: r.nonce.toString(),
        gasLimit: gasLimit.toString(),
        gasPrice: gasPrice.toString(),
      }
    } finally {
      if (!rec && this.inflight.get(q.account) === 'reserving') this.inflight.delete(q.account)
    }
  }

  // ---------------------------------------------------------------------------------------------- /tx/:hash

  async status(hash: Hex) {
    const rec = this.tx.get(hash)
    if (rec) {
      const current = rec.minedHash ?? rec.hashes[rec.hashes.length - 1]
      return {
        txHash: current,
        id: rec.id,
        hashes: rec.hashes,
        status: rec.status === 'success' ? 'success' : rec.status === 'pending' ? 'pending' : 'failed',
        detail: rec.status,
        nonce: rec.nonce,
        account: rec.sproutAccount,
        blockNumber: rec.blockNumber?.toString(),
        gasUsed: rec.gasUsed?.toString(),
        replaced: rec.hashes.length > 1,
        ...(rec.status === 'reverted' ? { error: 'transaction reverted on-chain' } : {}),
        ...(rec.status === 'cancelled' ? { error: 'not mined before its deadline or at a gas price its fee covers; cancelled (nothing executed) - request a new quote' } : {}),
        ...(rec.status === 'dropped' ? { error: rec.error ?? 'dropped' } : {}),
      }
    }
    // Unknown to this process (e.g. sent before a restart): ask the chain.
    const receipt = await this.pub.getTransactionReceipt({ hash }).catch(() => undefined)
    if (receipt) {
      return {
        txHash: hash,
        id: hash,
        status: receipt.status === 'success' ? 'success' : 'failed',
        detail: receipt.status === 'success' ? 'success' : 'reverted',
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        ...(receipt.status !== 'success' ? { error: 'transaction reverted on-chain' } : {}),
      }
    }
    const t = await this.pub.getTransaction({ hash }).catch(() => undefined)
    if (t) return { txHash: hash, id: hash, status: 'pending', detail: 'pending' }
    throw new HttpError(404, 'transaction not found')
  }
}
