// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {PasskeyTestBase} from "./utils/PasskeyTestBase.sol";
import {SproutAccountFactory} from "../src/SproutAccountFactory.sol";
import {SproutAccount} from "../src/SproutAccount.sol";

/// @notice Site -> relayer -> contract integration. The fixture is produced by scripts/passkey-e2e.mts, which runs the
///         site's real browser module (src/features/zcash/passkey/webauthn.ts) against a WebCrypto P-256 authenticator,
///         then the relayer's own parseRelay / verifyWebAuthn / calldata encoding. This test sends that raw calldata
///         unchanged: first use (factory.createAccountAndExecute) and a second batch (account.executeBatch).
contract BrowserE2ETest is PasskeyTestBase {
    string internal json;
    SproutAccountFactory internal f2;

    function setUp() public override {
        super.setUp();
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/browser-e2e.json"));
        f2 = new SproutAccountFactory{salt: bytes32(0)}(); // same CREATE2 address as JsFixture.t.sol
    }

    function _u(string memory key) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, key));
    }

    function test_browserAssertion_relayerCalldata_executes() public {
        assertEq(address(f2), vm.parseJsonAddress(json, ".factory"), "fixture factory changed: regenerate fixtures");
        bytes32 qx = vm.parseJsonBytes32(json, ".qx");
        bytes32 qy = vm.parseJsonBytes32(json, ".qy");
        address account = vm.parseJsonAddress(json, ".account");
        assertEq(f2.getAddress(qx, qy), account, "site counterfactual address != factory.getAddress");
        vm.chainId(_u(".chainId"));

        address feeRecipient = vm.parseJsonAddress(json, ".feeRecipient");
        address beef = address(0xbEEF);
        vm.deal(account, 1 ether); // the ZEC deposit lands as BNB at the counterfactual address

        // ---- first use: relayer sends factory.createAccountAndExecute
        assertEq(vm.parseJsonAddress(json, ".firstTo"), address(f2));
        uint256 beef0 = beef.balance;
        uint256 fee0 = feeRecipient.balance;
        address relayer = makeAddr("sprout-relayer-e2e");
        vm.prank(relayer);
        (bool ok, bytes memory ret) = address(f2).call(vm.parseJsonBytes(json, ".firstData"));
        assertTrue(ok, string(ret));
        assertGt(account.code.length, 0, "account deployed");
        SproutAccount acct = SproutAccount(payable(account));
        assertEq(acct.nonce(), 1);
        assertEq(beef.balance - beef0, _u(".firstValue0"));
        assertEq(feeRecipient.balance - fee0, _u(".firstGasFee"));

        // ---- second batch: relayer sends account.executeBatch
        assertEq(vm.parseJsonAddress(json, ".secondTo"), account);
        beef0 = beef.balance;
        fee0 = feeRecipient.balance;
        vm.prank(relayer);
        (ok, ret) = account.call(vm.parseJsonBytes(json, ".secondData"));
        assertTrue(ok, string(ret));
        assertEq(acct.nonce(), 2);
        assertEq(beef.balance - beef0, _u(".secondValue0"));
        assertEq(feeRecipient.balance - fee0, _u(".secondGasFee"));

        // ---- replay of either signed batch fails
        vm.prank(relayer);
        (ok,) = account.call(vm.parseJsonBytes(json, ".secondData"));
        assertFalse(ok, "replay must fail");
    }
}
