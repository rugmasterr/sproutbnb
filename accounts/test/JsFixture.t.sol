// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {PasskeyTestBase} from "./utils/PasskeyTestBase.sol";
import {SproutAccountFactory} from "../src/SproutAccountFactory.sol";
import {SproutAccount} from "../src/SproutAccount.sol";
import {Call, WebAuthnSig} from "../src/ISproutAccount.sol";

/// @notice Cross-checks accounts/js/challenge.ts against the contracts using a fixture it generated
///         (node js/gen-fixture.ts <factory>): Node-crypto P-256 key (SPKI) + DER signature with HIGH s,
///         Chrome-shaped clientDataJSON (with the extra "other_keys_can_be_added_here" key).
contract JsFixtureTest is PasskeyTestBase {
    string internal json;
    SproutAccountFactory internal f2;

    function setUp() public override {
        super.setUp();
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/js-assertion.json"));
        f2 = new SproutAccountFactory{salt: bytes32(0)}(); // address independent of test nonce
        console.log("fixture factory (pass to gen-fixture.ts):", address(f2));
    }

    function _u(string memory key) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, key));
    }

    function test_jsFixture_endToEnd() public {
        assertEq(address(f2), vm.parseJsonAddress(json, ".factory"), "regenerate fixture with the logged factory");
        assertEq(f2.implementation(), vm.parseJsonAddress(json, ".implementation"));

        bytes32 fqx = vm.parseJsonBytes32(json, ".qx");
        bytes32 fqy = vm.parseJsonBytes32(json, ".qy");
        // JS counterfactual address == factory.getAddress
        assertEq(f2.getAddress(fqx, fqy), vm.parseJsonAddress(json, ".account"));

        if (block.chainid != _u(".chainId")) vm.chainId(_u(".chainId"));

        Call[] memory calls = new Call[](2);
        calls[0] = Call(vm.parseJsonAddress(json, ".call0To"), _u(".call0Value"), vm.parseJsonBytes(json, ".call0Data"));
        calls[1] = Call(vm.parseJsonAddress(json, ".call1To"), _u(".call1Value"), vm.parseJsonBytes(json, ".call1Data"));
        uint256 deadline = _u(".deadline");
        uint256 gasFee = _u(".gasFee");
        address feeRecipient = vm.parseJsonAddress(json, ".feeRecipient");

        WebAuthnSig memory sig = WebAuthnSig({
            authenticatorData: vm.parseJsonBytes(json, ".authenticatorData"),
            clientDataJSON: vm.parseJsonString(json, ".clientDataJSON"),
            challengeIndex: _u(".challengeIndex"),
            typeIndex: _u(".typeIndex"),
            r: _u(".r"),
            s: _u(".s")
        });
        assertLe(sig.s, N_DIV_2, "helper must low-s normalise");

        address predicted = f2.getAddress(fqx, fqy);
        vm.deal(predicted, 1 ether);
        SproutAccount acct = SproutAccount(payable(f2.createAccount(fqx, fqy)));
        // JS challenge == contract challenge
        assertEq(acct.getChallenge(calls, deadline, gasFee, feeRecipient), vm.parseJsonBytes32(json, ".challenge"));

        uint256 toBefore = calls[0].to.balance; // fixture addresses may hold dust on a BSC fork -> compare deltas
        uint256 feeBefore = feeRecipient.balance;
        acct.executeBatch(calls, deadline, gasFee, feeRecipient, sig);
        assertEq(acct.nonce(), 1);
        assertEq(calls[0].to.balance - toBefore, calls[0].value);
        assertEq(feeRecipient.balance - feeBefore, gasFee);

        // ERC-1271 signature encoded by encodeWebAuthnSig()
        bytes32 h = vm.parseJsonBytes32(json, ".hash1271");
        assertEq(acct.isValidSignature(h, vm.parseJsonBytes(json, ".sig1271Encoded")), bytes4(0x1626ba7e));
    }
}
