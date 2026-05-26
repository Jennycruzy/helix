// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {HelixSwapExecutor} from "../src/HelixSwapExecutor.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";

contract RunPhase5LiveSwaps is Script {
    uint256 internal constant DEFAULT_OKB_IN_WEI = 50_000_000_000_000;
    uint256 internal constant DEFAULT_USDT0_IN = 5_000;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        IPoolManager poolManager = IPoolManager(vm.envAddress("XLAYER_POOL_MANAGER"));
        address usdt0 = vm.envAddress("XLAYER_USDT0");
        IHooks hook = IHooks(vm.envAddress("HELIX_HOOK"));

        uint256 okbIn = vm.envOr("PHASE5_OKB_IN_WEI", DEFAULT_OKB_IN_WEI);
        uint256 usdt0In = vm.envOr("PHASE5_USDT0_IN", DEFAULT_USDT0_IN);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(usdt0),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: hook
        });

        console2.log("THIS SPENDS REAL FUNDS ON X LAYER MAINNET ONLY WHEN RUN WITH --broadcast");
        console2.log("Deployer", deployer);
        console2.log("Hook", address(hook));
        console2.log("USDT0", usdt0);
        console2.log("OKB per zeroForOne swap wei", okbIn);
        console2.log("USDT0 oneForZero swap raw units", usdt0In);

        vm.startBroadcast(deployerPrivateKey);

        HelixSwapExecutor executor = new HelixSwapExecutor(poolManager, deployer);
        IERC20Minimal(usdt0).approve(address(executor), usdt0In);

        SwapParams memory pushAway = SwapParams({
            zeroForOne: true,
            // forge-lint: disable-next-line(unsafe-typecast)
            amountSpecified: -int256(okbIn),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        executor.exactInput{value: okbIn}(key, pushAway, okbIn, 1);
        executor.exactInput{value: okbIn}(key, pushAway, okbIn, 1);
        executor.exactInput{value: okbIn}(key, pushAway, okbIn, 1);

        SwapParams memory reflex = SwapParams({
            zeroForOne: false,
            // forge-lint: disable-next-line(unsafe-typecast)
            amountSpecified: -int256(usdt0In),
            sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
        });

        executor.exactInput(key, reflex, usdt0In, 1);

        vm.stopBroadcast();

        console2.log("Phase 5 executor", address(executor));
        console2.log("Submitted 3 push-away OKB->USDT0 swaps and 1 toxic USDT0->OKB swap");
    }
}
