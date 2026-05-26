// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";

contract HelixLiquiditySeeder is IUnlockCallback {
    using CurrencyLibrary for Currency;
    using BalanceDeltaLibrary for BalanceDelta;

    error NotOwner();
    error NotPoolManager();
    error SlippageExceeded();
    error NativeTransferFailed();

    struct SeedParams {
        address payer;
        PoolKey key;
        ModifyLiquidityParams params;
        uint256 maxAmount0;
        uint256 maxAmount1;
    }

    IPoolManager public immutable MANAGER;
    address public immutable OWNER;

    constructor(IPoolManager manager_, address owner_) {
        MANAGER = manager_;
        OWNER = owner_;
    }

    receive() external payable {}

    function seed(PoolKey calldata key, ModifyLiquidityParams calldata params, uint256 maxAmount0, uint256 maxAmount1)
        external
        payable
        returns (BalanceDelta delta)
    {
        if (msg.sender != OWNER) revert NotOwner();

        delta = abi.decode(
            MANAGER.unlock(
                abi.encode(
                    SeedParams({
                        payer: msg.sender,
                        key: key,
                        params: params,
                        maxAmount0: maxAmount0,
                        maxAmount1: maxAmount1
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

        SeedParams memory data = abi.decode(rawData, (SeedParams));
        (BalanceDelta delta,) = MANAGER.modifyLiquidity(data.key, data.params, "");

        _settleIfNeeded(data.key.currency0, data.payer, delta.amount0(), data.maxAmount0);
        _settleIfNeeded(data.key.currency1, data.payer, delta.amount1(), data.maxAmount1);

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

    function _settleIfNeeded(Currency currency, address payer, int128 signedDelta, uint256 maxAmount) internal {
        if (signedDelta >= 0) return;

        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 amount = uint256(uint128(-signedDelta));
        if (amount > maxAmount) revert SlippageExceeded();

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

    function _sendNative(address recipient, uint256 amount) internal {
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert NativeTransferFailed();
    }
}
