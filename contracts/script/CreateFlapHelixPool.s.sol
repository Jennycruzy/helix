// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";

interface IERC20Meta {
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
}

// Initializes a SKILL/OKB Uniswap v4 pool on X Layer mainnet in "Flap Launch
// Protection -- pool-ready mode": fee=STATIC_FEE (default 3000 = 0.30%),
// tickSpacing=60, no hook attached.
//
// Why no hook?
//   The existing HELIX hook is hardwired to the TokenDecimalsChainlinkRatioOracle
//   that returns the OKB/USDT ratio for any poolKey. Attaching it to a SKILL
//   pool would feed an OKB-priced reference into reflex/evolution decisions,
//   producing meaningless signals for SKILL. Per the project's no-fake-oracle
//   rule, this script initializes the SKILL pool WITHOUT the HELIX hook. A
//   purpose-built proxy-mode hook can be attached later in a separate script.
//
// Why static fee?
//   Uniswap v4 PoolManager rejects DYNAMIC_FEE_FLAG when hooks==address(0),
//   because dynamic-fee pools require a hook to call updateDynamicLPFee. With
//   no hook attached, we must use a fixed fee. 3000 (0.30%) mirrors the
//   conservative starting fee used on OKB/USDT0.
//
// Safety:
//   forge script defaults to simulation; this script ONLY broadcasts when
//   --broadcast is passed AND the deployer has > 0.005 OKB for gas. Pool
//   initialize on X Layer is a single tx of ~150-300k gas, so 0.005 OKB
//   leaves comfortable headroom without eating the deployer's whole balance.
//
// Usage (dry-run, no funds):
//   forge script contracts/script/CreateFlapHelixPool.s.sol:CreateFlapHelixPool \
//     --rpc-url https://rpc.xlayer.tech -vvv
//
// Usage (mainnet, spends real OKB):
//   DEPLOYER_PRIVATE_KEY=... INITIAL_PRICE_SKILL_PER_OKB=<wei18> \
//   forge script contracts/script/CreateFlapHelixPool.s.sol:CreateFlapHelixPool \
//     --rpc-url https://rpc.xlayer.tech --broadcast -vvv
contract CreateFlapHelixPool is Script {
    using PoolIdLibrary for PoolKey;

    address internal constant DEFAULT_SKILL = 0xED06d48a87F8B8b3E78AFD7DD59717A3f7317777;
    address internal constant DEFAULT_POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;

    function run() external {
        address deployer = vm.envOr("DEPLOYER_ADDRESS", address(0));
        uint256 pk = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (deployer == address(0) && pk != 0) deployer = vm.addr(pk);

        address skill = vm.envOr("XLAYER_FLAP_TOKEN", DEFAULT_SKILL);
        address poolMgrAddr = vm.envOr("XLAYER_POOL_MANAGER", DEFAULT_POOL_MANAGER);
        IPoolManager manager = IPoolManager(poolMgrAddr);
        // Static fee in hundredths-of-a-bip (3000 = 0.30%). Must be < 1_000_000.
        uint24 staticFee = uint24(vm.envOr("FLAP_STATIC_FEE", uint256(3000)));

        // Initial sqrtPriceX96 -- must be supplied. We do NOT pick one for you,
        // because guessing a SKILL/OKB price could place the pool far from
        // market and waste seed liquidity to arbs.
        uint160 sqrtPriceX96 = uint160(vm.envOr("INITIAL_SQRT_PRICE_X96", uint256(0)));

        console2.log("=== HELIX Flap-token pool init (Option A: pool-ready mode) ===");
        console2.log("WARNING: THIS SPENDS REAL OKB ON X LAYER MAINNET WHEN RUN WITH --broadcast");
        console2.log("PoolManager", poolMgrAddr);
        console2.log("SKILL token", skill);
        console2.log("Deployer", deployer);
        if (deployer != address(0)) {
            console2.log("Deployer OKB balance (wei)", deployer.balance);
            console2.log("Deployer SKILL balance (raw)", IERC20Meta(skill).balanceOf(deployer));
        }

        require(skill != address(0), "SKILL_ZERO");
        require(skill.code.length > 0, "SKILL_NOT_DEPLOYED");

        // currency0 must be the lower-sorted address. OKB = address(0) sorts
        // below any erc20.
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)), // OKB native
            currency1: Currency.wrap(skill),
            fee: staticFee, // STATIC fee; see comment at top of file
            tickSpacing: 60,
            hooks: IHooks(address(0)) // NO HOOK -- see comment at top of file
        });
        PoolId poolId = key.toId();
        console2.log("Computed poolId");
        console2.logBytes32(PoolId.unwrap(poolId));

        if (sqrtPriceX96 == 0) {
            console2.log("STATUS: DRY_RUN -- no INITIAL_SQRT_PRICE_X96 provided. Will not broadcast.");
            console2.log("Set INITIAL_SQRT_PRICE_X96 to an honestly-derived starting price before --broadcast.");
            return;
        }
        if (deployer == address(0)) {
            console2.log("STATUS: DRY_RUN -- no DEPLOYER_PRIVATE_KEY/DEPLOYER_ADDRESS. Will not broadcast.");
            return;
        }
        if (deployer.balance < 0.005 ether) {
            console2.log("STATUS: BLOCKED -- deployer OKB balance below 0.005 OKB safety floor.");
            console2.log("Refusing to broadcast; fund the deployer with more OKB first.");
            return;
        }

        vm.startBroadcast(pk);
        int24 tick = manager.initialize(key, sqrtPriceX96);
        vm.stopBroadcast();

        console2.log("Initialized SKILL/OKB pool at tick", tick);
        console2.log("Pool is in Option A 'pool-ready mode': no HELIX hook attached, static fee.");
        console2.log("Static fee (1e6 units):");
        console2.log(uint256(staticFee));
        console2.log("Dashboard will display Flap Launch Protection Proxy Mode status.");
    }
}
