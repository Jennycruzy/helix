# HELIX — Judging Criteria Map

Every claim here is backed by an artifact you can open: a mainnet transaction, a deployed address,
a test you can run, or a file in this repo.

---

## Innovation

**Claim:** HELIX is the first working on-chain synthesis of *LVR-as-objective* and *autonomous
dynamic-fee control* on Uniswap v4.

- Dynamic-fee hooks exist, and LVR-minimization is an active research topic — but fees are normally
  set by governance or a fixed formula, and LVR normally lives in off-chain dashboards. HELIX makes
  LVR an **on-chain control signal** the pool acts on by itself.
- Two-tier controller: a per-swap **REFLEX** override (`OVERRIDE_FEE_FLAG`) plus a cadence-based
  **EVOLUTION** of the baseline (`updateDynamicLPFee`). See [ARCHITECTURE.md](../ARCHITECTURE.md) §4.
- The "self-rewriting" is **bounded parameter tuning**, not arbitrary code — distinguishing it from
  both static hooks and unsafe upgradeable designs.

**Evidence:** `contracts/src/HelixHook.sol` (`beforeSwap`/`afterSwap` logic);
EVOLUTION tx [`0x100890…0454e6`](https://www.oklink.com/x-layer/tx/0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6)
showing the contract autonomously raised its own baseline fee.

---

## Market value

**Claim:** HELIX protects exactly the most-exposed liquidity on X Layer — early Flap-token pools.

- Newly launched tokens have thin liquidity → attract toxic flow and fast arbitrage → early LPs
  bleed when the pool price is repeatedly pushed off-market. This is the LP-retention problem that
  kills launch momentum.
- HELIX is positioned as a **self-defending liquidity layer for Flap-launched tokens**: it reads
  Flap `Portal` events for discovery/dashboarding and stands up a HELIX-protected v4 pool. See
  [README.md](../README.md) "Flap positioning" and [docs/GROUND_TRUTH.md](GROUND_TRUTH.md) §4.
- Honest scope: exact LVR needs a real price reference, so the live pool is `OKB/USDT0` (Chainlink
  feeds exist on X Layer). We did not fabricate a feed for a feed-less memecoin.

**Evidence:** Flap Portal `0xb30D8c4216E1f21F27444D2FfAee3ad577808678` referenced in the frontend
Flap dashboard (`frontend/src/App.tsx`); GROUND_TRUTH Phase 0 findings.

---

## Completeness

**Claim:** This is an end-to-end, working system — contracts, tests, mainnet deployment, real
adaptation, and a live frontend — not a prototype.

| Deliverable | Status | Evidence |
|---|---|---|
| Uniswap v4 hook with correct permission flags | ✅ | hook `0x9918…50C0`, address-encoded flags, `Hooks.validateHookPermissions` in `initialize` |
| Deployed + source-verified on X Layer mainnet | ✅ | all 4 contracts "Pass - Verified" on OKLink (solc `v0.8.33`, opt 200); `eth_getCode` returns 11,477 bytes; deploy txs in `deployments/xlayer-mainnet.json` |
| Dynamic-fee pool initialized + seeded | ✅ | PoolId `0x7e28…cc79`, seeder `0xB70d…b2CC`, real OKB+USDT0 settled |
| Oracle integration with safety checks | ✅ | `TokenDecimalsChainlinkRatioOracle` `0xf213…AFd2`; stale/reverted-oracle tests pass |
| **Real on-chain adaptation (reflex + evolution)** | ✅ | REFLEX tx `0x6089…f8184`, EVOLUTION tx `0x1008…54e6`, decoded events match records |
| Adversarial test suite | ✅ | `forge test --offline -vvv` → **15/15 pass** (stale/reverted oracle, fee clamp, non-manager, permission validation, reflex, evolution up/down) |
| Live frontend reading real chain state | ✅ | `frontend/src/App.tsx` reads hook/oracle/receipts via viem; owner-gated real-swap button; screenshots in `docs/demo/` |
| Docs | ✅ | README, ARCHITECTURE, DEMO, GROUND_TRUTH, VERIFICATION_LOG, this file |

**Reproduce in ~2 minutes:**
```sh
cd contracts
forge install Uniswap/v4-core Uniswap/v4-periphery OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std --no-git
forge build && forge test --offline -vvv      # 15 passed
```

---

## Safety & honesty (cross-cutting)

- **Hard fee bounds** `MIN_FEE=500 … MAX_FEE=20000` are `constant`s the hook cannot exceed; `_clampFee`
  is applied to every emitted fee.
- **No drain path / no proxy** — the hook holds no user funds beyond v4 accounting; only privileged
  actions are pause and bounded `setConfig`.
- **Fail-safe oracle** — bad/stale reads skip adaptation (`OracleSkipped`) instead of acting.
- **Source verified.** All four contracts show "Pass - Verified" on the OKLink X Layer explorer
  (solc `v0.8.33+commit.64118f21`, optimizer 200 runs) — and their behavior is independently proven
  on-chain by the adaptation transactions (see [VERIFICATION_LOG.md](../VERIFICATION_LOG.md)).

---

## Known limitations (stated up front)

1. LVR is a directional, oracle-anchored **proxy**, not exact closed-form CFMM-LVR (roadmap in
   ARCHITECTURE §3).
2. Exact LVR requires a real feed → live pool is oracle-covered `OKB/USDT0`, not a fresh memecoin.
3. `evolutionCadence = 3` is demo-tuned for fast visible adaptation; production would use a larger
   window.
