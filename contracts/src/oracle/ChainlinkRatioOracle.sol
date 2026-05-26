// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {IHelixOracle} from "../interfaces/IHelixOracle.sol";
import {IChainlinkAggregatorV3} from "../interfaces/IChainlinkAggregatorV3.sol";

contract ChainlinkRatioOracle is IHelixOracle {
    error InvalidOracleAnswer();
    error IncompleteRound();

    IChainlinkAggregatorV3 public immutable BASE_FEED;
    IChainlinkAggregatorV3 public immutable QUOTE_FEED;
    uint8 public immutable BASE_DECIMALS;
    uint8 public immutable QUOTE_DECIMALS;

    constructor(IChainlinkAggregatorV3 baseFeed_, IChainlinkAggregatorV3 quoteFeed_) {
        BASE_FEED = baseFeed_;
        QUOTE_FEED = quoteFeed_;
        BASE_DECIMALS = baseFeed_.decimals();
        QUOTE_DECIMALS = quoteFeed_.decimals();
    }

    function read(PoolKey calldata) external view returns (uint256 priceE18, uint256 updatedAt) {
        (, int256 baseAnswer,, uint256 baseUpdatedAt, uint80 baseAnsweredInRound) = BASE_FEED.latestRoundData();
        (, int256 quoteAnswer,, uint256 quoteUpdatedAt, uint80 quoteAnsweredInRound) = QUOTE_FEED.latestRoundData();

        if (baseAnswer <= 0 || quoteAnswer <= 0) revert InvalidOracleAnswer();
        if (baseAnsweredInRound == 0 || quoteAnsweredInRound == 0) revert IncompleteRound();

        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 baseScaled = _scale(uint256(baseAnswer), BASE_DECIMALS);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 quoteScaled = _scale(uint256(quoteAnswer), QUOTE_DECIMALS);
        priceE18 = FullMath.mulDiv(baseScaled, 1e18, quoteScaled);
        updatedAt = baseUpdatedAt < quoteUpdatedAt ? baseUpdatedAt : quoteUpdatedAt;
    }

    function _scale(uint256 answer, uint8 decimals_) internal pure returns (uint256) {
        if (decimals_ == 18) return answer;
        if (decimals_ < 18) return answer * (10 ** (18 - decimals_));
        return answer / (10 ** (decimals_ - 18));
    }
}
