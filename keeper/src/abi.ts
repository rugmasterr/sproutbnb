/**
 * Minimal typed ABIs the keeper uses. Aligned with the contracts agent's exports in ../contracts/abi/*.json
 * (run `npm run check-abi` from keeper/ to verify every entry below still matches those files).
 * Kept inline (not imported from ../contracts) so the fly.io Docker build only needs the keeper/ directory.
 */

const sproutErrors = [
  { type: "error", name: "AlreadyClaimed", inputs: [] },
  { type: "error", name: "AlreadySet", inputs: [] },
  { type: "error", name: "BadDepositValue", inputs: [] },
  { type: "error", name: "BridgeTooLarge", inputs: [] },
  { type: "error", name: "DrawTooLarge", inputs: [] },
  { type: "error", name: "EpochClosed", inputs: [] },
  { type: "error", name: "FactoryNotSet", inputs: [] },
  { type: "error", name: "FoundationNotSet", inputs: [] },
  {
    type: "error",
    name: "GrovePriceOutOfRange",
    inputs: [
      { name: "groveZecPerSprout", type: "uint256" },
      { name: "runZecPerSprout", type: "uint256" },
    ],
  },
  { type: "error", name: "InsufficientOutput", inputs: [] },
  {
    type: "error",
    name: "InsufficientPending",
    inputs: [
      { name: "requested", type: "uint256" },
      { name: "available", type: "uint256" },
    ],
  },
  { type: "error", name: "InsufficientPot", inputs: [] },
  { type: "error", name: "InvalidEpoch", inputs: [] },
  { type: "error", name: "InvalidProof", inputs: [] },
  { type: "error", name: "InvalidZcashAddress", inputs: [] },
  { type: "error", name: "LegacyV6ValidationHookNotImplemented", inputs: [] },
  { type: "error", name: "NotKeeper", inputs: [] },
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "NotRegisteredVault", inputs: [] },
  { type: "error", name: "OnlyVaultPortal", inputs: [] },
  { type: "error", name: "NotAuthorized", inputs: [] },
  { type: "error", name: "SlippageRequired", inputs: [] },
  { type: "error", name: "SproutNotSet", inputs: [] },
  { type: "error", name: "TooEarly", inputs: [] },
  { type: "error", name: "TooSoon", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "UnsupportedChain", inputs: [{ name: "chainId", type: "uint256" }] },
  { type: "error", name: "WrongMode", inputs: [{ name: "mode", type: "uint8" }] },
  { type: "error", name: "ZcashAddressNotSet", inputs: [] },
  { type: "error", name: "ZecNotSet", inputs: [] },
  { type: "error", name: "ZecOnChainFixed", inputs: [] },
  {
    type: "error",
    name: "ZecOutTooLow",
    inputs: [
      { name: "got", type: "uint256" },
      { name: "minOut", type: "uint256" },
    ],
  },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
] as const;

export const factoryAbi = [
  { type: "function", name: "plantingsLength", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getPlantings",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "page",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "vault", type: "address" },
          { name: "creator", type: "address" },
          { name: "mode", type: "uint8" },
          { name: "plantedAt", type: "uint64" },
        ],
      },
    ],
  },
  { type: "function", name: "roots", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "payouts", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "treasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "factorySpecVersion", stateMutability: "pure", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "isVault",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  ...sproutErrors,
] as const;

export const vaultAbi = [
  { type: "function", name: "taxToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "mode", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "payee", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "zcashAddress", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "payeePot", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "stats",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "received", type: "uint256" },
      { name: "toLiquidity", type: "uint256" },
      { name: "toRootstock", type: "uint256" },
      { name: "toOps", type: "uint256" },
      { name: "toPayee", type: "uint256" },
      { name: "pending", type: "uint256" },
    ],
  },
  { type: "function", name: "flush", stateMutability: "nonpayable", inputs: [], outputs: [] },
  ...sproutErrors,
] as const;

export const payoutsAbi = [
  {
    type: "function",
    name: "pendingBnb",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "totalPendingBnb", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAX_BRIDGE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "EPOCH_RECLAIM_DELAY", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "zec", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "keeper", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "zcashFoundationAddress", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "totals",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "zecToPayees", type: "uint256" },
      { name: "zecToHolders", type: "uint256" },
      { name: "bnbBridgedToZcash", type: "uint256" },
      { name: "bnbBridgedToFoundation", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "bnbAmount", type: "uint256" },
      { name: "minZecOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "bridgeOut",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "bnbAmount", type: "uint256" },
      { name: "oneClickDepositAddress", type: "address" },
      { name: "quoteRef", type: "bytes32" },
    ],
    outputs: [],
  },
  // fallback holder distributor
  {
    type: "function",
    name: "holderPool",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "totalHolderPool", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "usableDividend",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "pushHolderPool",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "publishHolderEpoch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "root", type: "bytes32" },
      { name: "total", type: "uint256" },
    ],
    outputs: [{ name: "epoch", type: "uint256" }],
  },
  {
    type: "function",
    name: "reclaimEpoch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "epoch", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "epochsLength",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getEpoch",
    stateMutability: "view",
    inputs: [
      { name: "vault", type: "address" },
      { name: "epoch", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "root", type: "bytes32" },
          { name: "total", type: "uint128" },
          { name: "claimed", type: "uint128" },
          { name: "publishedAt", type: "uint64" },
          { name: "closed", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "BridgedOut",
    anonymous: false,
    inputs: [
      { name: "vault", type: "address", indexed: true },
      { name: "mode", type: "uint8", indexed: false },
      { name: "bnbIn", type: "uint256", indexed: false },
      { name: "depositAddress", type: "address", indexed: false },
      { name: "quoteRef", type: "bytes32", indexed: false },
      { name: "zcashAddress", type: "string", indexed: false },
    ],
  },
  ...sproutErrors,
] as const;

export const rootsAbi = [
  { type: "function", name: "sprout", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "zec", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "portal", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "keeper", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "lpPot", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "rootPot", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAX_DRAW", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MIN_INTERVAL", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lastBurnAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lastLiquidityAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "grovePair", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "totals",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sproutBurned", type: "uint256" },
      { name: "bnbBurnSpent", type: "uint256" },
      { name: "bnbToLiquidity", type: "uint256" },
      { name: "zecToLiquidity", type: "uint256" },
      { name: "lpBurned", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "burnRun",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "minSproutOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "liquidityRun",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "minZecOut", type: "uint256" },
      { name: "minSproutOut", type: "uint256" },
    ],
    outputs: [],
  },
  ...sproutErrors,
] as const;

/** Flap Portal (IPortalTradeV2). quoteExactInput is NOT view: call it through eth_call / simulate. */
export const portalAbi = [
  {
    type: "function",
    name: "quoteExactInput",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "inputToken", type: "address" },
          { name: "outputToken", type: "address" },
          { name: "inputAmount", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "outputAmount", type: "uint256" }],
  },
] as const;

/** PancakeSwap V3 QuoterV2 (non-view; simulate). */
export const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
  { type: "function", name: "WETH9", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

/** Flap Tax Token V3 / Dividend (only what the fallback distributor needs). */
export const taxTokenAbi = [
  { type: "function", name: "dividendContract", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export const dividendAbi = [
  { type: "function", name: "minimumShareBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const WBNB: Record<number, `0x${string}`> = {
  56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  97: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
};

export const DEAD = "0x000000000000000000000000000000000000dEaD" as const;
