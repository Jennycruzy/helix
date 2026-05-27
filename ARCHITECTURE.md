# HELIX Architecture

HELIX is a single Uniswap v4 hook (`HelixHook`) plus a price oracle adapter. It turns
Loss-Versus-Rebalancing (LVR) into an on-chain control signal and uses it to move the pool's
dynamic LP fee inside a hard-coded safety envelope. This document describes the math, the control
loop, the safety model, and the oracle design.

---

## 1. Components

```
                         ┌───────────────────────────────────────────┐
                         │            Uniswap v4 PoolManager           │
                         │   0x360e68faccca8ca495c1b759fd9eee466db9fb32 │
                         └───────────────┬─────────────────────────────┘
            hook callbacks (onlyManager) │  updateDynamicLPFee
                                         ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                              HelixHook                                 │
   │  • afterInitialize  → set baseline fee, call updateDynamicLPFee       │
   │  • beforeSwap       → REFLEX per-swap override (OVERRIDE_FEE_FLAG)     │
   │  • afterSwap        → accumulate LVR, EVOLUTION baseline update        │
   │  • bounds: MIN_FEE=500 .. MAX_FEE=20000 (hundredths of a bip)          │
   │  • AccessControl + Pausable + non-reentrant guard                      │
   └───────────────┬───────────────────────────────────────────────────────┘
                   │ oracle.read(key)  (try/catch, staleness-checked)
                   ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │           TokenDecimalsChainlinkRatioOracle  (IHelixOracle)             │
   │  combines two Chainlink USD feeds into a decimals-adjusted              │
   │  base/quote ratio in 1e18 fixed point + the older updatedAt timestamp   │
   │   OKB/USD 0x4Ff345b18a2bF894F8627F41501FBf30d5C5e7BE                     │
   │   USDT/USD 0xb928a0678352005a2e51F614efD0b54C9830dB80                    │
   └───────────────────────────────────────────────────────────────────────┘
```

- **`HelixHook.sol`** — the brain. Implements `IHooks` directly (not via `BaseHook`) with strict
  permission-flag validation, so the deployed address must encode exactly
  `afterInitialize | beforeSwap | afterSwap`.
- **`IHelixOracle`** — the abstraction the hook depends on: `read(PoolKey) → (priceE18, updatedAt)`.
- **`TokenDecimalsChainlinkRatioOracle.sol`** — production oracle. Reads OKB/USD and USDT/USD
  Chainlink aggregators, divides them, and adjusts for the 18-vs-6 decimal gap between OKB and
  USDT0 so the ratio is directly comparable to the v4 pool's raw price units.
- **`ChainlinkRatioOracle.sol`** — the simpler same-decimals variant (legacy OKB/USDT pool).
- **`HelixLiquiditySeeder.sol` / `HelixSwapExecutor.sol`** — minimal v4 `unlock`-callback helpers
  to add liquidity and execute exact-input swaps; the swap executor is owner-gated.

---

## 2. Price units

The v4 pool stores `sqrtPriceX96`. The hook derives a comparable price:

```
poolPriceE18 = (sqrtPriceX96² / 2⁹⁶) · 1e18 / 2⁹⁶      // FullMath.mulDiv, no overflow
```

The oracle returns `priceE18` in the same fixed-point convention, with the token-decimal
adjustment baked in for the OKB(18)/USDT0(6) pair. Both numbers are therefore the same "raw pool
price unit", which is why the dashboard labels them *raw* oracle/pool price — they are meaningful
relative to each other, which is all LVR needs.

---

## 3. The LVR signal

For each swap, in `beforeSwap`, the hook builds a `SwapContext`:

```
divergenceBps = |poolPriceE18 − oraclePriceE18| / oraclePriceE18 × 10_000     // _absDiffBps
toxic         = swap pushes pool FURTHER from oracle in the arb direction      // _isToxic
lvrSignal     = toxic ? divergenceBps × |amountSpecified| : 0                  // _computeLvrSignal
```

`_isToxic` encodes the core idea — arbitrage that *closes* a pool-vs-true price gap is the toxic
flow that bleeds LPs:

```
if poolPrice > oraclePrice:  toxic = zeroForOne      // selling token0 pushes price down toward oracle
if poolPrice < oraclePrice:  toxic = !zeroForOne     // buying token0 pushes price up toward oracle
```

The signal combines **how far** the pool is dislocated (`divergenceBps`) with **how much size** is
crossing at that dislocation (`amountSpecified`) — a directional, size-weighted proxy for the
rebalancing loss the LPs are absorbing.

### Honest limitation

This is an **oracle-anchored LVR proxy**, not the exact closed-form CFMM-LVR. It captures the sign
and rough magnitude of toxic, price-correcting flow — exactly what a fee controller needs to react
— but it does not integrate the instantaneous rebalancing loss in closed form, and its accuracy is
bounded by the oracle's update frequency and precision. Roadmap: exact per-block CFMM-LVR via the
marginal-price path, and per-token feeds (or TWAP/escrow fallback) for assets lacking a canonical
Chainlink feed.

---

## 4. Two-tier adaptation

### Tier 1 — REFLEX (per swap, `beforeSwap`)

```
if toxic AND divergenceBps ≥ reflexThresholdBps:
    delta      = min(divergenceBps · reflexFeeMultiplierBps / 10_000, maxReflexFeeDelta)
    overrideFee = clamp(baselineFee + delta, MIN_FEE, MAX_FEE)
    emit ReflexFeeQuoted(...)
    return overrideFee | OVERRIDE_FEE_FLAG          // applies to THIS swap only
```

The override never persists; the next swap starts from the baseline again. This is the acute
defence: a single very toxic swap pays more, immediately.

### Tier 2 — EVOLUTION (cadence, `afterSwap`)

`afterSwap` accumulates `cumulativeLvrSignal` and `swapsSinceEvolution`. Every `evolutionCadence`
swaps it computes the average signal and nudges the baseline:

```
avgSignal = cumulativeLvrSignal / swapsSinceEvolution

if avgSignal ≥ evolutionThresholdBps:    newFee = clamp(baseline + evolutionStepUp)   // EVOLUTION_UP
elif avgSignal ≤ healthyThresholdBps:    newFee = clamp(baseline − evolutionStepDown) // EVOLUTION_DOWN
else:                                    newFee = baseline                            // hold

if newFee != baseline:
    poolManager.updateDynamicLPFee(key, newFee)
    emit BaselineFeeUpdated(...)
reset accumulators
```

This is the slow learning: persistent toxicity ratchets the resting fee up to protect LPs;
sustained healthy flow relaxes it back down to stay competitive — the pool's fee curve literally
rewrites itself over its trading history.

### Deployed configuration (X Layer mainnet `OKB/USDT0`)

| Param | Value | Meaning |
|---|---|---|
| `initialFee` | 3000 | 0.30% starting baseline |
| `MIN_FEE` / `MAX_FEE` | 500 / 20000 | hard bounds: 0.05% – 2.0% (constants, not configurable) |
| `reflexThresholdBps` | 200 | 2% pool-vs-oracle gap triggers a reflex override |
| `reflexFeeMultiplierBps` | 1000 | reflex delta = 10% of the divergence (bps) |
| `maxReflexFeeDelta` | 6000 | reflex can add at most +0.60% on top of baseline |
| `evolutionCadence` | 3 | re-evaluate baseline every 3 counted swaps |
| `evolutionThresholdBps` | 300 | avg signal above this → raise baseline |
| `healthyThresholdBps` | 50 | avg signal below this → lower baseline |
| `evolutionStepUp` / `evolutionStepDown` | 1000 / 500 | +0.10% up, −0.05% down per evolution |
| `maxOracleAge` | 1 day | oracle reads older than this are rejected (skip adaptation) |

(`evolutionCadence = 3` is intentionally small so the live demo can show an evolution within a
handful of swaps; a production pool would use a larger window.)

---

## 5. Safety envelope

- **Bounded power.** `_clampFee` is applied to *every* fee the hook ever emits — reflex and
  evolution alike — so the fee can never leave `[MIN_FEE, MAX_FEE]`. These are `constant`s; there
  is no setter and no proxy for the hook logic.
- **No custody / no drain.** The hook holds no user funds beyond v4 flash-accounting. There is no
  function that transfers pool liquidity out. Privileged surface = `pause`/`unpause` and `setConfig`
  (and `setConfig` is itself bounded by `MIN_FEE`/`MAX_FEE`/non-zero cadence checks).
- **Oracle as untrusted input.** `oracle.read` is wrapped in `try/catch`. `_isOracleFresh` rejects
  zero price, zero timestamp, and anything older than `maxOracleAge`. On any failure the hook emits
  `OracleSkipped` and proceeds with the unchanged baseline — it never adapts on bad data.
- **Reentrancy + caller gating.** `afterInitialize`/`beforeSwap`/`afterSwap` carry `onlyManager`
  (must be the PoolManager), `whenNotPaused`, and a `nonReentrantHook` guard. State is written
  before the external `updateDynamicLPFee` call (checks-effects-interactions).
- **Address integrity.** The hook is deployed via CREATE2 with a mined salt so its address encodes
  exactly the three permission flags it uses; `initialize` calls `Hooks.validateHookPermissions`
  and reverts if the address doesn't match.

---

## 6. Event log = the pool's memory

| Event | Emitted when | Key fields |
|---|---|---|
| `HelixInitialized` | `initialize` | admin, poolManager, oracle |
| `BaselineFeeUpdated` | evolution changes baseline | oldFee, newFee, lvrSignal, reason, swapsObserved, prices |
| `ReflexFeeQuoted` | reflex override applied | oldFee, newFee, lvrSignal, reason, prices |
| `OracleSkipped` | bad/stale oracle read | reason (`ORACLE_STALE` / `ORACLE_REVERT`) |
| `ConfigUpdated` | admin `setConfig` | full config |

The frontend reconstructs the fee-curve chart and event feed entirely from these on-chain events —
no mocked data — and links each one to its X Layer explorer transaction.

---

## 7. Pool-memory identity layer (frontend-derived, no contract change)

HELIX's "pool-memory hook" identity — **Pool Memory, Defense Epochs, Fee Curve Evolution, Pool
Learning** — is built **entirely in the frontend** from the events above plus live view getters
(`currentFee`, `currentToxicFlowScore`, `poolState`, `config`). **No contract change and no
redeployment were required**, which is why the verified mainnet bytecode and all deployed addresses
are untouched.

```
HelixHook events + view getters  ─▶  src/lib/poolMemory.ts   ─▶  PoolMemory  ─▶  panels
   ReflexFeeQuoted                     src/lib/defenseEpochs.ts    (epoch)        PoolMemoryPanel
   BaselineFeeUpdated                  src/lib/feeEvolution.ts     (fee band)     DefenseEpochBadge
   OracleSkipped                                                                  FeeCurveEvolutionChart
   poolState / config                                                            LearningLoopExplainer
```

| Layer | Source of truth | Notes |
|---|---|---|
| Pool Memory | reflex/evolution event counts + live `poolState` | `totalSwapsObserved = Σ BaselineFeeUpdated.swapsObserved + live swapsSinceEvolution` |
| Defense Epoch | `classifyDefenseEpoch(memory)` | presentation only; precedence Oracle-safe → Launch → Adaptive → Calm; `LAUNCH_SWAP_THRESHOLD = 12` |
| Fee Curve Evolution | reflex (temporary) vs baseline (persistent) events | fee band breakpoints in `feeEvolution.ts`; bounded controller, **not AI** |
| Pool Learning | observe → measure → defend → evolve → remember | bounded parameter tuning, **not** code mutation |

Because epochs and bands are computed off-chain, they can never override the hook or relax its
`MIN_FEE`/`MAX_FEE` bounds — they only *describe* what the on-chain controller already did. The
**Flap Launch Protection** panel additionally reads ERC-20 metadata (`name`/`symbol`/`decimals`)
live for any pasted Flap token address/URL, and labels whether the token is in oracle-anchored LVR
mode (reliable feed) or launch-protection proxy mode (no reliable feed yet) — never faking
metadata or a feed.
