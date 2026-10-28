// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WebAuthnSig} from "../ISproutAccount.sol";
import {Base64Url} from "./Base64Url.sol";
import {P256} from "./P256.sol";

/// @title WebAuthn
/// @notice Minimal WebAuthn assertion verifier (implemented for Sprout, following the design of the audited
///         Coinbase `webauthn-sol` / Daimo `WebAuthn.sol` libraries — written independently in this repo).
///
/// Checks, in order (any failure returns false, never reverts):
///   1. s <= n/2 and 0 < r < n (low-s, malleability)                              — in P256.verify
///   2. clientDataJSON[typeIndex..] == `"type":"webauthn.get"`                      — not a registration (webauthn.create)
///   3. clientDataJSON[challengeIndex..] == `"challenge":"<base64url(challenge)>"`  — binds the signature to our hash
///   4. authenticatorData.length >= 37, flags UP (0x01) set, flags UV (0x04) set  — user present AND verified
///   5. P256VERIFY(sha256(authenticatorData || sha256(clientDataJSON)), r, s, qx, qy) via precompile 0x100
///
/// Deliberately NOT checked (same as the reference implementations): origin, rpIdHash, signCount, crossOrigin.
/// Passkeys are scoped to an RP ID by the authenticator, so a key created on sproutbnb.cash cannot be exercised by
/// another origin; synced passkeys report signCount 0, so counters are useless as a clone signal.
/// The challenge lookup is "anchored" by the indexes the client supplies; the browser — not the submitter — produced
/// clientDataJSON and the authenticator signed its hash, so a submitter cannot inject a second "challenge" key.
library WebAuthn {
    bytes1 internal constant FLAG_UP = 0x01;
    bytes1 internal constant FLAG_UV = 0x04;

    bytes32 private constant TYPE_GET_HASH = keccak256('"type":"webauthn.get"');
    uint256 private constant TYPE_GET_LEN = 21; // bytes('"type":"webauthn.get"').length

    function verify(bytes memory challenge, WebAuthnSig memory sig, uint256 qx, uint256 qy)
        internal
        view
        returns (bool)
    {
        if (sig.s > P256.N_DIV_2) return false;

        bytes memory json = bytes(sig.clientDataJSON);

        // 2. type
        if (!_sliceEquals(json, sig.typeIndex, TYPE_GET_LEN, TYPE_GET_HASH)) return false;

        // 3. challenge (with closing quote so a prefix of a longer value can't match)
        bytes memory expected = abi.encodePacked('"challenge":"', Base64Url.encode(challenge), '"');
        if (!_sliceEquals(json, sig.challengeIndex, expected.length, keccak256(expected))) return false;

        // 4. flags
        bytes memory ad = sig.authenticatorData;
        if (ad.length < 37) return false;
        bytes1 flags = ad[32];
        if (flags & FLAG_UP != FLAG_UP) return false;
        if (flags & FLAG_UV != FLAG_UV) return false;

        // 5. signature over sha256(authenticatorData || sha256(clientDataJSON))
        bytes32 message = sha256(abi.encodePacked(ad, sha256(json)));
        return P256.verify(message, sig.r, sig.s, qx, qy);
    }

    /// @dev keccak256(data[start : start+len]) == expectedHash, with bounds checking (out of range => false).
    function _sliceEquals(bytes memory data, uint256 start, uint256 len, bytes32 expectedHash)
        private
        pure
        returns (bool eq)
    {
        if (start > data.length || len > data.length - start) return false;
        bytes32 h;
        assembly ("memory-safe") {
            h := keccak256(add(add(data, 0x20), start), len)
        }
        eq = h == expectedHash;
    }
}
