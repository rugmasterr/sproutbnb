// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Base64Url
/// @notice RFC 4648 §5 base64url encoding WITHOUT padding — exactly what browsers put in clientDataJSON.challenge.
library Base64Url {
    bytes internal constant TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    function encode(bytes memory data) internal pure returns (string memory) {
        uint256 len = data.length;
        if (len == 0) return "";
        // unpadded length = ceil(len * 4 / 3)
        uint256 outLen = (len * 4 + 2) / 3;
        bytes memory out = new bytes(outLen);
        bytes memory table = TABLE;
        uint256 o;
        uint256 i;
        for (; i + 3 <= len; i += 3) {
            uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i + 1])) << 8) | uint256(uint8(data[i + 2]));
            out[o++] = table[(n >> 18) & 63];
            out[o++] = table[(n >> 12) & 63];
            out[o++] = table[(n >> 6) & 63];
            out[o++] = table[n & 63];
        }
        uint256 rem = len - i;
        if (rem == 1) {
            uint256 n = uint256(uint8(data[i])) << 16;
            out[o++] = table[(n >> 18) & 63];
            out[o++] = table[(n >> 12) & 63];
        } else if (rem == 2) {
            uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i + 1])) << 8);
            out[o++] = table[(n >> 18) & 63];
            out[o++] = table[(n >> 12) & 63];
            out[o++] = table[(n >> 6) & 63];
        }
        return string(out);
    }
}
