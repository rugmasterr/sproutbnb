/**
 * ABIs used by the relayer. Function fragments come from the vendored challenge.ts (identical to accounts/js/challenge.ts);
 * the custom errors mirror accounts/src/ISproutAccount.sol so reverts can be decoded into readable messages.
 * test/abi.test.ts cross-checks every fragment here against accounts/abi/*.json when that directory is present.
 */
import { SPROUT_ACCOUNT_ABI, SPROUT_ACCOUNT_FACTORY_ABI } from './challenge.js'

export const ACCOUNT_ERRORS_ABI = [
  { type: 'error', name: 'NotFactory', inputs: [] },
  { type: 'error', name: 'AlreadyInitialized', inputs: [] },
  { type: 'error', name: 'InvalidPublicKey', inputs: [] },
  {
    type: 'error', name: 'Expired',
    inputs: [{ name: 'deadline', type: 'uint256' }, { name: 'nowTs', type: 'uint256' }],
  },
  { type: 'error', name: 'InvalidSignature', inputs: [] },
  { type: 'error', name: 'Reentrancy', inputs: [] },
  {
    type: 'error', name: 'CallFailed',
    inputs: [{ name: 'index', type: 'uint256' }, { name: 'returnData', type: 'bytes' }],
  },
  {
    type: 'error', name: 'InsufficientBalanceForFee',
    inputs: [{ name: 'balance', type: 'uint256' }, { name: 'gasFee', type: 'uint256' }],
  },
  { type: 'error', name: 'FeeRecipientZero', inputs: [] },
  { type: 'error', name: 'FeeTransferFailed', inputs: [] },
] as const

export const ACCOUNT_ABI = [...SPROUT_ACCOUNT_ABI, ...ACCOUNT_ERRORS_ABI] as const
export const FACTORY_ABI = [...SPROUT_ACCOUNT_FACTORY_ABI, ...ACCOUNT_ERRORS_ABI] as const

/** Generic Error(string) / Panic(uint256) for nested revert data inside CallFailed. */
export const STD_ERRORS_ABI = [
  { type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] },
  { type: 'error', name: 'Panic', inputs: [{ name: 'code', type: 'uint256' }] },
] as const
