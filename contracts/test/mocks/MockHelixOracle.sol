// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHelixOracle} from "../../src/interfaces/IHelixOracle.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";

contract MockHelixOracle is IHelixOracle {
    uint256 public priceE18;
    uint256 public updatedAt;
    bool public shouldRevert;

    constructor(uint256 initialPriceE18, uint256 initialUpdatedAt) {
        priceE18 = initialPriceE18;
        updatedAt = initialUpdatedAt;
    }

    function setPrice(uint256 newPriceE18) external {
        priceE18 = newPriceE18;
    }

    function setUpdatedAt(uint256 newUpdatedAt) external {
        updatedAt = newUpdatedAt;
    }

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function read(PoolKey calldata) external view returns (uint256, uint256) {
        if (shouldRevert) revert("MOCK_ORACLE_REVERT");
        return (priceE18, updatedAt);
    }
}

