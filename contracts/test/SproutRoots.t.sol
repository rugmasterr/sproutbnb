// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SproutTestBase} from "./utils/SproutTestBase.sol";
import {SproutRoots} from "../src/SproutRoots.sol";
import {MockV2Pair} from "./mocks/SproutMocks.sol";

contract SproutRootsTest is SproutTestBase {
    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        roots.setSprout(address(sprout));
    }

    function _deposit(uint256 lp, uint256 root) internal {
        vm.deal(address(this), address(this).balance + lp + root);
        roots.deposit{value: lp + root}(lp, root);
    }

    // ── inflows ──────────────────────────────────────────────────────────

    function test_depositAndPlainTransfers() public {
        _deposit(1 ether, 2 ether);
        assertEq(roots.lpPot(), 1 ether);
        assertEq(roots.rootPot(), 2 ether);
        _pay(address(roots), 0.5 ether); // e.g. Flap commission
        assertEq(roots.rootPot(), 2.5 ether);
        vm.expectRevert(SproutRoots.BadDepositValue.selector);
        roots.deposit{value: 1}(1, 1);
    }

    function test_receiveWorksWith2300Stipend() public {
        vm.deal(address(this), 1 ether);
        bool ok = payable(address(roots)).send(0.1 ether);
        assertTrue(ok);
        assertEq(roots.rootPot(), 0.1 ether);
    }

    // ── burnRun ──────────────────────────────────────────────────────────

    function test_burnRun() public {
        _deposit(0, 1 ether);
        vm.prank(keeper);
        roots.burnRun(0.5 ether, 400_000e18);
        assertEq(sprout.balanceOf(DEAD), 500_000e18);
        assertEq(roots.rootPot(), 0.5 ether);
        (uint256 burned, uint256 spent,,,) = roots.totals();
        assertEq(burned, 500_000e18);
        assertEq(spent, 0.5 ether);
        assertEq(roots.lastBurnAt(), block.timestamp);
    }

    function test_burnRunMeasuresTaxedOutputAndPartialFill() public {
        portal.configure(1_000_000e18, 1e12, 9800, 8000); // 2% tax on delivery, 80% fill
        _deposit(0, 1 ether);
        vm.prank(keeper);
        roots.burnRun(0.5 ether, 1);
        uint256 expected = (((0.4 ether * 1_000_000e18) / 1e18) * 9800) / 10000;
        assertEq(sprout.balanceOf(DEAD), expected);
        assertEq(roots.rootPot(), 0.6 ether, "refund stays in pot");
        (, uint256 spent,,,) = roots.totals();
        assertEq(spent, 0.4 ether);
    }

    function test_burnRunCapsIntervalAccess() public {
        _deposit(0, 3 ether);
        vm.startPrank(keeper);
        vm.expectRevert(SproutRoots.DrawTooLarge.selector);
        roots.burnRun(0.5 ether + 1, 1);
        vm.expectRevert(SproutRoots.ZeroAmount.selector);
        roots.burnRun(0, 1);
        roots.burnRun(0.5 ether, 1);
        vm.expectRevert(SproutRoots.TooSoon.selector);
        roots.burnRun(0.1 ether, 1);
        vm.warp(block.timestamp + 299);
        vm.expectRevert(SproutRoots.TooSoon.selector);
        roots.burnRun(0.1 ether, 1);
        vm.warp(block.timestamp + 1);
        roots.burnRun(0.1 ether, 1);
        vm.stopPrank();

        vm.warp(block.timestamp + 300);
        vm.prank(alice);
        vm.expectRevert(SproutRoots.NotKeeper.selector);
        roots.burnRun(0.1 ether, 1);
        vm.prank(owner);
        vm.expectRevert(SproutRoots.NotKeeper.selector);
        roots.burnRun(0.1 ether, 1);
        vm.prank(GUARDIAN);
        roots.burnRun(0.1 ether, 1);
    }

    function test_burnRunSlippageAndPot() public {
        _deposit(0, 0.2 ether);
        vm.startPrank(keeper);
        vm.expectRevert(SproutRoots.InsufficientPot.selector);
        roots.burnRun(0.3 ether, 1);
        vm.expectRevert("mock: slippage");
        roots.burnRun(0.1 ether, 200_000e18);
        vm.stopPrank();
    }

    function test_lpPotNotUsableForBurn() public {
        _deposit(1 ether, 0);
        vm.prank(keeper);
        vm.expectRevert(SproutRoots.InsufficientPot.selector);
        roots.burnRun(0.1 ether, 1);
    }

    function test_sproutNotSet() public {
        SproutRoots r = new SproutRoots(owner, keeper);
        vm.prank(keeper);
        vm.expectRevert(SproutRoots.SproutNotSet.selector);
        r.burnRun(0.1 ether, 1);
    }

    // ── liquidityRun ─────────────────────────────────────────────────────

    function test_liquidityRunBuildsSproutZecGrove() public {
        _deposit(1 ether, 0);
        assertEq(roots.grovePair(), address(0));
        vm.prank(keeper);
        roots.liquidityRun(0.5 ether, 2e18, 200_000e18);
        // 0.25 BNB → 2.5 ZEC (V3 mock 10 ZEC/BNB); 0.25 BNB → 250k SPROUT
        assertEq(zec.balanceOf(GROVE_PAIR), 2.5e18);
        assertEq(sprout.balanceOf(GROVE_PAIR), 250_000e18);
        assertEq(v2.lastTo(), DEAD, "LP to dEaD");
        assertGt(v2.lpBalance(DEAD), 0);
        assertEq(roots.grovePair(), GROVE_PAIR);
        assertEq(roots.lpPot(), 0.5 ether);
        assertEq(roots.zecReserve(), 0);
        (,, uint256 bnbToLiq, uint256 zecToLiq, uint256 lpBurned) = roots.totals();
        assertEq(bnbToLiq, 0.5 ether);
        assertEq(zecToLiq, 2.5e18);
        assertEq(lpBurned, v2.lpBalance(DEAD));
        assertEq(v3.lastFee(), 2500);
        assertEq(zec.allowance(address(roots), V2_ROUTER), 0);
        assertEq(sprout.allowance(address(roots), V2_ROUTER), 0);
    }

    function test_liquidityRunLeftoversAndTaxEffects() public {
        v2.configure(address(v2Factory), GROVE_PAIR, 9000, 8000); // router takes 90% SPROUT, 80% ZEC
        sprout.setTransferTax(GROVE_PAIR, 200); // tax-token: 2% on transfers into the pair
        portal.configure(1_000_000e18, 1e12, 9800, 10000); // 2% buy tax
        _deposit(1 ether, 0);
        vm.prank(keeper);
        roots.liquidityRun(0.5 ether, 1, 1);
        uint256 sproutGot = (250_000e18 * 9800) / 10000;
        uint256 used = (sproutGot * 9000) / 10000;
        // leftover SPROUT burned, leftover ZEC kept for next run
        assertEq(sprout.balanceOf(DEAD), sproutGot - used);
        assertEq(roots.zecReserve(), 2.5e18 - 2e18);
        assertEq(zec.balanceOf(address(roots)), 0.5e18);
        assertEq(sprout.balanceOf(GROVE_PAIR), used - (used * 200) / 10000, "pair receives net of tax");

        // Second run into an existing Grove at the run's own price: the ZEC reserve is offered too and consumed.
        vm.warp(block.timestamp + 300);
        v2.configure(address(v2Factory), GROVE_PAIR, 10000, 10000);
        _grove(98_000e18, 1e18); // 0.1 BNB -> 98k SPROUT (net of 2% tax) and 1 ZEC
        vm.prank(keeper);
        roots.liquidityRun(0.2 ether, 1, 1);
        assertEq(roots.zecReserve(), 0, "reserve consumed");
    }

    function test_liquidityRunPartialPortalFillReturnsToLpPot() public {
        portal.configure(1_000_000e18, 1e12, 10000, 5000);
        _deposit(1 ether, 0);
        vm.prank(keeper);
        roots.liquidityRun(0.5 ether, 1, 1);
        assertEq(roots.lpPot(), 0.5 ether + 0.125 ether);
        assertEq(address(roots).balance, roots.lpPot() + 0, "no root pot");
    }

    function test_liquidityRunChecks() public {
        _deposit(0.3 ether, 1 ether);
        vm.startPrank(keeper);
        vm.expectRevert(SproutRoots.InsufficientPot.selector);
        roots.liquidityRun(0.4 ether, 1, 1);
        vm.expectRevert(SproutRoots.DrawTooLarge.selector);
        roots.liquidityRun(0.6 ether, 1, 1);
        vm.expectRevert(SproutRoots.SlippageRequired.selector);
        roots.liquidityRun(0.2 ether, 0, 1);
        vm.expectRevert(SproutRoots.SlippageRequired.selector);
        roots.liquidityRun(0.2 ether, 1, 0);
        vm.expectRevert(SproutRoots.SlippageRequired.selector);
        roots.burnRun(0.2 ether, 0);
        vm.stopPrank();
    }

    function test_liquidityRunIntervalIndependentOfBurn() public {
        _deposit(1 ether, 1 ether);
        vm.startPrank(keeper);
        roots.burnRun(0.1 ether, 1);
        roots.liquidityRun(0.1 ether, 1, 1); // separate action clocks
        vm.expectRevert(SproutRoots.TooSoon.selector);
        roots.liquidityRun(0.1 ether, 1, 1);
        vm.stopPrank();
    }

    function test_liquidityRunV3Slippage() public {
        _deposit(1 ether, 0);
        vm.prank(keeper);
        vm.expectRevert("Too little received");
        roots.liquidityRun(0.5 ether, 3e18, 1);
        assertEq(roots.lpPot(), 1 ether, "atomic");
    }

    function _grove(uint112 sproutReserve, uint112 zecReserve_) internal {
        if (GROVE_PAIR.code.length == 0) vm.etch(GROVE_PAIR, address(new MockV2Pair()).code);
        v2Factory.register(address(sprout), address(zec), GROVE_PAIR);
        // token0 = ZEC in one case and SPROUT in the other, to exercise the ordering.
        if (address(zec) < address(sprout)) MockV2Pair(GROVE_PAIR).setReserves(address(zec), zecReserve_, sproutReserve);
        else MockV2Pair(GROVE_PAIR).setReserves(address(sprout), sproutReserve, zecReserve_);
    }

    /// @dev Regression: an attacker who skews (or pre-creates) the SPROUT/ZEC pair can no longer make the run
    ///      deposit protocol liquidity at a bad ratio (amountMin is 0 on addLiquidity).
    function test_liquidityRunRefusesSkewedGrove() public {
        _deposit(1 ether, 0);
        // Run price: 0.25 BNB -> 2.5 ZEC and 250k SPROUT => 1e-5 ZEC per SPROUT.
        _grove(1_000_000e18, 1e18); // 1e-6: SPROUT dumped 10x in the Grove
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SproutRoots.GrovePriceOutOfRange.selector, 1e12, 1e13));
        roots.liquidityRun(0.5 ether, 1, 1);
        _grove(10_000e18, 1e18); // 1e-4: SPROUT pumped 10x
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SproutRoots.GrovePriceOutOfRange.selector, 1e14, 1e13));
        roots.liquidityRun(0.5 ether, 1, 1);
        _grove(100_000e18, 1.06e18); // +6%: outside the 5% band
        vm.prank(keeper);
        vm.expectRevert();
        roots.liquidityRun(0.5 ether, 1, 1);
        assertEq(roots.lpPot(), 1 ether, "nothing spent");

        _grove(100_000e18, 1.04e18); // +4%: inside the band
        vm.prank(keeper);
        roots.liquidityRun(0.5 ether, 1, 1);
        assertEq(roots.lpPot(), 0.5 ether);
        vm.warp(block.timestamp + 300);
        _grove(104_000e18, 1e18); // -3.8%: inside the band
        vm.prank(keeper);
        roots.liquidityRun(0.5 ether, 1, 1);
        assertEq(roots.lpPot(), 0);
        assertEq(roots.MAX_GROVE_DEVIATION_BPS(), 500);
    }

    /// @dev The very first deposit sets the Grove price from this run's two buys only.
    function test_firstGroveDepositUsesOnlyThisRunsZec() public {
        v2.configure(address(v2Factory), GROVE_PAIR, 10000, 8000);
        _deposit(1 ether, 0);
        vm.prank(keeper);
        roots.liquidityRun(0.5 ether, 1, 1); // pair has no reserves: desired ZEC = 2.5e18, 80% taken
        assertEq(roots.zecReserve(), 0.5e18);
        vm.warp(block.timestamp + 300);
        v2.configure(address(v2Factory), GROVE_PAIR, 10000, 10000);
        vm.prank(keeper);
        roots.liquidityRun(0.5 ether, 1, 1); // still no reserves visible: reserve is kept, not dumped in
        assertEq(roots.zecReserve(), 0.5e18);
        assertEq(zec.balanceOf(address(roots)), 0.5e18);
    }

    // ── admin ────────────────────────────────────────────────────────────

    function test_adminFunctions() public {
        vm.prank(owner);
        vm.expectRevert(SproutRoots.AlreadySet.selector);
        roots.setSprout(alice);
        vm.prank(alice);
        vm.expectRevert(SproutRoots.NotOwner.selector);
        roots.setKeeper(alice);
        vm.prank(owner);
        roots.setKeeper(alice);
        assertEq(roots.keeper(), alice);
        vm.prank(owner);
        roots.transferOwnership(bob);
        assertEq(roots.owner(), bob);
        assertEq(roots.MAX_DRAW(), 0.5 ether);
        assertEq(roots.MIN_INTERVAL(), 300);
    }

    function test_noWithdrawalPath() public {
        _deposit(1 ether, 1 ether);
        // No owner/keeper function moves BNB out except runs whose outputs go to dEaD / the Grove.
        bytes4[3] memory sels = [bytes4(keccak256("withdraw(uint256)")), bytes4(keccak256("sweep(address)")), bytes4(keccak256("rescue(address,uint256)"))];
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(owner);
            (bool ok,) = address(roots).call(abi.encodeWithSelector(sels[i], uint256(1)));
            assertFalse(ok);
        }
    }

    function test_nextRunTimes() public {
        _deposit(1 ether, 1 ether);
        (uint256 nb, uint256 nl) = roots.nextRunTimes();
        assertEq(nb, 0);
        assertEq(nl, 0);
        vm.prank(keeper);
        roots.burnRun(0.1 ether, 1);
        (nb,) = roots.nextRunTimes();
        assertEq(nb, block.timestamp + 300);
    }
}
