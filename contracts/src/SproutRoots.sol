// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/security/ReentrancyGuard.sol";
import {IPortalTradeV2} from "./flap/IPortal.sol";
import {SproutChain} from "./lib/SproutChain.sol";
import {ZecSwap} from "./lib/ZecSwap.sol";
import {IFlapPortalLite, IPancakeV2Router, IPancakeV2Factory, IPancakeV2Pair} from "./interfaces/ISproutExternal.sol";

/// @title SproutRoots (竹根 · 竹林)
/// @notice Single shared contract that receives the Grove (liquidity) and Rootstock (buy & burn) shares of every
///         Sprout vault, plus Flap's integrator commission and the terminal fee share (plain BNB → rootPot).
///
///         - `burnRun`: buys $SPROUT through Flap Portal.swapExactInput (bonding curve or DEX) and sends it to
///           0x…dEaD.
///         - `liquidityRun`: half of the draw → ZEC (PancakeSwap V3 WBNB/ZEC 0.25%), half → $SPROUT (Flap
///           Portal), then addLiquidity($SPROUT, ZEC) on PancakeSwap V2. LP tokens → 0x…dEaD. Atomic.
///           This is The Grove 竹林: one shared, protocol-owned $SPROUT/ZEC pool that backs no individual coin.
///
///         Each run draws at most MAX_DRAW (0.5 BNB); each action is at least MIN_INTERVAL (300 s) apart.
///         Runs are keeper-only (the Flap Guardian is always a keeper) so they carry fresh on-chain quotes.
///
/// @dev    Trust model: there is NO function that withdraws BNB or tokens to the owner or keeper. BNB only leaves
///         through Portal buys and the V3 swap; $SPROUT only leaves to 0x…dEaD or into the Grove pair; ZEC only
///         into the Grove pair (leftovers stay in `zecReserve` for the next run).
///
///         Tax-token effects: $SPROUT is a Flap Tax Token V3, so transfers into pools can be taxed. Every amount
///         is measured by balance deltas (buy output, liquidity actually taken), never by return values.
///
///         Accounting: `_lpPot + _rootPot <= address(this).balance` always holds. Plain BNB transfers
///         (`receive`) are booked lazily into the root pot at the next deposit/run so `receive()` works even
///         with a 2300-gas stipend; `rootPot()` reports them already.
contract SproutRoots is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_DRAW = 0.5 ether;
    uint256 public constant MIN_INTERVAL = 300;
    /// @notice liquidityRun refuses to add to the Grove when the pair's price differs from the price implied by
    ///         the run's own two keeper-quoted buys (ZEC on V3, $SPROUT on Flap) by more than this. Without it an
    ///         attacker could skew (or pre-create) the $SPROUT/ZEC pair, let the run deposit at the bad ratio with
    ///         amountMin = 0 and arbitrage the protocol-owned liquidity back. 5% covers the natural no-arbitrage
    ///         band ($SPROUT 2% tax + pool fees) so ordinary drift does not block runs.
    uint256 public constant MAX_GROVE_DEVIATION_BPS = 500;
    address public constant DEAD = SproutChain.DEAD;

    address public immutable portal;
    address public immutable v2Router;
    address public immutable guardian;

    address public owner;
    address public keeper;
    address public sprout;
    address internal _zec;

    uint256 internal _lpPot;
    uint256 internal _rootPot;
    /// @notice ZEC bought for the Grove but not taken by the last addLiquidity (used first next run).
    uint256 public zecReserve;

    uint256 public lastBurnAt;
    uint256 public lastLiquidityAt;

    uint256 internal _sproutBurned;
    uint256 internal _bnbBurnSpent;
    uint256 internal _bnbToLiquidity;
    uint256 internal _zecToLiquidity;
    uint256 internal _lpBurned;

    event Deposited(address indexed from, uint256 lpAmount, uint256 rootAmount);
    event BurnRun(uint256 bnbIn, uint256 sproutBurned);
    event LiquidityRun(uint256 bnbIn, uint256 zecIn, uint256 sproutIn, uint256 lpBurned);
    event SproutSet(address indexed token);
    event ZecTokenSet(address indexed zec);
    event KeeperChanged(address indexed previousKeeper, address indexed newKeeper);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotKeeper();
    error ZeroAddress();
    error AlreadySet();
    error SproutNotSet();
    error ZecNotSet();
    error ZecOnChainFixed();
    error BadDepositValue();
    error ZeroAmount();
    error DrawTooLarge();
    error InsufficientPot();
    error TooSoon();
    error InsufficientOutput();
    error SlippageRequired();
    error GrovePriceOutOfRange(uint256 groveZecPerSprout, uint256 runZecPerSprout);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev The Flap Guardian is always a keeper; nothing can revoke that.
    modifier onlyKeeper() {
        if (msg.sender != keeper && msg.sender != guardian) revert NotKeeper();
        _;
    }

    constructor(address owner_, address keeper_) {
        if (owner_ == address(0)) revert ZeroAddress();
        portal = SproutChain.portal();
        v2Router = SproutChain.v2Router();
        guardian = SproutChain.guardian();
        _zec = SproutChain.zec();
        owner = owner_;
        keeper = keeper_;
        emit OwnershipTransferred(address(0), owner_);
        emit KeeperChanged(address(0), keeper_);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Admin (no fund access)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Set the $SPROUT token. Owner, once.
    function setSprout(address token) external onlyOwner {
        if (sprout != address(0)) revert AlreadySet();
        if (token == address(0)) revert ZeroAddress();
        sprout = token;
        emit SproutSet(token);
    }

    /// @notice Testnet only (no canonical ZEC there): set the mock ZEC token once.
    function setZecToken(address zec_) external onlyOwner {
        if (SproutChain.zec() != address(0)) revert ZecOnChainFixed();
        if (_zec != address(0)) revert AlreadySet();
        if (zec_ == address(0)) revert ZeroAddress();
        _zec = zec_;
        emit ZecTokenSet(zec_);
    }

    /// @notice Set the keeper (zero disables it; the Flap Guardian keeps keeper rights regardless).
    function setKeeper(address newKeeper) external onlyOwner {
        emit KeeperChanged(keeper, newKeeper);
        keeper = newKeeper;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Inflows
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Deposit BNB split between the Grove (lp) and Rootstock (root) pots. Used by SproutVaults;
    ///         anyone may donate.
    function deposit(uint256 lpAmount, uint256 rootAmount) external payable nonReentrant {
        if (msg.value != lpAmount + rootAmount) revert BadDepositValue();
        _absorbSurplus(msg.value);
        _lpPot += lpAmount;
        _rootPot += rootAmount;
        emit Deposited(msg.sender, lpAmount, rootAmount);
    }

    /// @notice Plain BNB (Flap integrator commission, terminal fee share, refunds) counts toward rootPot.
    receive() external payable {
        // Emit only with gas to spare (a 2300 stipend must still succeed) and outside runs (refunds).
        if (gasleft() > 10_000 && !_reentrancyGuardEntered()) emit Deposited(msg.sender, 0, msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function zec() external view returns (address) {
        return _zec;
    }

    function lpPot() external view returns (uint256) {
        return _lpPot;
    }

    /// @notice Root pot including not-yet-booked plain transfers.
    function rootPot() public view returns (uint256) {
        return address(this).balance - _lpPot;
    }

    /// @notice The Grove: $SPROUT/ZEC PancakeSwap V2 pair (address(0) until the first liquidityRun creates it).
    function grovePair() public view returns (address) {
        address s = sprout;
        address z = _zec;
        if (s == address(0) || z == address(0)) return address(0);
        return IPancakeV2Factory(IPancakeV2Router(v2Router).factory()).getPair(s, z);
    }

    function totals()
        external
        view
        returns (
            uint256 sproutBurned,
            uint256 bnbBurnSpent,
            uint256 bnbToLiquidity,
            uint256 zecToLiquidity,
            uint256 lpBurned
        )
    {
        return (_sproutBurned, _bnbBurnSpent, _bnbToLiquidity, _zecToLiquidity, _lpBurned);
    }

    /// @notice Earliest timestamps at which the next burn / liquidity run is allowed.
    function nextRunTimes() external view returns (uint256 nextBurnAt, uint256 nextLiquidityAt) {
        nextBurnAt = lastBurnAt == 0 ? 0 : lastBurnAt + MIN_INTERVAL;
        nextLiquidityAt = lastLiquidityAt == 0 ? 0 : lastLiquidityAt + MIN_INTERVAL;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Runs (keeper / Guardian)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Buy $SPROUT with `amount` BNB from the root pot and burn it (send to 0x…dEaD).
    /// @param minSproutOut Minimum $SPROUT actually received (net of any token tax).
    function burnRun(uint256 amount, uint256 minSproutOut) external nonReentrant onlyKeeper {
        if (minSproutOut == 0) revert SlippageRequired();
        address token = _sproutOrRevert();
        _absorbSurplus(0);
        _checkDraw(amount, _rootPot, lastBurnAt);
        _rootPot -= amount;
        lastBurnAt = block.timestamp;

        (uint256 got, uint256 spent) = _buySprout(token, amount, minSproutOut);
        if (spent < amount) _rootPot += amount - spent; // partial-fill refund stays in the pot
        IERC20(token).safeTransfer(DEAD, got);

        _sproutBurned += got;
        _bnbBurnSpent += spent;
        emit BurnRun(spent, got);
    }

    /// @notice Grow the Grove: half of `amount` → ZEC (V3), half → $SPROUT (Portal), addLiquidity on V2,
    ///         LP → 0x…dEaD. Leftover $SPROUT is burned; leftover ZEC is kept in `zecReserve` for the next run.
    /// @param minZecOut    Minimum ZEC from the V3 swap (QuoterV2 quote minus slippage).
    /// @param minSproutOut Minimum $SPROUT actually received from the Portal buy (net of token tax).
    function liquidityRun(uint256 amount, uint256 minZecOut, uint256 minSproutOut) external nonReentrant onlyKeeper {
        if (minZecOut == 0 || minSproutOut == 0) revert SlippageRequired();
        address token = _sproutOrRevert();
        address zecToken = _zec;
        if (zecToken == address(0)) revert ZecNotSet();
        _absorbSurplus(0);
        _checkDraw(amount, _lpPot, lastLiquidityAt);
        _lpPot -= amount;
        lastLiquidityAt = block.timestamp;

        uint256 half = amount / 2;
        uint256 zecGot = ZecSwap.bnbToZec(zecToken, half, minZecOut);
        (uint256 sproutGot, uint256 spentBuy) = _buySprout(token, amount - half, minSproutOut);
        if (spentBuy < amount - half) _lpPot += (amount - half) - spentBuy;

        uint256 zecAvail = zecGot + zecReserve;
        uint256 zecDesired;
        (uint256 rS, uint256 rZ) = _groveReserves(token);
        if (rS == 0 || rZ == 0) {
            // First deposit sets the Grove price: use only this run's ZEC so the price is exactly the ratio of
            // the two quoted buys (any reserve from earlier runs is kept for later).
            zecDesired = zecGot;
        } else {
            _checkGroveRatio(rS, rZ, sproutGot, zecGot);
            zecDesired = zecAvail;
        }
        (uint256 sproutUsed, uint256 zecUsed, uint256 liquidity) = _addGrove(token, zecToken, sproutGot, zecDesired);

        zecReserve = zecAvail - zecUsed;
        uint256 leftover = sproutGot > sproutUsed ? sproutGot - sproutUsed : 0;
        if (leftover > 0) {
            IERC20(token).safeTransfer(DEAD, leftover);
            _sproutBurned += leftover;
        }

        uint256 bnbIn = half + spentBuy;
        _bnbToLiquidity += bnbIn;
        _zecToLiquidity += zecUsed;
        _lpBurned += liquidity;
        emit LiquidityRun(bnbIn, zecUsed, sproutUsed, liquidity);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────

    /// @dev addLiquidity on PancakeSwap V2 with LP → dEaD. Amounts actually taken are measured by balance deltas.
    ///      amountMin = 0: the run's price risk is bounded by the two keeper-quoted buys; the V2 router only takes
    ///      the pool-ratio portion and the rest stays here (ZEC) or is burned ($SPROUT).
    function _addGrove(address token, address zecToken, uint256 sproutAmt, uint256 zecAmt)
        internal
        returns (uint256 sproutUsed, uint256 zecUsed, uint256 liquidity)
    {
        IERC20 s = IERC20(token);
        IERC20 z = IERC20(zecToken);
        uint256 sBefore = s.balanceOf(address(this));
        uint256 zBefore = z.balanceOf(address(this));
        s.forceApprove(v2Router, sproutAmt);
        z.forceApprove(v2Router, zecAmt);
        (,, liquidity) = IPancakeV2Router(v2Router).addLiquidity(
            token, zecToken, sproutAmt, zecAmt, 0, 0, DEAD, block.timestamp
        );
        s.forceApprove(v2Router, 0);
        z.forceApprove(v2Router, 0);
        sproutUsed = sBefore - s.balanceOf(address(this));
        zecUsed = zBefore - z.balanceOf(address(this));
    }

    /// @dev Current Grove reserves as ($SPROUT, ZEC); (0, 0) if the pair does not exist (yet).
    function _groveReserves(address token) internal view returns (uint256 rS, uint256 rZ) {
        address pair = grovePair();
        if (pair == address(0) || pair.code.length == 0) return (0, 0);
        (uint112 r0, uint112 r1,) = IPancakeV2Pair(pair).getReserves();
        (rS, rZ) = IPancakeV2Pair(pair).token0() == token ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
    }

    /// @dev Reverts unless rZ/rS is within MAX_GROVE_DEVIATION_BPS of zecGot/sproutGot (both directions).
    function _checkGroveRatio(uint256 rS, uint256 rZ, uint256 sproutGot, uint256 zecGot) internal pure {
        uint256 a = rZ * sproutGot; // grove price, cross-multiplied
        uint256 b = zecGot * rS; // run price, cross-multiplied
        uint256 hi = 10000 + MAX_GROVE_DEVIATION_BPS;
        if (a * 10000 > b * hi || b * 10000 > a * hi) {
            revert GrovePriceOutOfRange((rZ * 1e18) / rS, (zecGot * 1e18) / sproutGot);
        }
    }

    /// @dev Books plain transfers (balance surplus over the pots) into the root pot. `incoming` is the msg.value
    ///      of the current call, already in the balance but booked by the caller.
    function _absorbSurplus(uint256 incoming) internal {
        uint256 booked = _lpPot + _rootPot + incoming;
        uint256 bal = address(this).balance;
        if (bal > booked) _rootPot += bal - booked;
    }

    function _checkDraw(uint256 amount, uint256 pot, uint256 last) internal view {
        if (amount == 0) revert ZeroAmount();
        if (amount > MAX_DRAW) revert DrawTooLarge();
        if (amount > pot) revert InsufficientPot();
        if (last != 0 && block.timestamp < last + MIN_INTERVAL) revert TooSoon();
    }

    function _sproutOrRevert() internal view returns (address token) {
        token = sprout;
        if (token == address(0)) revert SproutNotSet();
    }

    /// @dev Buys $SPROUT with native BNB through the Flap Portal; returns the amount actually received and the
    ///      BNB actually spent (a partial fill may refund BNB during the call).
    function _buySprout(address token, uint256 bnbAmount, uint256 minOut)
        internal
        returns (uint256 got, uint256 spent)
    {
        uint256 before = IERC20(token).balanceOf(address(this));
        uint256 bnbBefore = address(this).balance;
        IFlapPortalLite(portal).swapExactInput{value: bnbAmount}(
            IPortalTradeV2.ExactInputParams({
                inputToken: address(0),
                outputToken: token,
                inputAmount: bnbAmount,
                minOutputAmount: minOut,
                permitData: ""
            })
        );
        got = IERC20(token).balanceOf(address(this)) - before;
        spent = bnbBefore - address(this).balance;
        if (got == 0 || got < minOut) revert InsufficientOutput();
    }
}
