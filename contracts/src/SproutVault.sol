// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultBaseV3} from "./flap/VaultBaseV3.sol";
import {VaultUISchema, VaultMethodSchema, FieldDescriptor, ApproveAction} from "./flap/IVaultSchemasV1.sol";
import {Initializable} from "@openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin-contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {StringsUpgradeable} from "@openzeppelin-contracts-upgradeable/utils/StringsUpgradeable.sol";
import {ISproutRootsDeposit, ISproutPayoutsCore, ISproutFactoryCore} from "./interfaces/ISprout.sol";
import {ZcashAddress} from "./lib/ZcashAddress.sol";

/// @title SproutVault (春笋金库)
/// @notice Per-coin Flap tax vault for coins planted on Sprout — the Zcash-native launchpad on BNB Chain.
///         Every Sprout coin pays a fixed 2.00% BNB tax; Flap's TaxProcessor dispatches the remainder
///         (mktBps = 10000) here, and the vault splits it:
///
///           25% → lpPot    The Grove 竹林: shared $SPROUT/ZEC liquidity (LP burned)        (= 0.50% of volume)
///           25% → rootPot  Rootstock 竹根: buy & burn $SPROUT                              (= 0.50%)
///           10% → opsPot   Sprout ops treasury                                            (= 0.20%)
///           40% → payeePot Deployer's choice, paid in ZEC by SproutPayouts                (= 0.80%)
///
///         Deployer's choice (mode): 0 Me · 1 Another wallet · 2 Holders (ZEC rewards) ·
///         3 A Zcash wallet (native ZEC on Zcash) · 4 Zcash Foundation (permanent donation).
///
///         `flush()` is permissionless: lp+root → SproutRoots.deposit, ops → factory.treasury(),
///         payee share → SproutPayouts.deposit(address(this)), where the keeper converts it to ZEC.
///         A failing destination never blocks the others: its share simply stays in its pot.
///
/// @dev    Native-only VaultBaseV3 with the normative balance-delta accounting model:
///           - `accountedQuote` == lpPot + rootPot + opsPot + payeePot at all times;
///           - `receive()` only recognizes `balance - accountedQuote` and splits it (no external calls);
///           - zero-delta wakes (spurious pings) are silent no-ops;
///           - every outflow decrements `accountedQuote` in the same transaction.
///         Guardian mandate: the Flap Guardian can always call setPayee / setZcashAddress / transferControl,
///         and no function exists that could revoke that.
contract SproutVault is Initializable, VaultBaseV3, ReentrancyGuardUpgradeable {
    // ─────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────

    uint8 public constant MODE_ME = 0;
    uint8 public constant MODE_WALLET = 1;
    uint8 public constant MODE_HOLDERS = 2;
    uint8 public constant MODE_ZCASH_WALLET = 3;
    uint8 public constant MODE_ZCASH_FOUNDATION = 4;

    uint256 public constant LP_BPS = 2500;
    uint256 public constant ROOT_BPS = 2500;
    uint256 public constant OPS_BPS = 1000;
    uint256 public constant PAYEE_BPS = 4000;

    // ─────────────────────────────────────────────────────────────────────
    // Storage (beacon-upgradeable: append only)
    // ─────────────────────────────────────────────────────────────────────

    address public taxToken;
    address public factory;
    address public roots;
    address public payouts;
    address public creator;
    uint8 public mode;
    address internal _payee;
    address internal _controller;
    string internal _zcashAddress;

    /// @notice V3 accounting baseline: recognized-and-unspent revenue (== sum of the four pots).
    uint256 public accountedQuote;

    uint256 public lpPot;
    uint256 public rootPot;
    uint256 public opsPot;
    uint256 public payeePot;

    uint256 internal _received;
    uint256 internal _toLiquidity;
    uint256 internal _toRootstock;
    uint256 internal _toOps;
    uint256 internal _toPayee;

    uint256[36] private __gap;

    // ─────────────────────────────────────────────────────────────────────
    // Events / errors
    // ─────────────────────────────────────────────────────────────────────

    event Revenue(uint256 amount);
    event Flushed(uint256 toLiquidity, uint256 toRootstock, uint256 toOps, uint256 toPayee);
    event PayeeChanged(address indexed previousPayee, address indexed newPayee);
    event ZcashAddressChanged(string previous, string next);
    event ControlTransferred(address indexed previousController, address indexed newController);
    event RootsDepositFailed(uint256 lpAmount, uint256 rootAmount);
    event OpsTransferFailed(address indexed treasury, uint256 amount);
    event PayoutsDepositFailed(uint256 amount);

    // Flap UI rule 004: reverts are literal bilingual strings (no custom errors).
    string internal constant ERR_MODE = unicode"Sprout: invalid mode / 春笋：无效模式";
    string internal constant ERR_ZERO = unicode"Sprout: zero address / 春笋：地址不能为零";
    string internal constant ERR_AUTH = unicode"Sprout: not authorized (controller or Flap Guardian only) / 春笋：无权限（仅控制人或 Flap Guardian）";
    string internal constant ERR_NA = unicode"Sprout: not applicable to this vault mode / 春笋：该模式不适用";
    string internal constant ERR_ZADDR = unicode"Sprout: invalid Zcash address (t1, t3, zs1 or u1) / 春笋：无效的 Zcash 地址（t1、t3、zs1 或 u1）";

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize a freshly deployed BeaconProxy. Called by SproutVaultFactory inside the proxy
    ///         constructor, so `msg.sender` is the factory. The factory has already validated the inputs;
    ///         they are re-checked here so a vault can never be initialized into an inconsistent state.
    function initialize(
        address taxToken_,
        uint8 mode_,
        address payee_,
        string calldata zcashAddress_,
        address creator_
    ) external initializer {
        require(taxToken_ != address(0), ERR_ZERO);
        require(mode_ <= MODE_ZCASH_FOUNDATION, ERR_MODE);
        __ReentrancyGuard_init();

        taxToken = taxToken_;
        factory = msg.sender;
        roots = ISproutFactoryCore(msg.sender).roots();
        payouts = ISproutFactoryCore(msg.sender).payouts();
        creator = creator_;
        mode = mode_;

        if (mode_ == MODE_ME || mode_ == MODE_WALLET) {
            require(payee_ != address(0), ERR_ZERO);
            _payee = payee_;
        } else if (mode_ == MODE_ZCASH_WALLET) {
            require(ZcashAddress.isValid(zcashAddress_), ERR_ZADDR);
            require(creator_ != address(0), ERR_ZERO);
            _zcashAddress = zcashAddress_;
            _controller = creator_;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // V3 surface
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc VaultBaseV3
    function vaultQuoteToken() public pure override returns (address) {
        return address(0);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Revenue recognition
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Native tax revenue (and any wake ping) lands here. Lightweight: storage writes + one event.
    receive() external payable {
        _sync();
    }

    /// @notice Recognize BNB that arrived without a wake (forced transfers, donations).
    function sync() external {
        _sync();
    }

    function _sync() internal {
        uint256 bal = address(this).balance;
        uint256 acc = accountedQuote;
        if (bal <= acc) return; // zero-delta wake: silent no-op (ping law 4)
        uint256 amount = bal - acc;
        accountedQuote = bal;
        _received += amount;

        uint256 lp = (amount * LP_BPS) / 10000;
        uint256 root = (amount * ROOT_BPS) / 10000;
        uint256 ops = (amount * OPS_BPS) / 10000;
        uint256 pay = amount - lp - root - ops; // rounding dust goes to the deployer's choice
        lpPot += lp;
        rootPot += root;
        opsPot += ops;
        payeePot += pay;
        emit Revenue(amount);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Flush
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Permissionless. Routes every pot to its destination; any leg that fails stays in its pot.
    function flush() external nonReentrant {
        _sync();
        uint256 sentLp;
        uint256 sentRoot;
        uint256 sentOps;
        uint256 sentPay;

        uint256 lp = lpPot;
        uint256 root = rootPot;
        if (lp + root > 0) {
            lpPot = 0;
            rootPot = 0;
            accountedQuote -= lp + root;
            try ISproutRootsDeposit(roots).deposit{value: lp + root}(lp, root) {
                sentLp = lp;
                sentRoot = root;
                _toLiquidity += lp;
                _toRootstock += root;
            } catch {
                lpPot = lp;
                rootPot = root;
                accountedQuote += lp + root;
                emit RootsDepositFailed(lp, root);
            }
        }

        uint256 ops = opsPot;
        if (ops > 0) {
            address treasury = ISproutFactoryCore(factory).treasury();
            opsPot = 0;
            accountedQuote -= ops;
            bool ok;
            if (treasury != address(0)) {
                assembly {
                    ok := call(gas(), treasury, ops, 0, 0, 0, 0) // no returndata copy
                }
            }
            if (ok) {
                sentOps = ops;
                _toOps += ops;
            } else {
                opsPot = ops;
                accountedQuote += ops;
                emit OpsTransferFailed(treasury, ops);
            }
        }

        uint256 pay = payeePot;
        if (pay > 0) {
            payeePot = 0;
            accountedQuote -= pay;
            try ISproutPayoutsCore(payouts).deposit{value: pay}(address(this)) {
                sentPay = pay;
                _toPayee += pay;
            } catch {
                payeePot = pay;
                accountedQuote += pay;
                emit PayoutsDepositFailed(pay);
            }
        }

        emit Flushed(sentLp, sentRoot, sentOps, sentPay);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Redirects (handing over control)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Modes 0/1: hand the payee role (and its future ZEC payouts) to `newPayee`.
    ///         Callable by the current payee or the Flap Guardian. Anything not yet settled by
    ///         SproutPayouts is paid to whoever is payee at settlement time.
    function setPayee(address newPayee) external {
        require(mode == MODE_ME || mode == MODE_WALLET, ERR_NA);
        _setPayee(newPayee);
    }

    /// @notice Mode 3: point future native-ZEC deliveries at a new Zcash address (t1/t3/zs1/u1).
    ///         Callable by the current controller (initially the creator) or the Flap Guardian.
    function setZcashAddress(string calldata addr) external {
        require(mode == MODE_ZCASH_WALLET, ERR_NA);
        require(msg.sender == _controller || msg.sender == _getGuardian(), ERR_AUTH);
        require(ZcashAddress.isValid(addr), ERR_ZADDR);
        string memory previous = _zcashAddress;
        _zcashAddress = addr;
        emit ZcashAddressChanged(previous, addr);
    }

    /// @notice Who may redirect this vault's payouts: the payee (modes 0/1), the controller (mode 3),
    ///         nobody (mode 2 is fixed to holders, mode 4 is a permanent donation).
    function controller() public view returns (address) {
        uint8 m = mode;
        if (m == MODE_ME || m == MODE_WALLET) return _payee;
        if (m == MODE_ZCASH_WALLET) return _controller;
        return address(0);
    }

    /// @notice Hand over control. Modes 0/1: identical to setPayee. Mode 3: new controller.
    ///         Current controller or Flap Guardian.
    function transferControl(address to) external {
        uint8 m = mode;
        if (m == MODE_ME || m == MODE_WALLET) {
            _setPayee(to);
            return;
        }
        require(m == MODE_ZCASH_WALLET, ERR_NA);
        address previous = _controller;
        require(msg.sender == previous || msg.sender == _getGuardian(), ERR_AUTH);
        require(to != address(0), ERR_ZERO);
        _controller = to;
        emit ControlTransferred(previous, to);
    }

    function _setPayee(address newPayee) internal {
        address previous = _payee;
        require(msg.sender == previous || msg.sender == _getGuardian(), ERR_AUTH);
        require(newPayee != address(0), ERR_ZERO);
        _payee = newPayee;
        emit PayeeChanged(previous, newPayee);
        emit ControlTransferred(previous, newPayee);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Payee for modes 0/1 (receives BEP-20 ZEC); address(0) otherwise.
    function payee() external view returns (address) {
        return _payee;
    }

    /// @notice Mode 3: the Zcash address receiving native ZEC. Mode 4 mirrors the Zcash Foundation address
    ///         configured in SproutPayouts (empty until the admin sets it). Empty for modes 0/1/2.
    function zcashAddress() public view returns (string memory) {
        if (mode == MODE_ZCASH_FOUNDATION) return ISproutPayoutsCore(payouts).zcashFoundationAddress();
        return _zcashAddress;
    }

    /// @notice Lifetime totals (BNB). `pending` = BNB currently held (pots + not-yet-recognized revenue).
    function stats()
        external
        view
        returns (
            uint256 received,
            uint256 toLiquidity,
            uint256 toRootstock,
            uint256 toOps,
            uint256 toPayee,
            uint256 pending
        )
    {
        return (_received, _toLiquidity, _toRootstock, _toOps, _toPayee, address(this).balance);
    }

    /// @notice Dynamic bilingual status line.
    function description() public view override returns (string memory) {
        uint8 m = mode;
        string memory en = string.concat(
            "Sprout vault, deployer's choice: ",
            _modeEn(m),
            _destination(m),
            ". Tax received ",
            _fmt(_received),
            " BNB: Grove (SPROUT/ZEC liquidity) ",
            _fmt(_toLiquidity),
            ", Rootstock (buy & burn SPROUT) ",
            _fmt(_toRootstock),
            ", ops ",
            _fmt(_toOps),
            ", deployer's choice (paid in ZEC) ",
            _fmt(_toPayee),
            " BNB; pending ",
            _fmt(address(this).balance),
            " BNB. Anyone can call flush()."
        );
        string memory zh = string.concat(
            unicode"春笋金库，部署者自选：",
            _modeZh(m),
            unicode"。累计税收 ",
            _fmt(_received),
            unicode" BNB：竹林（SPROUT/ZEC 流动性）",
            _fmt(_toLiquidity),
            unicode"，竹根（回购销毁 SPROUT）",
            _fmt(_toRootstock),
            unicode"，运营 ",
            _fmt(_toOps),
            unicode"，部署者自选（以 ZEC 支付）",
            _fmt(_toPayee),
            unicode" BNB；待分配 ",
            _fmt(address(this).balance),
            unicode" BNB。任何人都可以调用 flush()。"
        );
        return string.concat(en, " / ", zh);
    }

    function _destination(uint8 m) internal view returns (string memory) {
        if (m == MODE_ME || m == MODE_WALLET) {
            return string.concat(" (", StringsUpgradeable.toHexString(_payee), ")");
        }
        if (m == MODE_ZCASH_WALLET) return string.concat(" (", _zcashAddress, ")");
        if (m == MODE_ZCASH_FOUNDATION) {
            string memory zf = zcashAddress();
            return bytes(zf).length == 0 ? " (address not yet configured)" : string.concat(" (", zf, ")");
        }
        return "";
    }

    function _modeEn(uint8 m) internal pure returns (string memory) {
        if (m == MODE_ME) return "Me";
        if (m == MODE_WALLET) return "Another wallet";
        if (m == MODE_HOLDERS) return "Holders (ZEC rewards)";
        if (m == MODE_ZCASH_WALLET) return "A Zcash wallet";
        return "Zcash Foundation";
    }

    function _modeZh(uint8 m) internal pure returns (string memory) {
        if (m == MODE_ME) return unicode"部署者本人";
        if (m == MODE_WALLET) return unicode"指定钱包";
        if (m == MODE_HOLDERS) return unicode"持币者（ZEC 分红）";
        if (m == MODE_ZCASH_WALLET) return unicode"Zcash 钱包";
        return unicode"Zcash 基金会";
    }

    /// @dev Formats wei with 4 decimals (truncated), e.g. 1234500000000000000 -> "1.2345".
    function _fmt(uint256 weiAmount) internal pure returns (string memory) {
        uint256 frac = (weiAmount % 1e18) / 1e14;
        bytes memory f = bytes(StringsUpgradeable.toString(frac));
        bytes memory padded = new bytes(4);
        uint256 pad = 4 - f.length;
        for (uint256 i = 0; i < 4; i++) {
            padded[i] = i < pad ? bytes1("0") : f[i - pad];
        }
        return string.concat(StringsUpgradeable.toString(weiAmount / 1e18), ".", string(padded));
    }

    /// @notice On-chain UI schema (Flap VaultBaseV2).
    function vaultUISchema() public pure override returns (VaultUISchema memory schema) {
        schema.vaultType = "SproutVault";
        schema.description = unicode"Sprout (春笋) coin vault — Zcash-native. Splits this coin's 2% BNB tax: 25% to "
            unicode"the Grove (shared $SPROUT/ZEC liquidity, LP burned), 25% to Rootstock (buy & burn $SPROUT), 10% "
            unicode"to Sprout ops and 40% to the deployer's choice, paid in ZEC (Me, Another wallet, Holders, a Zcash "
            unicode"wallet, or the Zcash Foundation). flush() is permissionless. / 春笋金库（Zcash 原生）：本币 2% BNB 税收"
            unicode"的 25% 注入竹林（$SPROUT/ZEC 共享流动性，LP 销毁），25% 用于竹根回购销毁 $SPROUT，10% 用于运营，"
            unicode"40% 按部署者自选以 ZEC 支付（本人、指定钱包、持币者、Zcash 钱包或 Zcash 基金会）。任何人都可调用 flush()。";

        schema.methods = new VaultMethodSchema[](14);

        VaultMethodSchema memory s = schema.methods[0];
        s.name = "stats";
        s.description = unicode"Lifetime totals and BNB pending in the vault. / 累计统计与当前待分配的 BNB。";
        s.inputs = new FieldDescriptor[](0);
        s.outputs = new FieldDescriptor[](6);
        s.outputs[0] = FieldDescriptor("received", "uint256", "Total BNB tax received", 18);
        s.outputs[1] = FieldDescriptor("toLiquidity", "uint256", "BNB sent to the Grove", 18);
        s.outputs[2] = FieldDescriptor("toRootstock", "uint256", "BNB sent to Rootstock", 18);
        s.outputs[3] = FieldDescriptor("toOps", "uint256", "BNB sent to Sprout ops", 18);
        s.outputs[4] = FieldDescriptor("toPayee", "uint256", "BNB sent to SproutPayouts (paid out in ZEC)", 18);
        s.outputs[5] = FieldDescriptor("pending", "uint256", "BNB held, not yet flushed", 18);
        s.approvals = new ApproveAction[](0);

        _view(schema.methods[1], "lpPot", "uint256", 18, unicode"BNB waiting for the Grove. / 待注入竹林的 BNB。");
        _view(schema.methods[2], "rootPot", "uint256", 18, unicode"BNB waiting for Rootstock. / 待用于竹根的 BNB。");
        _view(schema.methods[3], "opsPot", "uint256", 18, unicode"BNB waiting for Sprout ops. / 待发送给运营的 BNB。");
        _view(
            schema.methods[4],
            "payeePot",
            "uint256",
            18,
            unicode"BNB waiting for the deployer's choice (converted to ZEC). / 待支付给部署者自选的 BNB（将换成 ZEC）。"
        );
        _view(
            schema.methods[5],
            "mode",
            "uint16",
            0,
            unicode"0 Me, 1 Another wallet, 2 Holders, 3 A Zcash wallet, 4 Zcash Foundation. / "
            unicode"0 本人，1 指定钱包，2 持币者，3 Zcash 钱包，4 Zcash 基金会。"
        );
        _view(
            schema.methods[6],
            "payee",
            "address",
            0,
            unicode"Payee receiving BEP-20 ZEC (modes 0/1). / 接收 BEP-20 ZEC 的收款人（模式 0/1）。"
        );
        _view(
            schema.methods[7],
            "zcashAddress",
            "string",
            0,
            unicode"Zcash address receiving native ZEC (modes 3/4). / 接收原生 ZEC 的 Zcash 地址（模式 3/4）。"
        );
        _view(
            schema.methods[8],
            "controller",
            "address",
            0,
            unicode"Who may redirect payouts (Flap Guardian always can). / 可修改收款去向的地址（Flap Guardian 始终可以）。"
        );

        _write0(schema.methods[9], "sync", unicode"Recognize BNB that arrived without a wake call. / 识别未记账的 BNB。");
        _write0(
            schema.methods[10],
            "flush",
            unicode"Send all pots to their destinations (anyone can call). / 将各份额发送到目的地（任何人可调用）。"
        );
        _write1(
            schema.methods[11],
            "setPayee",
            FieldDescriptor("newPayee", "address", "New payee address", 0),
            unicode"Modes 0/1: hand the payee role to a new address (current payee or Flap Guardian). / "
            unicode"模式 0/1：将收款人转交给新地址（当前收款人或 Flap Guardian）。"
        );
        _write1(
            schema.methods[12],
            "setZcashAddress",
            FieldDescriptor("addr", "string", "Zcash address (t1, t3, zs1 or u1)", 0),
            unicode"Mode 3: change the receiving Zcash address (controller or Flap Guardian). / "
            unicode"模式 3：修改接收的 Zcash 地址（控制人或 Flap Guardian）。"
        );
        _write1(
            schema.methods[13],
            "transferControl",
            FieldDescriptor("to", "address", "New controller", 0),
            unicode"Hand over control of this vault's payouts (modes 0/1/3). / 移交本金库收款去向的控制权（模式 0/1/3）。"
        );
    }

    function _view(
        VaultMethodSchema memory m,
        string memory name,
        string memory fieldType,
        uint8 decimals,
        string memory desc
    ) private pure {
        m.name = name;
        m.description = desc;
        m.inputs = new FieldDescriptor[](0);
        m.outputs = new FieldDescriptor[](1);
        m.outputs[0] = FieldDescriptor(name, fieldType, desc, decimals);
        m.approvals = new ApproveAction[](0);
    }

    function _write0(VaultMethodSchema memory m, string memory name, string memory desc) private pure {
        m.name = name;
        m.description = desc;
        m.inputs = new FieldDescriptor[](0);
        m.outputs = new FieldDescriptor[](0);
        m.approvals = new ApproveAction[](0);
        m.isWriteMethod = true;
    }

    function _write1(VaultMethodSchema memory m, string memory name, FieldDescriptor memory input, string memory desc)
        private
        pure
    {
        m.name = name;
        m.description = desc;
        m.inputs = new FieldDescriptor[](1);
        m.inputs[0] = input;
        m.outputs = new FieldDescriptor[](0);
        m.approvals = new ApproveAction[](0);
        m.isWriteMethod = true;
    }
}
