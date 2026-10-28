// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {Base64} from "@openzeppelin/utils/Base64.sol";
import {Base64Url} from "../src/lib/Base64Url.sol";
import {P256} from "../src/lib/P256.sol";
import {PasskeyTestBase} from "./utils/PasskeyTestBase.sol";
import {P256VerifierSolidity} from "./utils/P256VerifierSolidity.sol";

contract Base64UrlHarness {
    function enc(bytes memory b) external pure returns (string memory) {
        return Base64Url.encode(b);
    }
}

contract PrimitivesTest is PasskeyTestBase {
    Base64UrlHarness h;

    function setUp() public override {
        super.setUp();
        h = new Base64UrlHarness();
    }

    /// RFC 4648 §10 vectors (unpadded url alphabet).
    function test_base64url_rfcVectors() public view {
        assertEq(h.enc(""), "");
        assertEq(h.enc("f"), "Zg");
        assertEq(h.enc("fo"), "Zm8");
        assertEq(h.enc("foo"), "Zm9v");
        assertEq(h.enc("foob"), "Zm9vYg");
        assertEq(h.enc("fooba"), "Zm9vYmE");
        assertEq(h.enc("foobar"), "Zm9vYmFy");
        assertEq(h.enc(hex"fbff"), "-_8");
        assertEq(bytes(h.enc(abi.encodePacked(keccak256("x")))).length, 43);
    }

    /// Fuzz against OpenZeppelin's standard Base64: translate +/ -> -_ and drop '=' padding.
    function testFuzz_base64url_matchesOZ(bytes memory data) public view {
        bytes memory std = bytes(Base64.encode(data));
        uint256 len = std.length;
        while (len > 0 && std[len - 1] == "=") --len;
        bytes memory expected = new bytes(len);
        for (uint256 i; i < len; ++i) {
            bytes1 c = std[i];
            expected[i] = c == "+" ? bytes1("-") : c == "/" ? bytes1("_") : c;
        }
        assertEq(h.enc(data), string(expected));
    }

    function test_isOnCurve() public view {
        assertTrue(P256.isOnCurve(uint256(qx), uint256(qy)));
        assertFalse(P256.isOnCurve(uint256(qx), uint256(qy) + 1));
        assertFalse(P256.isOnCurve(0, 0));
        assertFalse(P256.isOnCurve(P256.P, uint256(qy)));
    }

    /// The RIP-7212 reference test vector (also what was used to verify BSC's precompile).
    function test_precompile_rip7212Vector() public view {
        bytes memory input =
            hex"4cee90eb86eaa050036147a12d49004b6b9c72bd725d39d4785011fe190f0b4da73bd4903f0ce3b639bbbf6e8e80d16931ff4bcf5993d58468e8fb19086e8cac36dbcd03009df8c59286b162af3bd7fcc0450c9aa81be5d10d312af6c66b1d604aebd3099c618202fcfe16ae7770b0c49ab5eadf74b754204a3bb6060e44eff37618b065f9832de4ca6ca971a7a1adc826d0f7c00181a5fb2ddf79ae00b4e10e";
        (bool ok, bytes memory ret) = address(0x100).staticcall(input);
        assertTrue(ok);
        assertEq(ret.length, 32);
        assertEq(abi.decode(ret, (uint256)), 1);
        // flip one bit of the hash -> fails (empty return)
        input[0] = bytes1(uint8(input[0]) ^ 1);
        (ok, ret) = address(0x100).staticcall(input);
        assertTrue(ok);
        assertEq(ret.length, 0);
    }

    /// Pure-Solidity test verifier agrees with forge's P-256 signer (and with the native precompile when present).
    function testFuzz_solidityVerifier_agrees(uint256 key, bytes32 digest) public {
        key = bound(key, 1, N - 1);
        P256VerifierSolidity v = new P256VerifierSolidity();
        (uint256 x, uint256 y) = vm.publicKeyP256(key);
        (bytes32 r, bytes32 s) = vm.signP256(key, digest);
        (bool ok, bytes memory ret) = address(v).staticcall(abi.encode(digest, r, s, x, y));
        assertTrue(ok && ret.length == 32, "solidity verifier rejected a valid sig");
        (ok, ret) = address(0x100).staticcall(abi.encode(digest, r, s, x, y));
        assertTrue(ok && ret.length == 32, "0x100 rejected a valid sig");
        // wrong digest rejected by both
        bytes32 other = keccak256(abi.encode(digest));
        (ok, ret) = address(v).staticcall(abi.encode(other, r, s, x, y));
        assertEq(ret.length, 0);
        (ok, ret) = address(0x100).staticcall(abi.encode(other, r, s, x, y));
        assertEq(ret.length, 0);
    }

    function test_P256_verify_enforcesLowS() public view {
        bytes32 digest = keccak256("low-s");
        (bytes32 r, bytes32 s) = vm.signP256(pk, digest);
        uint256 lo = _lowS(uint256(s));
        uint256 hi = N - lo;
        assertTrue(P256.verify(digest, uint256(r), lo, uint256(qx), uint256(qy)));
        assertFalse(P256.verify(digest, uint256(r), hi, uint256(qx), uint256(qy)));
    }
}
