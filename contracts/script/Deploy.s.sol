// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SproutRoots} from "../src/SproutRoots.sol";
import {SproutPayouts} from "../src/SproutPayouts.sol";
import {SproutVaultFactory} from "../src/SproutVaultFactory.sol";
import {SproutTerminal} from "../src/SproutTerminal.sol";

/// @notice Deploys SproutRoots, SproutPayouts, SproutVaultFactory and SproutTerminal and wires them.
///
/// Env:
///   SPROUT_OWNER     final owner of Roots + Payouts (multisig recommended)          [required]
///   SPROUT_KEEPER    keeper EOA used by /keeper (Flap Guardian is always a keeper)   [required]
///   SPROUT_ADMIN     factory admin (can only rotate the treasury / hand over admin)  [default: SPROUT_OWNER]
///   SPROUT_TREASURY  ops treasury (0.20% ops share + 0.75% terminal fee)              [required]
///   SPROUT_ZEC       testnet only: mock ZEC token (mainnet uses Binance-Peg ZEC)      [optional]
///
/// Run (mainnet):
///   forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --broadcast --account <keystore> --sender <addr>
///
/// The deployer temporarily owns Roots and Payouts to wire them (Payouts.setFactory, testnet ZEC), then hands
/// ownership to SPROUT_OWNER in the same broadcast. The Zcash Foundation address is NOT set here: it ships unset
/// and the owner calls Payouts.setZcashFoundationAddress once, after verifying it from an official source.
contract Deploy is Script {
    function run()
        external
        returns (SproutRoots roots, SproutPayouts payouts, SproutVaultFactory factory, SproutTerminal terminal)
    {
        address owner = vm.envAddress("SPROUT_OWNER");
        address keeper = vm.envAddress("SPROUT_KEEPER");
        address admin = vm.envOr("SPROUT_ADMIN", owner);
        address treasury = vm.envAddress("SPROUT_TREASURY");
        address testnetZec = vm.envOr("SPROUT_ZEC", address(0));

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers(); // the broadcasting account

        roots = new SproutRoots(deployer, keeper);
        payouts = new SproutPayouts(deployer, keeper);
        factory = new SproutVaultFactory(admin, address(roots), address(payouts), treasury);
        terminal = new SproutTerminal(address(roots), treasury);

        payouts.setFactory(address(factory));
        if (block.chainid != 56 && testnetZec != address(0)) {
            payouts.setZecToken(testnetZec);
            roots.setZecToken(testnetZec);
        }
        if (owner != deployer) {
            payouts.transferOwnership(owner);
            roots.transferOwnership(owner);
        }
        vm.stopBroadcast();

        console2.log("NEXT_PUBLIC_SPROUT_ROOTS=", address(roots));
        console2.log("NEXT_PUBLIC_SPROUT_PAYOUTS=", address(payouts));
        console2.log("NEXT_PUBLIC_SPROUT_FACTORY=", address(factory));
        console2.log("NEXT_PUBLIC_SPROUT_TERMINAL=", address(terminal));
        console2.log("vault beacon:", factory.beacon());
        console2.log("Next: launch $SPROUT via the factory (mode 1, payee = treasury), then roots.setSprout(token).");
    }
}
