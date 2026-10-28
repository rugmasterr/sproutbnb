// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SproutTestBase} from "./utils/SproutTestBase.sol";
import {SproutVault} from "../src/SproutVault.sol";
import {SproutPayouts} from "../src/SproutPayouts.sol";
import {MockDividend, MockTaxToken, Rejecter, RefundingDividend} from "./mocks/SproutMocks.sol";

contract SproutPayoutsTest is SproutTestBase {
    event Settled(address indexed vault, uint8 mode, uint256 bnbIn, uint256 zecOut, address to);
    event BridgedOut(
        address indexed vault, uint8 mode, uint256 bnbIn, address depositAddress, bytes32 quoteRef, string zcashAddress
    );

    address internal depositAddr = makeAddr("oneClickDeposit");

    function _fund(uint8 mode, address payee, string memory z, uint256 tax) internal returns (SproutVault v, address token) {
        (v, token) = _plant(mode, payee, z);
        _pay(address(v), tax);
        v.flush();
    }

    // ── deposit ──────────────────────────────────────────────────────────

    function test_depositOnlyRegisteredVaultItself() public {
        (SproutVault v,) = _plant(0, address(0), "");
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(SproutPayouts.NotRegisteredVault.selector);
        payouts.deposit{value: 1}(address(v));
        vm.prank(alice);
        vm.expectRevert(SproutPayouts.NotRegisteredVault.selector);
        payouts.deposit{value: 1}(alice);
        vm.deal(address(v), 0);
        vm.deal(address(v), 1 ether);
        vm.prank(address(v));
        payouts.deposit{value: 0.5 ether}(address(v));
        assertEq(payouts.pendingBnb(address(v)), 0.5 ether);
        assertEq(payouts.totalPendingBnb(), 0.5 ether);
    }

    function test_noPlainBnb() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(payouts).call{value: 1}("");
        assertFalse(ok);
    }

    // ── settle modes 0/1 ─────────────────────────────────────────────────

    function test_settleMode0_paysCreatorZec() public {
        (SproutVault v,) = _fund(0, address(0), "", 1 ether); // 0.4 BNB pending
        vm.expectEmit(address(payouts));
        emit Settled(address(v), 0, 0.4 ether, 4e18, creator);
        vm.prank(keeper);
        payouts.settle(address(v), 0.4 ether, 3.9e18);
        assertEq(zec.balanceOf(creator), 4e18);
        assertEq(payouts.pendingBnb(address(v)), 0);
        (uint256 toPayees,,,) = payouts.totals();
        assertEq(toPayees, 4e18);
        assertEq(v3.lastFee(), 2500, "uses the 0.25% pool");
        assertEq(address(payouts).balance, 0);
    }

    function test_settleMode1_followsPayeeRedirect() public {
        (SproutVault v,) = _fund(1, alice, "", 1 ether);
        vm.prank(alice);
        v.setPayee(bob);
        vm.prank(keeper);
        payouts.settle(address(v), 0.2 ether, 1);
        assertEq(zec.balanceOf(bob), 2e18);
        assertEq(zec.balanceOf(alice), 0);
        assertEq(payouts.pendingBnb(address(v)), 0.2 ether);
    }

    function test_settleToContractPayeeThatRejectsBnbStillWorks() public {
        Rejecter r = new Rejecter(); // ZEC is an ERC20: no receive hook involved
        (SproutVault v,) = _fund(1, address(r), "", 1 ether);
        vm.prank(GUARDIAN);
        payouts.settle(address(v), 0.4 ether, 1);
        assertEq(zec.balanceOf(address(r)), 4e18);
    }

    function test_settleSlippageAndBounds() public {
        (SproutVault v,) = _fund(0, address(0), "", 1 ether);
        vm.startPrank(keeper);
        vm.expectRevert(SproutPayouts.SlippageRequired.selector);
        payouts.settle(address(v), 0.4 ether, 0);
        vm.expectRevert("Too little received");
        payouts.settle(address(v), 0.4 ether, 5e18);
        vm.expectRevert(abi.encodeWithSelector(SproutPayouts.InsufficientPending.selector, 0.5 ether, 0.4 ether));
        payouts.settle(address(v), 0.5 ether, 1);
        vm.expectRevert(SproutPayouts.ZeroAmount.selector);
        payouts.settle(address(v), 0, 1);
        vm.stopPrank();
    }

    function test_settleAccessControl() public {
        (SproutVault v,) = _fund(0, address(0), "", 1 ether);
        vm.prank(alice);
        vm.expectRevert(SproutPayouts.NotKeeper.selector);
        payouts.settle(address(v), 0.1 ether, 1);
        vm.prank(owner);
        vm.expectRevert(SproutPayouts.NotKeeper.selector);
        payouts.settle(address(v), 0.1 ether, 1);
        // keeper disabled: Guardian still works
        vm.prank(owner);
        payouts.setKeeper(address(0));
        vm.prank(GUARDIAN);
        payouts.settle(address(v), 0.1 ether, 1);
    }

    function test_settleWrongModes() public {
        (SproutVault v,) = _fund(3, address(0), T_ADDR, 1 ether);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SproutPayouts.WrongMode.selector, 3));
        payouts.settle(address(v), 0.1 ether, 1);
    }

    // ── settle mode 2 (holders) ──────────────────────────────────────────

    function test_settleMode2_depositsIntoFlapDividend() public {
        (SproutVault v, address token) = _fund(2, address(0), "", 1 ether);
        MockDividend d = new MockDividend(address(zec), 1_000e18);
        MockTaxToken(token).setDividendContract(address(d));
        assertEq(payouts.usableDividend(address(v)), address(d));
        vm.prank(keeper);
        payouts.settle(address(v), 0.4 ether, 1);
        assertEq(zec.balanceOf(address(d)), 4e18);
        assertEq(d.totalDividendsDistributed(), 4e18);
        assertEq(payouts.holderPool(address(v)), 0);
        (, uint256 toHolders,,) = payouts.totals();
        assertEq(toHolders, 4e18);
        assertEq(zec.allowance(address(payouts), address(d)), 0);
    }

    /// @dev Regression: a dividend callee that pulls nothing and raises our ZEC balance used to underflow
    ///      (`before - after`) and brick settle() for the vault. Now the ZEC is pooled for the fallback distributor.
    function test_settleMode2_hostileDividendCannotBrickSettle() public {
        (SproutVault v, address token) = _fund(2, address(0), "", 1 ether);
        RefundingDividend d = new RefundingDividend(address(zec));
        MockTaxToken(token).setDividendContract(address(d));
        assertEq(payouts.usableDividend(address(v)), address(d));
        vm.prank(keeper);
        payouts.settle(address(v), 0.4 ether, 1);
        assertEq(payouts.holderPool(address(v)), 4e18, "full amount pooled");
        assertEq(payouts.totalHolderPool(), 4e18);
        assertEq(zec.allowance(address(payouts), address(d)), 0);
    }

    /// @dev Cross-vault isolation: one vault's pending BNB can never settle another vault.
    function test_cannotSettleOneVaultWithAnothersBnb() public {
        (SproutVault a,) = _fund(0, address(0), "", 1 ether);
        (SproutVault b,) = _plant(1, alice, "");
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SproutPayouts.InsufficientPending.selector, 0.1 ether, 0));
        payouts.settle(address(b), 0.1 ether, 1);
        assertEq(payouts.pendingBnb(address(a)), 0.4 ether);
    }

    function test_settleMode2_fallbackWhenDividendNotZec() public {
        (SproutVault v, address token) = _fund(2, address(0), "", 1 ether);
        MockDividend d = new MockDividend(WBNB, 1_000e18); // launched with a non-ZEC dividend token
        MockTaxToken(token).setDividendContract(address(d));
        assertEq(payouts.usableDividend(address(v)), address(0));
        vm.prank(keeper);
        payouts.settle(address(v), 0.4 ether, 1);
        assertEq(payouts.holderPool(address(v)), 4e18);
        assertEq(zec.balanceOf(address(payouts)), 4e18);
    }

    function test_settleMode2_fallbackWhenNoSharesOrReverts() public {
        (SproutVault v, address token) = _fund(2, address(0), "", 1 ether);
        MockDividend d = new MockDividend(address(zec), 0);
        MockTaxToken(token).setDividendContract(address(d));
        vm.prank(keeper);
        payouts.settle(address(v), 0.2 ether, 1);
        assertEq(payouts.holderPool(address(v)), 2e18, "no shares -> pooled");

        d.setShares(10);
        d.setRevert(true);
        vm.prank(keeper);
        payouts.settle(address(v), 0.2 ether, 1);
        assertEq(payouts.holderPool(address(v)), 4e18, "revert -> pooled");
        assertEq(zec.allowance(address(payouts), address(d)), 0);

        d.setRevert(false);
        vm.prank(keeper);
        payouts.pushHolderPool(address(v), 4e18);
        assertEq(zec.balanceOf(address(d)), 4e18);
        assertEq(payouts.holderPool(address(v)), 0);
        assertEq(payouts.totalHolderPool(), 0);
    }

    function test_settleMode2_noDividendContractAtAll() public {
        (SproutVault v,) = _fund(2, address(0), "", 1 ether); // MockTaxToken with dividendContract == 0
        vm.prank(keeper);
        payouts.settle(address(v), 0.4 ether, 1);
        assertEq(payouts.holderPool(address(v)), 4e18);
    }

    // ── fallback merkle distributor ──────────────────────────────────────

    function _leaf(address a, uint256 amt) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(a, amt))));
    }

    function test_merkleEpochClaimAndReclaim() public {
        (SproutVault v,) = _fund(2, address(0), "", 1 ether);
        vm.prank(keeper);
        payouts.settle(address(v), 0.4 ether, 1); // 4 ZEC pooled

        bytes32 la = _leaf(alice, 1e18);
        bytes32 lb = _leaf(bob, 2e18);
        bytes32 root = la < lb ? keccak256(abi.encodePacked(la, lb)) : keccak256(abi.encodePacked(lb, la));

        vm.prank(alice);
        vm.expectRevert(SproutPayouts.NotKeeper.selector);
        payouts.publishHolderEpoch(address(v), root, 3e18);
        vm.prank(keeper);
        vm.expectRevert(SproutPayouts.InvalidEpoch.selector);
        payouts.publishHolderEpoch(address(v), root, 5e18);

        vm.prank(keeper);
        uint256 e = payouts.publishHolderEpoch(address(v), root, 3e18);
        assertEq(payouts.holderPool(address(v)), 1e18);
        assertEq(payouts.totalEpochZec(), 3e18);

        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = lb;
        payouts.claim(address(v), e, alice, 1e18, proofA); // anyone may submit
        assertEq(zec.balanceOf(alice), 1e18);
        vm.expectRevert(SproutPayouts.AlreadyClaimed.selector);
        payouts.claim(address(v), e, alice, 1e18, proofA);
        vm.expectRevert(SproutPayouts.InvalidProof.selector);
        payouts.claim(address(v), e, bob, 3e18, proofA);

        vm.prank(keeper);
        vm.expectRevert(SproutPayouts.TooEarly.selector);
        payouts.reclaimEpoch(address(v), e);
        vm.warp(block.timestamp + 90 days);
        vm.prank(keeper);
        payouts.reclaimEpoch(address(v), e);
        assertEq(payouts.holderPool(address(v)), 3e18, "bob's unclaimed 2 ZEC back to the holders pool");
        assertEq(payouts.totalEpochZec(), 0);

        bytes32[] memory proofB = new bytes32[](1);
        proofB[0] = la;
        vm.expectRevert(SproutPayouts.EpochClosed.selector);
        payouts.claim(address(v), e, bob, 2e18, proofB);
    }

    // ── bridgeOut modes 3/4 ──────────────────────────────────────────────

    function test_bridgeOutMode3() public {
        (SproutVault v,) = _fund(3, address(0), T_ADDR, 2 ether); // 0.8 BNB pending
        bytes32 ref = keccak256("quote-1");
        vm.expectEmit(address(payouts));
        emit BridgedOut(address(v), 3, 0.5 ether, depositAddr, ref, T_ADDR);
        vm.prank(keeper);
        payouts.bridgeOut(address(v), 0.5 ether, depositAddr, ref);
        assertEq(depositAddr.balance, 0.5 ether);
        assertEq(payouts.pendingBnb(address(v)), 0.3 ether);
        (,, uint256 toZcash, uint256 toFoundation) = payouts.totals();
        assertEq(toZcash, 0.5 ether);
        assertEq(toFoundation, 0);
    }

    function test_bridgeOutUsesUpdatedZcashAddress() public {
        (SproutVault v,) = _fund(3, address(0), T_ADDR, 1 ether);
        vm.prank(creator);
        v.setZcashAddress(ZS_ADDR);
        vm.expectEmit(address(payouts));
        emit BridgedOut(address(v), 3, 0.1 ether, depositAddr, bytes32(0), ZS_ADDR);
        vm.prank(keeper);
        payouts.bridgeOut(address(v), 0.1 ether, depositAddr, bytes32(0));
    }

    function test_bridgeOutMode4Foundation() public {
        _setFoundation();
        (SproutVault v,) = _fund(4, address(0), "", 1 ether);
        vm.expectEmit(address(payouts));
        emit BridgedOut(address(v), 4, 0.4 ether, depositAddr, bytes32("q"), FOUNDATION_ADDR);
        vm.prank(GUARDIAN);
        payouts.bridgeOut(address(v), 0.4 ether, depositAddr, bytes32("q"));
        (,,, uint256 toFoundation) = payouts.totals();
        assertEq(toFoundation, 0.4 ether);
    }

    function test_bridgeOutCapsAndChecks() public {
        (SproutVault v,) = _fund(3, address(0), T_ADDR, 5 ether); // 2 BNB pending
        vm.startPrank(keeper);
        vm.expectRevert(SproutPayouts.BridgeTooLarge.selector);
        payouts.bridgeOut(address(v), 1 ether + 1, depositAddr, bytes32(0));
        vm.expectRevert(SproutPayouts.ZeroAddress.selector);
        payouts.bridgeOut(address(v), 1 ether, address(0), bytes32(0));
        payouts.bridgeOut(address(v), 1 ether, depositAddr, bytes32(0)); // exactly MAX_BRIDGE ok
        payouts.bridgeOut(address(v), 1 ether, depositAddr, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(SproutPayouts.InsufficientPending.selector, 1, 0));
        payouts.bridgeOut(address(v), 1, depositAddr, bytes32(0));
        vm.stopPrank();
        assertEq(payouts.MAX_BRIDGE(), 1 ether);

        vm.prank(alice);
        vm.expectRevert(SproutPayouts.NotKeeper.selector);
        payouts.bridgeOut(address(v), 1, depositAddr, bytes32(0));
    }

    function test_bridgeOutWrongModesAndRejectingDeposit() public {
        (SproutVault v0,) = _fund(0, address(0), "", 1 ether);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SproutPayouts.WrongMode.selector, 0));
        payouts.bridgeOut(address(v0), 0.1 ether, depositAddr, bytes32(0));

        (SproutVault v3,) = _fund(3, address(0), T_ADDR, 1 ether);
        Rejecter r = new Rejecter();
        vm.prank(keeper);
        vm.expectRevert(SproutPayouts.TransferFailed.selector);
        payouts.bridgeOut(address(v3), 0.1 ether, address(r), bytes32(0));
        assertEq(payouts.pendingBnb(address(v3)), 0.4 ether, "atomic");
    }

    // ── admin ────────────────────────────────────────────────────────────

    function test_foundationAddressSetOnceValidated() public {
        assertEq(bytes(payouts.zcashFoundationAddress()).length, 0, "ships unset");
        vm.prank(alice);
        vm.expectRevert(SproutPayouts.NotOwner.selector);
        payouts.setZcashFoundationAddress(FOUNDATION_ADDR);
        vm.prank(owner);
        vm.expectRevert(SproutPayouts.InvalidZcashAddress.selector);
        payouts.setZcashFoundationAddress("not-an-address");
        _setFoundation();
        assertEq(payouts.zcashFoundationAddress(), FOUNDATION_ADDR);
        vm.prank(owner);
        vm.expectRevert(SproutPayouts.AlreadySet.selector);
        payouts.setZcashFoundationAddress(T_ADDR);
    }

    function test_factoryAndZecSetOnce() public {
        vm.startPrank(owner);
        vm.expectRevert(SproutPayouts.AlreadySet.selector);
        payouts.setFactory(alice);
        vm.expectRevert(SproutPayouts.AlreadySet.selector);
        payouts.setZecToken(alice);
        vm.stopPrank();
        assertEq(payouts.zec(), address(zec));
    }

    function test_zecFixedOnMainnet() public {
        vm.chainId(56);
        SproutPayouts p = new SproutPayouts(owner, keeper);
        assertEq(p.zec(), 0x1Ba42e5193dfA8B03D15dd1B86a3113bbBEF8Eeb);
        vm.prank(owner);
        vm.expectRevert(SproutPayouts.ZecOnChainFixed.selector);
        p.setZecToken(alice);
        assertEq(p.guardian(), 0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b);
    }

    function test_ownership() public {
        vm.prank(owner);
        payouts.transferOwnership(alice);
        assertEq(payouts.owner(), alice);
        vm.prank(owner);
        vm.expectRevert(SproutPayouts.NotOwner.selector);
        payouts.setKeeper(owner);
    }

    function test_unsupportedChainReverts() public {
        vm.chainId(1);
        vm.expectRevert();
        new SproutPayouts(owner, keeper);
    }

    function test_conservationAcrossVaults() public {
        (SproutVault a,) = _fund(0, address(0), "", 1 ether);
        (SproutVault b,) = _fund(3, address(0), T_ADDR, 1 ether);
        assertEq(payouts.totalPendingBnb(), 0.8 ether);
        assertEq(address(payouts).balance, 0.8 ether);
        vm.startPrank(keeper);
        payouts.settle(address(a), 0.4 ether, 1);
        payouts.bridgeOut(address(b), 0.4 ether, depositAddr, bytes32(0));
        vm.stopPrank();
        assertEq(address(payouts).balance, 0);
        assertEq(payouts.totalPendingBnb(), 0);
        // vault b cannot drain vault a's pending (none left either way)
        vm.prank(keeper);
        vm.expectRevert();
        payouts.bridgeOut(address(b), 1, depositAddr, bytes32(0));
    }
}
