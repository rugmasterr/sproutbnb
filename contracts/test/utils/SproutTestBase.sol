// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SproutVault} from "../../src/SproutVault.sol";
import {SproutRoots} from "../../src/SproutRoots.sol";
import {SproutPayouts} from "../../src/SproutPayouts.sol";
import {SproutTerminal} from "../../src/SproutTerminal.sol";
import {SproutVaultFactory} from "../../src/SproutVaultFactory.sol";
import {
    MockToken,
    MockWBNB,
    MockV3Router,
    MockPortal,
    MockV2Router,
    MockV2Factory,
    MockTaxToken
} from "../mocks/SproutMocks.sol";

/// @dev Shared unit-test setup on BNB testnet chain id (97) so the chain switches resolve; mocks are etched at
///      the testnet Portal / PancakeSwap V2 router / V3 SwapRouter / WBNB addresses.
abstract contract SproutTestBase is Test {
    address internal constant VAULT_PORTAL = 0x027e3704fC5C16522e9393d04C60A3ac5c0d775f;
    address internal constant GUARDIAN = 0x76Fa8C526f8Bc27ba6958B76DeEf92a0dbE46950;
    address internal constant PORTAL = 0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9;
    address internal constant V2_ROUTER = 0xD99D1c33F9fC3444f8101754aBC46c52416550D1;
    address internal constant V3_ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address internal constant WBNB = 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address internal constant GROVE_PAIR = address(0x6409E);

    // Format-valid (synthetic) Zcash addresses for tests — not real wallets.
    string internal constant T_ADDR = "t1abcdefghijkmnopqrstuvwxyzABCDEFGH";
    string internal constant T3_ADDR = "t3ABCDEFGHJKLMNPQRSTUVWXYZ123456789";
    string internal constant ZS_ADDR =
        "zs1qpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2";
    string internal constant FOUNDATION_ADDR = "t3FoundationTestAddressXyz123456789";

    // Literal revert strings (Flap UI rule 004) of SproutVault / SproutVaultFactory.
    string internal constant E_V_ZERO = unicode"Sprout: zero address / 春笋：地址不能为零";
    string internal constant E_V_AUTH =
        unicode"Sprout: not authorized (controller or Flap Guardian only) / 春笋：无权限（仅控制人或 Flap Guardian）";
    string internal constant E_V_NA = unicode"Sprout: not applicable to this vault mode / 春笋：该模式不适用";
    string internal constant E_ZADDR =
        unicode"Sprout: invalid Zcash address (t1, t3, zs1 or u1) / 春笋：无效的 Zcash 地址（t1、t3、zs1 或 u1）";
    string internal constant E_F_NOT_ADMIN = unicode"Sprout: admin only / 春笋：仅管理员";
    string internal constant E_F_NOT_ADMIN_OR_GUARDIAN = unicode"Sprout: admin or Flap Guardian only / 春笋：仅管理员或 Flap Guardian";
    string internal constant E_F_NOT_GUARDIAN = unicode"Sprout: Flap Guardian only / 春笋：仅 Flap Guardian";
    string internal constant E_F_QUOTE = unicode"Sprout: only native BNB quote is supported / 春笋：仅支持原生 BNB 计价";
    string internal constant E_F_MODE = unicode"Sprout: invalid mode (0-4) / 春笋：无效模式（0-4）";
    string internal constant E_F_DATA =
        unicode"Sprout: invalid vaultData, expected abi.encode(uint8 mode, address payee, string zcashAddress) / 春笋：vaultData 格式无效";
    string internal constant E_F_PAYEE_REQUIRED = unicode"Sprout: mode 1 needs a payee wallet / 春笋：模式 1 需要收款钱包";
    string internal constant E_F_PAYEE_NOT_ALLOWED = unicode"Sprout: Holders mode takes no payee / 春笋：持币者模式不能指定收款人";
    string internal constant E_F_FOUNDATION = unicode"Sprout: Zcash Foundation address not configured yet / 春笋：Zcash 基金会地址尚未配置";
    string internal constant E_F_PLANTED = unicode"Sprout: token already has a vault / 春笋：该代币已有金库";

    address internal owner = makeAddr("owner");
    address internal keeper = makeAddr("keeper");
    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    SproutRoots internal roots;
    SproutPayouts internal payouts;
    SproutVaultFactory internal factory;
    SproutTerminal internal terminal;
    MockToken internal zec;
    MockToken internal sprout;
    MockPortal internal portal;
    MockV2Router internal v2;
    MockV2Factory internal v2Factory;
    MockV3Router internal v3;

    function setUp() public virtual {
        vm.chainId(97);
        vm.etch(PORTAL, address(new MockPortal()).code);
        vm.etch(V2_ROUTER, address(new MockV2Router()).code);
        vm.etch(V3_ROUTER, address(new MockV3Router()).code);
        vm.etch(WBNB, address(new MockWBNB()).code);
        portal = MockPortal(payable(PORTAL));
        v2 = MockV2Router(V2_ROUTER);
        v3 = MockV3Router(V3_ROUTER);
        v2Factory = new MockV2Factory();

        portal.configure(1_000_000e18, 1e12, 10000, 10000); // 1 BNB = 1M tokens; 1e18 tokens = 1e12 wei
        v2.configure(address(v2Factory), GROVE_PAIR, 10000, 10000);
        v3.configure(10e18); // 1 BNB = 10 ZEC

        zec = new MockToken("Mock ZEC", "ZEC");
        sprout = new MockToken("Sprout", "SPROUT");
        vm.deal(PORTAL, 1000 ether);

        roots = new SproutRoots(owner, keeper);
        payouts = new SproutPayouts(owner, keeper);
        factory = new SproutVaultFactory(admin, address(roots), address(payouts), treasury);
        terminal = new SproutTerminal(address(roots), treasury);

        vm.startPrank(owner);
        payouts.setZecToken(address(zec));
        payouts.setFactory(address(factory));
        roots.setZecToken(address(zec));
        vm.stopPrank();
    }

    function _plant(uint8 mode, address payee, string memory zaddr) internal returns (SproutVault vault, address token) {
        token = address(new MockTaxToken());
        vm.prank(VAULT_PORTAL);
        vault = SproutVault(payable(factory.newVault(token, address(0), creator, abi.encode(mode, payee, zaddr))));
    }

    function _pay(address to, uint256 amount) internal {
        vm.deal(address(this), address(this).balance + amount);
        (bool ok,) = to.call{value: amount}("");
        assertTrue(ok, "pay failed");
    }

    function _assertVaultInvariant(SproutVault v) internal view {
        assertEq(
            v.accountedQuote(), v.lpPot() + v.rootPot() + v.opsPot() + v.payeePot(), "accountedQuote == sum(pots)"
        );
        assertLe(v.accountedQuote(), address(v).balance, "accountedQuote <= balance");
    }

    function _setFoundation() internal {
        vm.prank(owner);
        payouts.setZcashFoundationAddress(FOUNDATION_ADDR);
    }
}
