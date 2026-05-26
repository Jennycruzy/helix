// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {HelixHook} from "../src/HelixHook.sol";
import {HelixSwapExecutor} from "../src/HelixSwapExecutor.sol";
import {IHelixOracle} from "../src/interfaces/IHelixOracle.sol";
import {MockHelixOracle} from "./mocks/MockHelixOracle.sol";
import {Deployers} from "v4-core/test/utils/Deployers.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {Currency} from "v4-core/src/types/Currency.sol";

contract HelixHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    event Swap(
        PoolId indexed poolId,
        address indexed sender,
        int128 amount0,
        int128 amount1,
        uint160 sqrtPriceX96,
        uint128 liquidity,
        int24 tick,
        uint24 fee
    );

    HelixHook hook;
    MockHelixOracle oracle;

    uint160 internal constant HELIX_FLAGS = Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;
    address internal constant ADMIN = address(0xBEEF);

    function setUp() public {
        oracle = new MockHelixOracle(1e18, block.timestamp);

        address hookAddr = address(uint160((uint256(type(uint160).max) & clearAllHookPermissionsMask) | HELIX_FLAGS));
        HelixHook impl = new HelixHook();
        vm.etch(hookAddr, address(impl).code);
        hook = HelixHook(hookAddr);

        deployFreshManagerAndRouters();

        hook.initialize(
            ADMIN,
            IPoolManager(manager),
            IHelixOracle(address(oracle)),
            HelixHook.Config({
                initialFee: 3_000,
                maxReflexFeeDelta: 6_000,
                evolutionStepUp: 1_000,
                evolutionStepDown: 500,
                reflexThresholdBps: 200,
                healthyThresholdBps: 50,
                evolutionThresholdBps: 300,
                reflexFeeMultiplierBps: 1_000,
                evolutionCadence: 3,
                maxOracleAge: 1 hours
            })
        );

        deployMintAndApprove2Currencies();
        (key,) = initPoolAndAddLiquidity(currency0, currency1, IHooks(address(hook)), LPFeeLibrary.DYNAMIC_FEE_FLAG, SQRT_PRICE_1_1);
    }

    function test_afterInitialize_setsStartingFee() public view {
        (, , , uint24 lpFee) = manager.getSlot0(key.toId());
        assertEq(lpFee, 3_000);
    }

    function test_beforeSwap_toxicFlowQuotesOverrideFee() public {
        oracle.setPrice(0.90e18);
        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: -100, sqrtPriceLimitX96: SQRT_PRICE_1_2});

        (uint24 expectedOverride, uint256 expectedSignal, bool toxic, bool oracleValid) = hook.previewOverrideFee(key, params);
        assertTrue(toxic);
        assertTrue(oracleValid);
        assertGt(expectedOverride, LPFeeLibrary.OVERRIDE_FEE_FLAG);

        vm.recordLogs();
        swapRouter.swap(key, params, PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), ZERO_BYTES);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 swapSig = keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
        uint24 observedFee = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(manager) && logs[i].topics[0] == swapSig) {
                (, , , , , observedFee) = abi.decode(logs[i].data, (int128, int128, uint160, uint128, int24, uint24));
            }
        }

        assertEq(observedFee, expectedOverride ^ LPFeeLibrary.OVERRIDE_FEE_FLAG);
        assertEq(hook.currentToxicFlowScore(key), expectedSignal);
    }

    function test_evolution_raisesBaselineFee_afterToxicCadence() public {
        oracle.setPrice(0.90e18);
        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: -100, sqrtPriceLimitX96: SQRT_PRICE_1_2});

        for (uint256 i = 0; i < 3; i++) {
            swapRouter.swap(key, params, PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), ZERO_BYTES);
        }

        (, , , uint24 lpFee) = manager.getSlot0(key.toId());
        assertEq(lpFee, 4_000);
    }

    function test_evolution_lowersBaselineFee_onHealthyCadence() public {
        oracle.setPrice(0.90e18);
        SwapParams memory toxicParams = SwapParams({zeroForOne: true, amountSpecified: -100, sqrtPriceLimitX96: SQRT_PRICE_1_2});
        for (uint256 i = 0; i < 3; i++) {
            swapRouter.swap(key, toxicParams, PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), ZERO_BYTES);
        }

        oracle.setPrice(hook.currentPoolPriceE18(key));
        SwapParams memory healthyParams =
            SwapParams({zeroForOne: false, amountSpecified: -10, sqrtPriceLimitX96: MAX_PRICE_LIMIT});
        for (uint256 i = 0; i < 3; i++) {
            swapRouter.swap(key, healthyParams, PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), ZERO_BYTES);
        }

        (, , , uint24 lpFee) = manager.getSlot0(key.toId());
        assertEq(lpFee, 3_500);
    }

    function test_feeClamp_respectsBounds() public {
        vm.prank(ADMIN);
        hook.setConfig(
            HelixHook.Config({
                initialFee: 3_000,
                maxReflexFeeDelta: 50_000,
                evolutionStepUp: 50_000,
                evolutionStepDown: 50_000,
                reflexThresholdBps: 1,
                healthyThresholdBps: 0,
                evolutionThresholdBps: 1,
                reflexFeeMultiplierBps: 10_000,
                evolutionCadence: 1,
                maxOracleAge: 1 hours
            })
        );

        oracle.setPrice(0.10e18);
        swapRouter.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -100, sqrtPriceLimitX96: SQRT_PRICE_1_2}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ZERO_BYTES
        );

        (, , , uint24 maxedFee) = manager.getSlot0(key.toId());
        assertEq(maxedFee, hook.MAX_FEE());

        oracle.setPrice(hook.currentPoolPriceE18(key));
        swapRouter.swap(
            key,
            SwapParams({zeroForOne: false, amountSpecified: -1, sqrtPriceLimitX96: MAX_PRICE_LIMIT}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ZERO_BYTES
        );

        (, , , uint24 minnedFee) = manager.getSlot0(key.toId());
        assertEq(minnedFee, hook.MIN_FEE());
    }

    function test_staleOracle_skipsAdaptation() public {
        vm.warp(3 hours);
        oracle.setUpdatedAt(1 hours);

        swapRouter.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -100, sqrtPriceLimitX96: SQRT_PRICE_1_2}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ZERO_BYTES
        );

        (, , , uint24 lpFee) = manager.getSlot0(key.toId());
        assertEq(lpFee, 3_000);
        assertEq(hook.currentToxicFlowScore(key), 0);
    }

    function test_revertedOracle_skipsAdaptation() public {
        oracle.setShouldRevert(true);

        swapRouter.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -100, sqrtPriceLimitX96: SQRT_PRICE_1_2}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ZERO_BYTES
        );

        (, , , uint24 lpFee) = manager.getSlot0(key.toId());
        assertEq(lpFee, 3_000);
    }

    function test_permissionFlags_matchExpectedAddress() public view {
        Hooks.validateHookPermissions(IHooks(address(hook)), hook.getHookPermissions());
    }

    function test_permissionValidation_revertsForWrongAddress() public {
        HelixHook wrongImpl = new HelixHook();
        vm.expectRevert();
        wrongImpl.initialize(
            ADMIN,
            IPoolManager(manager),
            IHelixOracle(address(oracle)),
            HelixHook.Config({
                initialFee: 3_000,
                maxReflexFeeDelta: 6_000,
                evolutionStepUp: 1_000,
                evolutionStepDown: 500,
                reflexThresholdBps: 200,
                healthyThresholdBps: 50,
                evolutionThresholdBps: 300,
                reflexFeeMultiplierBps: 1_000,
                evolutionCadence: 3,
                maxOracleAge: 1 hours
            })
        );
    }

    function test_nonManager_beforeSwap_reverts() public {
        vm.expectRevert(HelixHook.UnauthorizedCaller.selector);
        hook.beforeSwap(address(this), key, SwapParams({zeroForOne: true, amountSpecified: -1, sqrtPriceLimitX96: SQRT_PRICE_1_2}), ZERO_BYTES);
    }

    function test_liveSwapExecutor_settlesExactInputAndTriggersReflex() public {
        HelixSwapExecutor executor = new HelixSwapExecutor(IPoolManager(manager), address(this));
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(executor), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(executor), type(uint256).max);

        oracle.setPrice(0.90e18);
        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: -100, sqrtPriceLimitX96: SQRT_PRICE_1_2});

        vm.recordLogs();
        executor.exactInput(key, params, 100, 1);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 reflexSig = keccak256("ReflexFeeQuoted(bytes32,uint24,uint24,uint256,bytes32,uint256,uint256)");
        bool sawReflex = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(hook) && logs[i].topics[0] == reflexSig) {
                sawReflex = true;
            }
        }

        assertTrue(sawReflex);
        assertGt(hook.currentToxicFlowScore(key), 0);
    }
}
