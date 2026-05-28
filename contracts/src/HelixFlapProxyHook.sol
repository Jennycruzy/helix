// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";

/// @notice HELIX Flap Launch Protection Proxy hook.
///         Defends freshly-launched tokens with no external oracle:
///         (1) launch-window fee decay -- starts at launchFee and linearly
///             decays toward baselineFee over decayBlocks blocks
///         (2) swap-size reflex -- any swap whose abs(amountSpecified)
///             relative to current pool liquidity exceeds swapSizeReflexBps
///             gets baseline + reflexFeeDelta for that one swap only.
contract HelixFlapProxyHook is IHooks, AccessControl, Pausable {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint24 public constant MIN_FEE = 500;          // 0.05%
    uint24 public constant MAX_FEE = 100_000;      // 10%
    uint256 private constant BPS_DENOMINATOR = 10_000;

    bytes32 public constant REASON_LAUNCH = "LAUNCH_WINDOW";
    bytes32 public constant REASON_REFLEX = "SIZE_REFLEX";
    bytes32 public constant REASON_BASELINE = "BASELINE";

    error UnauthorizedCaller();
    error AlreadyInitialized();
    error InvalidConfig();
    error ReentrancyAttempt();

    struct Config {
        uint24 launchFee;          // fee at initBlock, e.g. 50_000 = 5.00%
        uint24 baselineFee;        // fee after decayBlocks elapsed, e.g. 5_000 = 0.50%
        uint32 decayBlocks;        // blocks over which launchFee linearly -> baselineFee
        uint24 reflexFeeDelta;     // extra fee for a reflex-triggering swap
        uint16 swapSizeReflexBps;  // swap size threshold as bps of current pool liquidity
    }

    struct PoolStateData {
        uint64 initBlock;
        uint24 lastQuotedFee;
        uint32 totalSwaps;
        uint32 reflexCount;
        bool initialized;
    }

    IPoolManager public poolManager;
    Config public config;
    bool public initialized;
    uint256 private unlocked = 1;

    mapping(PoolId => PoolStateData) public poolState;

    event HelixProxyInitialized(address indexed admin, address indexed poolManager, Config config);
    event PoolWired(PoolId indexed poolId, uint64 initBlock, uint24 launchFee, uint24 baselineFee, uint32 decayBlocks);
    event FeeQuoted(
        PoolId indexed poolId,
        uint24 quotedFee,
        uint24 baselineFee,
        bytes32 reason,
        uint32 blocksSinceInit,
        uint256 swapSize,
        uint128 liquidity
    );
    event ConfigUpdated(Config config);

    modifier onlyManager() {
        if (msg.sender != address(poolManager)) revert UnauthorizedCaller();
        _;
    }

    modifier nonReentrantHook() {
        if (unlocked != 1) revert ReentrancyAttempt();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    function initialize(address admin, IPoolManager manager_, Config calldata config_) external {
        if (initialized) revert AlreadyInitialized();
        if (address(manager_) == address(0)) revert InvalidConfig();
        _validateConfig(config_);

        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());

        initialized = true;
        poolManager = manager_;
        config = config_;
        unlocked = 1;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        emit HelixProxyInitialized(admin, address(manager_), config_);
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function setConfig(Config calldata config_) external onlyRole(ADMIN_ROLE) {
        _validateConfig(config_);
        config = config_;
        emit ConfigUpdated(config_);
    }

    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    /// @notice Current baseline fee for a pool given its init block + config decay.
    function currentBaselineFee(PoolKey calldata key) external view returns (uint24) {
        PoolStateData memory state = poolState[key.toId()];
        if (!state.initialized) return config.launchFee;
        return _decayedBaseline(state.initBlock);
    }

    function blocksSinceInit(PoolKey calldata key) external view returns (uint32) {
        PoolStateData memory state = poolState[key.toId()];
        if (!state.initialized) return 0;
        if (block.number <= state.initBlock) return 0;
        unchecked { return uint32(block.number - state.initBlock); }
    }

    // ---- hook entrypoints ----

    function afterInitialize(address, PoolKey calldata key, uint160, int24)
        external
        onlyManager
        whenNotPaused
        nonReentrantHook
        returns (bytes4)
    {
        PoolId poolId = key.toId();
        PoolStateData storage state = poolState[poolId];
        if (state.initialized) revert AlreadyInitialized();

        state.initBlock = uint64(block.number);
        state.lastQuotedFee = config.launchFee;
        state.initialized = true;

        poolManager.updateDynamicLPFee(key, config.launchFee);
        emit PoolWired(poolId, state.initBlock, config.launchFee, config.baselineFee, config.decayBlocks);
        return IHooks.afterInitialize.selector;
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyManager
        whenNotPaused
        nonReentrantHook
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        PoolStateData storage state = poolState[poolId];
        if (!state.initialized) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint24 baseline = _decayedBaseline(state.initBlock);
        uint128 liquidity = poolManager.getLiquidity(poolId);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 swapSize = params.amountSpecified < 0
            ? uint256(-params.amountSpecified)
            : uint256(params.amountSpecified);

        uint24 quotedFee = baseline;
        bytes32 reason = (block.number - state.initBlock) < config.decayBlocks ? REASON_LAUNCH : REASON_BASELINE;

        if (liquidity > 0 && swapSize > 0) {
            uint256 sizeBps = (swapSize * BPS_DENOMINATOR) / uint256(liquidity);
            if (sizeBps >= config.swapSizeReflexBps) {
                quotedFee = _clampFee(baseline + config.reflexFeeDelta);
                reason = REASON_REFLEX;
            }
        }

        state.lastQuotedFee = quotedFee;
        emit FeeQuoted(
            poolId,
            quotedFee,
            baseline,
            reason,
            // forge-lint: disable-next-line(unsafe-typecast)
            uint32(block.number - state.initBlock),
            swapSize,
            liquidity
        );

        return (
            IHooks.beforeSwap.selector,
            BeforeSwapDeltaLibrary.ZERO_DELTA,
            quotedFee | LPFeeLibrary.OVERRIDE_FEE_FLAG
        );
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        onlyManager
        whenNotPaused
        nonReentrantHook
        returns (bytes4, int128)
    {
        PoolStateData storage state = poolState[key.toId()];
        if (!state.initialized) return (IHooks.afterSwap.selector, 0);
        state.totalSwaps += 1;
        if (state.lastQuotedFee > _decayedBaseline(state.initBlock)) {
            state.reflexCount += 1;
        }
        return (IHooks.afterSwap.selector, 0);
    }

    // ---- disabled hook entrypoints ----

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert UnauthorizedCaller();
    }
    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external pure returns (bytes4) { revert UnauthorizedCaller(); }
    function afterAddLiquidity(
        address, PoolKey calldata, ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata
    ) external pure returns (bytes4, BalanceDelta) { revert UnauthorizedCaller(); }
    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external pure returns (bytes4) { revert UnauthorizedCaller(); }
    function afterRemoveLiquidity(
        address, PoolKey calldata, ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata
    ) external pure returns (bytes4, BalanceDelta) { revert UnauthorizedCaller(); }
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure returns (bytes4) { revert UnauthorizedCaller(); }
    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure returns (bytes4) { revert UnauthorizedCaller(); }

    // ---- internals ----

    function _decayedBaseline(uint64 initBlock) internal view returns (uint24) {
        if (block.number <= initBlock) return config.launchFee;
        uint256 elapsed = block.number - initBlock;
        if (elapsed >= config.decayBlocks) return config.baselineFee;

        uint24 launch = config.launchFee;
        uint24 base = config.baselineFee;
        if (launch <= base) return base;

        uint256 spread = uint256(launch) - uint256(base);
        uint256 decayed = (spread * elapsed) / uint256(config.decayBlocks);
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint24(uint256(launch) - decayed);
    }

    function _clampFee(uint24 fee) internal pure returns (uint24) {
        if (fee < MIN_FEE) return MIN_FEE;
        if (fee > MAX_FEE) return MAX_FEE;
        return fee;
    }

    function _validateConfig(Config calldata c) internal pure {
        if (c.launchFee < MIN_FEE || c.launchFee > MAX_FEE) revert InvalidConfig();
        if (c.baselineFee < MIN_FEE || c.baselineFee > MAX_FEE) revert InvalidConfig();
        if (c.baselineFee > c.launchFee) revert InvalidConfig();
        if (c.decayBlocks == 0) revert InvalidConfig();
        if (c.reflexFeeDelta > MAX_FEE) revert InvalidConfig();
        if (c.swapSizeReflexBps == 0 || c.swapSizeReflexBps > BPS_DENOMINATOR) revert InvalidConfig();
    }
}
