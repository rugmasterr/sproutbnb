// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ZcashAddress} from "../src/lib/ZcashAddress.sol";

contract ZcashAddressTest is Test {
    function _u(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        b[0] = "u";
        b[1] = "1";
        bytes memory cs = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
        for (uint256 i = 2; i < n; i++) {
            b[i] = cs[i % 32];
        }
        return string(b);
    }

    function test_transparent() public pure {
        assertEq(ZcashAddress.kind("t1abcdefghijkmnopqrstuvwxyzABCDEFGH"), 1);
        assertEq(ZcashAddress.kind("t3ABCDEFGHJKLMNPQRSTUVWXYZ123456789"), 1);
        assertTrue(ZcashAddress.isTransparent("t1abcdefghijkmnopqrstuvwxyzABCDEFGH"));
        // wrong length
        assertEq(ZcashAddress.kind("t1abcdefghijkmnopqrstuvwxyzABCDEFG"), 0);
        // excluded Base58 chars: 0 O I l
        assertEq(ZcashAddress.kind("t1abcdefghijkmnopqrstuvwxyzABCDEFG0"), 0);
        assertEq(ZcashAddress.kind("t1abcdefghijkmnopqrstuvwxyzABCDEFGO"), 0);
        assertEq(ZcashAddress.kind("t1abcdefghijkmnopqrstuvwxyzABCDEFGI"), 0);
        assertEq(ZcashAddress.kind("t1abcdefghijkmnopqrstuvwxyzABCDEFGl"), 0);
        // other prefixes
        assertEq(ZcashAddress.kind("t2abcdefghijkmnopqrstuvwxyzABCDEFGH"), 0);
        assertEq(ZcashAddress.kind("tmabcdefghijkmnopqrstuvwxyzABCDEFGH"), 0, "testnet t-addr rejected");
    }

    function test_sapling() public pure {
        string memory ok = "zs1qpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2";
        assertEq(ZcashAddress.kind(ok), 2);
        assertEq(ZcashAddress.kind("zs1qpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf"), 0);
        assertEq(ZcashAddress.kind("zs1Qpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2"), 0);
        assertEq(ZcashAddress.kind("zs1bpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2"), 0);
    }

    function test_unified() public pure {
        assertEq(ZcashAddress.kind(_u(106)), 3);
        assertEq(ZcashAddress.kind(_u(213)), 3);
        assertEq(ZcashAddress.kind(_u(79)), 0);
        assertEq(ZcashAddress.kind(_u(1001)), 0);
    }

    function test_garbage() public pure {
        assertFalse(ZcashAddress.isValid(""));
        assertFalse(ZcashAddress.isValid("0x000000000000000000000000000000000000dEaD"));
        assertFalse(ZcashAddress.isValid("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"));
    }
}
