// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {PasskeyTestBase} from "./utils/PasskeyTestBase.sol";
import {SproutAccountFactory} from "../src/SproutAccountFactory.sol";
import {SproutAccount} from "../src/SproutAccount.sol";
import {ISproutAccount, Call, WebAuthnSig} from "../src/ISproutAccount.sol";

contract SproutAccountFactoryTest is PasskeyTestBase {
    function test_getAddress_matchesCreate_andIsIdempotent() public {
        address predicted = factory.getAddress(qx, qy);
        assertEq(predicted.code.length, 0);

        vm.expectEmit(true, true, true, true, address(factory));
        emit SproutAccountFactory.AccountCreated(predicted, qx, qy);
        uint256 g = gasleft();
        address a = factory.createAccount(qx, qy);
        console.log("createAccount gas", g - gasleft());
        assertEq(a, predicted);
        assertGt(a.code.length, 0);

        // idempotent: second call returns the same account, no revert, no re-init
        vm.recordLogs();
        assertEq(factory.createAccount(qx, qy), a);
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_getAddress_isCreate2OfKeccakKey() public view {
        bytes32 salt = keccak256(abi.encode(qx, qy));
        bytes memory initCode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73", factory.implementation(), hex"5af43d82803e903d91602b57fd5bf3"
        );
        assertEq(factory.getAddress(qx, qy), vm.computeCreate2Address(salt, keccak256(initCode), address(factory)));
        assertEq(factory.salt(qx, qy), salt);
    }

    function test_distinctKeys_distinctAddresses() public view {
        (uint256 x2, uint256 y2) = vm.publicKeyP256(pk + 1);
        assertTrue(factory.getAddress(qx, qy) != factory.getAddress(bytes32(x2), bytes32(y2)));
        // swapping coordinates must not collide either
        assertTrue(factory.getAddress(qx, qy) != factory.getAddress(qy, qx));
    }

    function test_counterfactualFunding_thenDeploy() public {
        address predicted = factory.getAddress(qx, qy);
        vm.deal(predicted, 3 ether); // e.g. a 1Click ZEC->BNB delivery before the account exists
        address a = factory.createAccount(qx, qy);
        assertEq(a.balance, 3 ether);
    }

    function test_revert_invalidKey() public {
        vm.expectRevert(ISproutAccount.InvalidPublicKey.selector);
        factory.createAccount(bytes32(0), bytes32(0));
        vm.expectRevert(ISproutAccount.InvalidPublicKey.selector);
        factory.createAccount(qx, bytes32(uint256(qy) ^ 1)); // off-curve
    }

    function test_cannotReinitialize_orInitFromOutside() public {
        SproutAccount a = SproutAccount(payable(factory.createAccount(qx, qy)));
        vm.expectRevert(ISproutAccount.NotFactory.selector);
        a.initialize(qx, qy);
        vm.prank(address(factory));
        vm.expectRevert(ISproutAccount.AlreadyInitialized.selector);
        a.initialize(qx, qy);
    }

    function test_implementationIsInert() public {
        SproutAccount impl = SproutAccount(payable(factory.implementation()));
        vm.prank(address(factory));
        vm.expectRevert(ISproutAccount.AlreadyInitialized.selector);
        impl.initialize(qx, qy);
        (bytes32 x,) = impl.owner();
        assertEq(x, bytes32(0));
        // no key => no signature can ever validate
        bytes32 h = keccak256("x");
        WebAuthnSig memory sig = _assert(pk, impl.erc1271Challenge(h));
        assertEq(impl.isValidSignature(h, abi.encode(sig)), bytes4(0xffffffff));
    }

    function test_createAccountAndExecute_firstUse() public {
        address predicted = factory.getAddress(qx, qy);
        vm.deal(predicted, 1 ether);
        address relayer = makeAddr("sprout.test.relayer");
        address bob = makeAddr("sprout.test.bob");
        Call[] memory calls = new Call[](1);
        calls[0] = Call({to: bob, value: 0.25 ether, data: ""});
        uint256 deadline = block.timestamp + 300;
        uint256 fee = 0.0003 ether;
        // nonce 0 at the predicted (not yet deployed) address
        WebAuthnSig memory sig = _assert(pk, _challengeFor(predicted, 0, calls, deadline, fee, relayer));
        vm.prank(relayer);
        uint256 g = gasleft();
        address a = factory.createAccountAndExecute(qx, qy, calls, deadline, fee, relayer, sig);
        console.log("createAccountAndExecute gas (1 call)", g - gasleft());
        assertEq(a, predicted);
        assertEq(bob.balance, 0.25 ether);
        assertEq(relayer.balance, fee);
        assertEq(SproutAccount(payable(a)).nonce(), 1);

        // works on an already-deployed account too (idempotent create)
        WebAuthnSig memory sig2 = _assert(pk, _challengeFor(predicted, 1, calls, deadline, 0, address(0)));
        factory.createAccountAndExecute(qx, qy, calls, deadline, 0, address(0), sig2);
        assertEq(bob.balance, 0.5 ether);
    }
}
