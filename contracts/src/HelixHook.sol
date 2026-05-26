// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {IHelixOracle} from "./interfaces/IHelixOracle.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";

contract HelixHook is IHooks, AccessControl, Pausable {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint24 public constant MIN_FEE = 500;
    uint24 public constant MAX_FEE = 20_000;
    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant Q96 = 2 ** 96;

    bytes32 public constant REASON_REFLEX = "REFLEX";
    bytes32 public constant REASON_EVOLUTION_UP = "EVOLUTION_UP";
    bytes32 public constant REASON_EVOLUTION_DOWN = "EVOLUTION_DOWN";

    error UnauthorizedCaller();
    error AlreadyInitialized();
    error InvalidFeeBounds();
    error InvalidOracle();
    error OracleReadFailed();
    error OracleAnswerInvalid();
    error OracleStale();
    error ReentrancyAttempt();

    struct PoolStateData {
        uint24 baselineFee;
        uint24 lastReflexFee;
        uint32 swapsSinceEvolution;
        uint64 lastEvolutionBlock;
        uint256 cumulativeLvrSignal;
        uint256 lastOraclePriceE18;
        uint256 lastPoolPriceE18;
        bool initialized;
    }

    struct SwapContext {
        uint256 oraclePriceE18;
        uint256 poolPriceE18;
        uint256 lvrSignal;
        uint24 quotedFee;
        bool toxic;
        bool valid;
    }

    struct Config {
        uint24 initialFee;
        uint24 maxReflexFeeDelta;
        uint24 evolutionStepUp;
        uint24 evolutionStepDown;
        uint16 reflexThresholdBps;
        uint16 healthyThresholdBps;
        uint16 evolutionThresholdBps;
        uint16 reflexFeeMultiplierBps;
        uint32 evolutionCadence;
        uint64 maxOracleAge;
    }

    IPoolManager public poolManager;
    IHelixOracle public oracle;
    Config public config;
    bool public initialized;

    uint256 private unlocked = 1;

    mapping(PoolId => PoolStateData) public poolState;
    mapping(PoolId => SwapContext) internal swapContext;

    event HelixInitialized(address indexed admin, address indexed poolManager, address indexed oracle);
    event ReflexFeeQuoted(
        PoolId indexed poolId,
        uint24 oldFee,
        uint24 newFee,
        uint256 lvrSignal,
        bytes32 reason,
        uint256 oraclePriceE18,
        uint256 poolPriceE18
    );
    event BaselineFeeUpdated(
        PoolId indexed poolId,
        uint24 oldFee,
        uint24 newFee,
        uint256 lvrSignal,
        bytes32 reason,
        uint32 swapsObserved,
        uint256 oraclePriceE18,
        uint256 poolPriceE18
    );
    event OracleSkipped(PoolId indexed poolId, bytes32 reason);
    event ConfigUpdated(Config config);

    modifier onlyManager() {
        _onlyManager();
        _;
    }

    modifier nonReentrantHook() {
        _nonReentrantHookBefore();
        _;
        _nonReentrantHookAfter();
    }

    function initialize(address admin, IPoolManager manager_, IHelixOracle oracle_, Config calldata config_)
        external
    {
        if (initialized) revert AlreadyInitialized();
        if (address(manager_) == address(0) || address(oracle_) == address(0)) revert InvalidOracle();
        if (config_.initialFee < MIN_FEE || config_.initialFee > MAX_FEE) revert InvalidFeeBounds();
        if (config_.evolutionCadence == 0 || config_.maxOracleAge == 0) revert InvalidFeeBounds();

        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());

        initialized = true;
        poolManager = manager_;
        oracle = oracle_;
        config = config_;
        unlocked = 1;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        emit HelixInitialized(admin, address(manager_), address(oracle_));
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
        if (config_.initialFee < MIN_FEE || config_.initialFee > MAX_FEE) revert InvalidFeeBounds();
        if (config_.evolutionCadence == 0 || config_.maxOracleAge == 0) revert InvalidFeeBounds();
        config = config_;
        emit ConfigUpdated(config_);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function currentFee(PoolKey calldata key) external view returns (uint24) {
        PoolStateData memory state = poolState[key.toId()];
        return state.initialized ? state.baselineFee : config.initialFee;
    }

    function currentToxicFlowScore(PoolKey calldata key) external view returns (uint256) {
        return poolState[key.toId()].cumulativeLvrSignal;
    }

    function currentPoolPriceE18(PoolKey calldata key) external view returns (uint256) {
        return _currentPoolPrice(key);
    }

    function previewOverrideFee(PoolKey calldata key, SwapParams calldata params)
        external
        view
        returns (uint24 feeWithFlag, uint256 lvrSignal, bool toxic, bool oracleValid)
    {
        PoolStateData memory state = poolState[key.toId()];
        uint24 baseline = state.initialized ? state.baselineFee : config.initialFee;

        try oracle.read(key) returns (uint256 oraclePriceE18, uint256 updatedAt) {
            if (!_isOracleFresh(oraclePriceE18, updatedAt)) {
                return (0, 0, false, false);
            }

            uint256 poolPriceE18 = _currentPoolPrice(key);
            uint256 divergenceBps = _absDiffBps(poolPriceE18, oraclePriceE18);
            toxic = _isToxic(params.zeroForOne, poolPriceE18, oraclePriceE18);
            lvrSignal = _computeLvrSignal(divergenceBps, params.amountSpecified);
            oracleValid = true;

            if (toxic && divergenceBps >= config.reflexThresholdBps) {
                uint24 rawFee = baseline + _boundedReflexDelta(divergenceBps);
                return (_clampFee(rawFee) | LPFeeLibrary.OVERRIDE_FEE_FLAG, lvrSignal, true, true);
            }
        } catch {
            return (0, 0, false, false);
        }
    }

    function afterInitialize(address, PoolKey calldata key, uint160, int24)
        external
        onlyManager
        whenNotPaused
        nonReentrantHook
        returns (bytes4)
    {
        PoolId poolId = key.toId();
        PoolStateData storage state = poolState[poolId];
        state.baselineFee = config.initialFee;
        state.lastReflexFee = config.initialFee;
        state.swapsSinceEvolution = 0;
        state.lastEvolutionBlock = uint64(block.number);
        state.cumulativeLvrSignal = 0;
        state.initialized = true;

        poolManager.updateDynamicLPFee(key, config.initialFee);
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

        uint24 baseline = state.baselineFee;

        try oracle.read(key) returns (uint256 oraclePriceE18, uint256 updatedAt) {
            if (!_isOracleFresh(oraclePriceE18, updatedAt)) {
                emit OracleSkipped(poolId, "ORACLE_STALE");
                delete swapContext[poolId];
                return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
            }

            SwapContext memory context = _buildSwapContext(key, params, oraclePriceE18, baseline);
            swapContext[poolId] = context;

            if (context.toxic && _absDiffBps(context.poolPriceE18, context.oraclePriceE18) >= config.reflexThresholdBps) {
                uint24 overrideFee = _clampFee(baseline + _boundedReflexDelta(_absDiffBps(context.poolPriceE18, context.oraclePriceE18)));
                state.lastReflexFee = overrideFee;
                swapContext[poolId].quotedFee = overrideFee;
                emit ReflexFeeQuoted(
                    poolId,
                    baseline,
                    overrideFee,
                    context.lvrSignal,
                    REASON_REFLEX,
                    oraclePriceE18,
                    context.poolPriceE18
                );
                return (
                    IHooks.beforeSwap.selector,
                    BeforeSwapDeltaLibrary.ZERO_DELTA,
                    overrideFee | LPFeeLibrary.OVERRIDE_FEE_FLAG
                );
            }

            state.lastReflexFee = baseline;
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        } catch {
            emit OracleSkipped(poolId, "ORACLE_REVERT");
            delete swapContext[poolId];
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        onlyManager
        whenNotPaused
        nonReentrantHook
        returns (bytes4, int128)
    {
        PoolId poolId = key.toId();
        PoolStateData storage state = poolState[poolId];
        SwapContext memory context = swapContext[poolId];
        delete swapContext[poolId];

        if (!state.initialized || !context.valid) {
            return (IHooks.afterSwap.selector, 0);
        }

        state.lastOraclePriceE18 = context.oraclePriceE18;
        state.lastPoolPriceE18 = context.poolPriceE18;
        state.cumulativeLvrSignal += context.lvrSignal;
        state.swapsSinceEvolution += 1;

        if (state.swapsSinceEvolution >= config.evolutionCadence) {
            uint24 oldFee = state.baselineFee;
            uint256 avgSignalBps = state.cumulativeLvrSignal / state.swapsSinceEvolution;
            uint24 newFee = oldFee;
            bytes32 reason = bytes32(0);

            if (avgSignalBps >= config.evolutionThresholdBps) {
                newFee = _clampFee(oldFee + config.evolutionStepUp);
                reason = REASON_EVOLUTION_UP;
            } else if (avgSignalBps <= config.healthyThresholdBps) {
                newFee = _clampFee(oldFee > config.evolutionStepDown ? oldFee - config.evolutionStepDown : MIN_FEE);
                reason = REASON_EVOLUTION_DOWN;
            }

            if (newFee != oldFee) {
                state.baselineFee = newFee;
                poolManager.updateDynamicLPFee(key, newFee);
                emit BaselineFeeUpdated(
                    poolId,
                    oldFee,
                    newFee,
                    state.cumulativeLvrSignal,
                    reason,
                    state.swapsSinceEvolution,
                    context.oraclePriceE18,
                    context.poolPriceE18
                );
            }

            state.swapsSinceEvolution = 0;
            state.cumulativeLvrSignal = 0;
            state.lastEvolutionBlock = uint64(block.number);
        }

        return (IHooks.afterSwap.selector, 0);
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert UnauthorizedCaller();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert UnauthorizedCaller();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert UnauthorizedCaller();
    }

    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        revert UnauthorizedCaller();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert UnauthorizedCaller();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert UnauthorizedCaller();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert UnauthorizedCaller();
    }

    function _currentPoolPrice(PoolKey calldata key) internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        uint256 unscaled = FullMath.mulDiv(uint256(sqrtPriceX96), uint256(sqrtPriceX96), Q96);
        return FullMath.mulDiv(unscaled, 1e18, Q96);
    }

    function _onlyManager() internal view {
        if (msg.sender != address(poolManager)) revert UnauthorizedCaller();
    }

    function _nonReentrantHookBefore() internal {
        if (unlocked != 1) revert ReentrancyAttempt();
        unlocked = 2;
    }

    function _nonReentrantHookAfter() internal {
        unlocked = 1;
    }

    function _buildSwapContext(
        PoolKey calldata key,
        SwapParams calldata params,
        uint256 oraclePriceE18,
        uint24 baseline
    ) internal view returns (SwapContext memory context) {
        uint256 poolPriceE18 = _currentPoolPrice(key);
        uint256 divergenceBps = _absDiffBps(poolPriceE18, oraclePriceE18);

        context.oraclePriceE18 = oraclePriceE18;
        context.poolPriceE18 = poolPriceE18;
        context.lvrSignal = _computeLvrSignal(divergenceBps, params.amountSpecified);
        context.quotedFee = baseline;
        context.toxic = _isToxic(params.zeroForOne, poolPriceE18, oraclePriceE18);
        context.valid = true;
    }

    function _isOracleFresh(uint256 oraclePriceE18, uint256 updatedAt) internal view returns (bool) {
        if (oraclePriceE18 == 0 || updatedAt == 0) return false;
        if (block.timestamp > updatedAt + config.maxOracleAge) return false;
        return true;
    }

    function _absDiffBps(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == b) return 0;
        uint256 diff = a > b ? a - b : b - a;
        return (diff * BPS_DENOMINATOR) / b;
    }

    function _computeLvrSignal(uint256 divergenceBps, int256 amountSpecified) internal pure returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 size = amountSpecified < 0 ? uint256(-amountSpecified) : uint256(amountSpecified);
        if (size == 0 || divergenceBps == 0) return 0;
        return divergenceBps * size;
    }

    function _isToxic(bool zeroForOne, uint256 poolPriceE18, uint256 oraclePriceE18) internal pure returns (bool) {
        if (poolPriceE18 == oraclePriceE18) return false;
        if (poolPriceE18 > oraclePriceE18) return zeroForOne;
        return !zeroForOne;
    }

    function _boundedReflexDelta(uint256 divergenceBps) internal view returns (uint24) {
        uint256 scaled = (divergenceBps * config.reflexFeeMultiplierBps) / BPS_DENOMINATOR;
        if (scaled > config.maxReflexFeeDelta) return config.maxReflexFeeDelta;
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint24(scaled);
    }

    function _clampFee(uint24 fee) internal pure returns (uint24) {
        if (fee < MIN_FEE) return MIN_FEE;
        if (fee > MAX_FEE) return MAX_FEE;
        return fee;
    }
}
