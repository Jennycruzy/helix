// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {HelixHook} from "../src/HelixHook.sol";
import {ChainlinkRatioOracle} from "../src/oracle/ChainlinkRatioOracle.sol";
import {IChainlinkAggregatorV3} from "../src/interfaces/IChainlinkAggregatorV3.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";

contract DeployXLayerPhase4 is Script {
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint160 internal constant HOOK_FLAGS =
        Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        IPoolManager poolManager = IPoolManager(vm.envAddress("XLAYER_POOL_MANAGER"));
        address usdt = vm.envAddress("XLAYER_USDT");
        IChainlinkAggregatorV3 okbUsd = IChainlinkAggregatorV3(vm.envAddress("CHAINLINK_OKB_USD"));
        IChainlinkAggregatorV3 usdtUsd = IChainlinkAggregatorV3(vm.envAddress("CHAINLINK_USDT_USD"));

        console2.log("THIS SPENDS REAL FUNDS ON X LAYER MAINNET ONLY WHEN RUN WITH --broadcast");
        console2.log("Deployer", deployer);
        console2.log("PoolManager", address(poolManager));
        console2.log("USDT", usdt);
        console2.log("OKB/USD feed", address(okbUsd));
        console2.log("USDT/USD feed", address(usdtUsd));

        bytes memory hookInitCode = type(HelixHook).creationCode;
        (bytes32 salt, address hookAddress) = _mineHookAddress(hookInitCode);
        console2.log("Hook salt");
        console2.logBytes32(salt);
        console2.log("Hook address", hookAddress);

        vm.startBroadcast(deployerPrivateKey);

        ChainlinkRatioOracle oracle = new ChainlinkRatioOracle(okbUsd, usdtUsd);
        HelixHook hook = HelixHook(_deployCreate2(salt, hookInitCode));

        hook.initialize(
            deployer,
            poolManager,
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
            currency1: Currency.wrap(usdt),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        uint160 sqrtPriceX96 = _readSqrtPriceX96(oracle, key);
        poolManager.initialize(key, sqrtPriceX96);

        vm.stopBroadcast();

        console2.log("Oracle deployed", address(oracle));
        console2.log("Hook deployed", address(hook));
        console2.log("Pool initialized with sqrtPriceX96", uint256(sqrtPriceX96));
    }

    function _mineHookAddress(bytes memory initCode) internal pure returns (bytes32 salt, address hookAddress) {
        bytes32 initCodeHash = keccak256(initCode);
        for (uint256 i = 0; i < 1_000_000; i++) {
            salt = bytes32(i);
            hookAddress = address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, salt, initCodeHash))))
            );
            if (uint160(hookAddress) & Hooks.ALL_HOOK_MASK == HOOK_FLAGS) {
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

    function _readSqrtPriceX96(ChainlinkRatioOracle oracle, PoolKey memory key) internal view returns (uint160) {
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
