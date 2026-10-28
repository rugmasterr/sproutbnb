// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ISproutAccount, Call, WebAuthnSig} from "./ISproutAccount.sol";
import {WebAuthn} from "./lib/WebAuthn.sol";
import {P256} from "./lib/P256.sol";

/// @title SproutAccount (春笋 passkey account)
/// @notice A minimal smart account on BNB Chain controlled by ONE WebAuthn passkey (secp256r1 / P-256).
///         The passkey signs a batch of calls; anyone (normally Sprout's relayer) submits it and is reimbursed
///         `gasFee` BNB from the account, to the `feeRecipient` the passkey signed for. The account holds the BNB
///         that arrives from Zcash via NEAR Intents 1Click and the coins the user buys.
///
/// @dev SECURITY MODEL — READ THIS:
///   - The passkey (qx, qy) is the ONLY key. There is no owner, no guardian, no recovery, no upgrade, no key rotation.
///     If the passkey is lost, the funds are lost. Users should use a synced passkey (iCloud Keychain, Google
///     Password Manager, 1Password, ...) and should not keep more than they can afford to lose.
///   - Deployed as an EIP-1167 minimal proxy of a fixed implementation; the implementation has no upgrade path.
///   - Replay protection: sequential `nonce`, `block.chainid` and `address(this)` are inside the signed challenge.
///   - Every batch has a `deadline` (unix seconds, inclusive).
///   - `nonce` is consumed before any external call; a reentrancy lock blocks nested `executeBatch` calls.
///   - The whole batch is atomic: any failing call reverts everything (including the fee payment and nonce bump).
contract SproutAccount is ISproutAccount {
    /// @notice ERC-1271 magic value.
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;
    /// @notice Domain tag for ERC-1271 challenges, so a 1271 signature can never be replayed as an executeBatch.
    bytes32 public constant ERC1271_TYPEHASH = keccak256("SproutAccount.ERC1271(bytes32 hash)");

    /// @notice The factory that deployed the implementation; only it may initialize clones.
    address public immutable override factory;

    bytes32 private _qx;
    bytes32 private _qy;
    uint256 public override nonce;
    bool private _initialized;
    uint256 private _locked; // 0/1 — clones start at 0

    modifier lock() {
        if (_locked != 0) revert Reentrancy();
        _locked = 1;
        _;
        _locked = 0;
    }

    constructor() {
        factory = msg.sender;
        _initialized = true; // the implementation itself can never be initialized / used
    }

    /// @inheritdoc ISproutAccount
    function initialize(bytes32 qx, bytes32 qy) external override {
        if (msg.sender != factory) revert NotFactory();
        if (_initialized) revert AlreadyInitialized();
        if (!P256.isOnCurve(uint256(qx), uint256(qy))) revert InvalidPublicKey();
        _initialized = true;
        _qx = qx;
        _qy = qy;
        emit AccountInitialized(qx, qy);
    }

    /// @notice The passkey public key controlling this account.
    function owner() external view override returns (bytes32 qx, bytes32 qy) {
        return (_qx, _qy);
    }

    /// @notice keccak256(abi.encode(calls)) — exposed so off-chain code can cross-check its encoding.
    function hashCalls(Call[] calldata calls) public pure returns (bytes32) {
        return keccak256(abi.encode(calls));
    }

    /// @notice The 32-byte challenge the passkey must sign for the NEXT executeBatch with these parameters.
    /// challenge = keccak256(abi.encode(chainid, account, nonce, deadline, gasFee, feeRecipient, keccak256(abi.encode(calls))))
    function getChallenge(Call[] calldata calls, uint256 deadline, uint256 gasFee, address feeRecipient)
        public
        view
        override
        returns (bytes32)
    {
        return _challenge(nonce, hashCalls(calls), deadline, gasFee, feeRecipient);
    }

    function _challenge(uint256 n, bytes32 callsHash, uint256 deadline, uint256 gasFee, address feeRecipient)
        internal
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), n, deadline, gasFee, feeRecipient, callsHash));
    }

    /// @inheritdoc ISproutAccount
    function executeBatch(
        Call[] calldata calls,
        uint256 deadline,
        uint256 gasFee,
        address feeRecipient,
        WebAuthnSig calldata sig
    ) external override lock {
        if (block.timestamp > deadline) revert Expired(deadline, block.timestamp);
        if (gasFee != 0 && feeRecipient == address(0)) revert FeeRecipientZero();

        uint256 n = nonce;
        bytes32 challenge = _challenge(n, keccak256(abi.encode(calls)), deadline, gasFee, feeRecipient);
        if (!_verify(challenge, sig)) revert InvalidSignature();
        unchecked {
            nonce = n + 1; // consumed before any external call
        }

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

        emit Executed(n, challenge, len, gasFee, feeRecipient);
    }

    /// @notice ERC-1271. `signature` = abi.encode(WebAuthnSig) over the challenge
    ///         keccak256(abi.encode(ERC1271_TYPEHASH, chainid, address(this), hash)).
    ///         Malformed `signature` bytes return 0xffffffff (never revert): decoding happens in a self-staticcall
    ///         so an ABI-decoding revert is caught.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view override returns (bytes4) {
        try this.decodeWebAuthnSig(signature) returns (WebAuthnSig memory sig) {
            if (_verifyMem(erc1271Challenge(hash), sig)) return ERC1271_MAGIC;
        } catch {}
        return 0xffffffff;
    }

    /// @notice abi.decode(signature, (WebAuthnSig)); reverts on malformed input. Helper for isValidSignature.
    function decodeWebAuthnSig(bytes calldata signature) external pure returns (WebAuthnSig memory) {
        return abi.decode(signature, (WebAuthnSig));
    }

    /// @notice The challenge a passkey must sign for ERC-1271 validation of `hash` by this account.
    function erc1271Challenge(bytes32 hash) public view returns (bytes32) {
        return keccak256(abi.encode(ERC1271_TYPEHASH, block.chainid, address(this), hash));
    }

    function _verify(bytes32 challenge, WebAuthnSig calldata sig) internal view returns (bool) {
        return _verifyMem(challenge, sig);
    }

    function _verifyMem(bytes32 challenge, WebAuthnSig memory sig) internal view returns (bool) {
        bytes32 qx = _qx;
        if (qx == bytes32(0)) return false; // uninitialized (implementation or foreign clone)
        return WebAuthn.verify(abi.encodePacked(challenge), sig, uint256(qx), uint256(_qy));
    }

    /// @notice Accepts BNB (1Click deliveries, sale proceeds, refunds).
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
