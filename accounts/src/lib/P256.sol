// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title P256
/// @notice secp256r1 helpers around the P256VERIFY precompile at 0x100 (RIP-7212 on BSC; EIP-7951 on Osaka chains —
///         identical calling convention: input = hash | r | s | qx | qy (160 bytes), output = 32-byte 1 on success,
///         empty on failure).
/// @dev Neither RIP-7212 nor EIP-7951 enforce low-s, so `verify` does (malleability protection).
///      There is NO pure-Solidity fallback here on purpose: on a chain without the precompile every signature fails
///      closed (staticcall to an empty account succeeds with empty returndata -> false).
library P256 {
    address internal constant VERIFIER = address(0x100);

    uint256 internal constant P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF;
    uint256 internal constant A = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC; // -3 mod p
    uint256 internal constant B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B;
    uint256 internal constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 internal constant N_DIV_2 = 0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCE5617E3192A8;

    /// @notice true iff (x, y) is an affine point on secp256r1 (excludes the point at infinity / out-of-range coords).
    function isOnCurve(uint256 x, uint256 y) internal pure returns (bool) {
        if (x == 0 && y == 0) return false;
        if (x >= P || y >= P) return false;
        uint256 lhs = mulmod(y, y, P);
        uint256 rhs = addmod(addmod(mulmod(mulmod(x, x, P), x, P), mulmod(A, x, P), P), B, P);
        return lhs == rhs;
    }

    /// @notice Verify an ECDSA P-256 signature over `hash` (already hashed, 32 bytes) with low-s enforced.
    function verify(bytes32 hash, uint256 r, uint256 s, uint256 qx, uint256 qy) internal view returns (bool) {
        if (r == 0 || r >= N || s == 0 || s > N_DIV_2) return false;
        (bool ok, bytes memory ret) = VERIFIER.staticcall(abi.encode(hash, r, s, qx, qy));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }
}
