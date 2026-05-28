# HELIX — a self-defending liquidity layer for X Layer pools

> A Uniswap v4 hook that measures the Loss-Versus-Rebalancing (LVR) inflicted on its liquidity
> providers and autonomously rewrites its own dynamic-fee curve — on-chain, within hard-coded
> safety bounds — to drive that loss down over time.

**HELIX is not only a Flap product. Flap is the launchpad use case. The broader product is
self-defending liquidity for X Layer pools.** HELIX runs in two modes:

1. **Oracle-backed LVR Mode** — for assets with reliable oracle coverage. Full LVR-style toxic-flow
   detection and dynamic-fee adaptation. **Live proof: OKB/USDT0** on X Layer mainnet.
2. **Flap Launch Protection Proxy Mode** — for newly Flap-launched tokens that may not yet have
   reliable external feeds. **Example: SKILL (ClawHub)**. Surfaced in the dashboard as proxy mode;
   no oracle is faked.

OKB/USDT0 proves the full oracle-backed LVR mode. SKILL demonstrates the Flap Launch Protection
pathway. **Live on X Layer mainnet (chainId 196). Every claim below is backed by a verifiable
transaction.**

---

## Why this is novel (in three sentences)

Dynamic-fee hooks already exist, and LVR-minimization is a well-known research goal — but the two
have lived apart: fees are usually tuned by governance or a static formula, while LVR stays an
off-chain analytics number. HELIX is the working synthesis: it turns LVR into an on-chain control
signal and lets the pool itself move its fee in response, every swap and on a cadence, with no
human in the loop. The "self-rewriting" is bounded parameter tuning inside a hard-coded envelope —
not arbitrary code, not an upgradeable proxy, and with no key that can drain the pool.

---

## What makes HELIX different

Most "defensive" hooks ask *"which wallet is trading?"* and try to classify, score, or blacklist
addresses. **HELIX does not classify traders. It lets the pool learn from what the market does to
it.** It asks *"what is the market doing to this pool?"* — and records that at the **pool level**,
never per wallet. There are no wallet personas, no user scores, no blacklists, and no admin that
can pick winners.

That gives HELIX a distinct identity built from four layers, all derived from real on-chain state:

### 1. Pool Memory
Each pool keeps a structured memory of what happened to it, computed from the hook's own events
(`ReflexFeeQuoted`, `BaselineFeeUpdated`, `OracleSkipped`) and live `poolState`:

- total swaps metered, protected (reflex) swaps, total adaptations, baseline evolutions
- latest / highest / lowest fee reached
- current toxic-flow score (the hook's `cumulativeLvrSignal`)
- latest defense reason, fee direction (UP / DOWN / HOLD), and defense block
- stale-oracle skips

The dashboard's **Pool Memory** panel labels its source explicitly ("computed from HELIX hook
events and live poolState") so nothing is presented as real that isn't on-chain.

### 2. Defense Epochs
Named lifecycle modes computed from pool memory (a presentation layer over on-chain facts — they
never override the hook or its `MIN_FEE`/`MAX_FEE` bounds):

- **Launch Shield** — the pool is young (few metered swaps), so HELIX stays more sensitive to
  toxic flow and launch sniping.
- **Adaptive Defense** — HELIX detected pool-vs-oracle pressure and is actively adapting the fee.
- **Calm Market** — flow looks healthier, so HELIX relaxes defensive pressure.
- **Oracle Safe Mode** — the latest oracle signal was stale/unsafe, so HELIX paused learning and
  held the fee.

### 3. Fee Curve Evolution
HELIX does not use a fixed fee — the curve evolves with pool conditions. Two kinds of movement,
both emitted on-chain and shown distinctly in the UI:

- **Reflex fee** — a *temporary* per-swap response during a toxic-looking swap.
- **Baseline evolution** — a *longer-term* baseline update after the pool observes enough flow.

The dashboard shows the timeline plus the current fee band (Low Defense / Balanced / High Defense /
Max Clamp). This is a **bounded controller / learning loop, not "AI."**

### 4. Pool Learning
The narrative tying it together — **observe → measure → defend → evolve → remember**:

1. **Observe** — the hook sees every swap in `beforeSwap` / `afterSwap`.
2. **Measure** — it measures pool-vs-oracle divergence and an LVR-like toxic-flow signal.
3. **Defend** — toxic swaps get a temporary reflex fee.
4. **Evolve** — after a cadence window, the baseline fee nudges up or down, within bounds.
5. **Remember** — Pool Memory records the outcome and updates the defense epoch.

> "HELIX learns by updating bounded parameters from real on-chain trading history."
> **Self-evolving means bounded fee-curve adaptation, not arbitrary code mutation.** Oracle
> failures cause a safe skip/hold, never an unsafe fee change.

In one line: **other defensive hooks classify wallets; HELIX evolves pools.**

### 5. Pool Autobiography
Pool Autobiography turns raw hook events into a readable timeline of how HELIX defended the pool —
"At block N, HELIX detected toxic flow and raised the fee from 0.30% to 0.40%." Every card is
reconstructed from a real `ReflexFeeQuoted`, `BaselineFeeUpdated`, or `OracleSkipped` event on X
Layer (or from live `poolState`). Nothing is invented; the pool tells you, in plain English, what
it did and why. Severity labels — **Defense / Evolution / Safety / Calm** — match the on-chain
reason code so a judge can verify any card against the linked transaction.

### 6. Proof Passport
Proof Passport gives judges one place to verify the deployed hook, pool, oracle, and live
adaptation transactions. Network, chain ID, hook address, PoolManager, pool ID, the protected pair,
the oracle, deployment / pool-creation / reflex / evolution transactions, and the verified source
URL are all rendered with copy buttons and OKLink X Layer explorer links. Anything that isn't yet
proved is shown as **"Not provided yet"** rather than hidden — missing proof is never disguised.

---

## Two protection modes (honestly labeled)

### Mode 1 — Oracle-backed LVR Mode (live proof: OKB/USDT0)
For pairs with reliable oracle references. HELIX measures pool-vs-oracle divergence on every swap,
applies a per-swap reflex fee when flow is toxic, and evolves the baseline fee over a cadence
window. **OKB/USDT0 is the active live proof pool** — Chainlink OKB/USD and USDT/USD feeds on X
Layer give it a real external reference, and the dashboard surfaces real X Layer transactions for
both REFLEX and EVOLUTION events.

### Mode 2 — Flap Launch Protection Proxy Mode (example: SKILL / ClawHub)
For newly Flap-launched tokens that may not yet have reliable external oracle feeds. **SKILL
(`0xED06d48a87F8B8b3E78AFD7DD59717A3f7317777`,
[flap.sh page](https://flap.sh/xlayer/0xed06d48a87f8b8b3e78afd7dd59717a3f7317777))** is detected
live from X Layer and protected by the **HelixFlapProxyHook**
(`0x6c3eC6213b84c7E2267A24a81A2c23147e1950c0`), deployed live on X Layer mainnet
([deploy tx](https://www.oklink.com/x-layer/tx/0xcbfd2a15da866958b9ac47b6c3a69b76dfedb73a0bf9b993be71db108d23caf9)).
A new SKILL/OKB v4 pool with the hook attached
([poolId](https://www.oklink.com/x-layer/tx/0x08474e3f4620902515811cd995775df6ed440f79cb9118298ba7b07c65a907cf)
`0x74acb2620f3c441082cae8b8af709b0b48d59ac15be9824c37c4b549dd82fba7`) runs as a dynamic-fee pool:
a launch shield starts at **5.00%** and linearly decays to a **0.50%** baseline over **20,000
blocks**; any single swap larger than **5% of current pool liquidity** gets a one-swap **+0.50%**
size-reflex bump. **No external oracle is consulted** for proxy mode. The existing oracle-backed
HELIX hook is deliberately NOT reused for SKILL because its oracle reads OKB/USDT and would feed
wrong references to a SKILL pool.

**Honest status today (verify with the dashboard or scripts/CheckFlapToken.s.sol):** the
HelixFlapProxyHook is live and the SKILL/OKB proxy pool is initialised on chain. Liquidity
seeding still reverts at the SKILL token contract ("Transfers to/from pools are restricted in
BondingCurve state") until SKILL graduates from the Flap bonding curve. The defense surface is
wired up; once SKILL graduates and a seed succeeds, the hook will start adapting fees on real
swaps. No fake oracle, no fake liquidity.

### Mode 3 — Any X Layer token (Mode Checker)
The dashboard ships a generic checker: paste any X Layer token address (or Flap URL), and HELIX
reads ERC-20 metadata live and recommends Oracle-backed LVR mode or Launch Protection Proxy mode.
The Flap Portal (`0xb30D8c4216E1f21F27444D2FfAee3ad577808678`) is the discovery surface for
Flap-launched tokens; HELIX is the defense surface for any X Layer pool that wants it.

---

## The loop

```
                ┌─────────────────────────────────────────────┐
                │                  EVERY SWAP                   │
                └─────────────────────────────────────────────┘
   swap ──▶ beforeSwap ──▶ read Chainlink oracle (staleness-checked)
                              │
                              ├─ pool vs oracle gap in the arb direction?
                              │     │
                              │     ├─ YES & gap ≥ reflexThreshold ─▶ REFLEX:
                              │     │      return fee | OVERRIDE_FEE_FLAG  (this swap only)
                              │     │      emit ReflexFeeQuoted
                              │     └─ NO ─▶ keep baseline fee
                              ▼
   swap executes ──▶ afterSwap ──▶ accumulate LVR signal, count swap
                                       │
                                       └─ every N swaps (cadence) ─▶ EVOLUTION:
                                              avg LVR high  ─▶ baseline fee UP   (updateDynamicLPFee)
                                              avg LVR healthy ─▶ baseline fee DOWN
                                              clamp to [MIN_FEE, MAX_FEE]
                                              emit BaselineFeeUpdated
```

Two tiers:

- **REFLEX** (per-swap, in `beforeSwap`): an acutely toxic swap — one pushing the pool further from
  the oracle in the arbitrage direction — is charged an elevated fee *for that swap only*, via
  Uniswap v4's `OVERRIDE_FEE_FLAG`.
- **EVOLUTION** (cadence, in `afterSwap`): every `evolutionCadence` swaps, the hook reads the
  accumulated LVR signal and nudges the pool's *baseline* fee via `poolManager.updateDynamicLPFee`
  — up when LVR is rising, down when flow looks healthy — always clamped to bounds it can never
  exceed.

Every adaptation emits an on-chain event `(oldFee, newFee, lvrSignal, reason, prices)`. That event
log is the pool's **memory** — it feeds the Pool Memory panel, the Defense Epoch badge, and the
Fee Curve Evolution timeline in the frontend.

---

## Demo flow

The dashboard hero shows three buttons so a judge can pick a mode without scrolling:

1. **View Live OKB/USDT0 Proof** — scrolls to the Oracle-backed LVR card with live current fee,
   toxic-flow score, hook + oracle addresses, latest REFLEX tx, latest EVOLUTION tx.
2. **Check Flap Token** — scrolls to the Flap Launch Protection panel and auto-focuses an input.
   Pasting the SKILL URL or address reads ERC-20 metadata live from X Layer and shows proxy-mode
   readiness.
3. **Check Any X Layer Token** — scrolls to the generic Mode Checker. Paste any X Layer token; the
   checker returns the recommended mode (Oracle-backed LVR or Launch Protection Proxy).

### Judge flow (one minute)

1. Open the HELIX dashboard.
2. Look at the Defense Epoch badge — the named mode the pool is currently in.
3. Scroll to **Pool Autobiography** and read the most recent defense / evolution / safety card.
4. Click the explorer link on any card to verify it on OKLink X Layer.
5. Scroll to **Proof Passport**.
6. Verify the hook address, oracle, deployment tx, reflex tx, and evolution tx all open on OKLink.
7. Copy any address with the inline copy button if you want to compare with `deployments/xlayer-mainnet.json`.

Pool Autobiography answers "What did the pool do?". Proof Passport answers "How can I verify this
is real?".

The live oracle-backed loop on OKB/USDT0:

```
 Initialize a Uniswap v4 pool protected by the HELIX hook  (DYNAMIC_FEE_FLAG)
        │
        ▼
 Pool starts at a conservative baseline fee (0.30%)
        │
        ▼
 A toxic / adversarial swap pushes the pool away from the oracle reference
        │
        ▼
 HELIX detects the divergence  ──▶  raises the fee for that swap (REFLEX override)
        │
        ▼
 After enough swaps, HELIX updates the baseline fee (EVOLUTION via updateDynamicLPFee)
        │
        ▼
 Frontend shows the pool defending itself; judge clicks the X Layer explorer link
 and verifies the emitted adaptation event.
```

---

## Proof it's real — X Layer mainnet

All addresses are deployed with **verified source on the X Layer (OKLink) explorer** (solc
`v0.8.33+commit.64118f21`, optimizer 200 runs); both proof transactions succeeded (`status 0x1`)
and their decoded events match the values below exactly.

| Component | Address | Explorer |
|---|---|---|
| HELIX hook | `0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0` | [view](https://www.oklink.com/x-layer/address/0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0) |
| Oracle (TokenDecimalsChainlinkRatioOracle) | `0xf213fC8042136682ABd25AC2106481f4B6BdAFd2` | [view](https://www.oklink.com/x-layer/address/0xf213fC8042136682ABd25AC2106481f4B6BdAFd2) |
| Liquidity seeder | `0xB70d6705b1ED0d8b30e5e25039B8324d025Ab2CC` | [view](https://www.oklink.com/x-layer/address/0xB70d6705b1ED0d8b30e5e25039B8324d025Ab2CC) |
| Swap executor | `0xB705ca289Df4a39Ba55226C4405BA6c0143344CB` | [view](https://www.oklink.com/x-layer/address/0xB705ca289Df4a39Ba55226C4405BA6c0143344CB) |
| Uniswap v4 PoolManager | `0x360e68faccca8ca495c1b759fd9eee466db9fb32` | [view](https://www.oklink.com/x-layer/address/0x360e68faccca8ca495c1b759fd9eee466db9fb32) |
| Pair | `OKB` (native) / `USDT0` `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` | |
| PoolId | `0x7e28af1b33b5a70e30ecd13e92f2d2800d59dbf1139c02e72a9a745cebdecc79` | |

**The two transactions that prove HELIX adapts on real flow:**

- **EVOLUTION** — baseline fee raised `3000 → 4000` after a 3-swap toxic cadence
  ([`0x100890…0454e6`](https://www.oklink.com/x-layer/tx/0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6)).
  Decoded `BaselineFeeUpdated`: `reason=EVOLUTION_UP, swapsObserved=3`.
- **REFLEX** — next toxic swap charged `4000 → 4086` for that swap only
  ([`0x608903…f8184`](https://www.oklink.com/x-layer/tx/0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184)).
  Decoded `ReflexFeeQuoted`: `oldFee=4000, newFee=4086`, and the PoolManager `Swap` event in the
  same tx shows the exact fee `4086` was applied.

Fees are in **hundredths of a bip** (1,000,000 = 100%): `3000 = 0.30%`, `4086 = 0.4086%`. The hook
can never leave `[MIN_FEE=500, MAX_FEE=20000]` → `[0.05%, 2.0%]`.

The full deployment record (every tx hash, gas used, receipt status) is in
[deployments/xlayer-mainnet.json](deployments/xlayer-mainnet.json) and
[VERIFICATION_LOG.md](VERIFICATION_LOG.md).

---

## Safety model (plain language)

- **Bounded "self-rewriting".** The only thing HELIX changes is one number — the LP fee — and only
  inside hard-coded constants `MIN_FEE` and `MAX_FEE` that the contract literally cannot exceed
  (`_clampFee`). There is no arbitrary code execution and no upgradeable proxy for the hook logic.
- **Cannot be drained.** The hook never custodies user funds beyond Uniswap v4's own
  flash-accounting. There is no admin function that can withdraw pool liquidity. The only
  privileged actions are pausing and tuning config *within* the same bounds.
- **Oracle is treated as untrusted.** Every read is checked for zero price, zero/parameterized
  staleness (`maxOracleAge`), and reverts. On any bad read the hook **skips adaptation** for that
  swap (emits `OracleSkipped`) rather than acting on bad data — fail safe, not fail open.
- **Reentrancy-guarded.** `beforeSwap`/`afterSwap`/`afterInitialize` are wrapped in a
  non-reentrant guard and gated to the PoolManager (`onlyManager`); checks-effects-interactions is
  respected around the external oracle read and `updateDynamicLPFee` call.

---

## How LVR is computed

For each swap the hook compares the pool's execution price to the oracle's "true" price:

```
divergenceBps = |poolPriceE18 − oraclePriceE18| / oraclePriceE18 × 10_000
lvrSignal     = divergenceBps × swapSize          (only when the swap is "toxic")
```

A swap is **toxic** when it pushes the pool *further* from the oracle in the arbitrage direction
(`_isToxic`). The accumulated `lvrSignal` over a cadence window is the EVOLUTION control input; the
instantaneous `divergenceBps` against `reflexThresholdBps` is the REFLEX trigger.

**Honest limitations.** This is a *directional, oracle-anchored LVR proxy*, not the exact
closed-form CFMM-LVR integral. It captures the sign and rough magnitude of toxic, price-correcting
flow — which is what the fee controller needs — but it does not integrate the rebalancing loss in
closed form, and it is only as good as the oracle's freshness/precision. Production roadmap:
move toward exact per-block CFMM-LVR using the marginal-price path, and per-token feeds (or a
TWAP/escrow fallback) for assets without a canonical Chainlink feed. See
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## Run it yourself

### Prerequisites
- [Foundry](https://book.getfoundry.sh/) (`forge`/`anvil`), Node.js 20+, npm.

### Contracts — build & test (no funds, no network needed)
```sh
cd contracts
forge install Uniswap/v4-core Uniswap/v4-periphery OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std --no-git
forge build
forge test --offline -vvv
```
You should see the full suite pass, including the adversarial cases (stale oracle, reverted
oracle, fee-clamp bounds, non-manager caller, permission-flag validation, reflex path, evolution
up/down).

### Fork demo (recommended before any mainnet spend)
```sh
cp .env.example .env   # fill DEPLOYER_PRIVATE_KEY
anvil --fork-url https://rpc.xlayer.tech --port 8545      # terminal 1
# terminal 2 — dry-run (no --broadcast = simulation only):
cd contracts
set -a && source ../.env && set +a
forge script script/RunPhase5LiveSwaps.s.sol:RunPhase5LiveSwaps --rpc-url http://127.0.0.1:8545 -vvvv
```

### Frontend (read-only against mainnet works with no wallet)
```sh
cd frontend
npm install
npm run dev      # open the printed localhost URL
```
The dashboard reads the **real deployed hook/oracle and the real adaptation event receipts** from
X Layer mainnet — no mocked data. Every number shown (current fee, toxic-flow score, oracle/pool
prices, Pool Memory counters, the fee-evolution timeline) is read live from chain or decoded live
from transaction receipts; the only hardcoded values are the real deployment constants (contract
addresses, poolId) and the historical proof transactions that seed the event log.

Frontend behaviour (all verified to build/lint; live-wallet steps need the OKX extension):

- **Wallet connect** targets the **OKX Wallet** provider (`window.okxwallet`), with a generic
  injected fallback for any other wallet; connection errors are surfaced in the UI instead of
  failing silently.
- **"Run real toxic swap"** is owner-gated to the deployer wallet (the on-chain `HelixSwapExecutor`
  reverts `NotOwner()` for anyone else). Before sending, it **switches the wallet to X Layer
  (chainId 196)** and pins `chainId` on the approve + swap, so the transaction can never route to
  the wrong network. Failures (wrong chain, rejection, revert) show in the run status.
- After a swap mines, the dashboard shows a **clickable X Layer explorer link** for the tx and feeds
  it into the event log, so the new reflex / baseline-evolution events and Pool Memory counters
  update immediately.
- The hero **"View latest reflex tx"** button links to the most recent reflex event in the live
  log — never a hardcoded transaction.
- The **Flap Launch Protection** panel reads ERC-20 metadata live for any pasted Flap token
  address/URL and labels oracle-backed vs launch-protection proxy mode (it never fakes metadata,
  and it only detects — running a real swap works against the deployed OKB/USDT0 pool, the only
  pool with a live HELIX hook).

> **Deploy:** the frontend is a static Vite SPA that reads X Layer directly from the browser — no
> backend or VPS required. On Vercel, set **Root Directory = `frontend`**, framework **Vite**,
> build `npm run build`, output `dist`; no env vars are needed for the read-only dashboard.

### Live mainnet (spends real funds — opt-in)
Scripts default to dry-run. Real broadcast requires the explicit `--broadcast` flag and prints a
`THIS SPENDS REAL FUNDS ON X LAYER MAINNET` warning. Use the smallest amounts in `.env`.

### Flap-token pool scripts (proxy-hook mode)
Four scripts handle the SKILL / Flap-launch path. All four are safe to run without a key (they
print status without broadcasting). The dedicated **HelixFlapProxyHook** carries defense logic
that does not depend on any external oracle (launch-window fee decay + swap-size reflex), so the
existing oracle-backed HELIX hook is intentionally not reused for SKILL.

```sh
# 1. Read-only sanity check (Flap token + deployer balances on X Layer mainnet)
forge script contracts/script/CheckFlapToken.s.sol:CheckFlapToken \
  --rpc-url https://rpc.xlayer.tech

# Optional — check any token + wallet:
forge script contracts/script/CheckFlapToken.s.sol:CheckFlapToken \
  --rpc-url https://rpc.xlayer.tech \
  --sig "runFor(address,address)" 0xed06d48a87f8b8b3e78afd7dd59717a3f7317777 <YOUR_WALLET>

# 2. Dry-run proxy-hook deploy + pool init (no --broadcast = simulation only)
forge script contracts/script/DeploySkillFlapProxy.s.sol:DeploySkillFlapProxy \
  --rpc-url https://rpc.xlayer.tech

# 3. Dry-run legacy pool-ready-mode init (kept for audit history)
forge script contracts/script/CreateFlapHelixPool.s.sol:CreateFlapHelixPool \
  --rpc-url https://rpc.xlayer.tech

# 4. Dry-run seed (refuses to broadcast without SKILL + OKB balances + unlocked bonding curve)
forge script contracts/script/SeedFlapHelixPool.s.sol:SeedFlapHelixPool \
  --rpc-url https://rpc.xlayer.tech
```

Real broadcast of the proxy hook requires (1) `DEPLOYER_PRIVATE_KEY` set, (2) an
honestly-derived `INITIAL_SQRT_PRICE_X96`, (3) deployer holds at least 0.005 OKB for gas. The
deploy script refuses to send if those conditions are not met. Real broadcast of seeding
additionally requires SKILL graduation from the Flap bonding curve.

### Re-verify source on the explorer (already done; no spend)
The deployed contracts are already verified. To reproduce, set `OK_ACCESS_KEY` (OKLink API key) in
`.env` and run, per contract:
```sh
forge build --skip test --use 0.8.33 --force
forge verify-contract <address> <path:Contract> --chain-id 196 \
  --compiler-version v0.8.33+commit.64118f21 --num-of-optimizations 200 \
  --verifier oklink \
  --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER \
  --api-key "$OK_ACCESS_KEY" --watch
```
Note: the contracts compile under solc **0.8.33** (the `^0.8.26` pragma resolves to the latest patch
via Foundry multi-version build), which is what the deployed bytecode was built with.

---

## Mapping to the judging criteria

| Criterion | Evidence |
|---|---|
| **Innovation** | First on-chain synthesis of LVR-as-objective + autonomous dynamic-fee control on Uniswap v4. Bounded self-rewriting, not governance or a static curve. |
| **Market value** | Directly protects early LPs of newly launched (Flap) tokens — the thinnest, most-toxic-flow-exposed pools on X Layer. |
| **Completeness** | Real v4 hook deployed + **verified source** on mainnet, real seeded pool, **real adaptation txs** (reflex + evolution), full adversarial test suite, live frontend reading real chain state. |

Full criterion-by-criterion evidence: [docs/JUDGING.md](docs/JUDGING.md).

---

## Tech stack (pinned)

- **Contracts:** Solidity `^0.8.26`, Foundry, `Uniswap/v4-core` + `v4-periphery`,
  `OpenZeppelin/openzeppelin-contracts` (AccessControl, Pausable), Chainlink aggregator interface,
  CREATE2 hook-address mining.
- **Frontend:** React 19 + Vite 8 + TypeScript, `viem` 2.51, `wagmi` 3.6,
  `@tanstack/react-query` 5, `recharts` 3.8, Tailwind 4. OKX Wallet connect.
- **Chain:** X Layer mainnet (chainId 196, gas token OKB), RPC `https://rpc.xlayer.tech`,
  explorer `https://www.oklink.com/x-layer`.

Credits to Uniswap (v4 core/periphery), OpenZeppelin, Chainlink, Flap, and OKX/X Layer tooling.
All HELIX logic is written from scratch; no third-party project source was forked or pasted.

---

## Disclaimer

HELIX is **experimental software** built for the OKX Build X Hackathon. It is **not financial
advice** and has not been audited. The mainnet deployment uses intentionally tiny amounts for
demonstration. Do not deposit funds you are not prepared to lose.
