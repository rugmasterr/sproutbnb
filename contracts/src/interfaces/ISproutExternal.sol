// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPortalTradeV2, IPortalTypes} from "../flap/IPortal.sol";

/// @dev Minimal Flap Portal surface used by Sprout.
interface IFlapPortalLite {
    function swapExactInput(IPortalTradeV2.ExactInputParams calldata params)
        external
        payable
        returns (uint256 outputAmount);
    function getTokenV8Safe(address token) external view returns (IPortalTypes.TokenStateV8Safe memory state);
}

interface IWBNB {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @dev PancakeSwap V3 SwapRouter (v3-periphery style, with deadline). Selector of exactInputSingle: 0x414bf389.
interface IPancakeV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IPancakeV2Router {
    function factory() external view returns (address);
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}

interface IPancakeV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

interface IPancakeV2Pair {
    function token0() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

/// @dev Flap V3 Dividend contract (one per Tax Token V3, `token.dividendContract()`).
///      ABI verified on BSC mainnet on 2026-10-27 against the live clone implementation
///      0xefbc2f91142e24fbd5a550686155e6af3c4461fa: there is NO `deposit(address,uint256)` (0x47e7ef24);
///      the contract exposes `deposit(uint256)` (0xb6b55f25), which pulls `dividendToken()` from the caller
///      via transferFrom and is permissionless (a fork call from an unrelated EOA succeeded and increased
///      `totalDividendsDistributed()` by exactly the deposited amount).
interface IFlapDividend {
    function dividendToken() external view returns (address);
    function taxToken() external view returns (address);
    function totalShares() external view returns (uint256);
    function totalDividendsDistributed() external view returns (uint256);
    function withdrawableDividendOf(address account) external view returns (uint256);
    function minimumShareBalance() external view returns (uint256);
    function deposit(uint256 amount) external;
}

interface IFlapTaxTokenLite {
    function dividendContract() external view returns (address);
    function taxProcessor() external view returns (address);
}
