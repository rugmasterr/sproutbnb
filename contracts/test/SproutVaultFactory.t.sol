// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SproutTestBase} from "./utils/SproutTestBase.sol";
import {SproutVault} from "../src/SproutVault.sol";
import {SproutVaultFactory} from "../src/SproutVaultFactory.sol";
import {IVaultFactory, IVaultFactoryValidationV2} from "../src/flap/IVaultFactory.sol";
import {IPortalTypes} from "../src/flap/IPortal.sol";
import {VaultDataSchema, FactoryPolicy} from "../src/flap/IVaultSchemasV1.sol";

contract SproutVaultFactoryTest is SproutTestBase {
    event Planted(
        address indexed token, address indexed vault, address indexed creator, uint8 mode, address payee, string zcashAddress
    );

    function _data() internal view returns (IVaultFactoryValidationV2.LaunchValidationDataV1 memory d) {
        d.tokenVersion = IPortalTypes.TokenVersion.TOKEN_TAXED_V3;
        d.quoteToken = address(0);
        d.buyTaxRate = 200;
        d.sellTaxRate = 200;
        d.vaultBps = 10000;
        d.dividendToken = address(0);
        d.minimumShareBalance = 0;
        d; // silence
        return d;
    }

    function _check(IVaultFactoryValidationV2.LaunchValidationDataV1 memory d) internal view returns (bool ok) {
        (ok,) = factory.onBeforeLaunch(abi.encode(d));
    }

    function test_constructorAndViews() public view {
        assertEq(factory.admin(), admin);
        assertEq(factory.roots(), address(roots));
        assertEq(factory.payouts(), address(payouts));
        assertEq(factory.treasury(), treasury);
        assertTrue(factory.beacon() != address(0));
        assertEq(factory.factorySpecVersion(), "v2.3");
        assertTrue(factory.isQuoteTokenSupported(address(0)));
        assertFalse(factory.isQuoteTokenSupported(address(zec)));
    }

    function test_constructorRejectsZero() public {
        vm.expectRevert(IVaultFactory.ZeroAddress.selector);
        new SproutVaultFactory(admin, address(roots), address(0), treasury);
    }

    function test_newVaultOnlyVaultPortal() public {
        vm.expectRevert(IVaultFactory.OnlyVaultPortal.selector);
        factory.newVault(address(0x1), address(0), creator, abi.encode(uint8(0), address(0), ""));
    }

    function test_newVaultRegistryAndEvent() public {
        address token = address(0x7777);
        vm.expectEmit(true, false, true, true, address(factory));
        emit Planted(token, address(0), creator, 3, address(0), T_ADDR);
        vm.prank(VAULT_PORTAL);
        address v = factory.newVault(token, address(0), creator, abi.encode(uint8(3), address(0), T_ADDR));
        assertEq(factory.vaultOf(token), v);
        assertTrue(factory.isVault(v));
        assertEq(factory.plantingsLength(), 1);
        SproutVaultFactory.Planting[] memory p = factory.getPlantings(0, 10);
        assertEq(p.length, 1);
        assertEq(p[0].token, token);
        assertEq(p[0].vault, v);
        assertEq(p[0].creator, creator);
        assertEq(p[0].mode, 3);
        assertEq(SproutVault(payable(v)).factory(), address(factory));
        assertEq(SproutVault(payable(v)).roots(), address(roots));
        assertEq(SproutVault(payable(v)).payouts(), address(payouts));
    }

    function test_newVaultRejectsDuplicateAndQuote() public {
        vm.startPrank(VAULT_PORTAL);
        factory.newVault(address(0x77), address(0), creator, abi.encode(uint8(0), address(0), ""));
        vm.expectRevert(bytes(E_F_PLANTED));
        factory.newVault(address(0x77), address(0), creator, abi.encode(uint8(0), address(0), ""));
        vm.expectRevert(bytes(E_F_QUOTE));
        factory.newVault(address(0x78), address(zec), creator, abi.encode(uint8(0), address(0), ""));
        vm.stopPrank();
    }

    function test_vaultDataValidationPerMode() public {
        vm.startPrank(VAULT_PORTAL);
        // bad mode
        vm.expectRevert(bytes(E_F_MODE));
        factory.newVault(address(0x1), address(0), creator, abi.encode(uint8(5), address(0), ""));
        // short data
        vm.expectRevert(bytes(E_F_DATA));
        factory.newVault(address(0x1), address(0), creator, abi.encode(uint8(0), address(0)));
        // mode 1 needs payee
        vm.expectRevert(bytes(E_F_PAYEE_REQUIRED));
        factory.newVault(address(0x1), address(0), creator, abi.encode(uint8(1), address(0), ""));
        // mode 2 forbids payee
        vm.expectRevert(bytes(E_F_PAYEE_NOT_ALLOWED));
        factory.newVault(address(0x1), address(0), creator, abi.encode(uint8(2), alice, ""));
        // mode 3 needs a valid zcash address
        vm.expectRevert(bytes(E_ZADDR));
        factory.newVault(address(0x1), address(0), creator, abi.encode(uint8(3), address(0), "t1short"));
        vm.expectRevert(bytes(E_ZADDR));
        factory.newVault(address(0x1), address(0), creator, abi.encode(uint8(3), address(0), ""));
        // mode 4 needs the foundation address
        vm.expectRevert(bytes(E_F_FOUNDATION));
        factory.newVault(address(0x1), address(0), creator, abi.encode(uint8(4), address(0), ""));
        vm.stopPrank();

        _setFoundation();
        vm.prank(VAULT_PORTAL);
        address v = factory.newVault(address(0x1), address(0), creator, abi.encode(uint8(4), address(0), "ignored"));
        assertEq(SproutVault(payable(v)).zcashAddress(), FOUNDATION_ADDR);
    }

    function test_modes3and4IgnorePayee() public {
        vm.prank(VAULT_PORTAL);
        address v3 = factory.newVault(address(0x31), address(0), creator, abi.encode(uint8(3), alice, T_ADDR));
        assertEq(SproutVault(payable(v3)).payee(), address(0));
        assertEq(SproutVault(payable(v3)).controller(), creator);
        _setFoundation();
        vm.prank(VAULT_PORTAL);
        address v4 = factory.newVault(address(0x41), address(0), creator, abi.encode(uint8(4), alice, ""));
        assertEq(SproutVault(payable(v4)).payee(), address(0));
        assertEq(SproutVault(payable(v4)).controller(), address(0));
    }

    function test_noCustomErrorsInVaultOrFactoryAbi() public {
        // Flap UI rule 004: a non-portal, non-admin caller gets a readable string, not a selector.
        vm.prank(alice);
        (bool ok, bytes memory ret) = address(factory).call(abi.encodeCall(factory.setAdmin, (alice)));
        assertFalse(ok);
        assertEq(bytes4(ret), bytes4(keccak256("Error(string)")));
    }

    function test_resolveVaultData() public view {
        (uint8 m, address p, string memory z) = factory.resolveVaultData(abi.encode(uint8(0), alice, T_ADDR), creator);
        assertEq(m, 0);
        assertEq(p, creator);
        assertEq(bytes(z).length, 0);
        (m, p, z) = factory.resolveVaultData(abi.encode(uint8(1), alice, ""), creator);
        assertEq(p, alice);
        (m, p, z) = factory.resolveVaultData(abi.encode(uint8(3), address(0), ZS_ADDR), creator);
        assertEq(z, ZS_ADDR);
    }

    // ── launch validation ────────────────────────────────────────────────

    function test_validation_acceptsCanonical() public view {
        assertTrue(_check(_data()));
        IVaultFactoryValidationV2.LaunchValidationDataV1 memory d = _data();
        d.dividendToken = address(zec); // Holders mode: tracker-only with ZEC
        d.minimumShareBalance = 100_000e18;
        assertTrue(_check(d));
    }

    function test_validation_rejects() public view {
        IVaultFactoryValidationV2.LaunchValidationDataV1 memory d = _data();
        d.tokenVersion = IPortalTypes.TokenVersion.TOKEN_TAXED_V2;
        assertFalse(_check(d));
        d = _data();
        d.quoteToken = address(zec);
        assertFalse(_check(d));
        d = _data();
        d.buyTaxRate = 300;
        assertFalse(_check(d));
        d = _data();
        d.sellTaxRate = 100;
        assertFalse(_check(d));
        d = _data();
        d.vaultBps = 6000;
        d.dividendBps = 4000;
        assertFalse(_check(d));
        d = _data();
        d.vaultBps = 9000;
        d.lpBps = 1000;
        assertFalse(_check(d));
        d = _data();
        d.deflationBps = 1;
        assertFalse(_check(d));
        d = _data();
        d.dividendToken = address(0xBEEF); // not ZEC
        assertFalse(_check(d));
        d = _data();
        d.dividendToken = 0xfEEDFEEDfeEDFEedFEEdFEEDFeEdfEEdFeEdFEEd; // MAGIC_DIVIDEND_SELF not allowed
        assertFalse(_check(d));
    }

    function test_schemaAndPolicies() public view {
        VaultDataSchema memory s = factory.vaultDataSchema();
        assertEq(s.fields.length, 3);
        assertEq(s.fields[0].name, "mode");
        assertEq(s.fields[1].fieldType, "address");
        assertEq(s.fields[2].fieldType, "string");
        assertFalse(s.isArray);
        FactoryPolicy[] memory p = factory.tokenCreationPolicies();
        assertEq(p.length, 9);
        assertEq(p[8].target, "dividendToken");
    }

    function test_getPlantingsPagination() public {
        vm.startPrank(VAULT_PORTAL);
        for (uint160 i = 1; i <= 5; i++) {
            factory.newVault(address(i), address(0), creator, abi.encode(uint8(0), address(0), ""));
        }
        vm.stopPrank();
        assertEq(factory.getPlantings(0, 2).length, 2);
        assertEq(factory.getPlantings(3, 10).length, 2);
        assertEq(factory.getPlantings(4, 1)[0].token, address(5));
        assertEq(factory.getPlantings(5, 1).length, 0);
        assertEq(factory.getPlantings(1, type(uint256).max).length, 4);
        assertEq(factory.getPlantings(0, 0).length, 0);
    }

    // ── admin / guardian ─────────────────────────────────────────────────

    function test_setTreasury_adminOrGuardian() public {
        vm.prank(admin);
        factory.setTreasury(alice);
        assertEq(factory.treasury(), alice);
        vm.prank(GUARDIAN);
        factory.setTreasury(bob);
        assertEq(factory.treasury(), bob);
        vm.prank(alice);
        vm.expectRevert(bytes(E_F_NOT_ADMIN_OR_GUARDIAN));
        factory.setTreasury(alice);
        vm.prank(admin);
        vm.expectRevert(IVaultFactory.ZeroAddress.selector);
        factory.setTreasury(address(0));
    }

    function test_setAdmin() public {
        vm.prank(alice);
        vm.expectRevert(bytes(E_F_NOT_ADMIN));
        factory.setAdmin(alice);
        vm.prank(admin);
        factory.setAdmin(alice);
        assertEq(factory.admin(), alice);
        vm.prank(admin);
        vm.expectRevert(bytes(E_F_NOT_ADMIN));
        factory.setAdmin(admin);
    }

    function test_upgradeOnlyGuardian() public {
        SproutVault next = new SproutVault();
        vm.prank(admin);
        vm.expectRevert(bytes(E_F_NOT_GUARDIAN));
        factory.upgradeVaultImplementation(address(next));
        vm.prank(GUARDIAN);
        factory.upgradeVaultImplementation(address(next));
        assertEq(factory.beaconImplementation(), address(next));
    }

    function test_upgradePreservesVaultState() public {
        (SproutVault v,) = _plant(1, alice, "");
        _pay(address(v), 1 ether);
        SproutVault next = new SproutVault();
        vm.prank(GUARDIAN);
        factory.upgradeVaultImplementation(address(next));
        assertEq(v.payee(), alice);
        assertEq(v.payeePot(), 0.4 ether);
        v.flush();
        assertEq(payouts.pendingBnb(address(v)), 0.4 ether);
    }
}
