// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Internal cross-contract views between Sprout contracts.
interface ISproutRootsDeposit {
    function deposit(uint256 lpAmount, uint256 rootAmount) external payable;
}

interface ISproutPayoutsCore {
    function deposit(address vault) external payable;
    function zcashFoundationAddress() external view returns (string memory);
    function zec() external view returns (address);
}

interface ISproutFactoryCore {
    function roots() external view returns (address);
    function payouts() external view returns (address);
    function treasury() external view returns (address);
    function isVault(address vault) external view returns (bool);
    function vaultOf(address token) external view returns (address);
}

interface ISproutVaultCore {
    function taxToken() external view returns (address);
    function factory() external view returns (address);
    function mode() external view returns (uint8);
    function payee() external view returns (address);
    function zcashAddress() external view returns (string memory);
}
