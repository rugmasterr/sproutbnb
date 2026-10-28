// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {SproutRoots} from "../src/SproutRoots.sol";
import {SproutPayouts} from "../src/SproutPayouts.sol";
import {SproutVaultFactory} from "../src/SproutVaultFactory.sol";
import {SproutTerminal} from "../src/SproutTerminal.sol";

contract DeployScriptTest is Test {
    function test_deployWiresEverything() public {
        vm.chainId(97);
        address owner = makeAddr("owner");
        address keeper = makeAddr("keeper");
        address treasury = makeAddr("treasury");
        address mockZec = makeAddr("mockZec");
        vm.setEnv("SPROUT_OWNER", vm.toString(owner));
        vm.setEnv("SPROUT_KEEPER", vm.toString(keeper));
        vm.setEnv("SPROUT_TREASURY", vm.toString(treasury));
        vm.setEnv("SPROUT_ZEC", vm.toString(mockZec));

        (SproutRoots roots, SproutPayouts payouts, SproutVaultFactory factory, SproutTerminal terminal) =
            new Deploy().run();

        assertEq(payouts.factory(), address(factory));
        assertEq(payouts.owner(), owner);
        assertEq(roots.owner(), owner);
        assertEq(payouts.keeper(), keeper);
        assertEq(roots.keeper(), keeper);
        assertEq(payouts.zec(), mockZec);
        assertEq(roots.zec(), mockZec);
        assertEq(factory.admin(), owner);
        assertEq(factory.treasury(), treasury);
        assertEq(factory.roots(), address(roots));
        assertEq(factory.payouts(), address(payouts));
        assertEq(terminal.roots(), address(roots));
        assertEq(terminal.treasury(), treasury);
        assertEq(bytes(payouts.zcashFoundationAddress()).length, 0, "foundation address ships unset");
    }
}
