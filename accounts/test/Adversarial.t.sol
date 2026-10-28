// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {PasskeyTestBase} from "./utils/PasskeyTestBase.sol";
import {SproutAccountFactory} from "../src/SproutAccountFactory.sol";
import {SproutAccount} from "../src/SproutAccount.sol";
import {ISproutAccount, Call, WebAuthnSig} from "../src/ISproutAccount.sol";
import {Base64Url} from "../src/lib/Base64Url.sol";

/// WETH9/WBNB-style wrapper: withdraw() pays out with Solidity `transfer` (2300 gas stipend) — exactly like BSC WBNB.
contract MiniWBNB {
    mapping(address => uint256) public balanceOf;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 wad) external {
        balanceOf[msg.sender] -= wad;
        payable(msg.sender).transfer(wad);
    }
}

contract StipendSender {
    function pay(address payable to) external payable {
        to.transfer(msg.value);
    }
}

/// Fake 0x100 behaviours: must all fail closed.
contract EmptyReturn {
    fallback() external {}
}

contract ReturnsTwo {
    fallback() external {
        assembly {
            mstore(0, 2)
            return(0, 32)
        }
    }
}

contract ReturnsOneButLong {
    fallback() external {
        assembly {
            mstore(0, 1)
            mstore(32, 0)
            return(0, 64)
        }
    }
}

contract Reverts {
    fallback() external {
        assembly {
            mstore(0, 1)
            revert(0, 32)
        }
    }
}

/// Adversarial review tests (WebAuthn binding, precompile failure modes, replay across factories, 1271 robustness,
/// 2300-gas stipend payouts into the clone).
contract AdversarialTest is PasskeyTestBase {
    SproutAccount internal account;
    address internal relayer = makeAddr("sprout.adv.relayer");
    address internal bob = makeAddr("sprout.adv.bob");

    function setUp() public override {
        super.setUp();
        account = SproutAccount(payable(factory.createAccount(qx, qy)));
        vm.deal(address(account), 10 ether);
    }

    function _one(address to, uint256 v, bytes memory d) internal pure returns (Call[] memory c) {
        c = new Call[](1);
        c[0] = Call(to, v, d);
    }

    function _signFor(SproutAccount a, Call[] memory calls, uint256 deadline, uint256 fee, address rcpt)
        internal
        view
        returns (WebAuthnSig memory)
    {
        return _assert(pk, _challengeFor(address(a), a.nonce(), calls, deadline, fee, rcpt));
    }

    // ------------------------------------------------------------------ challenge binding

    /// Every signed field is bound: flipping deadline alone (fee/recipient/calls/nonce/chain/account covered elsewhere).
    function test_challenge_bindsDeadline() public {
        Call[] memory calls = _one(bob, 1 ether, "");
        uint256 d = block.timestamp + 600;
        WebAuthnSig memory sig = _signFor(account, calls, d, 0, address(0));
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d + 1, 0, address(0), sig);
    }

    /// Relayer cannot inflate the fee: user signed 0.001, relayer submits 1 BNB -> invalid.
    function test_relayerCannotInflateFee() public {
        Call[] memory calls = new Call[](0);
        uint256 d = block.timestamp + 600;
        WebAuthnSig memory sig = _signFor(account, calls, d, 0.001 ether, relayer);
        vm.prank(relayer);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d, 1 ether, relayer, sig);
        vm.prank(relayer);
        account.executeBatch(calls, d, 0.001 ether, relayer, sig);
        assertEq(relayer.balance, 0.001 ether);
    }

    /// Changing only the value of a call (same to/data) breaks the signature.
    function test_challenge_bindsCallValue() public {
        Call[] memory calls = _one(bob, 1 ether, "");
        uint256 d = block.timestamp + 600;
        WebAuthnSig memory sig = _signFor(account, calls, d, 0, address(0));
        calls[0].value = 2 ether;
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d, 0, address(0), sig);
    }

    /// Same passkey, second factory (e.g. a redeploy) -> different account address -> signature not replayable.
    function test_noReplay_acrossFactories() public {
        SproutAccountFactory f2 = new SproutAccountFactory();
        SproutAccount other = SproutAccount(payable(f2.createAccount(qx, qy)));
        assertTrue(address(other) != address(account));
        vm.deal(address(other), 10 ether);
        Call[] memory calls = _one(bob, 1 ether, "");
        uint256 d = block.timestamp + 600;
        WebAuthnSig memory sig = _signFor(account, calls, d, 0, address(0));
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        other.executeBatch(calls, d, 0, address(0), sig);
        account.executeBatch(calls, d, 0, address(0), sig);
        assertEq(bob.balance, 1 ether);
    }

    /// A front-runner submitting the signed batch directly only consumes it as the user intended; the relayer's
    /// createAccountAndExecute for the same sig then reverts (no double execution).
    function test_frontRun_createAccountAndExecute_noDoubleSpend() public {
        uint256 k2 = 0xA11CE;
        (uint256 x, uint256 y) = vm.publicKeyP256(k2);
        address predicted = factory.getAddress(bytes32(x), bytes32(y));
        vm.deal(predicted, 5 ether);
        Call[] memory calls = _one(bob, 1 ether, "");
        uint256 d = block.timestamp + 600;
        WebAuthnSig memory sig = _assert(k2, _challengeFor(predicted, 0, calls, d, 0.01 ether, relayer));

        // attacker deploys + executes first
        vm.prank(makeAddr("frontrunner"));
        factory.createAccountAndExecute(bytes32(x), bytes32(y), calls, d, 0.01 ether, relayer, sig);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        factory.createAccountAndExecute(bytes32(x), bytes32(y), calls, d, 0.01 ether, relayer, sig);
        assertEq(bob.balance, 1 ether);
        assertEq(relayer.balance, 0.01 ether); // fee still went to the SIGNED recipient, not the front-runner
    }

    // ------------------------------------------------------------------ clientDataJSON / authenticatorData

    /// challengeIndex pointing at a different (attacker-chosen) region that happens to be outside the JSON -> false.
    function test_indexes_outOfBounds_huge() public {
        Call[] memory calls = new Call[](0);
        uint256 d = block.timestamp + 600;
        WebAuthnSig memory sig = _signFor(account, calls, d, 0, address(0));
        sig.challengeIndex = type(uint256).max;
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d, 0, address(0), sig);
        sig.challengeIndex = 23;
        sig.typeIndex = type(uint256).max - 5;
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d, 0, address(0), sig);
    }

    /// The challenge match includes the closing quote: a JSON whose challenge is our b64 + extra chars is rejected
    /// even when properly signed by the passkey (so a signature for a LONGER challenge can't be reused).
    function test_challenge_prefixOfLongerValue_rejected() public {
        Call[] memory calls = new Call[](0);
        uint256 d = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 0, calls, d, 0, address(0));
        string memory cdj = string.concat(
            '{"type":"webauthn.get","challenge":"',
            Base64Url.encode(abi.encodePacked(c)),
            'AAAA","origin":"https://sproutbnb.cash","crossOrigin":false}'
        );
        bytes memory ad = _authData(FLAGS_UP_UV);
        (uint256 r, uint256 s) = _signRaw(pk, ad, cdj);
        WebAuthnSig memory sig = WebAuthnSig(ad, cdj, 23, 1, r, s);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d, 0, address(0), sig);
    }

    /// Key order differs from Chrome (challenge first) — still accepted, indexes are what matter.
    function test_clientData_otherKeyOrder_accepted() public {
        Call[] memory calls = new Call[](0);
        uint256 d = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 0, calls, d, 0, address(0));
        string memory b = Base64Url.encode(abi.encodePacked(c));
        string memory cdj = string.concat('{"challenge":"', b, '","type":"webauthn.get","origin":"https://sproutbnb.cash"}');
        bytes memory ad = _authData(FLAGS_UP_UV);
        (uint256 r, uint256 s) = _signRaw(pk, ad, cdj);
        WebAuthnSig memory sig = WebAuthnSig(ad, cdj, 1, 1 + 13 + 43 + 2, r, s);
        account.executeBatch(calls, d, 0, address(0), sig);
        assertEq(account.nonce(), 1);
    }

    /// authenticatorData with extensions (ED flag + CBOR) and a non-zero signCount still verifies.
    function test_authData_withExtensions_accepted() public {
        Call[] memory calls = new Call[](0);
        uint256 d = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 0, calls, d, 0, address(0));
        string memory cdj = _clientDataJSON("webauthn.get", c);
        bytes memory ad = abi.encodePacked(sha256(bytes(RP_ID)), bytes1(0x85), uint32(7), hex"a0");
        (uint256 r, uint256 s) = _signRaw(pk, ad, cdj);
        account.executeBatch(calls, d, 0, address(0), WebAuthnSig(ad, cdj, 23, 1, r, s));
        assertEq(account.nonce(), 1);
    }

    /// The submitter cannot strip/alter authenticatorData flags (UV) without breaking the signature.
    function test_flipFlags_afterSigning_rejected() public {
        Call[] memory calls = new Call[](0);
        uint256 d = block.timestamp + 600;
        WebAuthnSig memory sig = _signFor(account, calls, d, 0, address(0));
        sig.authenticatorData[32] = bytes1(0x45); // add AT bit
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d, 0, address(0), sig);
    }

    /// Message must be sha256(authData || sha256(clientDataJSON)) — a signature over keccak / raw concat fails.
    function test_wrongMessageConstruction_rejected() public {
        Call[] memory calls = new Call[](0);
        uint256 d = block.timestamp + 600;
        bytes32 c = _challengeFor(address(account), 0, calls, d, 0, address(0));
        string memory cdj = _clientDataJSON("webauthn.get", c);
        bytes memory ad = _authData(FLAGS_UP_UV);
        (bytes32 rr, bytes32 ss) = vm.signP256(pk, sha256(abi.encodePacked(ad, cdj))); // missing inner sha256
        uint256 s = uint256(ss) > N_DIV_2 ? N - uint256(ss) : uint256(ss);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d, 0, address(0), WebAuthnSig(ad, cdj, 23, 1, uint256(rr), s));
    }

    // ------------------------------------------------------------------ precompile failure modes (fail closed)

    /// Foundry refuses vm.etch over a NATIVE precompile (osaka profile) — these mocks only run when 0x100 is etched.
    function _skipIfNative() internal {
        if (nativePrecompile) vm.skip(true);
    }

    function _precompileRejects(address impl) internal {
        _skipIfNative();
        Call[] memory calls = new Call[](0);
        uint256 d = block.timestamp + 600;
        WebAuthnSig memory sig = _signFor(account, calls, d, 0, address(0));
        vm.etch(address(0x100), impl.code);
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d, 0, address(0), sig);
        assertEq(account.isValidSignature(bytes32(0), abi.encode(sig)), bytes4(0xffffffff));
    }

    function test_precompile_noCode_failsClosed() public {
        _skipIfNative();
        Call[] memory calls = new Call[](0);
        uint256 d = block.timestamp + 600;
        WebAuthnSig memory sig = _signFor(account, calls, d, 0, address(0));
        vm.etch(address(0x100), "");
        vm.expectRevert(ISproutAccount.InvalidSignature.selector);
        account.executeBatch(calls, d, 0, address(0), sig);
    }

    function test_precompile_emptyReturn_failsClosed() public {
        _precompileRejects(address(new EmptyReturn()));
    }

    function test_precompile_returnsTwo_failsClosed() public {
        _precompileRejects(address(new ReturnsTwo()));
    }

    function test_precompile_returns64Bytes_failsClosed() public {
        _precompileRejects(address(new ReturnsOneButLong()));
    }

    function test_precompile_reverts_failsClosed() public {
        _precompileRejects(address(new Reverts()));
    }

    // ------------------------------------------------------------------ ERC-1271 robustness

    /// Malformed signature bytes must return the failure value, never revert (ERC-1271 callers may not catch).
    function test_erc1271_malformedSignature_returnsInvalid() public view {
        bytes32 h = keccak256("x");
        assertEq(account.isValidSignature(h, ""), bytes4(0xffffffff));
        assertEq(account.isValidSignature(h, hex"1234"), bytes4(0xffffffff));
        assertEq(account.isValidSignature(h, abi.encode(uint256(1 << 200))), bytes4(0xffffffff));
        bytes memory junk = new bytes(400);
        junk[31] = 0x20;
        junk[63] = 0xff; // absurd offsets
        assertEq(account.isValidSignature(h, junk), bytes4(0xffffffff));
    }

    function test_erc1271_implementationAndOtherAccount_reject() public {
        bytes32 h = keccak256("login");
        WebAuthnSig memory sig = _assert(pk, account.erc1271Challenge(h));
        assertEq(account.isValidSignature(h, abi.encode(sig)), bytes4(0x1626ba7e));
        SproutAccount impl = SproutAccount(payable(factory.implementation()));
        assertEq(impl.isValidSignature(h, abi.encode(sig)), bytes4(0xffffffff));
        (uint256 x, uint256 y) = vm.publicKeyP256(0xB0B);
        SproutAccount other = SproutAccount(payable(factory.createAccount(bytes32(x), bytes32(y))));
        assertEq(other.isValidSignature(h, abi.encode(sig)), bytes4(0xffffffff));
    }

    function test_erc1271_otherChain_rejects() public {
        bytes32 h = keccak256("login");
        WebAuthnSig memory sig = _assert(pk, account.erc1271Challenge(h));
        vm.chainId(block.chainid + 1);
        assertEq(account.isValidSignature(h, abi.encode(sig)), bytes4(0xffffffff));
    }

    // ------------------------------------------------------------------ 2300-gas stipend payouts (WBNB.withdraw)

    /// Inside executeBatch the implementation is already warm, so a WETH9/WBNB-style `transfer` back into the clone
    /// must fit in the 2300 stipend (unwrapping WBNB is a normal trading step).
    function test_wbnbStyleWithdraw_insideBatch() public {
        MiniWBNB w = new MiniWBNB();
        Call[] memory calls = new Call[](2);
        calls[0] = Call(address(w), 1 ether, abi.encodeCall(MiniWBNB.deposit, ()));
        calls[1] = Call(address(w), 0, abi.encodeCall(MiniWBNB.withdraw, (1 ether)));
        uint256 d = block.timestamp + 600;
        uint256 before = address(account).balance;
        account.executeBatch(calls, d, 0, address(0), _signFor(account, calls, d, 0, address(0)));
        assertEq(address(account).balance, before);
    }

    /// Same against the REAL BSC WBNB (fork only: forge test --fork-url <bsc>).
    function test_realWBNB_withdraw_insideBatch_fork() public {
        address wbnb = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
        if (block.chainid != 56 || wbnb.code.length == 0) vm.skip(true);
        Call[] memory calls = new Call[](2);
        calls[0] = Call(wbnb, 1 ether, abi.encodeWithSignature("deposit()"));
        calls[1] = Call(wbnb, 0, abi.encodeWithSignature("withdraw(uint256)", 1 ether));
        uint256 d = block.timestamp + 600;
        uint256 before = address(account).balance;
        account.executeBatch(calls, d, 0, address(0), _signFor(account, calls, d, 0, address(0)));
        assertEq(address(account).balance, before);
    }

    /// KNOWN LIMITATION (documented in README): a cold 2300-stipend `transfer` into the clone fails, because the
    /// EIP-1167 proxy's DELEGATECALL to a cold implementation alone costs 2600 gas (EIP-2929). Senders must use
    /// `call{value:}` (Sprout's own contracts, Flap, plain EOA transfers with gas limit > 21000 all do).
    function test_stipendTransfer_cold_reverts_knownLimitation() public {
        StipendSender snd = new StipendSender();
        vm.deal(address(this), 1 ether);
        vm.expectRevert();
        snd.pay{value: 1 ether}(payable(address(account)));
        // the same payment via call{value} works
        (bool ok,) = address(account).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(account).balance, 11 ether);
    }
}
