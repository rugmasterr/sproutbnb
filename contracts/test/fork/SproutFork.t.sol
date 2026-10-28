// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {ClonesUpgradeable} from "@openzeppelin-contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import {IVaultPortal, IVaultPortalTypes} from "../../src/flap/IVaultPortal.sol";
import {IPortalTypes, IPortalTradeV2, IPortalCommonTypes} from "../../src/flap/IPortal.sol";
import {ITaxProcessor} from "../../src/flap/ITaxProcessor.sol";
import {SproutVault} from "../../src/SproutVault.sol";
import {SproutRoots} from "../../src/SproutRoots.sol";
import {SproutPayouts} from "../../src/SproutPayouts.sol";
import {SproutTerminal} from "../../src/SproutTerminal.sol";
import {SproutVaultFactory} from "../../src/SproutVaultFactory.sol";
import {IFlapDividend, IFlapTaxTokenLite} from "../../src/interfaces/ISproutExternal.sol";

interface IPortalFork {
    function swapExactInput(IPortalTradeV2.ExactInputParams calldata params) external payable returns (uint256);
    function getTokenV8Safe(address token) external view returns (IPortalTypes.TokenStateV8Safe memory);
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160, uint32, uint256);
}

/// @notice BSC mainnet fork suite. Skipped unless BSC_RPC_URL is set:
///   $env:BSC_RPC_URL="https://bsc-rpc.publicnode.com"; forge test --match-path test/fork/* -vv
/// Launches real Sprout coins through Flap's VaultPortal with our factory, trades on the real bonding curve,
/// dispatches tax through the real TaxProcessor, flushes, settles into real ZEC via the PancakeSwap V3 pool,
/// pays holders through the real Flap V3 Dividend contract, and trades through the terminal.
contract SproutForkTest is Test {
    address constant PORTAL = 0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0;
    address payable constant VAULT_PORTAL = payable(0x90497450f2a706f1951b5bdda52B4E5d16f34C06);
    address constant TAX_V3_IMPL = 0x024f18294970B5c76c0691b87f138A0317156422;
    address constant ZEC = 0x1Ba42e5193dfA8B03D15dd1B86a3113bbBEF8Eeb;
    address constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address constant QUOTER_V2 = 0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997;
    address constant GUARDIAN = 0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    string constant T_ADDR = "t1abcdefghijkmnopqrstuvwxyzABCDEFGH"; // synthetic, format-valid

    bool internal forked;
    address internal owner = makeAddr("sprout.fork.owner");
    address internal keeper = makeAddr("sprout.fork.keeper");
    address internal admin = makeAddr("sprout.fork.admin");
    address internal treasury = makeAddr("sprout.fork.treasury");
    address internal creator = makeAddr("sprout.fork.creator");
    address internal alice = makeAddr("sprout.fork.alice");
    address internal bob = makeAddr("sprout.fork.bob");

    SproutRoots internal roots;
    SproutPayouts internal payouts;
    SproutVaultFactory internal factory;
    SproutTerminal internal terminal;
    uint256 internal saltSeed;

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;
        saltSeed = uint256(keccak256(abi.encode(block.number, block.timestamp, address(this))));

        roots = new SproutRoots(owner, keeper);
        payouts = new SproutPayouts(owner, keeper);
        factory = new SproutVaultFactory(admin, address(roots), address(payouts), treasury);
        terminal = new SproutTerminal(address(roots), treasury);
        vm.prank(owner);
        payouts.setFactory(address(factory));

        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.label(PORTAL, "FlapPortal");
        vm.label(VAULT_PORTAL, "FlapVaultPortal");
        vm.label(ZEC, "ZEC");
    }

    modifier onlyFork() {
        if (!forked) {
            vm.skip(true);
            return;
        }
        _;
    }

    // ── helpers ──────────────────────────────────────────────────────────

    function _findSalt() internal returns (bytes32 salt, address predicted) {
        uint256 s = saltSeed;
        while (true) {
            salt = bytes32(s);
            predicted = ClonesUpgradeable.predictDeterministicAddress(TAX_V3_IMPL, salt, PORTAL);
            if (uint160(predicted) & 0xFFFF == 0x7777 && predicted.code.length == 0) break;
            s++;
        }
        saltSeed = s + 1;
    }

    function _launch(uint8 mode, address payee, string memory zaddr, address dividendToken, uint256 minShare)
        internal
        returns (address token, SproutVault vault)
    {
        (bytes32 salt, address predicted) = _findSalt();
        IVaultPortalTypes.NewTokenV6WithVaultParams memory p;
        p.name = "Sprout Fork Test";
        p.symbol = "SPRT";
        p.meta = "";
        p.dexThresh = IPortalCommonTypes.DexThreshType.FOUR_FIFTHS;
        p.salt = salt;
        p.migratorType = IPortalTypes.MigratorType.V2_MIGRATOR;
        p.quoteToken = address(0);
        p.quoteAmt = 0.05 ether;
        p.permitData = "";
        p.extensionID = bytes32(0);
        p.extensionData = "";
        p.dexId = IPortalTypes.DEXId.DEX0;
        p.lpFeeProfile = IPortalTypes.V3LPFeeProfile.LP_FEE_PROFILE_STANDARD;
        p.buyTaxRate = 200;
        p.sellTaxRate = 200;
        p.taxDuration = 3153600000;
        p.antiFarmerDuration = 86400;
        p.mktBps = 10000;
        p.deflationBps = 0;
        p.dividendBps = 0;
        p.lpBps = 0;
        p.minimumShareBalance = minShare;
        p.dividendToken = dividendToken;
        p.commissionReceiver = address(roots);
        p.tokenVersion = IPortalTypes.TokenVersion.TOKEN_TAXED_V3;
        p.vaultFactory = address(factory);
        p.vaultData = abi.encode(mode, payee, zaddr);

        vm.prank(creator);
        token = IVaultPortal(VAULT_PORTAL).newTokenV6WithVault{value: p.quoteAmt}(p);
        assertEq(token, predicted, "CREATE2 prediction (7777 vanity)");
        vault = SproutVault(payable(factory.vaultOf(token)));
        assertTrue(address(vault) != address(0), "vault registered");
        assertEq(IVaultPortal(VAULT_PORTAL).getVault(token).vault, address(vault), "VaultPortal knows our vault");
        assertEq(vault.taxToken(), token);
        assertEq(vault.mode(), mode);
        console2.log("launched", token, "vault", address(vault));
    }

    function _buy(address who, address token, uint256 bnb) internal returns (uint256 got) {
        uint256 before = IERC20(token).balanceOf(who);
        vm.startPrank(who);
        IPortalFork(PORTAL).swapExactInput{value: bnb}(
            IPortalTradeV2.ExactInputParams({
                inputToken: address(0), outputToken: token, inputAmount: bnb, minOutputAmount: 0, permitData: ""
            })
        );
        vm.stopPrank();
        got = IERC20(token).balanceOf(who) - before;
    }

    function _sell(address who, address token, uint256 amount) internal {
        vm.startPrank(who);
        IERC20(token).approve(PORTAL, amount);
        IPortalFork(PORTAL).swapExactInput(
            IPortalTradeV2.ExactInputParams({
                inputToken: token, outputToken: address(0), inputAmount: amount, minOutputAmount: 0, permitData: ""
            })
        );
        vm.stopPrank();
    }

    function _dispatch(address token) internal {
        ITaxProcessor(IFlapTaxTokenLite(token).taxProcessor()).dispatch{gas: 1_000_000}();
    }

    function _quoteZec(uint256 bnb) internal returns (uint256 out) {
        (out,,,) = IQuoterV2(QUOTER_V2).quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: WBNB, tokenOut: ZEC, amountIn: bnb, fee: 2500, sqrtPriceLimitX96: 0
            })
        );
    }

    // ── tests ────────────────────────────────────────────────────────────

    function test_fork_mode0_launchTradeDispatchFlushSettleZec() public onlyFork {
        (address token, SproutVault vault) = _launch(0, address(0), "", address(0), 0);
        assertEq(vault.payee(), creator);
        ITaxProcessor tp = ITaxProcessor(IFlapTaxTokenLite(token).taxProcessor());
        assertEq(tp.marketAddress(), address(vault), "tax remainder routed to the Sprout vault");
        assertEq(tp.commissionReceiver(), address(roots), "integrator commission to Roots");

        uint256 got = _buy(alice, token, 2 ether);
        _sell(alice, token, got / 2);
        console2.log("market quote pending", tp.marketQuoteBalance());
        uint256 rootsBefore = address(roots).balance;
        _dispatch(token);
        (uint256 received,,,,,) = vault.stats();
        console2.log("vault received (wei)", received);
        assertGt(received, 0, "dispatch paid the vault");
        assertEq(vault.accountedQuote(), address(vault).balance, "receive() recognized revenue");
        console2.log("commissionBps", tp.commissionBps());
        console2.log("commission to Roots (wei)", address(roots).balance - rootsBefore);
        console2.log("commission still pending (wei)", tp.commissionQuoteBalance());
        assertGt(address(roots).balance, rootsBefore, "Flap integrator commission reached Roots");

        vault.flush();
        uint256 pending = payouts.pendingBnb(address(vault));
        assertEq(
            pending, received - 2 * ((received * 2500) / 10000) - (received * 1000) / 10000, "40% to Payouts"
        );
        assertGt(roots.lpPot(), 0);
        assertGt(treasury.balance, 0);

        uint256 q = _quoteZec(pending);
        console2.log("BNB -> ZEC quote", pending, q);
        vm.prank(keeper);
        payouts.settle(address(vault), pending, (q * 99) / 100);
        uint256 zecGot = IERC20(ZEC).balanceOf(creator);
        console2.log("creator received ZEC (wei)", zecGot);
        assertGe(zecGot, (q * 99) / 100, "real V3 ZEC pool delivered");
        assertEq(payouts.pendingBnb(address(vault)), 0);
    }

    function test_fork_mode2_holdersRewardedInZecViaFlapDividend() public onlyFork {
        (address token, SproutVault vault) = _launch(2, address(0), "", ZEC, 100_000e18);
        IFlapDividend dividend = IFlapDividend(IFlapTaxTokenLite(token).dividendContract());
        console2.log("dividend contract", address(dividend));
        assertEq(dividend.dividendToken(), ZEC, "tracker-only dividend contract tracks ZEC");

        _buy(alice, token, 3 ether);
        _buy(bob, token, 1 ether);
        console2.log("totalShares", dividend.totalShares());
        _dispatch(token);
        vault.flush();
        uint256 pending = payouts.pendingBnb(address(vault));
        assertGt(pending, 0);

        uint256 distBefore = dividend.totalDividendsDistributed();
        address usable = payouts.usableDividend(address(vault));
        uint256 q = _quoteZec(pending);
        vm.prank(keeper);
        payouts.settle(address(vault), pending, (q * 99) / 100);
        (, uint256 toHolders,,) = payouts.totals();
        assertGt(toHolders, 0);

        if (usable != address(0)) {
            assertEq(dividend.totalDividendsDistributed() - distBefore, toHolders, "Flap dividend.deposit(uint256) took ZEC");
            assertGt(dividend.withdrawableDividendOf(alice), 0, "alice can withdraw ZEC");
            console2.log("alice withdrawable ZEC", dividend.withdrawableDividendOf(alice));
            console2.log("bob withdrawable ZEC", dividend.withdrawableDividendOf(bob));
            uint256 before = IERC20(ZEC).balanceOf(alice);
            vm.prank(alice);
            (bool ok,) = address(dividend).call(abi.encodeWithSignature("withdrawDividends()"));
            assertTrue(ok, "withdrawDividends()");
            assertGt(IERC20(ZEC).balanceOf(alice), before, "alice received ZEC");
        } else {
            console2.log("dividend not usable (no shares) -> pooled for fallback distributor");
            assertEq(payouts.holderPool(address(vault)), toHolders);
        }
    }

    function test_fork_mode3_bridgeOutAndRedirect() public onlyFork {
        (address token, SproutVault vault) = _launch(3, address(0), T_ADDR, address(0), 0);
        _buy(alice, token, 2 ether);
        _dispatch(token);
        vault.flush();
        uint256 pending = payouts.pendingBnb(address(vault));
        assertGt(pending, 0);
        address dep = makeAddr("simulated-1click-deposit");
        vm.prank(keeper);
        payouts.bridgeOut(address(vault), pending, dep, keccak256("quote"));
        assertEq(dep.balance, pending);
        vm.prank(GUARDIAN);
        vault.transferControl(bob);
        assertEq(vault.controller(), bob);
    }

    function test_fork_rootsBurnAndGroveOnRealCoin() public onlyFork {
        (address token,) = _launch(1, bob, "", address(0), 0);
        vm.prank(owner);
        roots.setSprout(token); // stand-in for $SPROUT
        vm.deal(address(this), 2 ether);
        roots.deposit{value: 2 ether}(1 ether, 1 ether);

        vm.prank(keeper);
        roots.burnRun(0.5 ether, 1);
        (uint256 burned,,,,) = roots.totals();
        assertGt(burned, 0);
        assertEq(IERC20(token).balanceOf(DEAD), burned, "bought on the real curve and burned");

        // Grove run while the coin is still on the bonding curve.
        uint256 q = _quoteZec(0.25 ether);
        vm.prank(keeper);
        try roots.liquidityRun(0.5 ether, (q * 98) / 100, 1) {
            address pair = roots.grovePair();
            assertTrue(pair != address(0), "SPROUT/ZEC pair created");
            (,,, uint256 zecToLiq, uint256 lpBurned) = roots.totals();
            assertGt(zecToLiq, 0);
            assertGt(lpBurned, 0);
            assertEq(IERC20(pair).balanceOf(DEAD), lpBurned, "LP burned to dEaD");
            console2.log("grove pair", pair, "lp burned", lpBurned);

            // Second run into the now-existing real pair: the Grove price guard compares the pair's reserves
            // with this run's own buys (the first run's buy moved the curve price up, so log both).
            vm.warp(block.timestamp + 300);
            uint256 q2 = _quoteZec(0.05 ether);
            vm.prank(keeper);
            try roots.liquidityRun(0.1 ether, (q2 * 98) / 100, 1) {
                (,,, uint256 zecToLiq2, uint256 lpBurned2) = roots.totals();
                assertGt(zecToLiq2, zecToLiq);
                assertGt(lpBurned2, lpBurned);
                console2.log("second grove run ok, lp burned total", lpBurned2);
            } catch (bytes memory err2) {
                console2.log("second grove run reverted:");
                console2.logBytes(err2);
                revert("second liquidityRun failed on fork");
            }
        } catch (bytes memory err) {
            console2.log("liquidityRun reverted while the coin is on the curve:");
            console2.logBytes(err);
            revert("liquidityRun failed on fork");
        }
    }

    function test_fork_terminalOnRealFlapToken() public onlyFork {
        (address token,) = _launch(0, address(0), "", address(0), 0);
        uint256 rootsBefore = address(roots).balance;
        vm.prank(alice);
        uint256 out = terminal.buy{value: 1 ether}(token, 1, alice);
        assertGt(out, 0);
        assertEq(IERC20(token).balanceOf(alice), out);
        assertEq(address(roots).balance - rootsBefore, 0.0025 ether, "0.25% to Roots");
        assertEq(treasury.balance, 0.0075 ether, "0.75% to treasury");

        vm.startPrank(alice);
        IERC20(token).approve(address(terminal), type(uint256).max);
        uint256 bnbOut = terminal.sell(token, out / 3, 1, alice);
        address dep = makeAddr("simulated-1click-deposit");
        uint256 cashOut = terminal.sellAndBridge(token, out / 3, 1, dep, keccak256("q"));
        vm.stopPrank();
        assertGt(bnbOut, 0);
        assertEq(dep.balance, cashOut);
        assertEq(address(terminal).balance, 0);
        assertEq(IERC20(token).balanceOf(address(terminal)), 0);

        // A third-party Flap tax token launched on mainnet (found via VaultPortal FlapTaxVaultTokenCreated logs).
        address ext = 0xC96AFaa3a1AAa36A05220dC1A63F8431997B7777;
        IPortalTypes.TokenStateV8Safe memory st = IPortalFork(PORTAL).getTokenV8Safe(ext);
        console2.log("external token status / buyTax / sellTax", st.status, st.buyTaxRate, st.sellTaxRate);
        if (st.buyTaxRate > 500 || st.sellTaxRate > 500) {
            vm.expectRevert(abi.encodeWithSelector(SproutTerminal.TaxTooHigh.selector, st.buyTaxRate, st.sellTaxRate));
            terminal.guard(ext);
        } else if (st.status == 1 || st.status == 4) {
            vm.prank(bob);
            uint256 extOut = terminal.buy{value: 0.1 ether}(ext, 1, bob);
            assertGt(extOut, 0, "terminal buy on a third-party Flap token");
            console2.log("external token bought", extOut);
        }

        // Guard: an address Flap does not know is refused.
        vm.expectRevert(abi.encodeWithSelector(SproutTerminal.TokenNotTradable.selector, 0));
        terminal.guard(address(0xdead0001));
    }
}
