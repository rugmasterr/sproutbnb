/// <reference lib="webworker" />
// CREATE2 vanity search (Flap docs "Find the salt"): deployer = Portal, init code = EIP-1167 clone of the
// Tax Token V3 implementation; the token address must end with the suffix (7777 for tax tokens).
import { concat, getAddress, keccak256, toHex, type Address, type Hex } from 'viem';

type Req = { portal: Address; impl: Address; suffix: string };

self.onmessage = (e: MessageEvent<Req>) => {
  try {
    const { portal, impl, suffix } = e.data;
    const bytecode = ('0x3d602d80600a3d3981f3363d3d373d3d3d363d73' + impl.slice(2).toLowerCase() + '5af43d82803e903d91602b57fd5bf3') as Hex;
    const initHash = keccak256(bytecode);
    const prefix = concat(['0xff', portal]);
    const want = suffix.toLowerCase();
    const seed = new Uint8Array(32);
    crypto.getRandomValues(seed);
    let salt = keccak256(toHex(seed));
    let tries = 0;
    for (;;) {
      const h = keccak256(concat([prefix, salt, initHash]));
      const addr = ('0x' + h.slice(26)) as Hex;
      if (addr.endsWith(want)) {
        (self as unknown as Worker).postMessage({ type: 'done', salt, address: getAddress(addr), tries });
        return;
      }
      salt = keccak256(salt);
      tries++;
      if ((tries & 4095) === 0) (self as unknown as Worker).postMessage({ type: 'progress', tries });
      if (tries > 50_000_000) throw new Error('salt search exhausted');
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};

export {};
