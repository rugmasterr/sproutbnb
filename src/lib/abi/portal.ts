// Minimal Flap Portal fragments (from contracts/src/flap/IPortal.sol).
export const portalAbi = [
  {
    type: 'function',
    name: 'getTokenV8Safe',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      {
        name: 'state',
        type: 'tuple',
        components: [
          { name: 'status', type: 'uint8' },
          { name: 'reserve', type: 'uint256' },
          { name: 'circulatingSupply', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'tokenVersion', type: 'uint8' },
          { name: 'r', type: 'uint256' },
          { name: 'h', type: 'uint256' },
          { name: 'k', type: 'uint256' },
          { name: 'dexSupplyThresh', type: 'uint256' },
          { name: 'quoteTokenAddress', type: 'address' },
          { name: 'nativeToQuoteSwapEnabled', type: 'bool' },
          { name: 'extensionID', type: 'bytes32' },
          { name: 'buyTaxRate', type: 'uint256' },
          { name: 'sellTaxRate', type: 'uint256' },
          { name: 'pool', type: 'address' },
          { name: 'progress', type: 'uint256' },
          { name: 'lpFeeProfile', type: 'uint8' },
          { name: 'dexId', type: 'uint8' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'swapExactInput',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'inputToken', type: 'address' },
          { name: 'outputToken', type: 'address' },
          { name: 'inputAmount', type: 'uint256' },
          { name: 'minOutputAmount', type: 'uint256' },
          { name: 'permitData', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'outputAmount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'quoteExactInput',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'inputToken', type: 'address' },
          { name: 'outputToken', type: 'address' },
          { name: 'inputAmount', type: 'uint256' },
        ],
      },
    ],
    outputs: [{ name: 'outputAmount', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'TokenBought',
    inputs: [
      { name: 'ts', type: 'uint256', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'buyer', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'eth', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'postPrice', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TokenSold',
    inputs: [
      { name: 'ts', type: 'uint256', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'seller', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'eth', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'postPrice', type: 'uint256', indexed: false },
    ],
  },
] as const;

/** TokenStatus enum (IPortalTypes). */
export const TokenStatus = { Invalid: 0, Tradable: 1, InDuel: 2, Killed: 3, DEX: 4, Staged: 5 } as const;

export const TOKEN_VERSION_NAMES: Record<number, string> = {
  0: 'TOKEN_LEGACY_MINT_NO_PERMIT',
  1: 'TOKEN_LEGACY_MINT_NO_PERMIT',
  2: 'TOKEN_V2_PERMIT',
  3: 'TOKEN_GOPLUS',
  4: 'TOKEN_TAXED',
  5: 'TOKEN_TAXED_V2',
  6: 'TOKEN_TAXED_V3',
  7: 'TOKEN_V3_PERMIT',
};
