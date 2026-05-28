// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {HelixFlapProxyHook} from "../src/HelixFlapProxyHook.sol";
import {Deployers} from "v4-core/test/utils/Deployers.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";

contract HelixFlapProxyHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    HelixFlapProxyHook proxyHook;

    uint160 internal constant HELIX_FLAGS = Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;
    address internal constant ADMIN = address(0xBEEF);

    HelixFlapProxyHook.Config internal cfg = HelixFlapProxyHook.Config({
        launchFee: 50_000,        // 5.00%
        baselineFee: 5_000,       //  0.50%
        decayBlocks: 1_000,
        reflexFeeDelta: 5_000,    // +0.50%
        swapSizeReflexBps: 500    // 5% of liquidity triggers reflex
    });

    function setUp() public {
        address hookAddr = address(uint160((uint256(type(uint160).max) & clearAllHookPermissionsMask) | HELIX_FLAGS));
        HelixFlapProxyHook impl = new HelixFlapProxyHook();
        vm.etch(hookAddr, address(impl).code);
        proxyHook = HelixFlapProxyHook(hookAddr);

        deployFreshManagerAndRouters();
        proxyHook.initialize(ADMIN, IPoolManager(manager), cfg);

        deployMintAndApprove2Currencies();
        (key,) = initPoolAndAddLiquidity(
            currency0, currency1, IHooks(address(proxyHook)), LPFeeLibrary.DYNAMIC_FEE_FLAG, SQRT_PRICE_1_1
        );
    }

    function test_afterInitialize_setsLaunchFee() public view {
        (, , , uint24 lpFee) = manager.getSlot0(key.toId());
        assertEq(lpFee, cfg.launchFee);
    }

    function test_currentBaselineFee_decaysLinearly() public {
        assertEq(proxyHook.currentBaselineFee(key), cfg.launchFee);

        vm.roll(block.number + 500);                                  // halfway through decay
        uint24 expectedHalf = cfg.launchFee - (cfg.launchFee - cfg.baselineFee) / 2;
        assertEq(proxyHook.currentBaselineFee(key), expectedHalf);

        vm.roll(block.number + 500);                                  // end of decay window
        assertEq(proxyHook.currentBaselineFee(key), cfg.baselineFee);

        vm.roll(block.number + 10_000);                               // long after decay
        assertEq(proxyHook.currentBaselineFee(key), cfg.baselineFee);
    }

    function test_beforeSwap_smallSwap_quotesLaunchBaseline() public {
        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: -1, sqrtPriceLimitX96: SQRT_PRICE_1_2});

        uint24 observedFee = _swapAndCaptureFee(params);

        // Block 1 of decay -- baseline still essentially launchFee. Allow a tolerance of 100 (0.01%).
        assertApproxEqAbs(uint256(observedFee), uint256(cfg.launchFee), 100);
    }

    function test_beforeSwap_largeSwap_triggersReflex() public {
        uint128 liquidity = manager.getLiquidity(key.toId());
        // Force size > 5% of liquidity to trip swapSizeReflexBps=500.
        int256 oversizedSwap = -int256(uint256(liquidity) / 10);      // 10% of liquidity

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: oversizedSwap, sqrtPriceLimitX96: SQRT_PRICE_1_2});

        uint24 observedFee = _swapAndCaptureFee(params);

        // Expected: baseline (~launchFee at block 1) + reflexFeeDelta.
        uint24 baseline = proxyHook.currentBaselineFee(key);
        assertEq(observedFee, baseline + cfg.reflexFeeDelta);
    }

    function test_beforeSwap_afterDecay_smallSwap_quotesBaselineOnly() public {
        vm.roll(block.number + cfg.decayBlocks);                      // decay fully elapsed

        SwapParams memory params = SwapParams({zeroForOne: true, amountSpecified: -1, sqrtPriceLimitX96: SQRT_PRICE_1_2});

        uint24 observedFee = _swapAndCaptureFee(params);
        assertEq(observedFee, cfg.baselineFee);
    }

    function test_afterSwap_countersIncrement() public {
        PoolSwapTest.TestSettings memory settings = PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});
        SwapParams memory small = SwapParams({zeroForOne: true, amountSpecified: -1, sqrtPriceLimitX96: SQRT_PRICE_1_2});
        swapRouter.swap(key, small, settings, ZERO_BYTES);

        (, , uint32 totalSwaps, uint32 reflexCount, ) = _readPoolState(key.toId());
        assertEq(totalSwaps, 1);
        assertEq(reflexCount, 0);

        uint128 liquidity = manager.getLiquidity(key.toId());
        int256 oversizedSwap = -int256(uint256(liquidity) / 10);
        SwapParams memory big = SwapParams({zeroForOne: true, amountSpecified: oversizedSwap, sqrtPriceLimitX96: SQRT_PRICE_1_2});
        swapRouter.swap(key, big, settings, ZERO_BYTES);

        (, , totalSwaps, reflexCount, ) = _readPoolState(key.toId());
        assertEq(totalSwaps, 2);
        assertEq(reflexCount, 1);
    }

    function test_initialize_rejectsBadConfig() public {
        HelixFlapProxyHook freshImpl = new HelixFlapProxyHook();
        address freshAddr = address(uint160((uint256(type(uint160).max) & clearAllHookPermissionsMask) | HELIX_FLAGS) - 1 << 16);
        vm.etch(freshAddr, address(freshImpl).code);
        HelixFlapProxyHook fresh = HelixFlapProxyHook(freshAddr);

        HelixFlapProxyHook.Config memory bad = cfg;
        bad.baselineFee = bad.launchFee + 1;                          // baseline > launch
        vm.expectRevert(HelixFlapProxyHook.InvalidConfig.selector);
        fresh.initialize(ADMIN, IPoolManager(manager), bad);
    }

    function test_setConfig_onlyAdmin() public {
        HelixFlapProxyHook.Config memory next = cfg;
        next.baselineFee = 1_000;

        vm.expectRevert();
        proxyHook.setConfig(next);

        vm.prank(ADMIN);
        proxyHook.setConfig(next);
        assertEq(proxyHook.currentBaselineFee(key), cfg.launchFee);   // still in launch window; baseline change only affects post-decay
    }

    // ---- helpers ----

    function _swapAndCaptureFee(SwapParams memory params) internal returns (uint24 observedFee) {
        vm.recordLogs();
        swapRouter.swap(key, params, PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), ZERO_BYTES);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 swapSig = keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(manager) && logs[i].topics[0] == swapSig) {
                (, , , , , observedFee) = abi.decode(logs[i].data, (int128, int128, uint160, uint128, int24, uint24));
            }
        }
    }

    function _readPoolState(PoolId poolId)
        internal
        view
        returns (uint64 initBlock, uint24 lastQuotedFee, uint32 totalSwaps, uint32 reflexCount, bool init_)
    {
        (initBlock, lastQuotedFee, totalSwaps, reflexCount, init_) = proxyHook.poolState(poolId);
    }
}
