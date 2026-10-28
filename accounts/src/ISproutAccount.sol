// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice One call in a passkey-signed batch.
struct Call {
    address to;
    uint256 value;
    bytes data;
}

/// @notice A WebAuthn assertion, as produced by `navigator.credentials.get()` and re-encoded by `accounts/js/challenge.ts`.
/// @dev Field order and types are part of the cross-component interface (SPEC v2 "Passkey accounts"). Do not reorder.
/// - authenticatorData: raw `response.authenticatorData` bytes (>= 37 bytes: rpIdHash(32) | flags(1) | signCount(4) | ...)
/// - clientDataJSON:    raw `response.clientDataJSON` as a UTF-8 string, byte-for-byte as the browser produced it
/// - challengeIndex:    byte offset of `"challenge":"` inside clientDataJSON
/// - typeIndex:         byte offset of `"type":"webauthn.get"` inside clientDataJSON
/// - r, s:              ECDSA P-256 signature scalars (DER-decoded; s must be <= n/2, the helper normalises it)
struct WebAuthnSig {
    bytes authenticatorData;
    string clientDataJSON;
    uint256 challengeIndex;
    uint256 typeIndex;
    uint256 r;
    uint256 s;
}

interface ISproutAccount {
    event AccountInitialized(bytes32 indexed qx, bytes32 indexed qy);
    event Executed(uint256 indexed nonce, bytes32 indexed challenge, uint256 calls, uint256 gasFee, address feeRecipient);
    event Received(address indexed from, uint256 amount);

    error NotFactory();
    error AlreadyInitialized();
    error InvalidPublicKey();
    error Expired(uint256 deadline, uint256 nowTs);
    error InvalidSignature();
    error Reentrancy();
    error CallFailed(uint256 index, bytes returnData);
    error InsufficientBalanceForFee(uint256 balance, uint256 gasFee);
    error FeeRecipientZero();
    error FeeTransferFailed();

    function initialize(bytes32 qx, bytes32 qy) external;
    function owner() external view returns (bytes32 qx, bytes32 qy);
    function nonce() external view returns (uint256);
    function factory() external view returns (address);

    function executeBatch(
        Call[] calldata calls,
        uint256 deadline,
        uint256 gasFee,
        address feeRecipient,
        WebAuthnSig calldata sig
    ) external;

    function getChallenge(Call[] calldata calls, uint256 deadline, uint256 gasFee, address feeRecipient)
        external
        view
        returns (bytes32);

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}
