# HELIX — Live Demo Run-of-Show (1–3 minutes)

Goal: a judge understands and *verifies* HELIX defending LPs in under three minutes. Everything is
real on X Layer mainnet — no mock data, no staged screenshots.

**Key links to have open in tabs before you start:**

- Frontend dashboard (local): `http://127.0.0.1:5173` after `cd frontend && npm install && npm run dev`
- REFLEX proof tx: https://www.oklink.com/x-layer/tx/0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184
- EVOLUTION proof tx: https://www.oklink.com/x-layer/tx/0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6
- Hook on explorer: https://www.oklink.com/x-layer/address/0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0

---

## The 90-second story (say this)

> "When a Flap token launches, its pool is thin — perfect prey for toxic arbitrage that bleeds the
> early LPs. HELIX is a Uniswap v4 hook that measures that bleed — Loss-Versus-Rebalancing —
> against a real Chainlink price, and rewrites its own fee curve on-chain to defend the LPs.
> It starts conservative, spikes the fee on an acutely toxic swap, and ratchets its baseline fee up
> when toxicity persists — all inside hard bounds it can never exceed. Here it is, live on X Layer."

---

## Run-of-show

### 0. (10s) Frame it
Point at the hero: **"current HELIX fee"** reading live from the deployed hook on X Layer mainnet.
Say: "This number is read straight from the contract — not a database."

### 1. (20s) Show the autobiography
Scroll to **"Fee curve over live adaptation events."** Each point is a real on-chain adaptation.
Say: "This chart is built only from emitted events. The pool's fee history *is* its decision log."

### 2. (25s) The EVOLUTION moment
Open the **EVOLUTION proof tx** tab. Show the decoded `BaselineFeeUpdated`:
`oldFee 3000 → newFee 4000`, `reason EVOLUTION_UP`, `swapsObserved 3`.
Say: "After three toxic swaps, the pool decided — on-chain — to raise its resting fee from 0.30%
to 0.40% to protect LPs. No governance vote, no admin. The hook called `updateDynamicLPFee` itself."

### 3. (25s) The REFLEX moment
Open the **REFLEX proof tx** tab. Show `ReflexFeeQuoted` `4000 → 4086`, and the PoolManager `Swap`
event in the *same transaction* showing fee `4086` was actually charged.
Say: "The very next toxic swap got hit with a one-time elevated fee — 0.4086% — just for that swap,
via Uniswap v4's fee-override flag. Acute defence on top of the slow baseline learning."

### 4. (20s) Prove the bounds + safety
Say: "It can't run away. Fees are clamped to a hard-coded 0.05%–2.0% band; there's no proxy, no key
that can drain the pool, and a stale or reverting oracle makes it *skip* adaptation rather than act
on bad data." (Optionally point to the `MIN_FEE`/`MAX_FEE` constants in `contracts/src/HelixHook.sol`.)

### 5. (20s) Live trigger (optional, spends ~0.005 USDT0)
If the **deployer OKX wallet** is connected: click **"Run real toxic swap."** It approves and sends
a real toxic USDT0→OKB swap through the deployed `HelixSwapExecutor`, then the dashboard refreshes
with the new event. Say: "That's a brand-new mainnet adaptation, live, right now."

> The button is owner-gated to the deployer wallet on purpose. If you're not connected as the
> deployer, skip this step — the read-only proof in steps 2–3 already stands on its own.

---

## Flap framing (weave in during step 0 or 4)

> "Integration is honest: HELIX reads Flap's `Portal` events on X Layer to discover and dashboard a
> launched token. Exact LVR needs a real price feed, so this live pool is OKB/USDT0 where Chainlink
> feeds exist — a fresh memecoin without a feed would use a clearly-labeled fallback, which we did
> not fake."

---

## If the network/wallet misbehaves (fallback)

1. The two **proof transactions** above are permanent on X Layer — open them directly; the story in
   steps 2–3 needs no local server and no wallet.
2. Recorded screenshots of the loaded dashboard are in [`docs/demo/`](docs/demo/)
   (`phase6-frontend-loaded.png`).
3. The full deployment + tx record is in [`deployments/xlayer-mainnet.json`](deployments/xlayer-mainnet.json)
   and [`VERIFICATION_LOG.md`](VERIFICATION_LOG.md).

---

## One-line close

> "HELIX is the first AMM that learns, on-chain, to defend its own LPs — and you just verified it on
> X Layer."
