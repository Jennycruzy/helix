// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {IHelixOracle} from "../interfaces/IHelixOracle.sol";
import {IChainlinkAggregatorV3} from "../interfaces/IChainlinkAggregatorV3.sol";

contract TokenDecimalsChainlinkRatioOracle is IHelixOracle {
    error InvalidOracleAnswer();
    error IncompleteRound();

    IChainlinkAggregatorV3 public immutable BASE_FEED;
    IChainlinkAggregatorV3 public immutable QUOTE_FEED;
    uint8 public immutable BASE_FEED_DECIMALS;
    uint8 public immutable QUOTE_FEED_DECIMALS;
    uint8 public immutable BASE_TOKEN_DECIMALS;
    uint8 public immutable QUOTE_TOKEN_DECIMALS;

    constructor(
        IChainlinkAggregatorV3 baseFeed_,
        IChainlinkAggregatorV3 quoteFeed_,
        uint8 baseTokenDecimals_,
        uint8 quoteTokenDecimals_
    ) {
        BASE_FEED = baseFeed_;
        QUOTE_FEED = quoteFeed_;
        BASE_FEED_DECIMALS = baseFeed_.decimals();
        QUOTE_FEED_DECIMALS = quoteFeed_.decimals();
        BASE_TOKEN_DECIMALS = baseTokenDecimals_;
        QUOTE_TOKEN_DECIMALS = quoteTokenDecimals_;
    }

    function read(PoolKey calldata) external view returns (uint256 priceE18, uint256 updatedAt) {
        (, int256 baseAnswer,, uint256 baseUpdatedAt, uint80 baseAnsweredInRound) = BASE_FEED.latestRoundData();
        (, int256 quoteAnswer,, uint256 quoteUpdatedAt, uint80 quoteAnsweredInRound) = QUOTE_FEED.latestRoundData();

        if (baseAnswer <= 0 || quoteAnswer <= 0) revert InvalidOracleAnswer();
        if (baseAnsweredInRound == 0 || quoteAnsweredInRound == 0) revert IncompleteRound();

        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 baseScaled = _scale(uint256(baseAnswer), BASE_FEED_DECIMALS);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 quoteScaled = _scale(uint256(quoteAnswer), QUOTE_FEED_DECIMALS);
        uint256 humanRatioE18 = FullMath.mulDiv(baseScaled, 1e18, quoteScaled);

        priceE18 = _toRawPoolPriceE18(humanRatioE18);
        updatedAt = baseUpdatedAt < quoteUpdatedAt ? baseUpdatedAt : quoteUpdatedAt;
    }

    function _toRawPoolPriceE18(uint256 humanRatioE18) internal view returns (uint256) {
        if (BASE_TOKEN_DECIMALS >= QUOTE_TOKEN_DECIMALS) {
            return humanRatioE18 / (10 ** (BASE_TOKEN_DECIMALS - QUOTE_TOKEN_DECIMALS));
        }
        return humanRatioE18 * (10 ** (QUOTE_TOKEN_DECIMALS - BASE_TOKEN_DECIMALS));
    }

    function _scale(uint256 answer, uint8 decimals_) internal pure returns (uint256) {
        if (decimals_ == 18) return answer;
        if (decimals_ < 18) return answer * (10 ** (18 - decimals_));
        return answer / (10 ** (decimals_ - 18));
    }
}

