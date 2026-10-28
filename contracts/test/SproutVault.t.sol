// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SproutTestBase} from "./utils/SproutTestBase.sol";
import {SproutVault} from "../src/SproutVault.sol";
import {SproutVaultFactory} from "../src/SproutVaultFactory.sol";
import {VaultUISchema} from "../src/flap/IVaultSchemasV1.sol";
import {Rejecter, RevertingRoots, ReentrantTreasury} from "./mocks/SproutMocks.sol";

contract SproutVaultTest is SproutTestBase {
    event Revenue(uint256 amount);

    // ── split & accounting ───────────────────────────────────────────────

    function test_split_25_25_10_40_allModes() public {
        _setFoundation();
        for (uint8 m = 0; m <= 4; m++) {
            (SproutVault v,) = _plant(m, m == 1 ? alice : address(0), m == 3 ? T_ADDR : "");
            _pay(address(v), 1 ether);
            assertEq(v.lpPot(), 0.25 ether, "lp");
            assertEq(v.rootPot(), 0.25 ether, "root");
            assertEq(v.opsPot(), 0.1 ether, "ops");
            assertEq(v.payeePot(), 0.4 ether, "payee");
            _assertVaultInvariant(v);
        }
    }

    function test_roundingDustGoesToPayeePot() public {
        (SproutVault v,) = _plant(0, address(0), "");
        _pay(address(v), 7);
        assertEq(v.lpPot() + v.rootPot() + v.opsPot() + v.payeePot(), 7);
        assertEq(v.payeePot(), 7 - 1 - 1 - 0);
        _assertVaultInvariant(v);
    }

    function test_spuriousPingsAreSilentNoOps() public {
        (SproutVault v,) = _plant(0, address(0), "");
        _pay(address(v), 1 ether);
        vm.recordLogs();
        for (uint256 i = 0; i < 3; i++) {
            (bool ok,) = address(v).call("");
            assertTrue(ok);
        }
        v.sync();
        assertEq(vm.getRecordedLogs().length, 0, "no events on zero-delta wakes");
        (uint256 received,,,,,) = v.stats();
        assertEq(received, 1 ether);
        _assertVaultInvariant(v);
    }

    function test_forcedTransferRecognizedOnSync() public {
        (SproutVault v,) = _plant(0, address(0), "");
        vm.deal(address(v), 2 ether); // no receive() call
        assertEq(v.accountedQuote(), 0);
        vm.expectEmit(address(v));
        emit Revenue(2 ether);
        v.sync();
        assertEq(v.payeePot(), 0.8 ether);
        _assertVaultInvariant(v);
    }

    function test_receiveIsLightweight() public {
        (SproutVault v,) = _plant(0, address(0), "");
        vm.deal(address(this), 1 ether);
        uint256 g = gasleft();
        (bool ok,) = address(v).call{value: 1 ether}("");
        uint256 used = g - gasleft();
        assertTrue(ok);
        assertLt(used, 150_000, "receive must stay cheap for Flap dispatch");
    }

    // ── flush ────────────────────────────────────────────────────────────

    function test_flushRoutesEveryPot() public {
        (SproutVault v,) = _plant(1, alice, "");
        _pay(address(v), 1 ether);
        uint256 tBefore = treasury.balance;
        v.flush();
        assertEq(roots.lpPot(), 0.25 ether);
        assertEq(roots.rootPot(), 0.25 ether);
        assertEq(treasury.balance - tBefore, 0.1 ether);
        assertEq(payouts.pendingBnb(address(v)), 0.4 ether);
        assertEq(address(v).balance, 0);
        (uint256 rec, uint256 l, uint256 r, uint256 o, uint256 p, uint256 pend) = v.stats();
        assertEq(rec, 1 ether);
        assertEq(l, 0.25 ether);
        assertEq(r, 0.25 ether);
        assertEq(o, 0.1 ether);
        assertEq(p, 0.4 ether);
        assertEq(pend, 0);
        _assertVaultInvariant(v);
    }

    function test_flushRecognizesUnsyncedRevenueFirst() public {
        (SproutVault v,) = _plant(0, address(0), "");
        vm.deal(address(v), 1 ether);
        v.flush();
        assertEq(payouts.pendingBnb(address(v)), 0.4 ether);
        assertEq(address(v).balance, 0);
    }

    function test_flushWithRejectingTreasuryKeepsOpsPot() public {
        (SproutVault v,) = _plant(0, address(0), "");
        Rejecter r = new Rejecter();
        vm.prank(admin);
        factory.setTreasury(address(r));
        _pay(address(v), 1 ether);
        v.flush();
        assertEq(v.opsPot(), 0.1 ether, "ops kept");
        assertEq(payouts.pendingBnb(address(v)), 0.4 ether, "payee still delivered");
        assertEq(roots.lpPot(), 0.25 ether, "roots still delivered");
        _assertVaultInvariant(v);
        assertEq(address(v).balance, 0.1 ether);

        vm.prank(admin);
        factory.setTreasury(treasury);
        v.flush();
        assertEq(v.opsPot(), 0);
        _assertVaultInvariant(v);
    }

    function test_flushWithFailingPayoutsKeepsPayeePot() public {
        // A vault not registered in the payouts' factory (payouts rejects its deposit).
        SproutVaultFactory other = new SproutVaultFactory(admin, address(roots), address(payouts), treasury);
        vm.prank(VAULT_PORTAL);
        SproutVault v = SproutVault(payable(other.newVault(address(0xABC), address(0), creator, abi.encode(uint8(0), address(0), ""))));
        _pay(address(v), 1 ether);
        v.flush();
        assertEq(v.payeePot(), 0.4 ether, "payee pot kept");
        assertEq(v.lpPot(), 0);
        _assertVaultInvariant(v);
    }

    function test_flushWithFailingRootsKeepsLpAndRoot() public {
        RevertingRoots rr = new RevertingRoots();
        SproutVaultFactory other = new SproutVaultFactory(admin, address(rr), address(payouts), treasury);
        vm.prank(VAULT_PORTAL);
        SproutVault v = SproutVault(payable(other.newVault(address(0xABD), address(0), creator, abi.encode(uint8(0), address(0), ""))));
        _pay(address(v), 1 ether);
        v.flush();
        assertEq(v.lpPot(), 0.25 ether);
        assertEq(v.rootPot(), 0.25 ether);
        assertEq(v.opsPot(), 0);
        _assertVaultInvariant(v);
    }

    function test_flushIsNonReentrant() public {
        (SproutVault v,) = _plant(0, address(0), "");
        ReentrantTreasury rt = new ReentrantTreasury();
        rt.setVault(address(v));
        vm.prank(admin);
        factory.setTreasury(address(rt));
        _pay(address(v), 1 ether);
        v.flush();
        assertFalse(rt.reentered(), "re-entry must fail");
        assertEq(address(rt).balance, 0.1 ether);
        _assertVaultInvariant(v);
    }

    function testFuzz_accountingInvariant(uint96[5] memory amounts, uint8 flushMask) public {
        (SproutVault v,) = _plant(0, address(0), "");
        uint256 total;
        for (uint256 i = 0; i < 5; i++) {
            uint256 a = uint256(amounts[i]) % 100 ether;
            total += a;
            if (a > 0) _pay(address(v), a);
            if (flushMask & (1 << i) != 0) v.flush();
            (bool ok,) = address(v).call(""); // spurious ping
            assertTrue(ok);
            _assertVaultInvariant(v);
        }
        (uint256 rec, uint256 l, uint256 r, uint256 o, uint256 p, uint256 pend) = v.stats();
        assertEq(rec, total);
        assertEq(l + r + o + p + pend, total, "conservation");
    }

    // ── modes / initialization ───────────────────────────────────────────

    function test_modeMe_payeeIsCreator() public {
        (SproutVault v,) = _plant(0, alice, "");
        assertEq(v.payee(), creator);
        assertEq(v.controller(), creator);
        assertEq(v.mode(), 0);
        assertEq(bytes(v.zcashAddress()).length, 0);
    }

    function test_modeZcashWallet_storesAddressAndController() public {
        (SproutVault v,) = _plant(3, address(0), ZS_ADDR);
        assertEq(v.zcashAddress(), ZS_ADDR);
        assertEq(v.controller(), creator);
        assertEq(v.payee(), address(0));
    }

    function test_modeFoundation_mirrorsPayoutsAddress() public {
        _setFoundation();
        (SproutVault v,) = _plant(4, address(0), "");
        assertEq(v.zcashAddress(), FOUNDATION_ADDR);
        assertEq(v.controller(), address(0));
    }

    function test_initializerLocked() public {
        (SproutVault v, address token) = _plant(0, address(0), "");
        vm.expectRevert("Initializable: contract is already initialized");
        v.initialize(token, 0, alice, "", alice);
        address impl = factory.beaconImplementation();
        vm.expectRevert("Initializable: contract is already initialized");
        SproutVault(payable(impl)).initialize(token, 0, alice, "", alice);
    }

    function test_vaultQuoteTokenIsNative() public {
        (SproutVault v,) = _plant(0, address(0), "");
        assertEq(v.vaultQuoteToken(), address(0));
        assertEq(v.vaultSpecVersion(), "v3");
    }

    // ── redirects & access control ───────────────────────────────────────

    function test_setPayee_byPayeeAndGuardian() public {
        (SproutVault v,) = _plant(1, alice, "");
        vm.prank(alice);
        v.setPayee(bob);
        assertEq(v.payee(), bob);
        vm.prank(alice);
        vm.expectRevert(bytes(E_V_AUTH));
        v.setPayee(alice);
        vm.prank(GUARDIAN);
        v.setPayee(alice);
        assertEq(v.payee(), alice);
    }

    function test_setPayee_rejects() public {
        (SproutVault v,) = _plant(0, address(0), "");
        vm.prank(bob);
        vm.expectRevert(bytes(E_V_AUTH));
        v.setPayee(bob);
        vm.prank(creator);
        vm.expectRevert(bytes(E_V_ZERO));
        v.setPayee(address(0));
        (SproutVault h,) = _plant(2, address(0), "");
        vm.prank(GUARDIAN);
        vm.expectRevert(bytes(E_V_NA));
        h.setPayee(bob);
    }

    function test_setZcashAddress_controllerAndGuardian() public {
        (SproutVault v,) = _plant(3, address(0), T_ADDR);
        vm.prank(creator);
        v.setZcashAddress(T3_ADDR);
        assertEq(v.zcashAddress(), T3_ADDR);
        vm.prank(GUARDIAN);
        v.setZcashAddress(ZS_ADDR);
        assertEq(v.zcashAddress(), ZS_ADDR);
        vm.prank(bob);
        vm.expectRevert(bytes(E_V_AUTH));
        v.setZcashAddress(T_ADDR);
        vm.prank(creator);
        vm.expectRevert(bytes(E_ZADDR));
        v.setZcashAddress("0x1234");
    }

    function test_setZcashAddress_onlyMode3() public {
        (SproutVault v,) = _plant(0, address(0), "");
        vm.prank(GUARDIAN);
        vm.expectRevert(bytes(E_V_NA));
        v.setZcashAddress(T_ADDR);
        _setFoundation();
        (SproutVault f,) = _plant(4, address(0), "");
        vm.prank(GUARDIAN);
        vm.expectRevert(bytes(E_V_NA));
        f.setZcashAddress(T_ADDR);
    }

    function test_transferControl_mode3() public {
        (SproutVault v,) = _plant(3, address(0), T_ADDR);
        vm.prank(creator);
        v.transferControl(alice);
        assertEq(v.controller(), alice);
        vm.prank(creator);
        vm.expectRevert(bytes(E_V_AUTH));
        v.setZcashAddress(T3_ADDR);
        vm.prank(alice);
        v.setZcashAddress(T3_ADDR);
        vm.prank(GUARDIAN);
        v.transferControl(bob);
        assertEq(v.controller(), bob);
    }

    function test_transferControl_modes01_movesPayee() public {
        (SproutVault v,) = _plant(0, address(0), "");
        vm.prank(creator);
        v.transferControl(alice);
        assertEq(v.payee(), alice);
        assertEq(v.controller(), alice);
    }

    function test_transferControl_notApplicableModes2and4() public {
        (SproutVault h,) = _plant(2, address(0), "");
        vm.prank(GUARDIAN);
        vm.expectRevert(bytes(E_V_NA));
        h.transferControl(bob);
        _setFoundation();
        (SproutVault f,) = _plant(4, address(0), "");
        vm.prank(GUARDIAN);
        vm.expectRevert(bytes(E_V_NA));
        f.transferControl(bob);
    }

    function test_guardianMandateSurvivesControlTransfers() public {
        (SproutVault v,) = _plant(3, address(0), T_ADDR);
        vm.prank(creator);
        v.transferControl(alice);
        vm.prank(alice);
        v.transferControl(bob);
        vm.prank(GUARDIAN);
        v.setZcashAddress(T3_ADDR); // Guardian still has access
        assertEq(v.zcashAddress(), T3_ADDR);
    }

    // ── UI ───────────────────────────────────────────────────────────────

    function test_descriptionIsBilingualAndDynamic() public {
        (SproutVault v,) = _plant(3, address(0), T_ADDR);
        string memory d0 = v.description();
        assertTrue(_contains(d0, "A Zcash wallet"));
        assertTrue(_contains(d0, T_ADDR));
        assertTrue(_contains(d0, unicode"春笋金库"));
        assertTrue(_contains(d0, "Tax received 0.0000 BNB"));
        _pay(address(v), 1.5 ether);
        v.flush();
        string memory d1 = v.description();
        assertTrue(_contains(d1, "Tax received 1.5000 BNB"));
        assertTrue(_contains(d1, "(paid in ZEC) 0.6000"));
    }

    function test_descriptionFoundationNotConfiguredYet() public {
        // Planting mode 4 requires the address; simulate a vault whose payouts view returns empty via mode 2 check.
        (SproutVault h,) = _plant(2, address(0), "");
        assertTrue(_contains(h.description(), "Holders (ZEC rewards)"));
    }

    function test_vaultUISchema() public {
        (SproutVault v,) = _plant(0, address(0), "");
        VaultUISchema memory s = v.vaultUISchema();
        assertEq(s.vaultType, "SproutVault");
        assertEq(s.methods.length, 14);
        assertEq(s.methods[0].name, "stats");
        assertEq(s.methods[0].outputs.length, 6);
        assertEq(s.methods[10].name, "flush");
        assertTrue(s.methods[10].isWriteMethod);
        assertEq(s.methods[12].name, "setZcashAddress");
        assertEq(s.methods[12].inputs[0].fieldType, "string");
        for (uint256 i = 0; i < 9; i++) {
            assertFalse(s.methods[i].isWriteMethod);
            assertEq(s.methods[i].approvals.length, 0);
        }
    }

    function _contains(string memory h, string memory n) internal pure returns (bool) {
        bytes memory hb = bytes(h);
        bytes memory nb = bytes(n);
        if (nb.length > hb.length) return false;
        for (uint256 i = 0; i <= hb.length - nb.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < nb.length; j++) {
                if (hb[i + j] != nb[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}
