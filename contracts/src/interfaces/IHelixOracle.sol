// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

interface IHelixOracle {
    function read(PoolKey calldata key) external view returns (uint256 priceE18, uint256 updatedAt);
}

