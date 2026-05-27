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

## Phase 4 Update — Active OKB/USDT0 Mainnet Deployment

Date: 2026-05-26

Reason for update:

- The deployer was funded with OKX-labeled `USDT0`, not the older `USDT` token address.
- The active demo path is now `OKB/USDT0` using token `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`.
- A decimal-adjusted oracle was deployed so HELIX compares Uniswap v4 raw pool price units correctly for native OKB `18` decimals versus USDT0 `6` decimals.

USDT0 balance check:

```text
Old USDT token 0x1E4a5963aBFD975d8c9021ce480b42188849D41d balance: 0
USDT0 token    0x779ded0c9e1022225f8e0630b35a9b54be713736 balance: 5,000,000 raw units = 5.0 USDT0
```

Dry-run command:

```sh
set -a && source /Users/user/helix/.env && set +a && forge script script/DeployUSDT0HookAndSeed.s.sol:DeployUSDT0HookAndSeed --rpc-url https://rpc.xlayer.tech --offline -vvvv
```

Dry-run key output:

```text
Script ran successfully.
USDT0 hook salt: 0x000000000000000000000000000000000000000000000000000000000000c727
USDT0 hook: 0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0
Initialized OKB/USDT0 pool at tick -231457
USDT0 oracle: 0xf213fC8042136682ABd25AC2106481f4B6BdAFd2
USDT0 seeder: 0xB70d6705b1ED0d8b30e5e25039B8324d025Ab2CC
Seeded liquidityDelta: 40000000000
Actual seed settled: 4244530276512475 wei OKB and 364711 raw USDT0
```

Mainnet broadcast command:

```sh
set -a && source /Users/user/helix/.env && set +a && forge script script/DeployUSDT0HookAndSeed.s.sol:DeployUSDT0HookAndSeed --rpc-url https://rpc.xlayer.tech --broadcast --offline -vvvv
```

Mainnet broadcast output:

```text
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
Transactions saved to: /Users/user/helix/contracts/broadcast/DeployUSDT0HookAndSeed.s.sol/196/run-latest.json
Estimated gas price: 0.040000001 gwei
Estimated total gas used for script: 6399267
Estimated amount required: 0.000255970686399267 ETH
```

Active mainnet addresses:

```text
Adjusted oracle: 0xf213fC8042136682ABd25AC2106481f4B6BdAFd2
HELIX hook:      0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0
Liquidity seeder:0xB70d6705b1ED0d8b30e5e25039B8324d025Ab2CC
PoolId:          0x7e28af1b33b5a70e30ecd13e92f2d2800d59dbf1139c02e72a9a745cebdecc79
USDT0:           0x779Ded0c9e1022225f8E0630b35a9b54bE713736
```

Mainnet tx hashes:

```text
Oracle deploy:   0xd3b2d2c7f528b3ec2eef597cd28fb5a50bbb1e45852c95c1aa727977cca238e4
Hook deploy:     0x220497b02ddf44e2b7dd23f92b7c4e4254cbc85c65f1c912041050aea12c7b7b
Hook initialize: 0x3d69debd9384a7f94368f1274bf07eb395f8927d19a479a50d0382972d0ead8c
Pool initialize: 0x47c3ae0f17960b1716b3d598894c53d06ffca6ca23cede7adba8499f14c7c9e1
Seeder deploy:   0xf6893a2de1f73aa31a1560fbb30e4522ab7dfd12d44db19fbd730e33a282d01c
USDT0 approve:   0xb72c8be99c50656047f47d9ffde7425979041a1608cc72718ba11811d0be2c12
Liquidity seed:  0x3f032b7b633499a38e895ed4670e0f54aaab86e009b10962484945afbc513919
```

Receipt status extraction:

```sh
node -e "const f=require('./broadcast/DeployUSDT0HookAndSeed.s.sol/196/run-latest.json'); for (const r of f.receipts) console.log(JSON.stringify({transactionHash:r.transactionHash,status:r.status,gasUsed:r.gasUsed,contractAddress:r.contractAddress}, null, 2));"
```

Key receipt output:

```text
All seven broadcast receipts returned status 0x1.
```

Plain-English result:

- The active OKB/USDT0 HELIX pool is deployed on X Layer mainnet and seeded with real liquidity.
- The hook address is permission-flag-correct and the pool was initialized with Uniswap v4's dynamic-fee flag.
- Source verification on OKLink is still not completed because X Layer verification uses the OKLink verification API and this environment has no `OK_ACCESS_KEY` / signing credentials configured.

Post-USDT0 deployment regression:

```sh
node -e "JSON.parse(require('fs').readFileSync('deployments/xlayer-mainnet.json','utf8')); console.log('deployment json ok')"
forge build
forge test --offline -vvv
```

Result:

```text
deployment json ok
forge build: No files changed, compilation skipped
Ran 2 test suites in 63.45ms (68.50ms CPU time): 14 tests passed, 0 failed, 0 skipped (14 total tests)
```

Explorer verification blocker check:

```text
Official X Layer API docs list POST /api/v5/xlayer/contract/verify-source-code for source verification.
The same docs list auth failures for missing OK_ACCESS_KEY, OK_ACCESS_PASSPHRASE, OK_ACCESS_SIGN, and OK_ACCESS_TIMESTAMP.
Local environment check found no OKLink verification credentials.
```

## Phase 5 — Live Adaptation Proven On-Chain

Date: 2026-05-26

What Phase 5 had to prove:

- A real X Layer mainnet swap can move the HELIX pool away from the Chainlink oracle reference.
- The hook can update the baseline dynamic fee through `updateDynamicLPFee`.
- A later toxic swap can trigger the per-swap reflex override and emit `ReflexFeeQuoted`.

Pre-broadcast regression:

```sh
forge clean && forge build && forge test --offline -vvv
```

Output:

```text
Solc 0.8.26 finished in 21.10s
Compiler run successful!
Ran 2 test suites in 40.38ms (28.84ms CPU time): 15 tests passed, 0 failed, 0 skipped (15 total tests)
```

Warning-free dry-run:

```sh
set -a && source /Users/user/helix/.env && set +a && forge script script/RunPhase5LiveSwaps.s.sol:RunPhase5LiveSwaps --rpc-url https://rpc.xlayer.tech --offline -vvvv
```

Dry-run key output:

```text
Compiler run successful!
Script ran successfully.
BaselineFeeUpdated: oldFee 3000, newFee 4000, lvrSignal 65450000000000000, reason EVOLUTION_UP, swapsObserved 3
ReflexFeeQuoted: oldFee 4000, newFee 4086, lvrSignal 4340000, reason REFLEX
Estimated gas price: 0.040030421 gwei
Estimated total gas used for script: 2706837
Estimated amount required: 0.000108355824688377 ETH
```

Mainnet broadcast:

```sh
set -a && source /Users/user/helix/.env && set +a && forge script script/RunPhase5LiveSwaps.s.sol:RunPhase5LiveSwaps --rpc-url https://rpc.xlayer.tech --broadcast --offline -vvvv
```

Broadcast output:

```text
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
Transactions saved to: /Users/user/helix/contracts/broadcast/RunPhase5LiveSwaps.s.sol/196/run-latest.json
Estimated gas price: 0.040059403 gwei
Estimated total gas used for script: 2706837
Estimated amount required: 0.000108434274238311 ETH
```

Live tx hashes:

```text
Swap executor deploy: 0xe5d82776fa9aad25d511989f9862f0b210775db872526becb12267f7c4d94003
USDT0 approve:        0xc3930a0390bd4c6e1dedc5064296e2e96c6ef405aa1963005971a2c34a5efdf5
Push-away swap 1:     0x9e2ce8852242a85a45f41b4fdf612f81a9a505f22b53c96b8ac846a97fd6aa92
Push-away swap 2:     0x636dae55fa97b7916fdf44f35563095a5979782f765a268b40384a3ddf825c33
Evolution swap:       0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6
Reflex toxic swap:    0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184
```

Receipt extraction command:

```sh
node -e "const f=require('./broadcast/RunPhase5LiveSwaps.s.sol/196/run-latest.json'); for (const r of f.receipts) console.log(JSON.stringify({transactionHash:r.transactionHash,status:r.status,gasUsed:r.gasUsed,contractAddress:r.contractAddress}, null, 2));"
```

Receipt status:

```text
All six Phase 5 receipts returned status 0x1.
```

Decoded HELIX events:

```text
Evolution tx: 0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6
Event: BaselineFeeUpdated
oldFee: 3000
newFee: 4000
lvrSignal: 65450000000000000
reason: EVOLUTION_UP
swapsObserved: 3
oraclePriceE18: 90749785
poolPriceE18: 84780174

Reflex tx: 0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184
Event: ReflexFeeQuoted
oldFee: 4000
newFee: 4086
lvrSignal: 4340000
reason: REFLEX
oraclePriceE18: 90749785
poolPriceE18: 82867456
PoolManager Swap fee: 4086
```

Explorer links:

```text
https://www.oklink.com/x-layer/tx/0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6
https://www.oklink.com/x-layer/tx/0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184
```

Plain-English result:

- HELIX adapted on real X Layer mainnet transactions, not a fork or mock.
- The third live swap caused the baseline fee to rise from `3000` to `4000`.
- The toxic swap after that received a per-swap reflex fee of `4086`, and the PoolManager swap event shows that exact fee was used.

## Phase 6 — Real Frontend Dashboard

Date: 2026-05-26

What Phase 6 had to prove:

- The frontend connects to X Layer mainnet, not mock data.
- It reads the deployed HELIX hook, oracle, and Phase 5 adaptation receipts.
- It includes the Flap-facing pool dashboard and a guarded real-swap control.
- It builds, lints, serves locally, and has screenshot proof.

Dependency install:

```sh
npm install viem wagmi @tanstack/react-query recharts tailwindcss @tailwindcss/vite --loglevel=info
```

Output:

```text
added 79 packages, and audited 232 packages in 1m
found 0 vulnerabilities
```

Production build:

```sh
npm run build
```

Output:

```text
> frontend@0.0.0 build
> tsc -b && vite build

vite v8.0.14 building client environment for production...
✓ 1458 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.45 kB │ gzip:   0.29 kB
dist/assets/index-BodIom4D.css   13.19 kB │ gzip:   3.89 kB
dist/assets/ccip-Br81oUIO.js      2.83 kB │ gzip:   1.30 kB
dist/assets/index-CqequCi3.js   858.87 kB │ gzip: 259.14 kB

✓ built in 1.53s
```

Lint:

```sh
npm run lint
```

Output:

```text
> frontend@0.0.0 lint
> eslint .
```

Local runtime proof:

```sh
npm run dev -- --host 127.0.0.1 --port 5173
curl -I http://127.0.0.1:5174/
```

Output:

```text
VITE v8.0.14  ready in 846 ms
Local:   http://127.0.0.1:5174/

HTTP/1.1 200 OK
Content-Type: text/html
```

Live X Layer state read using the same `viem` stack as the frontend:

```sh
node --input-type=module -e "<read deployed hook and oracle state>"
```

Output:

```json
{
  "fee": 4000,
  "toxicScore": "4340000",
  "poolPriceE18": "85149181",
  "oraclePriceE18": "91282185",
  "oracleUpdatedAt": 1779752428
}
```

Screenshot capture:

```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless=new --disable-gpu --no-sandbox --window-size=1440,1400 --virtual-time-budget=15000 --screenshot=docs/demo/phase6-frontend-loaded.png http://127.0.0.1:5174/
```

Output:

```text
501084 bytes written to file docs/demo/phase6-frontend-loaded.png
```

Screenshot files:

```text
docs/demo/phase6-frontend.png
docs/demo/phase6-frontend-loaded.png
```

Plain-English result:

- The Phase 6 frontend builds and lints cleanly.
- The app serves locally and reads the deployed X Layer HELIX hook/oracle state with real values.
- The screenshot in `docs/demo/phase6-frontend-loaded.png` shows the live dashboard loaded with current fee, toxic-flow score, oracle price, and pool price from mainnet.

## Phase 7 — Docs + Independent Re-Verification (fresh Linux environment)

Date: 2026-05-27

Why this section exists:

- The Phases 0-6 logs above were produced on the original macOS build machine (`/Users/user/helix`).
- This section re-proves the build, tests, and on-chain deployment independently on a fresh Linux
  checkout (`/workspaces/helix`), and records completion of the Phase 7 documentation deliverables.

On-chain re-verification (read-only X Layer mainnet RPC, no spend):

```sh
curl -s -X POST https://rpc.xlayer.tech ... eth_chainId
curl -s -X POST https://rpc.xlayer.tech ... eth_getCode <hook> / <oracle>
curl -s -X POST https://rpc.xlayer.tech ... eth_getTransactionReceipt <evolution tx> / <reflex tx>
```

Output:

```text
chainId            = 0xc4 (196, X Layer mainnet)
hook   code length = 11477 bytes
oracle code length = 2053 bytes
evolution tx 0x100890...0454e6  status=0x1  block=61066053  logs=3
reflex    tx 0x608903...f8184   status=0x1  block=61066053  logs=4
```

Decoded REFLEX event data words from the hook log (emitter `0x9918...50C0`):

```text
oldFee=4000  newFee=4086  lvrSignal=4340000  reason="REFLEX"  oraclePriceE18=90749785  poolPriceE18=82867456
```

These match `deployments/xlayer-mainnet.json` exactly. Deployment and live adaptation are genuine.

Build + test re-run on Linux:

```sh
cd contracts
forge install Uniswap/v4-core Uniswap/v4-periphery OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std --no-git
forge build
forge test --offline -vvv
```

Output:

```text
Compiling 104 files with Solc 0.8.26
Compiler run successful!
(one benign forge-lint block-timestamp warning on the oracle staleness check)

Ran 4 tests for test/ChainlinkRatioOracle.t.sol:ChainlinkRatioOracleTest  — 4 passed
Ran 11 tests for test/HelixHook.t.sol:HelixHookTest                       — 11 passed
Ran 2 test suites: 15 tests passed, 0 failed, 0 skipped (15 total tests)
```

Phase 7 documentation written:

- `README.md` — judge-facing pitch, novelty, Flap positioning, loop + Flap demo diagrams,
  proof-it's-real table, safety model, LVR formula + limitations, run instructions, criteria map.
- `ARCHITECTURE.md` — LVR math, two-tier adaptation, safety envelope, oracle design, diagrams.
- `DEMO.md` — literal 1-3 min run-of-show with explorer links and recorded fallback.
- `docs/JUDGING.md` — criterion-by-criterion evidence.
- `docs/X_POST.md` — X/Twitter launch draft tagging the partners.

Plain-English result:

- A stranger on a fresh Linux machine reproduced the clean build and the full 15-test green suite,
  and independently confirmed via public RPC that the mainnet hook/oracle exist and that the two
  adaptation transactions are real and decode to the documented values.

## Source Verification on X Layer (OKLink) explorer

Date: 2026-05-27

Method: Foundry's Etherscan-compatible OKLink verifier.

Key discovery: the deployed bytecode metadata reports solc `0.8.33`, not `0.8.26`. The hook source
pragma is `^0.8.26`, so Foundry's multi-version build compiled `HelixHook` (and the other HELIX
contracts) with the latest matching solc `0.8.33+commit.64118f21`, while `v4-core` files that pin
`=0.8.26` stayed on 0.8.26. Verifying against 0.8.26 failed ("Unable to verify"); against 0.8.33 it
passed. Compiler version was read straight from the on-chain metadata CBOR:

```text
metadata tail ...64736f6c6343 0008 21 0033  ->  solc 0.8.33
```

Command (per contract; constructor args ABI-encoded with `cast abi-encode`):

```sh
forge build --skip test --use 0.8.33 --force
forge verify-contract <address> <path:Contract> \
  --chain-id 196 \
  --compiler-version v0.8.33+commit.64118f21 \
  --num-of-optimizations 200 \
  [--constructor-args <abi-encoded>] \
  --verifier oklink \
  --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER \
  --api-key $OK_ACCESS_KEY --watch
```

Result — all four contracts returned `Response: OK / Details: Pass - Verified`:

```text
HelixHook                          0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0  Pass - Verified
TokenDecimalsChainlinkRatioOracle  0xf213fC8042136682ABd25AC2106481f4B6BdAFd2  Pass - Verified
HelixLiquiditySeeder               0xB70d6705b1ED0d8b30e5e25039B8324d025Ab2CC  Pass - Verified
HelixSwapExecutor                  0xB705ca289Df4a39Ba55226C4405BA6c0143344CB  Pass - Verified
```

Plain-English result:

- Every HELIX contract on X Layer mainnet now shows verified source on the OKLink explorer, so a
  judge can read the exact code behind each address. The one remaining open item from earlier
  (source verification) is now closed.
