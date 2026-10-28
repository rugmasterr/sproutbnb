// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultFactoryBaseV2} from "./flap/VaultFactoryBaseV2.sol";
import {IVaultFactoryValidationV2} from "./flap/IVaultFactory.sol";
import {IPortalTypes} from "./flap/IPortal.sol";
import {VaultDataSchema, FieldDescriptor, FactoryPolicy} from "./flap/IVaultSchemasV1.sol";
import {BeaconProxy} from "@openzeppelin/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/proxy/beacon/UpgradeableBeacon.sol";
import {SproutVault} from "./SproutVault.sol";
import {ISproutPayoutsCore} from "./interfaces/ISprout.sol";
import {ZcashAddress} from "./lib/ZcashAddress.sol";

/// @title SproutVaultFactory (春笋工厂)
/// @notice Flap vault factory (spec v2.3) for coins planted on Sprout, the Zcash-native launchpad on BNB Chain.
///         Deploys one beacon-proxied SproutVault per coin and keeps an on-chain registry of every planting.
///
///         vaultData = abi.encode(uint8 mode, address payee, string zcashAddress):
///           0 ME               payee := creator (payee / zcashAddress ignored)
///           1 WALLET           payee must be non-zero
///           2 HOLDERS          payee must be 0; launch with dividendToken = ZEC (tracker-only, dividendBps = 0)
///           3 ZCASH_WALLET     zcashAddress required (t1/t3/zs1/u1 format check); controller = creator
///           4 ZCASH_FOUNDATION requires SproutPayouts.zcashFoundationAddress() to be set; zcashAddress ignored
///
/// @dev    Trust model: `admin` can only rotate the ops `treasury` and hand over the admin role. Vault logic
///         upgrades go through the beacon and are Flap-Guardian-only. The Guardian can also rotate the treasury.
contract SproutVaultFactory is VaultFactoryBaseV2 {
    struct Planting {
        address token;
        address vault;
        address creator;
        uint8 mode;
        uint64 plantedAt;
    }

    uint8 internal constant MAX_MODE = 4;

    address public immutable roots;
    address public immutable payouts;
    address public immutable beacon;
    address public treasury;
    address public admin;

    Planting[] internal _plantings;
    mapping(address => address) public vaultOf;
    mapping(address => bool) public isVault;

    event Planted(
        address indexed token, address indexed vault, address indexed creator, uint8 mode, address payee, string zcashAddress
    );
    event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);
    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event VaultImplementationUpgraded(address indexed newImplementation);

    // Flap UI rule 004: Sprout's own reverts are literal bilingual strings (no custom errors). The Flap base
    // contract's OnlyVaultPortal / ZeroAddress errors are kept as defined by Flap.
    string internal constant ERR_NOT_ADMIN = unicode"Sprout: admin only / 春笋：仅管理员";
    string internal constant ERR_NOT_ADMIN_OR_GUARDIAN = unicode"Sprout: admin or Flap Guardian only / 春笋：仅管理员或 Flap Guardian";
    string internal constant ERR_NOT_GUARDIAN = unicode"Sprout: Flap Guardian only / 春笋：仅 Flap Guardian";
    string internal constant ERR_QUOTE = unicode"Sprout: only native BNB quote is supported / 春笋：仅支持原生 BNB 计价";
    string internal constant ERR_MODE = unicode"Sprout: invalid mode (0-4) / 春笋：无效模式（0-4）";
    string internal constant ERR_DATA = unicode"Sprout: invalid vaultData, expected abi.encode(uint8 mode, address payee, string zcashAddress) / 春笋：vaultData 格式无效";
    string internal constant ERR_ZADDR = unicode"Sprout: invalid Zcash address (t1, t3, zs1 or u1) / 春笋：无效的 Zcash 地址（t1、t3、zs1 或 u1）";
    string internal constant ERR_PAYEE_REQUIRED = unicode"Sprout: mode 1 needs a payee wallet / 春笋：模式 1 需要收款钱包";
    string internal constant ERR_PAYEE_NOT_ALLOWED = unicode"Sprout: Holders mode takes no payee / 春笋：持币者模式不能指定收款人";
    string internal constant ERR_FOUNDATION = unicode"Sprout: Zcash Foundation address not configured yet / 春笋：Zcash 基金会地址尚未配置";
    string internal constant ERR_PLANTED = unicode"Sprout: token already has a vault / 春笋：该代币已有金库";

    constructor(address admin_, address roots_, address payouts_, address treasury_) {
        if (admin_ == address(0) || roots_ == address(0) || payouts_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        admin = admin_;
        roots = roots_;
        payouts = payouts_;
        treasury = treasury_;
        SproutVault impl = new SproutVault();
        beacon = address(new UpgradeableBeacon(address(impl)));
        emit AdminChanged(address(0), admin_);
        emit TreasuryChanged(address(0), treasury_);
    }

    // ─────────────────────────────────────────────────────────────────────
    // IVaultFactory
    // ─────────────────────────────────────────────────────────────────────

    function factorySpecVersion() public pure override returns (string memory) {
        return "v2.3";
    }

    /// @notice Only native BNB is supported.
    function isQuoteTokenSupported(address quoteToken) external pure override returns (bool) {
        return quoteToken == address(0);
    }

    /// @notice Deploy the SproutVault for a (predicted) tax token. Only callable by the Flap VaultPortal.
    function newVault(address taxToken, address quoteToken, address creator, bytes calldata vaultData)
        external
        override
        returns (address vault)
    {
        if (msg.sender != _getVaultPortal()) revert OnlyVaultPortal();
        require(quoteToken == address(0), ERR_QUOTE);
        if (taxToken == address(0)) revert ZeroAddress();
        require(vaultOf[taxToken] == address(0), ERR_PLANTED);

        (uint8 mode, address payee, string memory zaddr) = resolveVaultData(vaultData, creator);

        vault = address(
            new BeaconProxy(beacon, abi.encodeCall(SproutVault.initialize, (taxToken, mode, payee, zaddr, creator)))
        );

        vaultOf[taxToken] = vault;
        isVault[vault] = true;
        _plantings.push(
            Planting({token: taxToken, vault: vault, creator: creator, mode: mode, plantedAt: uint64(block.timestamp)})
        );
        emit Planted(taxToken, vault, creator, mode, payee, zaddr);
    }

    /// @notice Resolve (mode, payee, zcashAddress) from vaultData exactly as newVault does. Reverts on invalid input.
    function resolveVaultData(bytes calldata vaultData, address creator)
        public
        view
        returns (uint8 mode, address payee, string memory zaddr)
    {
        // abi.encode(uint8, address, string) is at least 4 words (mode, payee, offset, length).
        require(vaultData.length >= 128, ERR_DATA);
        uint256 m;
        (m, payee, zaddr) = abi.decode(vaultData, (uint256, address, string));
        require(m <= MAX_MODE, ERR_MODE);
        mode = uint8(m);
        if (mode == 0) {
            if (creator == address(0)) revert ZeroAddress();
            payee = creator;
            zaddr = "";
        } else if (mode == 1) {
            require(payee != address(0), ERR_PAYEE_REQUIRED);
            zaddr = "";
        } else if (mode == 2) {
            require(payee == address(0), ERR_PAYEE_NOT_ALLOWED);
            zaddr = "";
        } else if (mode == 3) {
            // payee is ignored: native ZEC goes to zcashAddress; control starts with the creator.
            payee = address(0);
            if (creator == address(0)) revert ZeroAddress();
            require(ZcashAddress.isValid(zaddr), ERR_ZADDR);
        } else {
            // payee and zcashAddress are ignored: the Zcash Foundation address lives in SproutPayouts.
            payee = address(0);
            require(bytes(ISproutPayoutsCore(payouts).zcashFoundationAddress()).length != 0, ERR_FOUNDATION);
            zaddr = "";
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Launch validation (spec v2.2+ normalized hook)
    // ─────────────────────────────────────────────────────────────────────

    function _validateBeforeLaunch(IVaultFactoryValidationV2.LaunchValidationDataV1 memory data)
        internal
        view
        override
        returns (bool success, string memory reason)
    {
        if (data.tokenVersion != IPortalTypes.TokenVersion.TOKEN_TAXED_V3) {
            return (false, unicode"Sprout requires a Flap Tax Token V3 (TOKEN_TAXED_V3). / 春笋仅支持 Flap 税币 V3。");
        }
        if (data.quoteToken != address(0)) {
            return (false, unicode"Sprout coins are quoted in native BNB. / 春笋币仅支持原生 BNB 计价。");
        }
        if (data.buyTaxRate != 200 || data.sellTaxRate != 200) {
            return (false, unicode"Sprout coins use a fixed 2% buy/sell tax (200 bps). / 春笋币买卖税固定为 2%。");
        }
        if (data.vaultBps != 10000) {
            return (
                false,
                unicode"mktBps must be 10000: the whole remainder goes to the Sprout vault. / mktBps 必须为 10000。"
            );
        }
        if (data.dividendBps != 0 || data.deflationBps != 0 || data.lpBps != 0) {
            return (
                false,
                unicode"dividendBps, deflationBps and lpBps must be 0 (holder rewards are paid in ZEC by Sprout). / "
                unicode"dividendBps、deflationBps、lpBps 必须为 0（持币者奖励由春笋以 ZEC 发放）。"
            );
        }
        if (data.dividendToken != address(0)) {
            address z = ISproutPayoutsCore(payouts).zec();
            if (z == address(0) || data.dividendToken != z) {
                return (false, unicode"dividendToken must be address(0) or ZEC. / dividendToken 必须为 0 地址或 ZEC。");
            }
        }
        return (true, "");
    }

    /// @notice Machine-readable launch constraints (informational; enforced in onBeforeLaunch).
    function tokenCreationPolicies() public pure override returns (FactoryPolicy[] memory policies) {
        policies = new FactoryPolicy[](9);
        policies[0] = FactoryPolicy(
            "tokenVersion", "eq", abi.encode(uint256(6)), "Must be a Flap Tax Token V3 (TOKEN_TAXED_V3 = 6)."
        );
        policies[1] = FactoryPolicy("quoteToken", "eq", abi.encode(address(0)), "Quote token must be native BNB.");
        policies[2] = FactoryPolicy("buyTaxRate", "eq", abi.encode(uint256(200)), "Buy tax is fixed at 2% (200 bps).");
        policies[3] = FactoryPolicy("sellTaxRate", "eq", abi.encode(uint256(200)), "Sell tax is fixed at 2% (200 bps).");
        policies[4] =
            FactoryPolicy("mktBps", "eq", abi.encode(uint256(10000)), "100% of the remainder goes to the vault.");
        policies[5] = FactoryPolicy(
            "dividendBps", "eq", abi.encode(uint256(0)), "0 (tracker-only; ZEC rewards are pushed by Sprout)."
        );
        policies[6] = FactoryPolicy("deflationBps", "eq", abi.encode(uint256(0)), "Must be 0.");
        policies[7] = FactoryPolicy("lpBps", "eq", abi.encode(uint256(0)), "Must be 0 (liquidity goes to the Grove).");
        address[] memory allowed = new address[](2);
        allowed[0] = address(0);
        allowed[1] = 0x1Ba42e5193dfA8B03D15dd1B86a3113bbBEF8Eeb; // Binance-Peg ZEC (mainnet; testnet: mock ZEC)
        policies[8] = FactoryPolicy(
            "dividendToken", "in", abi.encode(allowed), "address(0), or ZEC (Binance-Peg ZEC) for Holders mode."
        );
    }

    /// @notice Schema of vaultData.
    function vaultDataSchema() public pure override returns (VaultDataSchema memory schema) {
        schema.description = unicode"Sprout (春笋) vault — Zcash-native. vaultData = abi.encode(uint8 mode, address payee, "
            unicode"string zcashAddress). 0.80% of volume is paid in ZEC to the deployer's choice: mode 0 Me (payee = "
            unicode"creator), 1 Another wallet (payee required), 2 Holders (launch with dividendToken = ZEC, "
            unicode"dividendBps 0), 3 A Zcash wallet (zcashAddress t1/t3/zs1/u1 required), 4 Zcash Foundation "
            unicode"(permanent donation). Use mktBps 10000 and commissionReceiver = SproutRoots. / 春笋金库：成交额 0.80% "
            unicode"以 ZEC 支付给部署者自选：0 本人，1 指定钱包，2 持币者，3 Zcash 钱包，4 Zcash 基金会。";
        schema.fields = new FieldDescriptor[](3);
        schema.fields[0] = FieldDescriptor(
            "mode", "uint16", "0 Me, 1 Another wallet, 2 Holders, 3 A Zcash wallet, 4 Zcash Foundation (uint8)", 0
        );
        schema.fields[1] = FieldDescriptor("payee", "address", "Payee wallet for mode 1 (zero for other modes)", 0);
        schema.fields[2] =
            FieldDescriptor("zcashAddress", "string", "Zcash address for mode 3 (t1, t3, zs1 or u1); empty otherwise", 0);
        schema.isArray = false;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Registry views
    // ─────────────────────────────────────────────────────────────────────

    function plantingsLength() external view returns (uint256) {
        return _plantings.length;
    }

    /// @notice Oldest-first slice of the registry.
    function getPlantings(uint256 offset, uint256 limit) external view returns (Planting[] memory page) {
        uint256 len = _plantings.length;
        if (offset >= len || limit == 0) return new Planting[](0);
        uint256 end = len - offset < limit ? len : offset + limit;
        page = new Planting[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _plantings[i];
        }
    }

    function beaconImplementation() external view returns (address) {
        return UpgradeableBeacon(beacon).implementation();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Rotate the ops treasury. Admin or Flap Guardian.
    function setTreasury(address newTreasury) external {
        require(msg.sender == admin || msg.sender == _getGuardian(), ERR_NOT_ADMIN_OR_GUARDIAN);
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setAdmin(address newAdmin) external {
        require(msg.sender == admin, ERR_NOT_ADMIN);
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
    }

    /// @notice Upgrade the logic of every SproutVault. Flap Guardian only.
    function upgradeVaultImplementation(address newImplementation) external {
        require(msg.sender == _getGuardian(), ERR_NOT_GUARDIAN);
        UpgradeableBeacon(beacon).upgradeTo(newImplementation);
        emit VaultImplementationUpgraded(newImplementation);
    }
}
