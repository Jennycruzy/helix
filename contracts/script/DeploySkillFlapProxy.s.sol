// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {HelixFlapProxyHook} from "../src/HelixFlapProxyHook.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";

interface IERC20Meta {
    function balanceOf(address) external view returns (uint256);
}

/// @notice Deploys the HelixFlapProxyHook to X Layer mainnet and initialises a
///         NEW SKILL/OKB Uniswap v4 pool with the hook attached + dynamic-fee
///         flag enabled. The previously-initialised hookless pool is left
///         untouched (Uniswap v4 pools are immutable, so a fresh PoolKey is
///         required to add hooks).
///
/// Liquidity seeding is NOT performed here -- the SKILL token still enforces
/// the "transfers to/from pools are restricted in BondingCurve state"
/// restriction. Once SKILL graduates from the Flap bonding curve, the existing
/// SeedFlapHelixPool script can be pointed at this new poolKey.
///
/// Usage (dry-run, no funds):
///   forge script contracts/script/DeploySkillFlapProxy.s.sol:DeploySkillFlapProxy \
///     --rpc-url https://rpc.xlayer.tech -vvv
///
/// Usage (mainnet broadcast):
///   DEPLOYER_PRIVATE_KEY=... INITIAL_SQRT_PRICE_X96=<wei> \
///   forge script contracts/script/DeploySkillFlapProxy.s.sol:DeploySkillFlapProxy \
///     --rpc-url https://rpc.xlayer.tech --broadcast -vvv
contract DeploySkillFlapProxy is Script {
    using PoolIdLibrary for PoolKey;

    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint160 internal constant HOOK_FLAGS =
        Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;

    address internal constant DEFAULT_SKILL = 0xED06d48a87F8B8b3E78AFD7DD59717A3f7317777;
    address internal constant DEFAULT_POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;

    function run() external {
        uint256 pk = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        address deployer = pk != 0 ? vm.addr(pk) : vm.envOr("DEPLOYER_ADDRESS", address(0));

        address skill = vm.envOr("XLAYER_FLAP_TOKEN", DEFAULT_SKILL);
        address poolMgrAddr = vm.envOr("XLAYER_POOL_MANAGER", DEFAULT_POOL_MANAGER);
        IPoolManager manager = IPoolManager(poolMgrAddr);
        uint160 sqrtPriceX96 = uint160(vm.envOr("INITIAL_SQRT_PRICE_X96", uint256(0)));

        HelixFlapProxyHook.Config memory cfg = HelixFlapProxyHook.Config({
            launchFee: uint24(vm.envOr("PROXY_LAUNCH_FEE", uint256(50_000))),       // 5.00%
            baselineFee: uint24(vm.envOr("PROXY_BASELINE_FEE", uint256(5_000))),    // 0.50%
            decayBlocks: uint32(vm.envOr("PROXY_DECAY_BLOCKS", uint256(20_000))),
            reflexFeeDelta: uint24(vm.envOr("PROXY_REFLEX_DELTA", uint256(5_000))), // +0.50%
            swapSizeReflexBps: uint16(vm.envOr("PROXY_SWAP_SIZE_REFLEX_BPS", uint256(500))) // 5% of liquidity
        });

        console2.log("=== HELIX Flap Launch Protection Proxy -- mainnet deploy ===");
        console2.log("WARNING: BROADCAST MODE SPENDS REAL OKB ON X LAYER MAINNET");
        console2.log("PoolManager", poolMgrAddr);
        console2.log("SKILL token", skill);
        console2.log("Deployer", deployer);
        if (deployer != address(0)) {
            console2.log("Deployer OKB balance (wei)", deployer.balance);
            console2.log("Deployer SKILL balance (raw)", IERC20Meta(skill).balanceOf(deployer));
        }
        console2.log("Config.launchFee (1e6 units)", uint256(cfg.launchFee));
        console2.log("Config.baselineFee (1e6 units)", uint256(cfg.baselineFee));
        console2.log("Config.decayBlocks", uint256(cfg.decayBlocks));
        console2.log("Config.reflexFeeDelta (1e6 units)", uint256(cfg.reflexFeeDelta));
        console2.log("Config.swapSizeReflexBps", uint256(cfg.swapSizeReflexBps));

        require(skill != address(0), "SKILL_ZERO");
        require(skill.code.length > 0, "SKILL_NOT_DEPLOYED");

        bytes memory hookInitCode = type(HelixFlapProxyHook).creationCode;
        (bytes32 salt, address hookAddress) = _mineHookAddress(hookInitCode);
        console2.log("Hook salt");
        console2.logBytes32(salt);
        console2.log("Hook address (predicted)", hookAddress);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(skill),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddress)
        });
        PoolId poolId = key.toId();
        console2.log("Computed poolId");
        console2.logBytes32(PoolId.unwrap(poolId));

        if (sqrtPriceX96 == 0) {
            console2.log("STATUS: DRY_RUN -- no INITIAL_SQRT_PRICE_X96 provided. Will not broadcast.");
            return;
        }
        if (deployer == address(0)) {
            console2.log("STATUS: DRY_RUN -- no DEPLOYER_PRIVATE_KEY/DEPLOYER_ADDRESS. Will not broadcast.");
            return;
        }
        if (deployer.balance < 0.005 ether) {
            console2.log("STATUS: BLOCKED -- deployer OKB balance below 0.005 OKB safety floor.");
            return;
        }

        vm.startBroadcast(pk);

        HelixFlapProxyHook hook = HelixFlapProxyHook(_deployCreate2(salt, hookInitCode));
        require(address(hook) == hookAddress, "HOOK_ADDR_MISMATCH");
        hook.initialize(deployer, manager, cfg);

        int24 tick = manager.initialize(key, sqrtPriceX96);

        vm.stopBroadcast();

        console2.log("Hook deployed at", address(hook));
        console2.log("Pool initialized at tick", tick);
        console2.log("Done. Pool is dynamic-fee with the proxy hook attached.");
        console2.log("Seeding is still blocked by SKILL bonding-curve transfer restriction.");
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
}
