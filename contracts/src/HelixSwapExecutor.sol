// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";

contract HelixSwapExecutor is IUnlockCallback {
    using CurrencyLibrary for Currency;
    using BalanceDeltaLibrary for BalanceDelta;

    error NotOwner();
    error NotPoolManager();
    error SlippageExceeded();
    error NativeTransferFailed();

    struct ExactInputParams {
        address payer;
        PoolKey key;
        SwapParams swap;
        uint256 maxInput;
        uint256 minOutput;
    }

    IPoolManager public immutable MANAGER;
    address public immutable OWNER;

    constructor(IPoolManager manager_, address owner_) {
        MANAGER = manager_;
        OWNER = owner_;
    }

    receive() external payable {}

    function exactInput(PoolKey calldata key, SwapParams calldata swap, uint256 maxInput, uint256 minOutput)
        external
        payable
        returns (BalanceDelta delta)
    {
        if (msg.sender != OWNER) revert NotOwner();
        if (swap.amountSpecified >= 0) revert SlippageExceeded();

        delta = abi.decode(
            MANAGER.unlock(
                abi.encode(
                    ExactInputParams({
                        payer: msg.sender,
                        key: key,
                        swap: swap,
                        maxInput: maxInput,
                        minOutput: minOutput
                    })
                )
            ),
            (BalanceDelta)
        );

        uint256 refund = address(this).balance;
        if (refund != 0) _sendNative(OWNER, refund);
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(MANAGER)) revert NotPoolManager();

        ExactInputParams memory data = abi.decode(rawData, (ExactInputParams));
        BalanceDelta delta = MANAGER.swap(data.key, data.swap, "");

        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();

        if (amount0 < 0) {
            _settle(data.key.currency0, data.payer, _abs(amount0), data.maxInput);
        } else if (amount0 > 0) {
            _take(data.key.currency0, data.payer, _positive(amount0), data.minOutput);
        }

        if (amount1 < 0) {
            _settle(data.key.currency1, data.payer, _abs(amount1), data.maxInput);
        } else if (amount1 > 0) {
            _take(data.key.currency1, data.payer, _positive(amount1), data.minOutput);
        }

        return abi.encode(delta);
    }

    function rescueToken(address token, uint256 amount) external {
        if (msg.sender != OWNER) revert NotOwner();
        require(IERC20Minimal(token).transfer(OWNER, amount), "TOKEN_RESCUE_FAILED");
    }

    function rescueNative(uint256 amount) external {
        if (msg.sender != OWNER) revert NotOwner();
        _sendNative(OWNER, amount);
    }

    function _settle(Currency currency, address payer, uint256 amount, uint256 maxInput) internal {
        if (amount > maxInput) revert SlippageExceeded();

        if (currency.isAddressZero()) {
            MANAGER.settle{value: amount}();
        } else {
            MANAGER.sync(currency);
            require(
                IERC20Minimal(Currency.unwrap(currency)).transferFrom(payer, address(MANAGER), amount),
                "TOKEN_SETTLE_FAILED"
            );
            MANAGER.settle();
        }
    }

    function _take(Currency currency, address recipient, uint256 amount, uint256 minOutput) internal {
        if (amount < minOutput) revert SlippageExceeded();
        MANAGER.take(currency, recipient, amount);
    }

    function _abs(int128 amount) internal pure returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(uint128(-amount));
    }

    function _positive(int128 amount) internal pure returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(uint128(amount));
    }

    function _sendNative(address recipient, uint256 amount) internal {
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert NativeTransferFailed();
    }
}
