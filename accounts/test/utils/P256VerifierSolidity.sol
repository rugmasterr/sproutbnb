// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title P256VerifierSolidity — TEST ONLY
/// @notice Pure-Solidity secp256r1 ECDSA verifier with the RIP-7212 / EIP-7951 calling convention
///         (calldata = hash|r|s|qx|qy, returns 32-byte 1 on success, empty on failure).
///         Tests `vm.etch` its runtime code at 0x100 when the local EVM has no P256VERIFY precompile.
///         Unoptimised (Jacobian coordinates, Shamir's trick, modexp inversion). Never deploy this to production:
///         production relies on the chain's native precompile.
contract P256VerifierSolidity {
    uint256 private constant P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;
    uint256 private constant A = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC;
    uint256 private constant B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B;
    uint256 private constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 private constant GX = 0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296;
    uint256 private constant GY = 0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5;

    struct J {
        uint256 x;
        uint256 y;
        uint256 z;
    }

    fallback(bytes calldata input) external returns (bytes memory) {
        if (input.length != 160) return "";
        (uint256 h, uint256 r, uint256 s, uint256 qx, uint256 qy) =
            abi.decode(input, (uint256, uint256, uint256, uint256, uint256));
        if (_verify(h, r, s, qx, qy)) return abi.encode(uint256(1));
        return "";
    }

    function _verify(uint256 h, uint256 r, uint256 s, uint256 qx, uint256 qy) internal view returns (bool) {
        if (r == 0 || r >= N || s == 0 || s >= N) return false;
        if (!_onCurve(qx, qy)) return false;
        uint256 w = _modexp(s, N - 2, N);
        uint256 u1 = mulmod(h % N, w, N);
        uint256 u2 = mulmod(r, w, N);

        J memory g = J(GX, GY, 1);
        J memory q = J(qx, qy, 1);
        J memory gq = _add(g, q);
        J memory acc = J(1, 1, 0); // infinity

        for (uint256 i = 256; i > 0;) {
            unchecked {
                --i;
            }
            acc = _double(acc);
            uint256 b1 = (u1 >> i) & 1;
            uint256 b2 = (u2 >> i) & 1;
            if (b1 == 1 && b2 == 1) acc = _add(acc, gq);
            else if (b1 == 1) acc = _add(acc, g);
            else if (b2 == 1) acc = _add(acc, q);
        }
        if (acc.z == 0) return false;
        uint256 zinv = _modexp(acc.z, P - 2, P);
        uint256 ax = mulmod(acc.x, mulmod(zinv, zinv, P), P);
        return ax % N == r;
    }

    function _onCurve(uint256 x, uint256 y) internal pure returns (bool) {
        if (x >= P || y >= P || (x == 0 && y == 0)) return false;
        uint256 rhs = addmod(addmod(mulmod(mulmod(x, x, P), x, P), mulmod(A, x, P), P), B, P);
        return mulmod(y, y, P) == rhs;
    }

    function _sub(uint256 a, uint256 b) private pure returns (uint256) {
        return addmod(a, P - b, P);
    }

    // dbl-2001-b (a = -3)
    function _double(J memory p1) private pure returns (J memory) {
        if (p1.z == 0 || p1.y == 0) return J(1, 1, 0);
        uint256 delta = mulmod(p1.z, p1.z, P);
        uint256 gamma = mulmod(p1.y, p1.y, P);
        uint256 beta = mulmod(p1.x, gamma, P);
        uint256 alpha = mulmod(3, mulmod(_sub(p1.x, delta), addmod(p1.x, delta, P), P), P);
        uint256 x3 = _sub(mulmod(alpha, alpha, P), mulmod(8, beta, P));
        uint256 yz = addmod(p1.y, p1.z, P);
        uint256 z3 = _sub(_sub(mulmod(yz, yz, P), gamma), delta);
        uint256 y3 = _sub(mulmod(alpha, _sub(mulmod(4, beta, P), x3), P), mulmod(8, mulmod(gamma, gamma, P), P));
        return J(x3, y3, z3);
    }

    // add-2007-bl
    function _add(J memory p1, J memory p2) private pure returns (J memory) {
        if (p1.z == 0) return p2;
        if (p2.z == 0) return p1;
        uint256 z1z1 = mulmod(p1.z, p1.z, P);
        uint256 z2z2 = mulmod(p2.z, p2.z, P);
        uint256 u1 = mulmod(p1.x, z2z2, P);
        uint256 u2 = mulmod(p2.x, z1z1, P);
        uint256 s1 = mulmod(mulmod(p1.y, p2.z, P), z2z2, P);
        uint256 s2 = mulmod(mulmod(p2.y, p1.z, P), z1z1, P);
        if (u1 == u2) {
            if (s1 == s2) return _double(p1);
            return J(1, 1, 0);
        }
        uint256 hh = _sub(u2, u1);
        uint256 h2 = addmod(hh, hh, P);
        uint256 i = mulmod(h2, h2, P);
        uint256 j = mulmod(hh, i, P);
        uint256 rr = addmod(_sub(s2, s1), _sub(s2, s1), P);
        uint256 v = mulmod(u1, i, P);
        uint256 x3 = _sub(_sub(mulmod(rr, rr, P), j), addmod(v, v, P));
        uint256 s1j = mulmod(s1, j, P);
        uint256 y3 = _sub(mulmod(rr, _sub(v, x3), P), addmod(s1j, s1j, P));
        uint256 zs = addmod(p1.z, p2.z, P);
        uint256 z3 = mulmod(_sub(_sub(mulmod(zs, zs, P), z1z1), z2z2), hh, P);
        return J(x3, y3, z3);
    }

    function _modexp(uint256 base, uint256 e, uint256 m) private view returns (uint256 result) {
        (bool ok, bytes memory ret) = address(0x05).staticcall(abi.encode(uint256(32), uint256(32), uint256(32), base, e, m));
        require(ok && ret.length == 32, "modexp");
        result = abi.decode(ret, (uint256));
    }
}
