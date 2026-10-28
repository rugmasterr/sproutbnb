// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SproutTestBase} from "./utils/SproutTestBase.sol";
import {SproutTerminal} from "../src/SproutTerminal.sol";
import {MockToken, Rejecter} from "./mocks/SproutMocks.sol";

contract SproutTerminalTest is SproutTestBase {
    event TerminalTrade(
        address indexed trader, address indexed token, bool isBuy, uint256 bnbAmount, uint256 tokenAmount, uint256 fee
    );
    event CashOut(address indexed trader, uint256 bnbOut, address depositAddress, bytes32 quoteRef);

    MockToken internal flapToken;
    address internal depositAddr = makeAddr("oneClickDeposit");

    function setUp() public override {
        super.setUp();
        flapToken = new MockToken("Some Flap Coin", "FLAP");
        portal.setToken(address(flapToken), 1, 300, 300); // Tradable, 3% tax
        vm.deal(alice, 100 ether);
    }

    function test_buyFeeSplit() public {
        uint256 rootsBefore = address(roots).balance;
        uint256 tBefore = treasury.balance;
        vm.expectEmit(address(terminal));
        emit TerminalTrade(alice, address(flapToken), true, 1 ether, 990_000e18, 0.01 ether);
        vm.prank(alice);
        uint256 out = terminal.buy{value: 1 ether}(address(flapToken), 1, address(0));
        assertEq(out, 990_000e18);
        assertEq(flapToken.balanceOf(alice), out);
        assertEq(address(roots).balance - rootsBefore, 0.0025 ether, "0.25% to Roots");
        assertEq(treasury.balance - tBefore, 0.0075 ether, "0.75% to treasury");
        assertEq(address(terminal).balance, 0);
        assertEq(roots.rootPot(), 0.0025 ether, "lands in rootPot");
    }

    function test_buyToRecipientAndMinOut() public {
        vm.prank(alice);
        terminal.buy{value: 0.1 ether}(address(flapToken), 99_000e18, bob);
        assertEq(flapToken.balanceOf(bob), 99_000e18);
        vm.prank(alice);
        vm.expectRevert("mock: slippage");
        terminal.buy{value: 0.1 ether}(address(flapToken), 99_001e18, bob);
    }

    function test_buyTaxedDeliveryMeasuredByDelta() public {
        portal.configure(1_000_000e18, 1e12, 9700, 10000); // 3% of gross withheld
        vm.prank(alice);
        uint256 out = terminal.buy{value: 1 ether}(address(flapToken), 1, alice);
        assertEq(out, (990_000e18 * 9700) / 10000);
    }

    function test_buyPartialFillRefunds() public {
        portal.configure(1_000_000e18, 1e12, 10000, 5000);
        uint256 before = alice.balance;
        vm.prank(alice);
        terminal.buy{value: 1 ether}(address(flapToken), 1, alice);
        // 0.495 BNB actually traded: fee is 1% of what was spent (0.005), everything else comes back.
        assertEq(before - alice.balance, 0.5 ether, "unused net and unused fee returned");
        assertEq(address(roots).balance + treasury.balance, 0.005 ether, "fee only on spent BNB");
        assertEq(terminal.totalVolumeBnb(), 0.5 ether);
        assertEq(address(terminal).balance, 0);
    }

    function test_sellFeeAndPayout() public {
        flapToken.mint(alice, 1_000_000e18); // sells for 1 BNB gross (1e12 wei per token)
        vm.startPrank(alice);
        flapToken.approve(address(terminal), type(uint256).max);
        uint256 before = alice.balance;
        uint256 out = terminal.sell(address(flapToken), 1_000_000e18, 0.99 ether, address(0));
        vm.stopPrank();
        assertEq(out, 0.99 ether);
        assertEq(alice.balance - before, 0.99 ether);
        assertEq(address(roots).balance, 0.0025 ether);
        assertEq(treasury.balance, 0.0075 ether);
        assertEq(flapToken.balanceOf(address(terminal)), 0);
    }

    function test_sellMinOutIsNetOfFee() public {
        flapToken.mint(alice, 1_000_000e18);
        vm.startPrank(alice);
        flapToken.approve(address(terminal), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(SproutTerminal.InsufficientOutput.selector, 0.99 ether, 0.99 ether + 1));
        terminal.sell(address(flapToken), 1_000_000e18, 0.99 ether + 1, alice);
        vm.stopPrank();
    }

    function test_sellPartialFillReturnsTokens() public {
        portal.configure(1_000_000e18, 1e12, 10000, 6000);
        flapToken.mint(alice, 1_000_000e18);
        vm.startPrank(alice);
        flapToken.approve(address(terminal), type(uint256).max);
        terminal.sell(address(flapToken), 1_000_000e18, 1, alice);
        vm.stopPrank();
        assertEq(flapToken.balanceOf(alice), 400_000e18);
        assertEq(flapToken.balanceOf(address(terminal)), 0);
    }

    function test_sellAndBridgeSendsToOneClick() public {
        flapToken.mint(alice, 2_000_000e18);
        bytes32 ref = keccak256("1click-quote");
        vm.startPrank(alice);
        flapToken.approve(address(terminal), type(uint256).max);
        vm.expectEmit(address(terminal));
        emit CashOut(alice, 1.98 ether, depositAddr, ref);
        uint256 out = terminal.sellAndBridge(address(flapToken), 2_000_000e18, 1.9 ether, depositAddr, ref);
        vm.stopPrank();
        assertEq(out, 1.98 ether);
        assertEq(depositAddr.balance, 1.98 ether);
    }

    function test_sellAndBridgeAtomic() public {
        flapToken.mint(alice, 1_000_000e18);
        Rejecter r = new Rejecter();
        vm.startPrank(alice);
        flapToken.approve(address(terminal), type(uint256).max);
        vm.expectRevert(SproutTerminal.TransferFailed.selector);
        terminal.sellAndBridge(address(flapToken), 1_000_000e18, 1, address(r), bytes32(0));
        vm.expectRevert(SproutTerminal.ZeroAddress.selector);
        terminal.sellAndBridge(address(flapToken), 1_000_000e18, 1, address(0), bytes32(0));
        vm.stopPrank();
        assertEq(flapToken.balanceOf(alice), 1_000_000e18, "sale reverted with the bridge leg");
    }

    function test_bridgeForwardsValueAndEmitsCashOut() public {
        bytes32 ref = keccak256("sprout-shield:v1:...");
        vm.deal(alice, 1 ether);
        uint256 rootsBefore = address(roots).balance;
        vm.prank(alice);
        vm.expectEmit(address(terminal));
        emit CashOut(alice, 0.4 ether, depositAddr, ref);
        terminal.bridge{value: 0.4 ether}(depositAddr, ref);
        assertEq(depositAddr.balance, 0.4 ether, "full value forwarded");
        assertEq(address(roots).balance, rootsBefore, "no fee");
        assertEq(address(terminal).balance, 0, "terminal holds nothing");
    }

    function test_bridgeRejectsZeroAndFailedSend() public {
        vm.deal(alice, 1 ether);
        Rejecter r = new Rejecter();
        vm.startPrank(alice);
        vm.expectRevert(SproutTerminal.ZeroAmount.selector);
        terminal.bridge(depositAddr, bytes32(0));
        vm.expectRevert(SproutTerminal.ZeroAddress.selector);
        terminal.bridge{value: 1}(address(0), bytes32(0));
        vm.expectRevert(SproutTerminal.TransferFailed.selector);
        terminal.bridge{value: 1}(address(r), bytes32(0));
        vm.stopPrank();
        assertEq(alice.balance, 1 ether);
    }

    // ── guard ────────────────────────────────────────────────────────────

    function test_guardRefusesInvalidStagedKilled() public {
        MockToken t = new MockToken("x", "x");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SproutTerminal.TokenNotTradable.selector, 0));
        terminal.buy{value: 1 ether}(address(t), 1, alice);
        portal.setToken(address(t), 5, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(SproutTerminal.TokenNotTradable.selector, 5));
        terminal.guard(address(t));
        portal.setToken(address(t), 3, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(SproutTerminal.TokenNotTradable.selector, 3));
        terminal.guard(address(t));
        portal.setToken(address(t), 2, 0, 0); // InDuel (obsolete) refused too
        vm.expectRevert(abi.encodeWithSelector(SproutTerminal.TokenNotTradable.selector, 2));
        terminal.guard(address(t));
        portal.setToken(address(t), 6, 0, 0); // unknown future status refused
        vm.expectRevert(abi.encodeWithSelector(SproutTerminal.TokenNotTradable.selector, 6));
        terminal.guard(address(t));
        portal.setToken(address(t), 1, 0, 0); // Tradable ok
        terminal.guard(address(t));
        portal.setToken(address(t), 4, 0, 0); // DEX ok
        terminal.guard(address(t));
    }

    function test_guardRefusesTaxAbove5Percent() public {
        portal.setToken(address(flapToken), 1, 500, 500);
        terminal.guard(address(flapToken)); // exactly 5% ok
        portal.setToken(address(flapToken), 1, 501, 0);
        vm.expectRevert(abi.encodeWithSelector(SproutTerminal.TaxTooHigh.selector, 501, 0));
        terminal.guard(address(flapToken));
        portal.setToken(address(flapToken), 4, 0, 1000);
        flapToken.mint(alice, 1e18);
        vm.startPrank(alice);
        flapToken.approve(address(terminal), 1e18);
        vm.expectRevert(abi.encodeWithSelector(SproutTerminal.TaxTooHigh.selector, 0, 1000));
        terminal.sell(address(flapToken), 1e18, 1, alice);
        vm.stopPrank();
    }

    function test_strayBnbRefused() public {
        vm.prank(alice);
        (bool ok,) = address(terminal).call{value: 1}("");
        assertFalse(ok);
    }

    function test_zeroAmounts() public {
        vm.prank(alice);
        vm.expectRevert(SproutTerminal.ZeroAmount.selector);
        terminal.buy(address(flapToken), 1, alice);
        vm.prank(alice);
        vm.expectRevert(SproutTerminal.ZeroAmount.selector);
        terminal.sell(address(flapToken), 0, 1, alice);
    }

    function testFuzz_feeMath(uint128 amount) public view {
        (uint256 toRoots, uint256 toTreasury) = terminal.feeSplit(amount);
        uint256 fee = (uint256(amount) * 100) / 10000;
        assertEq(toRoots + toTreasury, fee);
        assertEq(toRoots, fee / 4);
        assertEq(terminal.FEE_BPS(), 100);
    }

    function testFuzz_buyPartialFillConservation(uint64 v, uint16 fill) public {
        uint256 value = bound(uint256(v), 1e9, 50 ether);
        uint256 fillBps = bound(uint256(fill), 1, 10000);
        portal.configure(1_000_000e18, 1e12, 10000, fillBps);
        uint256 a = alice.balance;
        uint256 feesBefore = address(roots).balance + treasury.balance;
        vm.prank(alice);
        terminal.buy{value: value}(address(flapToken), 1, alice);
        uint256 fees = address(roots).balance + treasury.balance - feesBefore;
        uint256 paid = a - alice.balance;
        assertEq(address(terminal).balance, 0, "terminal holds nothing");
        assertLe(fees, (value * 100) / 10000, "fee never above 1% of input");
        assertLe(fees * 9900, (paid - fees) * 100 + 9900, "fee <= 1% of total spent (rounding)");
    }

    function testFuzz_buyConservation(uint64 v) public {
        uint256 value = bound(uint256(v), 1e9, 50 ether);
        uint256 rb = address(roots).balance;
        uint256 tb = treasury.balance;
        vm.prank(alice);
        terminal.buy{value: value}(address(flapToken), 1, alice);
        uint256 fee = (value * 100) / 10000;
        assertEq(address(roots).balance - rb + treasury.balance - tb, fee);
        assertEq(address(terminal).balance, 0);
    }
}
