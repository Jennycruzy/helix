// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ChainlinkRatioOracle} from "../src/oracle/ChainlinkRatioOracle.sol";
import {MockChainlinkAggregatorV3} from "./mocks/MockChainlinkAggregatorV3.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";

contract ChainlinkRatioOracleTest is Test {
    MockChainlinkAggregatorV3 baseFeed;
    MockChainlinkAggregatorV3 quoteFeed;
    ChainlinkRatioOracle oracle;

    function setUp() public {
        baseFeed = new MockChainlinkAggregatorV3(8, 40e8, 100);
        quoteFeed = new MockChainlinkAggregatorV3(8, 1e8, 120);
        oracle = new ChainlinkRatioOracle(baseFeed, quoteFeed);
    }

    function test_read_returnsRatioScaledTo1e18() public view {
        (uint256 priceE18, uint256 updatedAt) = oracle.read(_dummyKey());
        assertEq(priceE18, 40e18);
        assertEq(updatedAt, 100);
    }

    function test_read_usesOlderUpdateTimestamp() public {
        baseFeed.setRoundData(2, 42e8, 300, 2);
        quoteFeed.setRoundData(2, 1e8, 250, 2);

        (, uint256 updatedAt) = oracle.read(_dummyKey());
        assertEq(updatedAt, 250);
    }

    function test_read_revertsOnZeroAnswer() public {
        quoteFeed.setRoundData(2, 0, 250, 2);
        vm.expectRevert(ChainlinkRatioOracle.InvalidOracleAnswer.selector);
        oracle.read(_dummyKey());
    }

    function test_read_revertsOnIncompleteRound() public {
        quoteFeed.setRoundData(2, 1e8, 250, 0);
        vm.expectRevert(ChainlinkRatioOracle.IncompleteRound.selector);
        oracle.read(_dummyKey());
    }

    function _dummyKey() internal pure returns (PoolKey memory key) {
        key.currency0 = Currency.wrap(address(0x1));
        key.currency1 = Currency.wrap(address(0x2));
        key.fee = 0;
        key.tickSpacing = 60;
        key.hooks = IHooks(address(0));
    }
}
