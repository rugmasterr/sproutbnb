// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {IPortalTradeV2, IPortalTypes} from "../../src/flap/IPortal.sol";
import {IPancakeV3SwapRouter} from "../../src/interfaces/ISproutExternal.sol";

/// @dev Mintable ERC20 (mock ZEC, generic Flap token). Optional transfer tax into `taxedTo`.
contract MockToken is ERC20 {
    address public dividendContract;
    address public taxedTo;
    uint256 public taxBps;
    address public constant TAX_SINK = address(0x7A85);

    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setDividendContract(address d) external {
        dividendContract = d;
    }

    function setTransferTax(address to, uint256 bps) external {
        taxedTo = to;
        taxBps = bps;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        if (taxBps > 0 && to == taxedTo) {
            uint256 tax = (amount * taxBps) / 10000;
            super._transfer(from, TAX_SINK, tax);
            super._transfer(from, to, amount - tax);
        } else {
            super._transfer(from, to, amount);
        }
    }
}

/// @dev WBNB stand-in (etched at the testnet WBNB address; no constructor state).
contract MockWBNB {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "wbnb: withdraw");
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address from, address to, uint256 a) external returns (bool) {
        if (from != msg.sender) allowance[from][msg.sender] -= a;
        balanceOf[from] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev PancakeSwap V3 SwapRouter stand-in: pulls tokenIn, mints tokenOut (MockToken) at `rate` per 1e18 in.
contract MockV3Router {
    uint256 public rate; // out per 1e18 in
    uint256 public calls;
    uint24 public lastFee;

    function configure(uint256 rate_) external {
        rate = rate_;
    }

    function exactInputSingle(IPancakeV3SwapRouter.ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256 out)
    {
        require(p.deadline >= block.timestamp, "v3: expired");
        calls++;
        lastFee = p.fee;
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        out = (p.amountIn * rate) / 1e18;
        require(out >= p.amountOutMinimum, "Too little received");
        MockToken(p.tokenOut).mint(p.recipient, out);
    }
}

/// @dev Flap Portal stand-in (etched at the testnet Portal address).
contract MockPortal {
    struct Cfg {
        uint8 status;
        uint16 buyTax;
        uint16 sellTax;
    }

    uint256 public rate; // tokens (gross) per 1 BNB
    uint256 public sellRate; // BNB per 1e18 tokens
    uint256 public deliverBps; // part of gross delivered (simulates tax-token buy tax)
    uint256 public fillBps; // part of input actually used; rest refunded
    uint256 public calls;
    mapping(address => Cfg) public cfg;

    function configure(uint256 rate_, uint256 sellRate_, uint256 deliverBps_, uint256 fillBps_) external {
        rate = rate_;
        sellRate = sellRate_;
        deliverBps = deliverBps_;
        fillBps = fillBps_;
    }

    function setToken(address token, uint8 status, uint16 buyTax, uint16 sellTax) external {
        cfg[token] = Cfg(status, buyTax, sellTax);
    }

    function swapExactInput(IPortalTradeV2.ExactInputParams calldata p) external payable returns (uint256 out) {
        calls++;
        if (p.inputToken == address(0)) {
            require(msg.value == p.inputAmount, "mock: value");
            uint256 used = (msg.value * fillBps) / 10000;
            if (used < msg.value) {
                (bool ok,) = msg.sender.call{value: msg.value - used}("");
                require(ok, "mock: refund");
            }
            uint256 gross = (used * rate) / 1e18;
            out = (gross * deliverBps) / 10000;
            require(out >= p.minOutputAmount, "mock: slippage");
            MockToken(p.outputToken).mint(msg.sender, out);
        } else {
            require(p.outputToken == address(0), "mock: sell to native only");
            uint256 used = (p.inputAmount * fillBps) / 10000;
            IERC20(p.inputToken).transferFrom(msg.sender, address(this), used);
            out = (used * sellRate) / 1e18;
            require(out >= p.minOutputAmount, "mock: slippage");
            (bool ok,) = msg.sender.call{value: out}("");
            require(ok, "mock: pay");
        }
    }

    function getTokenV8Safe(address token) external view returns (IPortalTypes.TokenStateV8Safe memory s) {
        Cfg memory c = cfg[token];
        s.status = c.status;
        s.buyTaxRate = c.buyTax;
        s.sellTaxRate = c.sellTax;
    }

    receive() external payable {}
}

contract MockV2Factory {
    mapping(address => mapping(address => address)) public getPair;

    function register(address a, address b, address pair) external {
        getPair[a][b] = pair;
        getPair[b][a] = pair;
    }
}

/// @dev PancakeSwap V2 pair stand-in (reserves only), etched at the Grove pair address.
contract MockV2Pair {
    address public token0;
    uint112 internal _r0;
    uint112 internal _r1;

    function setReserves(address t0, uint112 r0, uint112 r1) external {
        token0 = t0;
        _r0 = r0;
        _r1 = r1;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (_r0, _r1, uint32(block.timestamp));
    }
}

/// @dev Flap Dividend stand-in that pulls nothing and instead sends ZEC back (hostile / buggy callee).
contract RefundingDividend {
    address public dividendToken;
    uint256 public totalShares = 1;

    constructor(address token) {
        dividendToken = token;
    }

    function deposit(uint256) external {
        MockToken(dividendToken).mint(msg.sender, 1);
    }
}

/// @dev PancakeSwap V2 router stand-in (etched at the testnet router address).
contract MockV2Router {
    address public factory;
    address public pair;
    uint256 public useABps;
    uint256 public useBBps;
    mapping(address => uint256) public lpBalance;
    address public lastTo;

    function configure(address factory_, address pair_, uint256 useABps_, uint256 useBBps_) external {
        factory = factory_;
        pair = pair_;
        useABps = useABps_;
        useBBps = useBBps_;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 aDesired,
        uint256 bDesired,
        uint256,
        uint256,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(deadline >= block.timestamp, "v2: expired");
        if (MockV2Factory(factory).getPair(tokenA, tokenB) == address(0)) {
            MockV2Factory(factory).register(tokenA, tokenB, pair);
        }
        amountA = (aDesired * useABps) / 10000;
        amountB = (bDesired * useBBps) / 10000;
        IERC20(tokenA).transferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountB);
        liquidity = amountA / 1e6 + amountB / 1e6 + 1;
        lpBalance[to] += liquidity;
        lastTo = to;
    }
}

/// @dev Flap V3 Dividend stand-in with the verified ABI: deposit(uint256) pulls dividendToken via transferFrom.
contract MockDividend {
    address public dividendToken;
    uint256 public totalShares;
    uint256 public totalDividendsDistributed;
    bool public shouldRevert;

    constructor(address token, uint256 shares) {
        dividendToken = token;
        totalShares = shares;
    }

    function setShares(uint256 s) external {
        totalShares = s;
    }

    function setRevert(bool r) external {
        shouldRevert = r;
    }

    function deposit(uint256 amount) external {
        require(!shouldRevert, "dividend: nope");
        IERC20(dividendToken).transferFrom(msg.sender, address(this), amount);
        totalDividendsDistributed += amount;
    }
}

/// @dev Minimal tax token for vault tests (only dividendContract() is read).
contract MockTaxToken {
    address public dividendContract;

    function setDividendContract(address d) external {
        dividendContract = d;
    }
}

contract Rejecter {
    receive() external payable {
        revert("no thanks");
    }
}

contract RevertingRoots {
    function deposit(uint256, uint256) external payable {
        revert("roots down");
    }
}

/// @dev Treasury that tries to re-enter the vault's flush() while being paid.
contract ReentrantTreasury {
    address public vault;
    bool public reentered;

    function setVault(address v) external {
        vault = v;
    }

    receive() external payable {
        (bool ok,) = vault.call(abi.encodeWithSignature("flush()"));
        reentered = ok;
    }
}
