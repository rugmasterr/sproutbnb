// Sprout contracts — written from SPEC.md v2 "Contract interface" (authoritative) and cross-checked against
// contracts/src/*.sol event signatures.

type Param = { readonly name?: string; readonly type: string };
const U256 = [{ type: 'uint256' }] as const;
function view<const N extends string, const O extends readonly Param[] = typeof U256, const I extends readonly Param[] = readonly []>(
  name: N,
  outputs?: O,
  inputs?: I,
) {
  return {
    type: 'function',
    name,
    stateMutability: 'view',
    inputs: (inputs ?? []) as I,
    outputs: (outputs ?? U256) as O,
  } as const;
}

export const factoryAbi = [
  { type: 'function', name: 'plantingsLength', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'getPlantings',
    stateMutability: 'view',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'token', type: 'address' },
          { name: 'vault', type: 'address' },
          { name: 'creator', type: 'address' },
          { name: 'mode', type: 'uint8' },
          { name: 'plantedAt', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'vaultOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'address' }],
  },
  { type: 'function', name: 'roots', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'payouts', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'treasury', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'event',
    name: 'Planted',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'mode', type: 'uint8', indexed: false },
      { name: 'payee', type: 'address', indexed: false },
      { name: 'zcashAddress', type: 'string', indexed: false },
    ],
  },
] as const;

export const vaultAbi = [
  { type: 'function', name: 'taxToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'mode', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'payee', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'zcashAddress', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'controller', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'lpPot', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'rootPot', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'opsPot', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'payeePot', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'stats',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'received', type: 'uint256' },
      { name: 'toLiquidity', type: 'uint256' },
      { name: 'toRootstock', type: 'uint256' },
      { name: 'toOps', type: 'uint256' },
      { name: 'toPayee', type: 'uint256' },
      { name: 'pending', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'sync', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'flush', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'setPayee', stateMutability: 'nonpayable', inputs: [{ name: 'newPayee', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setZcashAddress', stateMutability: 'nonpayable', inputs: [{ name: 'addr', type: 'string' }], outputs: [] },
  { type: 'function', name: 'transferControl', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }], outputs: [] },
  { type: 'event', name: 'Revenue', inputs: [{ name: 'amount', type: 'uint256', indexed: false }] },
  {
    type: 'event',
    name: 'Flushed',
    inputs: [
      { name: 'toLiquidity', type: 'uint256', indexed: false },
      { name: 'toRootstock', type: 'uint256', indexed: false },
      { name: 'toOps', type: 'uint256', indexed: false },
      { name: 'toPayee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PayeeChanged',
    inputs: [
      { name: 'previousPayee', type: 'address', indexed: true },
      { name: 'newPayee', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'ZcashAddressChanged',
    inputs: [
      { name: 'previous', type: 'string', indexed: false },
      { name: 'next', type: 'string', indexed: false },
    ],
  },
] as const;

export const rootsAbi = [
  view('sprout', [{ type: 'address' }]),
  view('lpPot'),
  view('rootPot'),
  view('MAX_DRAW'),
  view('MIN_INTERVAL'),
  view('lastBurnAt'),
  view('lastLiquidityAt'),
  view('grovePair', [{ type: 'address' }]),
  view('totals', [
    { name: 'sproutBurned', type: 'uint256' },
    { name: 'bnbBurnSpent', type: 'uint256' },
    { name: 'bnbToLiquidity', type: 'uint256' },
    { name: 'zecToLiquidity', type: 'uint256' },
    { name: 'lpBurned', type: 'uint256' },
  ]),
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'lpAmount', type: 'uint256', indexed: false },
      { name: 'rootAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BurnRun',
    inputs: [
      { name: 'bnbIn', type: 'uint256', indexed: false },
      { name: 'sproutBurned', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LiquidityRun',
    inputs: [
      { name: 'bnbIn', type: 'uint256', indexed: false },
      { name: 'zecIn', type: 'uint256', indexed: false },
      { name: 'sproutIn', type: 'uint256', indexed: false },
      { name: 'lpBurned', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const payoutsAbi = [
  view('pendingBnb', [{ type: 'uint256' }], [{ name: 'vault', type: 'address' }]),
  view('zcashFoundationAddress', [{ type: 'string' }]),
  view('MAX_BRIDGE'),
  view('totals', [
    { name: 'zecToPayees', type: 'uint256' },
    { name: 'zecToHolders', type: 'uint256' },
    { name: 'bnbBridgedToZcash', type: 'uint256' },
    { name: 'bnbBridgedToFoundation', type: 'uint256' },
  ]),
  {
    type: 'event',
    name: 'Settled',
    inputs: [
      { name: 'vault', type: 'address', indexed: true },
      { name: 'mode', type: 'uint8', indexed: false },
      { name: 'bnbIn', type: 'uint256', indexed: false },
      { name: 'zecOut', type: 'uint256', indexed: false },
      { name: 'to', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BridgedOut',
    inputs: [
      { name: 'vault', type: 'address', indexed: true },
      { name: 'mode', type: 'uint8', indexed: false },
      { name: 'bnbIn', type: 'uint256', indexed: false },
      { name: 'depositAddress', type: 'address', indexed: false },
      { name: 'quoteRef', type: 'bytes32', indexed: false },
      { name: 'zcashAddress', type: 'string', indexed: false },
    ],
  },
] as const;

export const terminalAbi = [
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ name: 'out', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sell',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minBnbOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ name: 'bnbOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sellAndBridge',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minBnbOut', type: 'uint256' },
      { name: 'oneClickDepositAddress', type: 'address' },
      { name: 'quoteRef', type: 'bytes32' },
    ],
    outputs: [{ name: 'bnbOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'bridge',
    stateMutability: 'payable',
    inputs: [
      { name: 'oneClickDepositAddress', type: 'address' },
      { name: 'quoteRef', type: 'bytes32' },
    ],
    outputs: [],
  },
  view('FEE_BPS'),
  {
    type: 'event',
    name: 'TerminalTrade',
    inputs: [
      { name: 'trader', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'isBuy', type: 'bool', indexed: false },
      { name: 'bnbAmount', type: 'uint256', indexed: false },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CashOut',
    inputs: [
      { name: 'trader', type: 'address', indexed: true },
      { name: 'bnbOut', type: 'uint256', indexed: false },
      { name: 'depositAddress', type: 'address', indexed: false },
      { name: 'quoteRef', type: 'bytes32', indexed: false },
    ],
  },
] as const;

/** Deployer's choice modes. vaultData = abi.encode(uint8 mode, address payee, string zcashAddress). */
export const MODE = { ME: 0, WALLET: 1, HOLDERS: 2, ZCASH_WALLET: 3, ZCASH_FOUNDATION: 4 } as const;
export type Mode = 0 | 1 | 2 | 3 | 4;
export const MODES: Mode[] = [0, 1, 2, 3, 4];

/** The 2.00% tax split (bps of trade volume). */
export const SPLIT = { liquidity: 50, rootstock: 50, ops: 20, choice: 80 } as const;
