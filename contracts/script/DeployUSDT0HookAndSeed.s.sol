// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {HelixHook} from "../src/HelixHook.sol";
import {HelixLiquiditySeeder} from "../src/HelixLiquiditySeeder.sol";
import {TokenDecimalsChainlinkRatioOracle} from "../src/oracle/TokenDecimalsChainlinkRatioOracle.sol";
import {IChainlinkAggregatorV3} from "../src/interfaces/IChainlinkAggregatorV3.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";

contract DeployUSDT0HookAndSeed is Script {
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint160 internal constant HOOK_FLAGS =
        Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;

    struct DeployContext {
        address deployer;
        IPoolManager poolManager;
        address usdt0;
        IChainlinkAggregatorV3 okbUsd;
        IChainlinkAggregatorV3 usdtUsd;
        uint256 maxOkb;
        uint256 maxUsdt0;
        int256 liquidityDelta;
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        DeployContext memory ctx = DeployContext({
            deployer: vm.addr(deployerPrivateKey),
            poolManager: IPoolManager(vm.envAddress("XLAYER_POOL_MANAGER")),
            usdt0: vm.envAddress("XLAYER_USDT0"),
            okbUsd: IChainlinkAggregatorV3(vm.envAddress("CHAINLINK_OKB_USD")),
            usdtUsd: IChainlinkAggregatorV3(vm.envAddress("CHAINLINK_USDT_USD")),
            maxOkb: vm.envOr("SEED_MAX_OKB_WEI", uint256(5e15)),
            maxUsdt0: vm.envOr("SEED_MAX_USDT0", uint256(1_000_000)),
            liquidityDelta: int256(vm.envOr("SEED_LIQUIDITY_DELTA", uint256(1e12)))
        });

        bytes memory hookInitCode = type(HelixHook).creationCode;
        (bytes32 salt, address hookAddress) = _mineHookAddress(hookInitCode, 31_000);

        console2.log("THIS SPENDS REAL FUNDS ON X LAYER MAINNET ONLY WHEN RUN WITH --broadcast");
        console2.log("Deployer", ctx.deployer);
        console2.log("USDT0", ctx.usdt0);
        console2.log("USDT0 hook salt");
        console2.logBytes32(salt);
        console2.log("USDT0 hook", hookAddress);

        vm.startBroadcast(deployerPrivateKey);
        (TokenDecimalsChainlinkRatioOracle oracle, HelixHook hook, HelixLiquiditySeeder seeder) =
            _deployAndSeed(ctx, salt, hookInitCode);
        vm.stopBroadcast();

        console2.log("USDT0 oracle", address(oracle));
        console2.log("USDT0 hook deployed", address(hook));
        console2.log("USDT0 seeder", address(seeder));
        console2.log("Seeded liquidityDelta");
        console2.logInt(ctx.liquidityDelta);
    }

    function _deployAndSeed(DeployContext memory ctx, bytes32 salt, bytes memory hookInitCode)
        internal
        returns (TokenDecimalsChainlinkRatioOracle oracle, HelixHook hook, HelixLiquiditySeeder seeder)
    {
        oracle = new TokenDecimalsChainlinkRatioOracle(ctx.okbUsd, ctx.usdtUsd, 18, 6);
        hook = HelixHook(_deployCreate2(salt, hookInitCode));
        hook.initialize(
            ctx.deployer,
            ctx.poolManager,
            oracle,
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
                maxOracleAge: 1 days
            })
        );

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(ctx.usdt0),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        uint160 sqrtPriceX96 = _readSqrtPriceX96(oracle, key);
        int24 tick = ctx.poolManager.initialize(key, sqrtPriceX96);
        console2.log("Initialized OKB/USDT0 pool at tick", tick);

        seeder = new HelixLiquiditySeeder(ctx.poolManager, ctx.deployer);
        IERC20Minimal(ctx.usdt0).approve(address(seeder), ctx.maxUsdt0);
        seeder.seed{value: ctx.maxOkb}(
            key,
            ModifyLiquidityParams({tickLower: -300_000, tickUpper: 300_000, liquidityDelta: ctx.liquidityDelta, salt: 0}),
            ctx.maxOkb,
            ctx.maxUsdt0
        );
    }

    function _mineHookAddress(bytes memory initCode, uint256 start) internal view returns (bytes32 salt, address hookAddress) {
        bytes32 initCodeHash = keccak256(initCode);
        for (uint256 i = start; i < start + 1_000_000; i++) {
            salt = bytes32(i);
            hookAddress = address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, salt, initCodeHash))))
            );
            if ((uint160(hookAddress) & Hooks.ALL_HOOK_MASK == HOOK_FLAGS) && hookAddress.code.length == 0) {
                return (salt, hookAddress);
            }
        }
        revert("HOOK_SALT_NOT_FOUND");
    }

    function _deployCreate2(bytes32 salt, bytes memory initCode) internal returns (address deployed) {
        (bool success, bytes memory result) = CREATE2_DEPLOYER.call(bytes.concat(salt, initCode));
        require(success, "CREATE2_DEPLOY_FAILED");
        require(result.length == 20, "CREATE2_BAD_RETURN");
        // forge-lint: disable-next-line(unsafe-typecast)
        deployed = address(bytes20(result));
    }

    function _readSqrtPriceX96(TokenDecimalsChainlinkRatioOracle oracle, PoolKey memory key) internal view returns (uint160) {
        (uint256 priceE18,) = oracle.read(key);
        uint256 ratioX192 = FullMath.mulDiv(priceE18, 2 ** 192, 1e18);
        return uint160(_sqrt(ratioX192));
    }

    function _sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = x;
        uint256 y = (x + 1) / 2;
        while (y < z) {
            z = y;
            y = (x / y + y) / 2;
        }
    }
}
