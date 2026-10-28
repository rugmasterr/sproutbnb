// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {PasskeyTestBase} from "./utils/PasskeyTestBase.sol";
import {SproutAccountFactory} from "../src/SproutAccountFactory.sol";
import {SproutAccount} from "../src/SproutAccount.sol";
import {ISproutAccount, Call, WebAuthnSig} from "../src/ISproutAccount.sol";

contract Target {
    uint256 public last;
    uint256 public received;

    function poke(uint256 v) external payable {
        last = v;
        received += msg.value;
    }

    function boom() external pure {
        revert("boom");
    }
}

/// Re-enters executeBatch from inside a call using a pre-signed (otherwise valid) batch for the next nonce.
contract Reenterer {
    SproutAccount public account;
    Call[] internal innerCalls;
    uint256 internal innerDeadline;
    WebAuthnSig internal innerSig;
    bool public armed;

    function arm(SproutAccount a, Call[] memory calls, uint256 deadline, WebAuthnSig memory sig) external {
        account = a;
        delete innerCalls;
        for (uint256 i; i < calls.length; ++i) {
            innerCalls.push(calls[i]);
        }
        innerDeadline = deadline;
        innerSig = sig;
        armed = true;
    }

    function attack() external {
        account.executeBatch(innerCalls, innerDeadline, 0, address(0), innerSig);
    }

    receive() external payable {
        if (armed) {
            armed = false;
            account.executeBatch(innerCalls, innerDeadline, 0, address(0), innerSig);
        }
    }
}

contract RejectingRecipient {
    receive() external payable {
        revert("no");
    }
}

contract SproutAccountTest is PasskeyTestBase {
    SproutAccount internal account;
    Target internal target;
    address internal relayer = makeAddr("sprout.test.relayer");
    address internal alice = makeAddr("sprout.test.alice");

    function setUp() public override {
        super.setUp();
        account = SproutAccount(payable(factory.createAccount(qx, qy)));
        target = new Target();
        vm.deal(address(account), 10 ether);
    }

    // ------------------------------------------------------------------ helpers

    function _calls2() internal view returns (Call[] memory calls) {
        calls = new Call[](2);
        calls[0] = Call({to: alice, value: 1 ether, data: ""});
        calls[1] = Call({to: address(target), value: 0.5 ether, data: abi.encodeCall(Target.poke, (42))});
    }

    function _sign(Call[] memory calls, uint256 deadline, uint256 gasFee, address feeRecipient)
        internal
        view
        returns (WebAuthnSig memory)
    {
        bytes32 c = _challengeFor(address(account), account.nonce(), calls, deadline, gasFee, feeRecipient);
        return _assert(pk, c);
    }

    // ------------------------------------------------------------------ happy path

    function test_executeBatch_happyPath_paysFeeAfterExecution() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        uint256 fee = 0.001 ether;
        WebAuthnSig memory sig = _sign(calls, deadline, fee, relayer);

        // contract and test agree on the challenge formula
        assertEq(
            account.getChallenge(calls, deadline, fee, relayer),
            _challengeFor(address(account), 0, calls, deadline, fee, relayer)
        );

        vm.expectEmit(true, true, false, true, address(account));
        emit ISproutAccount.Executed(0, _challengeFor(address(account), 0, calls, deadline, fee, relayer), 2, fee, relayer);
        vm.prank(relayer);
        uint256 g = gasleft();
        account.executeBatch(calls, deadline, fee, relayer, sig);
        console.log("executeBatch gas (2 calls, incl. P256)", g - gasleft());

        assertEq(account.nonce(), 1);
        assertEq(alice.balance, 1 ether);
        assertEq(target.last(), 42);
        assertEq(target.received(), 0.5 ether);
        assertEq(relayer.balance, fee);
        assertEq(address(account).balance, 10 ether - 1.5 ether - fee);
    }

    function test_executeBatch_anyoneCanSubmit_feeGoesToSignedRecipient() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0.002 ether, relayer);
        vm.prank(makeAddr("randomSubmitter"));
        account.executeBatch(calls, deadline, 0.002 ether, relayer, sig);
        assertEq(relayer.balance, 0.002 ether);
    }

    function test_executeBatch_zeroFee_zeroRecipient() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        account.executeBatch(calls, deadline, 0, address(0), sig);
        assertEq(account.nonce(), 1);
    }

    function test_executeBatch_emptyBatch_justPaysFee() public {
        Call[] memory calls = new Call[](0);
        uint256 deadline = block.timestamp + 1;
        WebAuthnSig memory sig = _sign(calls, deadline, 1 wei, relayer);
        account.executeBatch(calls, deadline, 1 wei, relayer, sig);
        assertEq(relayer.balance, 1);
    }

    function test_deadline_isInclusive() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 100;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        vm.warp(deadline);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    // ------------------------------------------------------------------ signature failures

    function test_revert_badChallenge_differentNonce() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 7, calls, deadline, 0, address(0)); // wrong nonce
        WebAuthnSig memory sig = _assert(pk, c);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_badChallenge_tamperedCalls() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        calls[0].to = makeAddr("thief");
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_badChallenge_tamperedFeeOrRecipient() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0.001 ether, relayer);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 1 ether, relayer, sig);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0.001 ether, makeAddr("otherRelayer"), sig);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline + 1, 0.001 ether, relayer, sig);
    }

    function test_revert_badChallenge_otherChain() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        // signed for another chain (e.g. BSC testnet 97 vs mainnet 56) — must not execute here
        uint256 otherChain = block.chainid == 97 ? 56 : 97;
        bytes32 c = _challengeForChain(otherChain, address(account), 0, calls, deadline, 0, address(0));
        WebAuthnSig memory sig = _assert(pk, c);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_badChallenge_otherAccount() public {
        uint256 pk2 = pk + 1;
        (uint256 x2, uint256 y2) = vm.publicKeyP256(pk2);
        SproutAccount other = SproutAccount(payable(factory.createAccount(bytes32(x2), bytes32(y2))));
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        // signature made by pk for `account`, submitted to `other` (even if other used the same key, address differs)
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        other.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_wrongKey() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 0, calls, deadline, 0, address(0));
        WebAuthnSig memory sig = _assert(pk + 12345, c);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_replay() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        account.executeBatch(calls, deadline, 0, address(0), sig);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
        assertEq(account.nonce(), 1);
        assertEq(alice.balance, 1 ether);
    }

    function test_revert_expiredDeadline() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 60;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(ISproutAccount.Expired.selector, deadline, deadline + 1));
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_highS() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        assertLe(sig.s, N_DIV_2);
        // (r, n - s) is an equally valid ECDSA signature — the precompile alone would accept it.
        sig.s = N - sig.s;
        bytes32 message = sha256(abi.encodePacked(sig.authenticatorData, sha256(bytes(sig.clientDataJSON))));
        (bool ok, bytes memory ret) =
            address(0x100).staticcall(abi.encode(message, sig.r, sig.s, uint256(qx), uint256(qy)));
        assertTrue(ok && ret.length == 32, "precompile should accept the high-s twin");
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_zeroOrOutOfRangeRS() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory a1 = _sign(calls, deadline, 0, address(0));
        a1.r = 0;
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), a1);
        WebAuthnSig memory a2 = _sign(calls, deadline, 0, address(0));
        a2.r = N;
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), a2);
        WebAuthnSig memory a3 = _sign(calls, deadline, 0, address(0));
        a3.s = 0;
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), a3);
    }

    function test_revert_missingUV() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 0, calls, deadline, 0, address(0));
        WebAuthnSig memory sig = _assertWith(pk, c, "webauthn.get", 0x01); // UP only
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_missingUP() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 0, calls, deadline, 0, address(0));
        WebAuthnSig memory sig = _assertWith(pk, c, "webauthn.get", 0x04); // UV only
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_typeCreate() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 0, calls, deadline, 0, address(0));
        WebAuthnSig memory sig = _assertWith(pk, c, "webauthn.create", FLAGS_UP_UV);
        sig.challengeIndex = 26; // challenge itself is fine; only the type is wrong
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_wrongIndexes_noPanic() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        WebAuthnSig memory bad = _sign(calls, deadline, 0, address(0));
        bad.challengeIndex = 24;
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), bad);
        bad.challengeIndex = type(uint256).max;
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), bad);
        bad.challengeIndex = sig.challengeIndex;
        bad.typeIndex = 10_000;
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), bad);
    }

    function test_revert_tamperedClientData() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        sig.clientDataJSON = string.concat(sig.clientDataJSON, " ");
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_revert_shortAuthData() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        sig.authenticatorData = hex"0102";
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    // ------------------------------------------------------------------ fee / execution failures

    function test_revert_insufficientBalanceForGasFee() public {
        Call[] memory calls = new Call[](1);
        calls[0] = Call({to: alice, value: 9.9995 ether, data: ""});
        uint256 deadline = block.timestamp + 600;
        uint256 fee = 0.001 ether;
        WebAuthnSig memory sig = _sign(calls, deadline, fee, relayer);
        vm.expectRevert(
            abi.encodeWithSelector(ISproutAccount.InsufficientBalanceForFee.selector, 0.0005 ether, fee)
        );
        account.executeBatch(calls, deadline, fee, relayer, sig);
        // atomic: nothing moved, nonce not consumed
        assertEq(account.nonce(), 0);
        assertEq(alice.balance, 0);
    }

    function test_revert_feeRecipientZero() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 1, address(0));
        vm.expectRevert(ISproutAccount.FeeRecipientZero.selector);
        account.executeBatch(calls, deadline, 1, address(0), sig);
    }

    function test_revert_feeRecipientRejects() public {
        address rej = address(new RejectingRecipient());
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 1, rej);
        vm.expectRevert(ISproutAccount.FeeTransferFailed.selector);
        account.executeBatch(calls, deadline, 1, rej, sig);
    }

    function test_revert_callFailed_bubblesIndexAndData() public {
        Call[] memory calls = new Call[](2);
        calls[0] = Call({to: alice, value: 1, data: ""});
        calls[1] = Call({to: address(target), value: 0, data: abi.encodeCall(Target.boom, ())});
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        vm.expectRevert(
            abi.encodeWithSelector(
                ISproutAccount.CallFailed.selector, 1, abi.encodeWithSignature("Error(string)", "boom")
            )
        );
        account.executeBatch(calls, deadline, 0, address(0), sig);
        assertEq(alice.balance, 0);
    }

    function test_revert_valueExceedsBalance() public {
        Call[] memory calls = new Call[](1);
        calls[0] = Call({to: alice, value: 11 ether, data: ""});
        uint256 deadline = block.timestamp + 600;
        WebAuthnSig memory sig = _sign(calls, deadline, 0, address(0));
        vm.expectRevert(abi.encodeWithSelector(ISproutAccount.CallFailed.selector, 0, ""));
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    // ------------------------------------------------------------------ reentrancy

    /// A call inside the batch re-enters executeBatch with a VALID signature for the next nonce -> blocked.
    function test_reentrancy_viaCall_blocked() public {
        Reenterer evil = new Reenterer();
        uint256 deadline = block.timestamp + 600;

        Call[] memory inner = new Call[](1);
        inner[0] = Call({to: alice, value: 1 ether, data: ""});
        // valid for nonce 1 (the nonce the account will be at during the outer call)
        WebAuthnSig memory innerSig =
            _assert(pk, _challengeFor(address(account), 1, inner, deadline, 0, address(0)));
        evil.arm(account, inner, deadline, innerSig);

        Call[] memory outer = new Call[](1);
        outer[0] = Call({to: address(evil), value: 0, data: abi.encodeCall(Reenterer.attack, ())});
        WebAuthnSig memory outerSig = _sign(outer, deadline, 0, address(0));

        vm.expectRevert(
            abi.encodeWithSelector(
                ISproutAccount.CallFailed.selector, 0, abi.encodeWithSelector(ISproutAccount.Reentrancy.selector)
            )
        );
        account.executeBatch(outer, deadline, 0, address(0), outerSig);
        assertEq(alice.balance, 0);
        assertEq(account.nonce(), 0);
    }

    /// The fee recipient re-enters when paid -> blocked (lock still held), whole tx reverts.
    function test_reentrancy_viaFeeRecipient_blocked() public {
        Reenterer evil = new Reenterer();
        uint256 deadline = block.timestamp + 600;
        Call[] memory inner = new Call[](1);
        inner[0] = Call({to: alice, value: 1 ether, data: ""});
        WebAuthnSig memory innerSig =
            _assert(pk, _challengeFor(address(account), 1, inner, deadline, 0, address(0)));
        evil.arm(account, inner, deadline, innerSig);

        Call[] memory outer = new Call[](0);
        WebAuthnSig memory outerSig = _sign(outer, deadline, 1 wei, address(evil));
        vm.expectRevert(ISproutAccount.FeeTransferFailed.selector);
        account.executeBatch(outer, deadline, 1 wei, address(evil), outerSig);
        assertEq(alice.balance, 0);
    }

    /// Sanity: the pre-signed inner batch is genuinely valid once the lock is free (proves the test above is meaningful).
    function test_reentrancy_innerSigValidSequentially() public {
        uint256 deadline = block.timestamp + 600;
        Call[] memory first = new Call[](0);
        account.executeBatch(first, deadline, 0, address(0), _sign(first, deadline, 0, address(0)));
        Call[] memory inner = new Call[](1);
        inner[0] = Call({to: alice, value: 1 ether, data: ""});
        WebAuthnSig memory innerSig =
            _assert(pk, _challengeFor(address(account), 1, inner, deadline, 0, address(0)));
        account.executeBatch(inner, deadline, 0, address(0), innerSig);
        assertEq(alice.balance, 1 ether);
    }

    // ------------------------------------------------------------------ ERC-1271 / receive / misc

    function test_erc1271() public view {
        bytes32 h = keccak256("sign in to sproutbnb.cash");
        WebAuthnSig memory sig = _assert(pk, account.erc1271Challenge(h));
        assertEq(account.isValidSignature(h, abi.encode(sig)), bytes4(0x1626ba7e));
        assertEq(account.isValidSignature(keccak256("other"), abi.encode(sig)), bytes4(0xffffffff));
        // a raw signature over `h` itself (not domain-wrapped) is rejected
        WebAuthnSig memory raw = _assert(pk, h);
        assertEq(account.isValidSignature(h, abi.encode(raw)), bytes4(0xffffffff));
    }

    function test_erc1271SigCannotExecute() public {
        Call[] memory calls = _calls2();
        uint256 deadline = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 0, calls, deadline, 0, address(0));
        // attacker obtained an ERC-1271 signature over c (domain-wrapped) — must not execute
        WebAuthnSig memory sig = _assert(pk, account.erc1271Challenge(c));
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, deadline, 0, address(0), sig);
    }

    function test_receive() public {
        vm.deal(alice, 1 ether);
        vm.expectEmit(true, false, false, true, address(account));
        emit ISproutAccount.Received(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(account).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(account).balance, 11 ether);
    }

    function test_owner_and_factory() public view {
        (bytes32 x, bytes32 y) = account.owner();
        assertEq(x, qx);
        assertEq(y, qy);
        assertEq(account.factory(), address(factory));
    }

    function test_hashCalls_matchesAbiEncode() public view {
        Call[] memory calls = _calls2();
        assertEq(account.hashCalls(calls), keccak256(abi.encode(calls)));
    }

    /// Fuzz: random key & random message — sign/verify round trip through the account's 1271 path.
    function testFuzz_erc1271_roundTrip(uint256 key, bytes32 h) public {
        key = bound(key, 1, N - 1);
        (uint256 x, uint256 y) = vm.publicKeyP256(key);
        SproutAccount a = SproutAccount(payable(factory.createAccount(bytes32(x), bytes32(y))));
        WebAuthnSig memory sig = _assert(key, a.erc1271Challenge(h));
        assertEq(a.isValidSignature(h, abi.encode(sig)), bytes4(0x1626ba7e));
    }
}
