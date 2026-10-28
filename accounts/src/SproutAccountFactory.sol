// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Clones} from "@openzeppelin/proxy/Clones.sol";
import {SproutAccount} from "./SproutAccount.sol";
import {Call, WebAuthnSig} from "./ISproutAccount.sol";

/// @title SproutAccountFactory
/// @notice Deploys passkey accounts as EIP-1167 clones at CREATE2 address determined only by the passkey public key:
///         salt = keccak256(abi.encode(qx, qy)). The address is known before deployment (counterfactual), so a
///         1Click ZEC->BNB delivery can be sent to it before the account exists.
/// @dev No owner, no admin, no fees. The implementation is created in the constructor and is fixed forever.
contract SproutAccountFactory {
    /// @notice The single SproutAccount implementation every clone delegates to.
    address public immutable implementation;

    event AccountCreated(address indexed account, bytes32 indexed qx, bytes32 indexed qy);

    constructor() {
        implementation = address(new SproutAccount());
    }

    function salt(bytes32 qx, bytes32 qy) public pure returns (bytes32) {
        return keccak256(abi.encode(qx, qy));
    }

    /// @notice Counterfactual address of the account for passkey (qx, qy).
    function getAddress(bytes32 qx, bytes32 qy) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt(qx, qy), address(this));
    }

    /// @notice Deploy (if needed) and return the account for (qx, qy). Idempotent: returns the existing account.
    /// @dev Reverts with InvalidPublicKey if (qx, qy) is not on the P-256 curve.
    function createAccount(bytes32 qx, bytes32 qy) public returns (address account) {
        account = getAddress(qx, qy);
        if (account.code.length != 0) return account;
        Clones.cloneDeterministic(implementation, salt(qx, qy));
        SproutAccount(payable(account)).initialize(qx, qy);
        emit AccountCreated(account, qx, qy);
    }

    /// @notice Relayer convenience: deploy-if-needed and execute a signed batch in ONE transaction (first use).
    function createAccountAndExecute(
        bytes32 qx,
        bytes32 qy,
        Call[] calldata calls,
        uint256 deadline,
        uint256 gasFee,
        address feeRecipient,
        WebAuthnSig calldata sig
    ) external returns (address account) {
        account = createAccount(qx, qy);
        SproutAccount(payable(account)).executeBatch(calls, deadline, gasFee, feeRecipient, sig);
    }
}
