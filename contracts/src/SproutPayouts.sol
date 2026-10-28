// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/security/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/utils/cryptography/MerkleProof.sol";
import {SproutChain} from "./lib/SproutChain.sol";
import {ZecSwap} from "./lib/ZecSwap.sol";
import {ZcashAddress} from "./lib/ZcashAddress.sol";
import {ISproutFactoryCore, ISproutVaultCore} from "./interfaces/ISprout.sol";
import {IFlapDividend, IFlapTaxTokenLite} from "./interfaces/ISproutExternal.sol";

/// @title SproutPayouts (春笋 ZEC 支付)
/// @notice Single shared contract that turns every Sprout vault's 40% "deployer's choice" share (BNB) into ZEC:
///
///           mode 0 Me / 1 Another wallet  settle(): BNB → BEP-20 ZEC (PancakeSwap V3 WBNB/ZEC 0.25%) → payee
///           mode 2 Holders                settle(): BNB → ZEC → the coin's Flap Dividend contract
///                                         (`deposit(uint256)`, tracker-only, dividendToken = ZEC). If that
///                                         contract is not usable for ZEC (wrong dividendToken, no shares yet,
///                                         call fails) the ZEC is kept in `holderPool[vault]` for the fallback
///                                         merkle distributor (publishHolderEpoch / claim) or a later push.
///           mode 3 A Zcash wallet         bridgeOut(): BNB → 1Click deposit address on BSC → native ZEC
///           mode 4 Zcash Foundation       bridgeOut(): same, to the Zcash Foundation address (set once)
///
/// @dev    Trust model. Owner: set keeper, wire the vault factory once, set the Zcash Foundation address once,
///         transfer ownership. Keeper (and the Flap Guardian, always): choose *when* and with which slippage
///         bound (`minZecOut`) to settle, and which 1Click deposit address to bridge to (capped at MAX_BRIDGE
///         per call). Neither owner nor keeper can withdraw BNB or ZEC to themselves: BNB only leaves through
///         the PancakeSwap V3 swap or to a 1Click deposit address; ZEC only leaves to a vault's payee, the
///         coin's Flap Dividend contract, or merkle claimants. The 1Click deposit address is an off-chain
///         quote the keeper obtains — that is the one point where the keeper is trusted (see README).
contract SproutPayouts is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_BRIDGE = 1 ether;
    uint256 public constant EPOCH_RECLAIM_DELAY = 90 days;

    uint8 internal constant MODE_ME = 0;
    uint8 internal constant MODE_WALLET = 1;
    uint8 internal constant MODE_HOLDERS = 2;
    uint8 internal constant MODE_ZCASH_WALLET = 3;
    uint8 internal constant MODE_ZCASH_FOUNDATION = 4;

    struct HolderEpoch {
        bytes32 root;
        uint128 total;
        uint128 claimed;
        uint64 publishedAt;
        bool closed;
    }

    address public immutable guardian;

    address public owner;
    address public keeper;
    address public factory;
    address internal _zec;
    string internal _foundation;

    mapping(address => uint256) public pendingBnb;
    uint256 public totalPendingBnb;

    /// @notice Fallback distributor: ZEC per vault (mode 2) not yet pushed to Flap or committed to an epoch.
    mapping(address => uint256) public holderPool;
    uint256 public totalHolderPool;
    mapping(address => HolderEpoch[]) internal _epochs;
    mapping(address => mapping(uint256 => mapping(address => bool))) public claimed;
    uint256 public totalEpochZec; // committed to epochs, not yet claimed / reclaimed

    uint256 internal _zecToPayees;
    uint256 internal _zecToHolders;
    uint256 internal _bnbBridgedToZcash;
    uint256 internal _bnbBridgedToFoundation;

    event Deposited(address indexed vault, uint256 amount);
    event Settled(address indexed vault, uint8 mode, uint256 bnbIn, uint256 zecOut, address to);
    event BridgedOut(
        address indexed vault, uint8 mode, uint256 bnbIn, address depositAddress, bytes32 quoteRef, string zcashAddress
    );
    event HolderRewardsDeposited(address indexed vault, address indexed dividend, uint256 zecAmount);
    event HolderRewardsPooled(address indexed vault, uint256 zecAmount);
    event HolderEpochPublished(address indexed vault, uint256 indexed epoch, bytes32 root, uint256 total);
    event HolderEpochReclaimed(address indexed vault, uint256 indexed epoch, uint256 amount);
    event Claimed(address indexed vault, uint256 indexed epoch, address indexed account, uint256 amount);
    event ZcashFoundationAddressSet(string addr);
    event FactorySet(address indexed factory);
    event ZecTokenSet(address indexed zec);
    event KeeperChanged(address indexed previousKeeper, address indexed newKeeper);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotKeeper();
    error ZeroAddress();
    error ZeroAmount();
    error AlreadySet();
    error NotRegisteredVault();
    error FactoryNotSet();
    error ZecNotSet();
    error WrongMode(uint8 mode);
    error InsufficientPending(uint256 requested, uint256 available);
    error BridgeTooLarge();
    error InvalidZcashAddress();
    error FoundationNotSet();
    error ZcashAddressNotSet();
    error TransferFailed();
    error SlippageRequired();
    error InvalidEpoch();
    error EpochClosed();
    error AlreadyClaimed();
    error InvalidProof();
    error TooEarly();
    error ZecOnChainFixed();

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
        guardian = SproutChain.guardian();
        _zec = SproutChain.zec();
        owner = owner_;
        keeper = keeper_;
        emit OwnershipTransferred(address(0), owner_);
        emit KeeperChanged(address(0), keeper_);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Wire the SproutVaultFactory whose vaults may deposit. Owner, once.
    function setFactory(address factory_) external onlyOwner {
        if (factory != address(0)) revert AlreadySet();
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
        emit FactorySet(factory_);
    }

    /// @notice Set the Zcash Foundation donation address. Owner, ONCE. Never guessed or hard-coded: the
    ///         "Zcash Foundation" mode stays disabled (factory rejects mode 4) until this is set.
    function setZcashFoundationAddress(string calldata addr) external onlyOwner {
        if (bytes(_foundation).length != 0) revert AlreadySet();
        if (!ZcashAddress.isValid(addr)) revert InvalidZcashAddress();
        _foundation = addr;
        emit ZcashFoundationAddressSet(addr);
    }

    /// @notice Testnet only (no canonical ZEC there): set the mock ZEC token once.
    function setZecToken(address zec_) external onlyOwner {
        if (SproutChain.zec() != address(0)) revert ZecOnChainFixed();
        if (_zec != address(0)) revert AlreadySet();
        if (zec_ == address(0)) revert ZeroAddress();
        _zec = zec_;
        emit ZecTokenSet(zec_);
    }

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
    // Inflow
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Called by a Sprout vault's flush() with its 40% share. Vaults only (factory-registered).
    function deposit(address vault) external payable nonReentrant {
        if (msg.sender != vault) revert NotRegisteredVault();
        address f = factory;
        if (f == address(0)) revert FactoryNotSet();
        if (!ISproutFactoryCore(f).isVault(vault)) revert NotRegisteredVault();
        if (msg.value == 0) revert ZeroAmount();
        pendingBnb[vault] += msg.value;
        totalPendingBnb += msg.value;
        emit Deposited(vault, msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Settlement in ZEC (modes 0/1/2)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Convert `bnbAmount` of a vault's pending BNB into BEP-20 ZEC and deliver it.
    /// @param minZecOut Slippage bound from PancakeSwap QuoterV2 (must be non-zero).
    function settle(address vault, uint256 bnbAmount, uint256 minZecOut) external nonReentrant onlyKeeper {
        if (minZecOut == 0) revert SlippageRequired();
        uint8 mode = ISproutVaultCore(vault).mode();
        if (mode > MODE_HOLDERS) revert WrongMode(mode);
        address z = _zec;
        if (z == address(0)) revert ZecNotSet();
        _draw(vault, bnbAmount);

        uint256 zecOut = ZecSwap.bnbToZec(z, bnbAmount, minZecOut);

        address to;
        if (mode == MODE_HOLDERS) {
            to = _payHolders(vault, z, zecOut);
            _zecToHolders += zecOut;
        } else {
            to = ISproutVaultCore(vault).payee();
            if (to == address(0)) revert ZeroAddress();
            IERC20(z).safeTransfer(to, zecOut);
            _zecToPayees += zecOut;
        }
        emit Settled(vault, mode, bnbAmount, zecOut, to);
    }

    /// @dev Deposit ZEC into the coin's Flap Dividend contract if it is a usable ZEC tracker; else pool it.
    ///      Returns the dividend contract (or this contract when pooled).
    function _payHolders(address vault, address z, uint256 amount) internal returns (address) {
        address dividend = _usableDividend(vault, z);
        if (dividend != address(0)) {
            uint256 before = IERC20(z).balanceOf(address(this));
            IERC20(z).forceApprove(dividend, amount);
            try IFlapDividend(dividend).deposit(amount) {
                IERC20(z).forceApprove(dividend, 0);
                uint256 afterBal = IERC20(z).balanceOf(address(this));
                // Never trust the callee: a pull larger than `amount` is impossible (allowance), and a balance that
                // went up must not underflow and brick settle(). Only what was actually pulled counts as paid.
                uint256 pulled = before > afterBal ? before - afterBal : 0;
                if (pulled >= amount) {
                    emit HolderRewardsDeposited(vault, dividend, amount);
                    return dividend;
                }
                if (pulled > 0) emit HolderRewardsDeposited(vault, dividend, pulled);
                // Partial / no pull: whatever remains is pooled below.
                amount -= pulled;
            } catch {
                IERC20(z).forceApprove(dividend, 0);
            }
        }
        holderPool[vault] += amount;
        totalHolderPool += amount;
        emit HolderRewardsPooled(vault, amount);
        return address(this);
    }

    /// @notice The coin's Flap Dividend contract if it tracks ZEC and has shares; address(0) otherwise.
    function usableDividend(address vault) external view returns (address) {
        return _usableDividend(vault, _zec);
    }

    function _usableDividend(address vault, address z) internal view returns (address dividend) {
        if (z == address(0)) return address(0);
        address token = ISproutVaultCore(vault).taxToken();
        if (token.code.length == 0) return address(0);
        try IFlapTaxTokenLite(token).dividendContract() returns (address d) {
            dividend = d;
        } catch {
            return address(0);
        }
        if (dividend == address(0) || dividend.code.length == 0) return address(0);
        try IFlapDividend(dividend).dividendToken() returns (address t) {
            if (t != z) return address(0);
        } catch {
            return address(0);
        }
        try IFlapDividend(dividend).totalShares() returns (uint256 shares) {
            if (shares == 0) return address(0);
        } catch {
            return address(0);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Fallback holder distributor (mode 2)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Retry pushing pooled ZEC into the coin's Flap Dividend contract (once it has shares).
    function pushHolderPool(address vault, uint256 amount) external nonReentrant onlyKeeper {
        if (amount == 0 || amount > holderPool[vault]) revert ZeroAmount();
        address z = _zec;
        address dividend = _usableDividend(vault, z);
        if (dividend == address(0)) revert InvalidEpoch();
        holderPool[vault] -= amount;
        totalHolderPool -= amount;
        uint256 before = IERC20(z).balanceOf(address(this));
        IERC20(z).forceApprove(dividend, amount);
        IFlapDividend(dividend).deposit(amount);
        IERC20(z).forceApprove(dividend, 0);
        if (before - IERC20(z).balanceOf(address(this)) != amount) revert TransferFailed();
        emit HolderRewardsDeposited(vault, dividend, amount);
    }

    /// @notice Commit `total` pooled ZEC of `vault` to a merkle snapshot of holders (keeper computes it from
    ///         the coin's Flap Dividend share balances). Leaves: keccak256(bytes.concat(keccak256(abi.encode(account, amount)))).
    function publishHolderEpoch(address vault, bytes32 root, uint256 total)
        external
        onlyKeeper
        returns (uint256 epoch)
    {
        if (root == bytes32(0) || total == 0 || total > holderPool[vault] || total > type(uint128).max) {
            revert InvalidEpoch();
        }
        holderPool[vault] -= total;
        totalHolderPool -= total;
        totalEpochZec += total;
        epoch = _epochs[vault].length;
        _epochs[vault].push(
            HolderEpoch({root: root, total: uint128(total), claimed: 0, publishedAt: uint64(block.timestamp), closed: false})
        );
        emit HolderEpochPublished(vault, epoch, root, total);
    }

    /// @notice Claim ZEC from a holder epoch. Anyone may submit; ZEC always goes to `account`.
    function claim(address vault, uint256 epoch, address account, uint256 amount, bytes32[] calldata proof)
        external
        nonReentrant
    {
        if (epoch >= _epochs[vault].length) revert InvalidEpoch();
        HolderEpoch storage e = _epochs[vault][epoch];
        if (e.closed) revert EpochClosed();
        if (claimed[vault][epoch][account]) revert AlreadyClaimed();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
        if (!MerkleProof.verifyCalldata(proof, e.root, leaf)) revert InvalidProof();
        if (uint256(e.claimed) + amount > e.total) revert InvalidProof();
        claimed[vault][epoch][account] = true;
        e.claimed += uint128(amount);
        totalEpochZec -= amount;
        IERC20(_zec).safeTransfer(account, amount);
        emit Claimed(vault, epoch, account, amount);
    }

    /// @notice After EPOCH_RECLAIM_DELAY, unclaimed ZEC returns to the same vault's holder pool (never to the
    ///         owner or keeper) to be redistributed in a later epoch.
    function reclaimEpoch(address vault, uint256 epoch) external onlyKeeper {
        if (epoch >= _epochs[vault].length) revert InvalidEpoch();
        HolderEpoch storage e = _epochs[vault][epoch];
        if (e.closed) revert EpochClosed();
        if (block.timestamp < e.publishedAt + EPOCH_RECLAIM_DELAY) revert TooEarly();
        e.closed = true;
        uint256 rest = uint256(e.total) - e.claimed;
        totalEpochZec -= rest;
        holderPool[vault] += rest;
        totalHolderPool += rest;
        emit HolderEpochReclaimed(vault, epoch, rest);
    }

    function epochsLength(address vault) external view returns (uint256) {
        return _epochs[vault].length;
    }

    function getEpoch(address vault, uint256 epoch) external view returns (HolderEpoch memory) {
        return _epochs[vault][epoch];
    }

    // ─────────────────────────────────────────────────────────────────────
    // Bridge to Zcash (modes 3/4)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Send `bnbAmount` (≤ MAX_BRIDGE) of a mode-3/4 vault's pending BNB to a NEAR Intents 1Click
    ///         deposit address on BSC, quoted off-chain for BNB(BSC) → ZEC(Zcash) to the vault's Zcash address.
    function bridgeOut(address vault, uint256 bnbAmount, address oneClickDepositAddress, bytes32 quoteRef)
        external
        nonReentrant
        onlyKeeper
    {
        if (bnbAmount > MAX_BRIDGE) revert BridgeTooLarge();
        if (oneClickDepositAddress == address(0)) revert ZeroAddress();
        uint8 mode = ISproutVaultCore(vault).mode();
        string memory zaddr;
        if (mode == MODE_ZCASH_WALLET) {
            zaddr = ISproutVaultCore(vault).zcashAddress();
            if (bytes(zaddr).length == 0) revert ZcashAddressNotSet();
        } else if (mode == MODE_ZCASH_FOUNDATION) {
            zaddr = _foundation;
            if (bytes(zaddr).length == 0) revert FoundationNotSet();
        } else {
            revert WrongMode(mode);
        }
        _draw(vault, bnbAmount);

        (bool ok,) = oneClickDepositAddress.call{value: bnbAmount}("");
        if (!ok) revert TransferFailed();

        if (mode == MODE_ZCASH_WALLET) _bnbBridgedToZcash += bnbAmount;
        else _bnbBridgedToFoundation += bnbAmount;
        emit BridgedOut(vault, mode, bnbAmount, oneClickDepositAddress, quoteRef, zaddr);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function zec() external view returns (address) {
        return _zec;
    }

    function zcashFoundationAddress() external view returns (string memory) {
        return _foundation;
    }

    function totals()
        external
        view
        returns (uint256 zecToPayees, uint256 zecToHolders, uint256 bnbBridgedToZcash, uint256 bnbBridgedToFoundation)
    {
        return (_zecToPayees, _zecToHolders, _bnbBridgedToZcash, _bnbBridgedToFoundation);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────

    function _draw(address vault, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 p = pendingBnb[vault];
        if (amount > p) revert InsufficientPending(amount, p);
        pendingBnb[vault] = p - amount;
        totalPendingBnb -= amount;
    }
}
