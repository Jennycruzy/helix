# VERIFICATION LOG

## Phase 0 — Ground Truth

Date: 2026-05-26

Commands run locally:

```sh
pwd
rg --files /Users/user | head -n 200
mkdir -p /Users/user/helix/docs
ls -ld /Users/user/helix /Users/user/helix/docs
```

Key local output:

```text
/Users/user
drwxr-xr-x  3 user  staff  96 May 26 16:50 /Users/user/helix
drwxr-xr-x  2 user  staff  64 May 26 16:50 /Users/user/helix/docs
```

External verification completed:

- Confirmed Uniswap v4 mainnet deployments on X Layer from Uniswap docs
- Confirmed X Layer RPC, chain ID, gas token, explorer, and verification API from OKX docs
- Confirmed real Chainlink feed contracts on X Layer for `ETH/USD`, `USDC/USD`, `USDT/USD`, `OKB/USD`, and `BTC/USD`
- Confirmed Flap is live on X Layer and documents:
  - X Layer `Portal` deployment
  - token creation events
  - token migration event
  - ABI download path

Blocking product truth discovered:

- Exact oracle-based LVR is straightforward for oracle-covered pairs.
- I found no canonical third-party oracle evidence for arbitrary fresh Flap tokens on X Layer.
- Mainnet pair choice must be confirmed before any spend or implementation assumptions continue.

## Phase 1 — Scaffold + Fork

Date: 2026-05-26

Commands run locally:

```sh
forge --version
anvil --version
node --version
npm --version
mkdir -p /Users/user/helix/contracts /Users/user/helix/frontend /Users/user/helix/script /Users/user/helix/deployments /Users/user/helix/docs/demo
forge init /Users/user/helix/contracts --no-git --force
npm create vite@latest /Users/user/helix/frontend -- --template react-ts
npm install
forge build
source /Users/user/helix/.env && anvil --fork-url $XLAYER_RPC_URL --port $ANVIL_FORK_PORT
cast block-number --rpc-url http://127.0.0.1:8545
curl -s -X POST http://127.0.0.1:8545 -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
npm run build
```

Key outputs:

```text
forge Version: 1.5.1-stable
anvil Version: 1.5.1-stable
node v20.20.2
npm 10.8.2
```

```text
Installed forge-std
Initialized forge project
```

```text
Compiling 23 files with Solc 0.8.33
Solc 0.8.33 finished in 2.38s
Compiler run successful!
```

Anvil fork startup:

```text
Endpoint:       https://rpc.xlayer.tech
Block number:   61042251
Block hash:     0x8c5a9758b81ea67514a903ceea54002543e180926da53bf96c154c6dcd50d477
Chain ID:       196
Listening on 127.0.0.1:8545
```

`cast block-number` result:

```text
cast crashed in Foundry 1.5.1 on macOS with:
Attempted to create a NULL object.
Location: system-configuration-0.6.1/src/dynamic_store.rs:154
```

Fork verification fallback:

```json
{"jsonrpc":"2.0","id":1,"result":"0x3a36e4b"}
```

Frontend build output:

```text
vite v8.0.14 building client environment for production...
✓ built in 397ms
```

Phase 1 result:

- Contracts scaffolded under `/Users/user/helix/contracts`
- Frontend scaffolded under `/Users/user/helix/frontend`
- Contracts build clean with Foundry
- Frontend production build succeeds
- X Layer fork is live and responding locally
- One local-tool issue discovered: `cast` crashes on this machine, so fork liveness was proven with raw JSON-RPC instead

## Phase 2 — Core Hook (Local + Official v4 Test Harness)

Date: 2026-05-26

Commands run:

```sh
forge install Uniswap/v4-core Uniswap/v4-periphery OpenZeppelin/openzeppelin-contracts --no-git
forge build
forge test --offline --match-contract HelixHookTest -vvv
forge test --offline --match-test test_beforeSwap_toxicFlowQuotesOverrideFee -vvvv
forge test --offline --match-test test_evolution_lowersBaselineFee_onHealthyCadence -vvvv
```

Key results:

```text
forge build
Solc 0.8.26 finished in 18.46s
Compiler run successful!
```

```text
Ran 10 tests for test/HelixHook.t.sol:HelixHookTest
[PASS] test_afterInitialize_setsStartingFee()
[PASS] test_beforeSwap_toxicFlowQuotesOverrideFee()
[PASS] test_evolution_lowersBaselineFee_onHealthyCadence()
[PASS] test_evolution_raisesBaselineFee_afterToxicCadence()
[PASS] test_feeClamp_respectsBounds()
[PASS] test_nonManager_beforeSwap_reverts()
[PASS] test_permissionFlags_matchExpectedAddress()
[PASS] test_permissionValidation_revertsForWrongAddress()
[PASS] test_revertedOracle_skipsAdaptation()
[PASS] test_staleOracle_skipsAdaptation()
Suite result: ok. 10 passed; 0 failed
```

Toxic reflex trace highlights:

```text
previewOverrideFee(...) -> 4197415, 111100, true, true
emit ReflexFeeQuoted(... oldFee: 3000, newFee: 3111, lvrSignal: 111100, reason: REFLEX ...)
emit Swap(... fee: 3111)
```

Healthy evolution-down trace highlights:

```text
emit Swap(... fee: 4000)
PoolManager::updateDynamicLPFee(..., 3500)
emit BaselineFeeUpdated(... oldFee: 4000, newFee: 3500, lvrSignal: 0, reason: EVOLUTION_DOWN ...)
```

Notes:

- The HELIX hook is implemented as a direct `IHooks` contract with strict permission-flag validation.
- The hook is bounded to `MIN_FEE = 500` and `MAX_FEE = 20_000`.
- Foundry on this machine crashes in post-compile network-assisted signature lookup, so all test execution uses `--offline`.

## Phase 3 — Chainlink Adapter

Date: 2026-05-26

Commands run:

```sh
forge test --offline -vvv
```

Key results:

```text
Ran 4 tests for test/ChainlinkRatioOracle.t.sol:ChainlinkRatioOracleTest
[PASS] test_read_returnsRatioScaledTo1e18()
[PASS] test_read_revertsOnIncompleteRound()
[PASS] test_read_revertsOnZeroAnswer()
[PASS] test_read_usesOlderUpdateTimestamp()
Suite result: ok. 4 passed; 0 failed
```

Combined suite:

```text
Ran 2 test suites in 31.63ms (16.45ms CPU time): 14 tests passed, 0 failed, 0 skipped (14 total tests)
```

Notes:

- `ChainlinkRatioOracle` converts two Chainlink feeds into HELIX's `IHelixOracle` ratio format.
- Adapter returns `priceE18` and the older of the two feed timestamps.
- Bad or incomplete rounds revert in the adapter; HELIX treats oracle reverts as a safe skip.

## Phase 4 — X Layer Mainnet Deployment

Date: 2026-05-26

Pre-broadcast checks:

```sh
git push -u origin main
cast wallet address --private-key <redacted>
curl -s -X POST https://rpc.xlayer.tech ... eth_getBalance
curl -s -X POST https://rpc.xlayer.tech ... eth_gasPrice
curl -s -X POST https://rpc.xlayer.tech ... eth_call decimals/symbol/balanceOf
forge build
set -a && source /Users/user/helix/.env && set +a && forge script script/DeployXLayerPhase4.s.sol:DeployXLayerPhase4 --rpc-url http://127.0.0.1:8545 --offline -vvvv
```

Key pre-broadcast output:

```text
To https://github.com/Jennycruzy/helix.git
 * [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
```

```text
Deployer address: 0x0Ac6bf160e208e67AF06d7F00c92AEfBbf089f95
Native balance: 0x2aa1efb94e0000
Gas price: 0x1312d01
USDT balance on 0x1E4a5963aBFD975d8c9021ce480b42188849D41d: 0
USDT balance on 0x779ded0c9e1022225f8e0630b35a9b54be713736: 0
```

Fork dry-run output:

```text
Script ran successfully.
Hook salt: 0x0000000000000000000000000000000000000000000000000000000000007afb
Oracle deployed 0x7Cb64aB50C89B3803d4DcC4E7B7041FE9607Fd23
Hook deployed 0xF08e79cd52b866d8ED91C35c5efBdAd91FF590C0
Pool initialized with sqrtPriceX96 763153869149809453229789624221
Estimated total gas used for script: 4726935
Estimated amount required: 0.000189077404726935 ETH
```

Mainnet broadcast command:

```sh
set -a && source /Users/user/helix/.env && set +a && forge script script/DeployXLayerPhase4.s.sol:DeployXLayerPhase4 --rpc-url https://rpc.xlayer.tech --broadcast --offline -vvvv
```

Mainnet broadcast output:

```text
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
Transactions saved to: /Users/user/helix/contracts/broadcast/DeployXLayerPhase4.s.sol/196/run-latest.json
Estimated amount required: 0.000189081124727028 ETH
```

Mainnet addresses:

```text
Oracle: 0x7Cb64aB50C89B3803d4DcC4E7B7041FE9607Fd23
Hook:   0xF08e79cd52b866d8ED91C35c5efBdAd91FF590C0
PoolId: 0xe6610ae955d149bf40e540c70393361e93a10b790447c7599b4df25750869585
USDT:   0x1E4a5963aBFD975d8c9021ce480b42188849D41d
```

Mainnet tx hashes:

```text
Oracle deploy:   0x7312a5754d9369685a46ccbc5b15b086ab1a867592263210e186272d91f28ae9
Hook deploy:     0x18a95b1d8874df57a4827499b577ca4271bd359882820ff89bc92d0cf66febaf
Hook initialize: 0xa2fb3fe5efc8cf4ba026226f654acf1d37d64d64e649126dce281d6a0b060061
Pool initialize: 0x828a5985fc219c5e658450ee57a6588bdcbe87efe00b62900bd3427ad26d8694
```

Receipt statuses:

```text
0x7312...8ae9 status 0x1 gasUsed 0x69fdf
0x18a9...ebaf status 0x1 gasUsed 0x2a0d9
0xa2fb...0061 status 0x1 gasUsed 0x27132a
0x828a...694  status 0x1 gasUsed 0x1ba2a
```

Explorer links:

```text
https://www.oklink.com/x-layer/address/0x7Cb64aB50C89B3803d4DcC4E7B7041FE9607Fd23
https://www.oklink.com/x-layer/address/0xF08e79cd52b866d8ED91C35c5efBdAd91FF590C0
https://www.oklink.com/x-layer/tx/0x7312a5754d9369685a46ccbc5b15b086ab1a867592263210e186272d91f28ae9
https://www.oklink.com/x-layer/tx/0x18a95b1d8874df57a4827499b577ca4271bd359882820ff89bc92d0cf66febaf
https://www.oklink.com/x-layer/tx/0xa2fb3fe5efc8cf4ba026226f654acf1d37d64d64e649126dce281d6a0b060061
https://www.oklink.com/x-layer/tx/0x828a5985fc219c5e658450ee57a6588bdcbe87efe00b62900bd3427ad26d8694
```

Phase 4 blockers:

- Minimal OKB/USDT liquidity is not seeded yet because the deployer has `0` USDT on the checked X Layer USDT contracts.
- Source verification is not completed yet because X Layer explorer verification requires the explorer verification flow/API credentials.

Post-deploy code checks:

```sh
curl -s -X POST https://rpc.xlayer.tech ... eth_getCode 0xF08e79cd52b866d8ED91C35c5efBdAd91FF590C0
curl -s -X POST https://rpc.xlayer.tech ... eth_getCode 0x7Cb64aB50C89B3803d4DcC4E7B7041FE9607Fd23
```

Result:

```text
Both deployed addresses returned non-empty bytecode.
```

Post-deploy regression:

```sh
forge test --offline -vvv
```

Result:

```text
Ran 2 test suites in 65.42ms (45.39ms CPU time): 14 tests passed, 0 failed, 0 skipped (14 total tests)
```
