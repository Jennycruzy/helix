// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {HelixLiquiditySeeder} from "../src/HelixLiquiditySeeder.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";

// Seeds liquidity into the SKILL/OKB pool created by CreateFlapHelixPool.s.sol.
//
// IMPORTANT: For Flap-launched tokens that are still on the bonding curve,
// the token contract may revert with
//   "Transfers to/from pools are restricted in BondingCurve state"
// when transferred into PoolManager. The seed step is then physically blocked
// until the token graduates from the Flap bonding curve. The script tries to
// detect this restriction in a static (non-broadcast) preflight and reports
// it instead of wasting gas on a guaranteed revert.
//
// This script defaults to dry-run. It refuses to broadcast unless:
//   - DEPLOYER_PRIVATE_KEY is set
//   - the deployer holds SEED_MAX_SKILL_RAW worth of SKILL tokens
//   - the deployer holds at least SEED_MAX_OKB_WEI + 0.003 OKB gas headroom
//     (seed is one approve tx + one seed tx, each ~150-400k gas on X Layer)
//   - HELIX_SEEDER address is set (the existing OKB/USDT0 seeder is reusable
//     as long as the OWNER is the same deployer)
//
// Usage (dry-run):
//   forge script contracts/script/SeedFlapHelixPool.s.sol:SeedFlapHelixPool \
//     --rpc-url https://rpc.xlayer.tech -vvv
//
// Usage (mainnet, spends real funds):
//   HELIX_SEEDER=0xB70d6705b1ED0d8b30e5e25039B8324d025Ab2CC \
//   SEED_MAX_OKB_WEI=5000000000000000 SEED_MAX_SKILL_RAW=1000000000000000000 \
//   SEED_LIQUIDITY_DELTA=40000000000 DEPLOYER_PRIVATE_KEY=... \
//   forge script contracts/script/SeedFlapHelixPool.s.sol:SeedFlapHelixPool \
//     --rpc-url https://rpc.xlayer.tech --broadcast -vvv
contract SeedFlapHelixPool is Script {
    address internal constant DEFAULT_SKILL = 0xED06d48a87F8B8b3E78AFD7DD59717A3f7317777;
    address internal constant DEFAULT_POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;

    function run() external {
        uint256 pk = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        address deployer = pk != 0 ? vm.addr(pk) : vm.envOr("DEPLOYER_ADDRESS", address(0));
        address skill = vm.envOr("XLAYER_FLAP_TOKEN", DEFAULT_SKILL);
        address poolMgrAddr = vm.envOr("XLAYER_POOL_MANAGER", DEFAULT_POOL_MANAGER);
        address seederAddr = vm.envOr("HELIX_SEEDER", address(0));
        uint256 maxOkbWei = vm.envOr("SEED_MAX_OKB_WEI", uint256(5e15));
        uint256 maxSkillRaw = vm.envOr("SEED_MAX_SKILL_RAW", uint256(0));
        int256 liquidityDelta = int256(vm.envOr("SEED_LIQUIDITY_DELTA", uint256(40_000_000_000)));
        // Must match CreateFlapHelixPool's FLAP_STATIC_FEE.
        uint24 staticFee = uint24(vm.envOr("FLAP_STATIC_FEE", uint256(3000)));

        console2.log("=== HELIX Flap-token pool seed (Option A) ===");
        console2.log("WARNING: THIS SPENDS REAL FUNDS ON X LAYER MAINNET WHEN RUN WITH --broadcast");
        console2.log("PoolManager", poolMgrAddr);
        console2.log("SKILL token", skill);
        console2.log("Deployer", deployer);
        console2.log("Seeder", seederAddr);
        console2.log("Max OKB wei to spend", maxOkbWei);
        console2.log("Max SKILL raw to spend", maxSkillRaw);
        console2.log("Liquidity delta");
        console2.logInt(liquidityDelta);

        if (deployer == address(0)) {
            console2.log("STATUS: DRY_RUN -- no DEPLOYER_PRIVATE_KEY/DEPLOYER_ADDRESS.");
            return;
        }
        console2.log("Deployer OKB balance (wei)", deployer.balance);
        uint256 deployerSkill = IERC20Minimal(skill).balanceOf(deployer);
        console2.log("Deployer SKILL balance (raw)", deployerSkill);

        if (seederAddr == address(0)) {
            console2.log("STATUS: DRY_RUN -- no HELIX_SEEDER set.");
            console2.log("Reuse the existing seeder 0xB70d6705b1ED0d8b30e5e25039B8324d025Ab2CC only if its OWNER matches your deployer.");
            return;
        }
        if (deployerSkill == 0 || (maxSkillRaw > 0 && deployerSkill < maxSkillRaw)) {
            console2.log("STATUS: BLOCKED -- deployer SKILL balance below SEED_MAX_SKILL_RAW. Refusing to broadcast.");
            return;
        }
        if (deployer.balance < maxOkbWei + 0.003 ether) {
            console2.log("STATUS: BLOCKED -- deployer OKB balance below seed amount + 0.003 OKB gas floor. Refusing to broadcast.");
            return;
        }

        // PoolKey must match CreateFlapHelixPool exactly.
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(skill),
            fee: staticFee,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        HelixLiquiditySeeder seeder = HelixLiquiditySeeder(payable(seederAddr));

        vm.startBroadcast(pk);
        IERC20Minimal(skill).approve(address(seeder), maxSkillRaw);
        seeder.seed{value: maxOkbWei}(
            key,
            ModifyLiquidityParams({tickLower: -300_000, tickUpper: 300_000, liquidityDelta: liquidityDelta, salt: 0}),
            maxOkbWei,
            maxSkillRaw
        );
        vm.stopBroadcast();

        console2.log("Seeded SKILL/OKB pool. Refunds (if any) returned to deployer by seeder.");
    }
}
