// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {SproutAccountFactory} from "../../src/SproutAccountFactory.sol";
import {SproutAccount} from "../../src/SproutAccount.sol";
import {Call, WebAuthnSig} from "../../src/ISproutAccount.sol";
import {Base64Url} from "../../src/lib/Base64Url.sol";
import {P256VerifierSolidity} from "./P256VerifierSolidity.sol";

/// @dev Shared fixtures: real P-256 keys (vm.publicKeyP256 / vm.signP256), browser-shaped WebAuthn assertions,
///      and a precompile check — if 0x100 does not verify a known-good signature (e.g. local EVM < Osaka) the
///      pure-Solidity verifier is etched there. On a BSC fork / Osaka EVM the native precompile is used.
abstract contract PasskeyTestBase is Test {
    uint256 internal constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 internal constant N_DIV_2 = N / 2;
    bytes1 internal constant FLAGS_UP_UV = 0x05;

    string internal constant ORIGIN = "https://sproutbnb.cash";
    string internal constant RP_ID = "sproutbnb.cash";

    SproutAccountFactory internal factory;
    uint256 internal pk = 0x5370726f75742d70617373 + 1; // arbitrary test key
    bytes32 internal qx;
    bytes32 internal qy;

    bool internal nativePrecompile;

    function setUp() public virtual {
        _ensureP256Precompile();
        factory = new SproutAccountFactory();
        (uint256 x, uint256 y) = vm.publicKeyP256(pk);
        qx = bytes32(x);
        qy = bytes32(y);
    }

    function _ensureP256Precompile() internal {
        uint256 k = 0xC0FFEE;
        (uint256 x, uint256 y) = vm.publicKeyP256(k);
        bytes32 h = keccak256("sprout-precompile-probe");
        (bytes32 r, bytes32 s) = vm.signP256(k, h);
        (bool ok, bytes memory ret) = address(0x100).staticcall(abi.encode(h, r, s, x, y));
        nativePrecompile = ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
        if (!nativePrecompile) {
            P256VerifierSolidity v = new P256VerifierSolidity();
            vm.etch(address(0x100), address(v).code);
            console.log("P256VERIFY: no native precompile at 0x100 -> etched pure-Solidity verifier");
        } else {
            console.log("P256VERIFY: native precompile at 0x100 (chainid %s)", block.chainid);
        }
    }

    // ------------------------------------------------------------------ browser-shaped assertion building

    function _authData(bytes1 flags) internal pure returns (bytes memory) {
        // rpIdHash(32) | flags(1) | signCount(4, big-endian; synced passkeys use 0)
        return abi.encodePacked(sha256(bytes(RP_ID)), flags, uint32(0));
    }

    function _clientDataJSON(string memory type_, bytes32 challenge) internal pure returns (string memory) {
        // Exactly the shape Chrome/Safari emit: {"type":...,"challenge":...,"origin":...,"crossOrigin":false}
        return string.concat(
            '{"type":"',
            type_,
            '","challenge":"',
            Base64Url.encode(abi.encodePacked(challenge)),
            '","origin":"',
            ORIGIN,
            '","crossOrigin":false}'
        );
    }

    function _lowS(uint256 s) internal pure returns (uint256) {
        return s > N_DIV_2 ? N - s : s;
    }

    function _signRaw(uint256 key, bytes memory authData, string memory cdj)
        internal
        pure
        returns (uint256 r, uint256 s)
    {
        bytes32 message = sha256(abi.encodePacked(authData, sha256(bytes(cdj))));
        (bytes32 rr, bytes32 ss) = vm.signP256(key, message);
        r = uint256(rr);
        s = _lowS(uint256(ss));
    }

    function _assert(uint256 key, bytes32 challenge) internal pure returns (WebAuthnSig memory sig) {
        return _assertWith(key, challenge, "webauthn.get", FLAGS_UP_UV);
    }

    function _assertWith(uint256 key, bytes32 challenge, string memory type_, bytes1 flags)
        internal
        pure
        returns (WebAuthnSig memory sig)
    {
        bytes memory ad = _authData(flags);
        string memory cdj = _clientDataJSON(type_, challenge);
        (uint256 r, uint256 s) = _signRaw(key, ad, cdj);
        sig = WebAuthnSig({authenticatorData: ad, clientDataJSON: cdj, challengeIndex: 23, typeIndex: 1, r: r, s: s});
    }

    /// @dev Independent (test-side) reimplementation of the challenge formula from SPEC v2.
    function _challengeFor(
        address account,
        uint256 n,
        Call[] memory calls,
        uint256 deadline,
        uint256 gasFee,
        address feeRecipient
    ) internal view returns (bytes32) {
        return _challengeForChain(block.chainid, account, n, calls, deadline, gasFee, feeRecipient);
    }

    function _challengeForChain(
        uint256 chainId,
        address account,
        uint256 n,
        Call[] memory calls,
        uint256 deadline,
        uint256 gasFee,
        address feeRecipient
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(chainId, account, n, deadline, gasFee, feeRecipient, keccak256(abi.encode(calls))));
    }
}
