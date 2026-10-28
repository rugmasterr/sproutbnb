// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {SproutAccountFactory} from "../src/SproutAccountFactory.sol";

/// @notice Deploys SproutAccountFactory (which deploys the fixed SproutAccount implementation) via the canonical
///         CREATE2 deployer, so the factory address is the same on every chain for the same bytecode + salt.
///
///   Dry run (no broadcast):
///     forge script script/DeployAccounts.s.sol --rpc-url $BSC_RPC_URL
///   Broadcast (operator only — NOT done by the build agents):
///     forge script script/DeployAccounts.s.sol --rpc-url $BSC_RPC_URL --broadcast --private-key $DEPLOYER_PK
///
///   Env: ACCOUNT_FACTORY_SALT (bytes32, optional, default keccak256("sprout.accounts.v1"))
///        SKIP_P256_CHECK=true to skip the live precompile check (e.g. on a chain whose RPC rejects eth_call to 0x100)
///
///   Afterwards set NEXT_PUBLIC_SPROUT_ACCOUNT_FACTORY=<factory> (and the implementation, for challenge.ts'
///   computeAccountAddress) in the site/relayer env.
contract DeployAccounts is Script {
    // RIP-7212 reference vector (hash | r | s | qx | qy) — expected output 1.
    bytes internal constant RIP7212_VECTOR =
        hex"4cee90eb86eaa050036147a12d49004b6b9c72bd725d39d4785011fe190f0b4da73bd4903f0ce3b639bbbf6e8e80d16931ff4bcf5993d58468e8fb19086e8cac36dbcd03009df8c59286b162af3bd7fcc0450c9aa81be5d10d312af6c66b1d604aebd3099c618202fcfe16ae7770b0c49ab5eadf74b754204a3bb6060e44eff37618b065f9832de4ca6ca971a7a1adc826d0f7c00181a5fb2ddf79ae00b4e10e";

    function run() external returns (SproutAccountFactory factory) {
        bytes32 salt = vm.envOr("ACCOUNT_FACTORY_SALT", keccak256("sprout.accounts.v1"));

        if (!vm.envOr("SKIP_P256_CHECK", false)) {
            // Ask the REAL node (not the local simulation EVM, which may lack the precompile) to run the vector.
            string memory params = string.concat(
                '[{"to":"0x0000000000000000000000000000000000000100","data":"', vm.toString(RIP7212_VECTOR), '"},"latest"]'
            );
            bytes memory ret = vm.rpc("eth_call", params);
            require(
                ret.length == 32 && abi.decode(ret, (uint256)) == 1,
                "P256VERIFY precompile (0x100) not available on this chain: passkey accounts would be unusable"
            );
            console.log("P256VERIFY at 0x100: OK on chain", block.chainid);
        }

        vm.startBroadcast();
        factory = new SproutAccountFactory{salt: salt}();
        vm.stopBroadcast();

        console.log("SproutAccountFactory:", address(factory));
        console.log("SproutAccount implementation:", factory.implementation());
    }
}
