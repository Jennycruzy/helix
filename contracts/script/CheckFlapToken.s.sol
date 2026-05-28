// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";

interface IERC20Meta {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
}

// Read-only Flap-token sanity check on X Layer mainnet.
// Usage:
//   forge script script/CheckFlapToken.s.sol:CheckFlapToken \
//     --rpc-url https://rpc.xlayer.tech \
//     --sig "run(address,address)" \
//     <flapToken> <deployer>
//
// Defaults (no args) match the SKILL / ClawHub Flap token + the current HELIX deployer.
contract CheckFlapToken is Script {
    address internal constant DEFAULT_SKILL = 0xED06d48a87F8B8b3E78AFD7DD59717A3f7317777;
    address internal constant DEFAULT_DEPLOYER = 0x0Ac6bf160e208e67AF06d7F00c92AEfBbf089f95;

    function run() external view {
        _check(DEFAULT_SKILL, DEFAULT_DEPLOYER);
    }

    // Use with --sig "runFor(address,address)" <flapToken> <deployer> to check
    // a different token or wallet.
    function runFor(address flapToken, address deployer) external view {
        _check(flapToken, deployer);
    }

    function _check(address flapToken, address deployer) internal view {
        console2.log("=== HELIX Flap-token check (read-only) ===");
        console2.log("Flap token", flapToken);
        console2.log("Deployer wallet", deployer);

        require(flapToken.code.length > 0, "FLAP_TOKEN_NOT_DEPLOYED");

        IERC20Meta token = IERC20Meta(flapToken);
        string memory name = token.name();
        string memory symbol = token.symbol();
        uint8 decimals = token.decimals();
        uint256 supply = token.totalSupply();
        uint256 deployerBalance = IERC20Minimal(flapToken).balanceOf(deployer);
        uint256 deployerOkb = deployer.balance;

        console2.log("name", name);
        console2.log("symbol", symbol);
        console2.log("decimals", decimals);
        console2.log("totalSupply (raw)", supply);
        console2.log("deployer balance (raw)", deployerBalance);
        console2.log("deployer OKB balance (wei)", deployerOkb);

        // Honest gating: this script does NOT recommend creating a pool unless
        // the deployer has SKILL to seed and at least ~0.05 OKB for gas.
        if (deployerBalance == 0) {
            console2.log("STATUS: WAITING_FOR_TOKEN_BALANCE");
            console2.log("Deployer holds 0 of the Flap token. Cannot seed a real pool yet.");
        } else if (deployerOkb < 0.005 ether) {
            console2.log("STATUS: WAITING_FOR_OKB_GAS");
            console2.log("Deployer OKB below the 0.005 OKB safety floor for pool init + tiny-liquidity seed.");
        } else {
            console2.log("STATUS: READY_FOR_DRY_RUN");
        }

        console2.log("NOTE: This script never broadcasts; it only reads chain state.");
    }
}
