// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title SimAccount — gas-estimation stand-in for SproutAccount (NEVER deployed)
/// @notice The relayer's /quote-gas has to price a batch BEFORE the passkey has signed it, so it cannot simulate the
///         real `executeBatch` (it would revert InvalidSignature). Instead it runs `eth_estimateGas` with a state
///         override that puts THIS runtime code at the account address. It has the same `executeBatch` ABI and runs the
///         calls + fee payment exactly like SproutAccount, but skips the deadline / signature / nonce / lock logic.
///         The relayer adds a fixed overhead for those (VERIFY_OVERHEAD_GAS) and for first-use deployment
///         (DEPLOY_OVERHEAD_GAS). The real transaction is always re-estimated with the real signature in /relay.
contract SimAccount {
    struct Call {
        address to;
        uint256 value;
        bytes data;
    }

    struct WebAuthnSig {
        bytes authenticatorData;
        string clientDataJSON;
        uint256 challengeIndex;
        uint256 typeIndex;
        uint256 r;
        uint256 s;
    }

    error CallFailed(uint256 index, bytes returnData);
    error InsufficientBalanceForFee(uint256 balance, uint256 gasFee);
    error FeeTransferFailed();

    function executeBatch(Call[] calldata calls, uint256, uint256 gasFee, address feeRecipient, WebAuthnSig calldata)
        external
    {
        uint256 len = calls.length;
        for (uint256 i; i < len; ++i) {
            Call calldata c = calls[i];
            (bool ok, bytes memory ret) = c.to.call{value: c.value}(c.data);
            if (!ok) revert CallFailed(i, ret);
        }
        if (gasFee != 0) {
            uint256 bal = address(this).balance;
            if (bal < gasFee) revert InsufficientBalanceForFee(bal, gasFee);
            (bool sent,) = feeRecipient.call{value: gasFee}("");
            if (!sent) revert FeeTransferFailed();
        }
    }

    /// @dev Mirrors SproutAccount.nonce() / owner() reads so nothing that probes the account breaks during a sim.
    function nonce() external pure returns (uint256) {
        return 0;
    }

    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return 0xffffffff;
    }

    receive() external payable {}
}
