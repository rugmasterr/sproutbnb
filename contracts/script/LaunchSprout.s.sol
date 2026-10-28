// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ClonesUpgradeable} from "@openzeppelin-contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import {IVaultPortal, IVaultPortalTypes} from "../src/flap/IVaultPortal.sol";
import {IPortalTypes, IPortalCommonTypes} from "../src/flap/IPortal.sol";
import {SproutChain} from "../src/lib/SproutChain.sol";

/// @notice Launch $SPROUT itself as a Sprout coin: mode 1 (Another wallet), payee = treasury.
///         After it confirms, the Roots owner calls `roots.setSprout(token)` (printed below).
///
/// Env: SPROUT_FACTORY, SPROUT_ROOTS, SPROUT_TREASURY, SPROUT_META (Flap metadata CID from funcs.flap.sh/api/upload),
///      SPROUT_FIRST_BUY_WEI (optional, default 0), SPROUT_SALT_SEED (optional).
contract LaunchSprout is Script {
    function run() external returns (address token) {
        address factory = vm.envAddress("SPROUT_FACTORY");
        address roots = vm.envAddress("SPROUT_ROOTS");
        address treasury = vm.envAddress("SPROUT_TREASURY");
        string memory meta = vm.envString("SPROUT_META");
        uint256 firstBuy = vm.envOr("SPROUT_FIRST_BUY_WEI", uint256(0));
        uint256 seed = vm.envOr("SPROUT_SALT_SEED", uint256(keccak256(abi.encode(block.timestamp, factory))));

        address portal = SproutChain.portal();
        address impl = SproutChain.taxTokenV3Impl();
        bytes32 salt;
        address predicted;
        for (uint256 s = seed;; s++) {
            salt = bytes32(s);
            predicted = ClonesUpgradeable.predictDeterministicAddress(impl, salt, portal);
            if (uint160(predicted) & 0xFFFF == 0x7777 && predicted.code.length == 0) break;
        }
        console2.log("predicted $SPROUT", predicted);

        IVaultPortalTypes.NewTokenV6WithVaultParams memory p;
        p.name = "Sprout";
        p.symbol = "SPROUT";
        p.meta = meta;
        p.dexThresh = IPortalCommonTypes.DexThreshType.FOUR_FIFTHS;
        p.salt = salt;
        p.migratorType = IPortalTypes.MigratorType.V2_MIGRATOR;
        p.quoteToken = address(0);
        p.quoteAmt = firstBuy;
        p.dexId = IPortalTypes.DEXId.DEX0;
        p.lpFeeProfile = IPortalTypes.V3LPFeeProfile.LP_FEE_PROFILE_STANDARD;
        p.buyTaxRate = 200;
        p.sellTaxRate = 200;
        p.taxDuration = 3153600000;
        p.antiFarmerDuration = 86400;
        p.mktBps = 10000;
        p.commissionReceiver = roots;
        p.tokenVersion = IPortalTypes.TokenVersion.TOKEN_TAXED_V3;
        p.vaultFactory = factory;
        p.vaultData = abi.encode(uint8(1), treasury, "");

        vm.startBroadcast();
        token = IVaultPortal(payable(SproutChain.vaultPortal())).newTokenV6WithVault{value: firstBuy}(p);
        vm.stopBroadcast();
        console2.log("NEXT_PUBLIC_SPROUT_TOKEN=", token);
        console2.log("Now (Roots owner): cast send <roots> 'setSprout(address)' <token>");
    }
}
