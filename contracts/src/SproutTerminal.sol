// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/security/ReentrancyGuard.sol";
import {IPortalTradeV2, IPortalTypes} from "./flap/IPortal.sol";
import {SproutChain} from "./lib/SproutChain.sol";
import {IFlapPortalLite} from "./interfaces/ISproutExternal.sol";

/// @title SproutTerminal (春笋终端)
/// @notice Trade any Flap token through the Flap Portal (bonding curve or DEX) with one Zcash-funded account,
///         and cash out to Zcash in the same transaction. 1% fee on the BNB side of every trade:
///         0.25% → SproutRoots (Rootstock buy & burn), 0.75% → Sprout treasury.
///         Sprout's own coins are traded fee-free directly via the Portal on their coin page; the terminal is for
///         any Flap token.
///
///         Guard: only tokens whose Flap state is Tradable (curve) or DEX (graduated) are accepted (Invalid,
///         InDuel, Killed and Staged are refused), and tokens whose buy or sell tax exceeds 5% (500 bps) are refused.
///
/// @dev    No admin, no upgradeability, holds nothing between transactions. `sellAndBridge` sends the net BNB to
///         a NEAR Intents 1Click deposit address on BSC (quoted off-chain by the user's client for BNB(BSC) →
///         ZEC(Zcash)); it is only sent if the sale succeeds, because it is the same transaction.
contract SproutTerminal is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_BPS = 100; // 1.00%
    uint256 public constant ROOTS_FEE_BPS = 25; // of volume: 0.25% → Roots; the other 0.75% → treasury
    uint256 public constant MAX_TAX_BPS = 500;

    uint8 internal constant STATUS_INVALID = 0;
    uint8 internal constant STATUS_TRADABLE = 1; // on the bonding curve
    uint8 internal constant STATUS_DEX = 4; // graduated

    address public immutable roots;
    address public immutable treasury;
    address public immutable portal;

    uint256 public totalVolumeBnb;
    uint256 public totalFeesBnb;

    event TerminalTrade(
        address indexed trader, address indexed token, bool isBuy, uint256 bnbAmount, uint256 tokenAmount, uint256 fee
    );
    event CashOut(address indexed trader, uint256 bnbOut, address depositAddress, bytes32 quoteRef);

    error ZeroAddress();
    error ZeroAmount();
    error TokenNotTradable(uint8 status);
    error TaxTooHigh(uint256 buyTaxBps, uint256 sellTaxBps);
    error InsufficientOutput(uint256 got, uint256 minOut);
    error TransferFailed();
    error UnexpectedBnb();

    constructor(address roots_, address treasury_) {
        if (roots_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        roots = roots_;
        treasury = treasury_;
        portal = SproutChain.portal();
    }

    /// @dev Only accepts BNB mid-trade (Portal sell proceeds / partial-fill refunds); stray BNB is refused.
    receive() external payable {
        if (!_reentrancyGuardEntered()) revert UnexpectedBnb();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Trading
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Buy `token` with msg.value BNB (1% fee taken first). Tokens go to `recipient` (or msg.sender).
    function buy(address token, uint256 minOut, address recipient) external payable nonReentrant returns (uint256 out) {
        if (msg.value == 0) revert ZeroAmount();
        guard(token);
        if (recipient == address(0)) recipient = msg.sender;

        uint256 fee = (msg.value * FEE_BPS) / 10000;
        uint256 net = msg.value - fee;
        uint256 pre = address(this).balance - msg.value;
        uint256 tokBefore = IERC20(token).balanceOf(address(this));

        IFlapPortalLite(portal).swapExactInput{value: net}(
            IPortalTradeV2.ExactInputParams({
                inputToken: address(0),
                outputToken: token,
                inputAmount: net,
                minOutputAmount: minOut,
                permitData: ""
            })
        );
        out = IERC20(token).balanceOf(address(this)) - tokBefore;
        if (out == 0 || out < minOut) revert InsufficientOutput(out, minOut);

        // Partial fill (e.g. at graduation): return the unused BNB to the trader, and charge the 1% fee only on
        // the BNB that was actually spent (fee and spent net keep the same 1 : 99 ratio).
        uint256 unused = address(this).balance - pre - fee;
        if (unused > 0) {
            uint256 spentNet = net - unused;
            uint256 feeUsed = (spentNet * FEE_BPS) / (10000 - FEE_BPS);
            if (feeUsed > fee) feeUsed = fee;
            fee = feeUsed;
        }
        uint256 refund = msg.value - (net - unused) - fee;
        IERC20(token).safeTransfer(recipient, out);
        _payFee(fee);
        if (refund > 0) _send(msg.sender, refund);

        totalVolumeBnb += msg.value - refund;
        emit TerminalTrade(msg.sender, token, true, msg.value - refund, out, fee);
    }

    /// @notice Sell `amountIn` of `token` (pulled from msg.sender; approve first). Net BNB goes to `recipient`.
    function sell(address token, uint256 amountIn, uint256 minBnbOut, address recipient)
        external
        nonReentrant
        returns (uint256 bnbOut)
    {
        if (recipient == address(0)) recipient = msg.sender;
        bnbOut = _sell(token, amountIn, minBnbOut);
        _send(recipient, bnbOut);
    }

    /// @notice Cash out to Zcash: sell, then send the net BNB to a 1Click deposit address (BNB → native ZEC) in
    ///         the same transaction. `quoteRef` identifies the 1Click quote (and, for shielded payouts, the
    ///         Sprout forwarder's payout record).
    function sellAndBridge(
        address token,
        uint256 amountIn,
        uint256 minBnbOut,
        address oneClickDepositAddress,
        bytes32 quoteRef
    ) external nonReentrant returns (uint256 bnbOut) {
        if (oneClickDepositAddress == address(0)) revert ZeroAddress();
        bnbOut = _sell(token, amountIn, minBnbOut);
        _send(oneClickDepositAddress, bnbOut);
        emit CashOut(msg.sender, bnbOut, oneClickDepositAddress, quoteRef);
    }

    /// @notice Cash out BNB the caller already holds (no sale, no fee): forwards msg.value to a 1Click deposit
    ///         address and emits the same `CashOut` event as `sellAndBridge`. Used for "Move ZEC" sends and for
    ///         coin-page sales (Portal sell, then bridge) so that every cash-out — in particular a shielded one,
    ///         which Sprout's shield forwarder only pays after finding this event on-chain — is provable.
    function bridge(address oneClickDepositAddress, bytes32 quoteRef) external payable nonReentrant {
        if (oneClickDepositAddress == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        _send(oneClickDepositAddress, msg.value);
        emit CashOut(msg.sender, msg.value, oneClickDepositAddress, quoteRef);
    }

    /// @notice Reverts unless `token` is tradable through the terminal (Flap state and tax checks).
    function guard(address token) public view {
        IPortalTypes.TokenStateV8Safe memory s;
        try IFlapPortalLite(portal).getTokenV8Safe(token) returns (IPortalTypes.TokenStateV8Safe memory st) {
            s = st;
        } catch {
            revert TokenNotTradable(STATUS_INVALID); // the live Portal reverts TokenNotFound for unknown tokens
        }
        if (s.status != STATUS_TRADABLE && s.status != STATUS_DEX) revert TokenNotTradable(s.status);
        if (s.buyTaxRate > MAX_TAX_BPS || s.sellTaxRate > MAX_TAX_BPS) revert TaxTooHigh(s.buyTaxRate, s.sellTaxRate);
    }

    /// @notice Fee split for a BNB amount: (toRoots, toTreasury).
    function feeSplit(uint256 bnbAmount) public pure returns (uint256 toRoots, uint256 toTreasury) {
        uint256 fee = (bnbAmount * FEE_BPS) / 10000;
        toRoots = (fee * ROOTS_FEE_BPS) / FEE_BPS;
        toTreasury = fee - toRoots;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────

    function _sell(address token, uint256 amountIn, uint256 minBnbOut) internal returns (uint256 net) {
        if (amountIn == 0) revert ZeroAmount();
        guard(token);
        IERC20 t = IERC20(token);
        uint256 tokBefore = t.balanceOf(address(this));
        t.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 received = t.balanceOf(address(this)) - tokBefore; // robust to transfer tax

        uint256 bnbBefore = address(this).balance;
        t.forceApprove(portal, received);
        IFlapPortalLite(portal).swapExactInput(
            IPortalTradeV2.ExactInputParams({
                inputToken: token,
                outputToken: address(0),
                inputAmount: received,
                minOutputAmount: 0, // net (after fee) is checked against minBnbOut below
                permitData: ""
            })
        );
        t.forceApprove(portal, 0);
        uint256 gross = address(this).balance - bnbBefore;
        uint256 fee = (gross * FEE_BPS) / 10000;
        net = gross - fee;
        if (net == 0 || net < minBnbOut) revert InsufficientOutput(net, minBnbOut);

        // Return any tokens the Portal did not take (partial fill).
        uint256 left = t.balanceOf(address(this)) - tokBefore;
        if (left > 0) t.safeTransfer(msg.sender, left);

        _payFee(fee);
        totalVolumeBnb += gross;
        emit TerminalTrade(msg.sender, token, false, gross, received - left, fee);
    }

    function _payFee(uint256 fee) internal {
        if (fee == 0) return;
        uint256 toRoots = (fee * ROOTS_FEE_BPS) / FEE_BPS;
        totalFeesBnb += fee;
        _send(roots, toRoots);
        _send(treasury, fee - toRoots);
    }

    function _send(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
