# HELIX Phase 0 Ground Truth

Date: 2026-05-26

Status: `STOP AND WAIT`

Phase 0 conclusion:

- Uniswap v4 is deployed on X Layer mainnet, so the hook-based build is viable on the target chain.
- X Layer mainnet infra is public and documented by OKX.
- Real Chainlink price feeds exist on X Layer for major assets and stables.
- Flap is live on X Layer and exposes documented contracts and events we can compose with directly.
- Critical constraint: I found no evidence that arbitrary newly launched Flap tokens have a canonical third-party oracle on X Layer. That means exact oracle-anchored LVR is viable for oracle-covered pairs, but not for a fresh Flap token unless we use a clearly labeled fallback oracle design.

## 1. X Layer Mainnet Infra

Official X Layer mainnet network info from OKX:

- Chain name: `X Layer mainnet`
- Chain ID: `196`
- Gas token: `OKB`
- Public RPC URLs:
  - `https://rpc.xlayer.tech`
  - `https://xlayerrpc.okx.com`
- Block explorer:
  - `https://www.okx.com/web3/explorer/xlayer`
  - OKLink deep links also resolve under `https://www.oklink.com/x-layer/...`

Contract verification method:

- X Layer exposes an explorer verification API:
  - `POST /api/v5/xlayer/contract/verify-source-code`
  - `POST /api/v5/xlayer/contract/check-verify-result`
- Docs endpoint: `https://web3.okx.com/xlayer/onchaindata/docs/en/`

Implication:

- We can verify HELIX contracts on the X Layer explorer after deployment.

## 2. Uniswap v4 on X Layer Mainnet

Official Uniswap deployment docs list X Layer mainnet (`196`) with live v4 core/periphery addresses.

Confirmed addresses:

- `PoolManager`: `0x360e68faccca8ca495c1b759fd9eee466db9fb32`
- `PositionDescriptor`: `0x9e9fbbef0e1bd752e83de5acff3d0c936a9e5a4b`
- `PositionManager`: `0xcf1eafc6928dc385a342e7c6491d371d2871458b`
- `Quoter`: `0x8928074ca1b241d8ec02815881c1af11e8bc5219`
- `StateView`: `0x76fd297e2d437cd7f76d50f01afe6160f86e9990`
- `Universal Router`: `0xda00ae15d3a71466517129255255db7c0c0956d3`
- `Universal Router 2.1.1`: `0x8b844f885672f333bc0042cb669255f93a4c1e6b`
- `Permit2`: `0x000000000022D473030F116dDEE9F6B43aC78BA3`

Useful related X Layer Uniswap info:

- Uniswap v3 docs list wrapped native token on X Layer as `WOKB` at `0xe538905cf8410324e03A5A23C1c177a474D59b2b`
- OKX announced official Uniswap support on X Layer on 2026-01-16

Implication:

- The hackathon target stack is real on X Layer mainnet.
- HELIX can be deployed as a genuine Uniswap v4 hook on the intended chain.

## 3. Real Oracle Availability on X Layer Mainnet

Chainlink Data Feeds pages show X Layer mainnet feeds for major assets and stables. I confirmed feed contracts for at least these assets:

- `ETH / USD`: `0x8b85b50535551F8E8cDAF78dA235b5Cf1005907b`
- `USDC / USD`: `0xB8a08c178D96C315FbFB5661ABD208477391BC40`
- `USDT / USD`: `0xb928a0678352005a2e51F614efD0b54C9830dB80`
- `OKB / USD`: `0x4Ff345b18a2bF894F8627F41501FBf30d5C5e7BE`
- `BTC / USD`: `0x4D6f6488a2B3a5f7b088f276887f608a1e9805c4`

How we would read them:

- Standard Chainlink aggregator interface via `latestRoundData()`
- Safety checks required in HELIX:
  - reject `answer <= 0`
  - reject stale `updatedAt`
  - reject incomplete rounds
  - bound max staleness in contract constants

Best Phase 1-5 candidate pairs for exact oracle-anchored LVR:

- `WETH / USDC`
- `WETH / USDT`
- `OKB / USDT`
- `BTC / USDC`

Why these pairs are good:

- Both sides have straightforward USD-denominated oracle coverage or one side is a USD stable.
- We can derive a clean reference price for the pool.
- They are much more defensible for judging than inventing a price source for a new memecoin.

Important limitation:

- I did not find evidence of canonical Chainlink feeds for arbitrary newly launched Flap tokens on X Layer.
- Therefore a brand-new Flap token cannot honestly claim exact oracle-based LVR unless:
  - we pick a Flap token that already has an external oracle, or
  - we use a clearly labeled operator-fed/reference-price fallback, or
  - we position the Flap integration as token discovery + HELIX pool creation, while the live exact-LVR demo runs on an oracle-covered pair.

Recommendation:

- For the competition demo, the safest path is:
  - exact LVR on an oracle-covered X Layer pair, and
  - direct Flap integration for token discovery/selection/dashboarding.
- If you want the live demo asset itself to be a Flap token, we need your approval to use a fallback oracle model and label it honestly.

## 4. Flap on X Layer

Flap is live on X Layer and directly documents X Layer deployment and indexing surfaces.

Confirmed X Layer Flap contracts:

- Portal: `0xb30D8c4216E1f21F27444D2FfAee3ad577808678`
- Standard token implementation: `0x12Dc83157Bf1cfCB8Db5952b3ba5bb56Cc38f8C9`
- Tax token V1 implementation: `0xa9918579C9eD0899eCc7e449B9c59916Fb89bAF1`
- Version: `v4.12.1`

What Flap exposes that HELIX can use directly:

- Token creation events from `Portal`
- Documented event indexing flow for `TokenCreated`
- Launch metadata fields including:
  - `ts`
  - `creator`
  - `token`
  - `name`
  - `symbol`
  - `meta` IPFS CID
- DEX migration event:
  - `LaunchedToDEX(address token, address pool, uint256 amount, uint256 eth)`
- Published ABI in docs

What this means for HELIX:

- Direct Flap composition is real and should be described as `contract-based + event-based integration`.
- We can build a Flap token selector/dashboard from real X Layer events and metadata.
- We can let a user select a Flap-launched token and initialize a HELIX-protected Uniswap v4 pool for it.

What I did not verify:

- I did not find evidence in the docs of a Flap SDK we need for this build.
- I did not find evidence that Flap itself migrates to Uniswap v4 on X Layer; docs only say tokens are listed on a DEX and emit `LaunchedToDEX`.

Product positioning implication:

- Honest wording today is:
  - `HELIX is a self-defending liquidity layer for Flap-launched tokens on X Layer.`
  - Integration type: `direct contract/event integration for discovery and pool dashboarding`
  - Pool creation path: `HELIX creates a separate Uniswap v4 dynamic-fee pool for the selected Flap token`

## 5. Stop/Go Decision Before Spending Mainnet Funds

Go conditions already satisfied:

- X Layer mainnet exists and is documented.
- Uniswap v4 is deployed on X Layer mainnet.
- X Layer has a contract verification path.
- Real price feeds exist on X Layer for several major assets.
- Flap is directly composable on X Layer through contracts and events.

Decision that still requires your confirmation:

- Which pair are we building the real mainnet demo around?

Recommended options:

1. Best technical path: `WETH / USDC` or `OKB / USDT`
2. Best Flap-branded path with honest caveat: select a Flap token for dashboard/pool UX, but prove exact LVR on an oracle-covered pair
3. Highest-risk path: use a fresh Flap token and accept a clearly labeled fallback oracle model instead of canonical third-party price feeds

## 6. What I Need From You Before Phase 1+

Please confirm both:

- Funding: you are willing to fund a fresh X Layer deployer wallet with only demo-sized OKB and token amounts
- Pair choice:
  - `WETH / USDC`
  - `WETH / USDT`
  - `OKB / USDT`
  - `BTC / USDC`
  - `Flap token + fallback oracle` if you explicitly want that tradeoff

Without that confirmation, I should not proceed to any mainnet-spend path.

## Sources

- Uniswap v4 deployments:
  - https://developers.uniswap.org/docs/protocols/v4/deployments
- Uniswap v3 X Layer deployments with WOKB:
  - https://developers.uniswap.org/docs/protocols/v3/deployments/v3-xlayer-deployments
- X Layer RPC endpoints:
  - https://web3.okx.com/xlayer/docs/developer/rpc-endpoints/rpc-endpoints
- X Layer network info:
  - https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/network-information
- X Layer contract verification API docs:
  - https://web3.okx.com/xlayer/onchaindata/docs/en/
- OKX announcement that Uniswap supports X Layer:
  - https://www.okx.com/en-us/help/okx-web3-announcement-about-x-layer-support-on-uniswap
- Chainlink X Layer feed pages:
  - https://data.chain.link/feeds/xlayer/xlayer/eth-usd
  - https://data.chain.link/feeds/xlayer/xlayer/usdc-usd
  - https://data.chain.link/feeds/xlayer/xlayer/usdt-usd
  - https://data.chain.link/feeds/xlayer/xlayer/okb-usd
  - https://data.chain.link/feeds/xlayer/xlayer/btc-usd
- OKLink deep links used to expand exact feed addresses:
  - https://www.oklink.com/x-layer/evm/address/0x8b85b50535551F8E8cDAF78dA235b5Cf1005907b
  - https://www.oklink.com/x-layer/address/0xB8a08c178D96C315FbFB5661ABD208477391BC40
  - https://www.oklink.com/x-layer/address/0xb928a0678352005a2e51F614efD0b54C9830dB80
  - https://www.oklink.com/x-layer/address/0x4Ff345b18a2bF894F8627F41501FBf30d5C5e7BE
  - https://www.oklink.com/x-layer/evm/address/0x4D6f6488a2B3a5f7b088f276887f608a1e9805c4
- Flap app:
  - https://x.flap.sh/board
- Flap docs:
  - https://docs.flap.sh/flap
  - https://docs.flap.sh/flap/developers
  - https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/deployed-contract-addresses
  - https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/index-token-created-events
  - https://docs.flap.sh/flap/developers/wallet-and-terminal-and-bot-developers/token-migration
