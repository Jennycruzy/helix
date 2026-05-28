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

> "HELIX is a self-defending liquidity layer for X Layer pools. It runs in two modes. **Oracle-backed
> LVR mode** measures Loss-Versus-Rebalancing against a real Chainlink price and rewrites the pool's
> fee curve on-chain to defend LPs — we'll prove that live on OKB/USDT0. **Flap Launch Protection
> Proxy mode** detects new Flap-launched tokens like SKILL and shows readiness for a proxy-mode
> defense pathway. HELIX is not only a Flap product — Flap is the launchpad use case; HELIX is the
> defense surface for any X Layer pool that wants it."

---

## Run-of-show

### 0. (10s) Frame it
Point at the hero: **"HELIX is a self-defending liquidity layer for X Layer pools."** Three hero
buttons make the modes obvious:
- **View Live OKB/USDT0 Proof** → Mode 1 (oracle-backed LVR)
- **Check Flap Token** → Mode 2 (Flap Launch Protection Proxy, example: SKILL)
- **Check Any X Layer Token** → generic mode checker

Say: "Two modes, plus a checker for anything else on X Layer."

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

### 5. (20s) Pool Autobiography — the pool tells its own story
Scroll to **"Pool Autobiography"**. Each card is reconstructed from a real on-chain HELIX event.
Say: "The pool explains, in plain English, every defense it has run. The first card is *now* —
what epoch the pool is in this second. Below that, every reflex, every baseline evolution, every
oracle skip is a card with a block number and an explorer link." Click any card's tx link → it
opens the same OKLink event a judge would inspect manually.

### 6. (20s) Proof Passport — judge-ready verification card
Scroll to **"Proof Passport"**. Say: "Everything you need to verify HELIX is on this one card —
network, chain ID, hook address, PoolManager, pool ID, the protected pair, the oracle, and the
deployment / pool-creation / reflex / evolution transactions." Hit any **Copy** button or click
any address → it opens on OKLink X Layer. Anything not yet proved is shown as **"Not provided
yet"** — missing proof is never hidden.

### 7. (20s) Live trigger (optional, spends ~0.005 USDT0)
If the **deployer OKX wallet** is connected: click **"Run real toxic swap."** It approves and sends
a real toxic USDT0→OKB swap through the deployed `HelixSwapExecutor`, then the dashboard refreshes
with the new event. Say: "That's a brand-new mainnet adaptation, live, right now."

> The button is owner-gated to the deployer wallet on purpose. If you're not connected as the
> deployer, skip this step — the read-only proof in steps 2–3 already stands on its own.

---

## Flap framing (weave in during step 0 or 4)

> "OKB/USDT0 proves the full oracle-backed LVR mode. SKILL (ClawHub) demonstrates the Flap Launch
> Protection pathway: HELIX detects the Flap token live from X Layer and runs a dedicated
> HelixFlapProxyHook on a real SKILL/OKB v4 pool. The hook starts the fee at 5% as a launch
> shield, decays it to 0.5% over 20 000 blocks, and bumps an extra 0.5% on any swap larger than
> 5% of pool liquidity — all without consulting any external oracle. HELIX is not only a Flap
> product; Flap is the launchpad use case."

### Demo the Flap mode (10s, no spend)
1. Click **Check Flap Token** in the hero.
2. The Flap Launch Protection panel scrolls into view and the input is auto-focused.
3. Paste the SKILL Flap URL: `https://flap.sh/xlayer/0xed06d48a87f8b8b3e78afd7dd59717a3f7317777`.
4. The panel reads the token's metadata live (name `ClawHub`, symbol `SKILL`, decimals `18`) and
   labels it Launch Protection Proxy Mode — pointing at the real **HelixFlapProxyHook**
   (`0x6c3eC6213b84c7E2267A24a81A2c23147e1950c0`) and the real proxy-hook SKILL/OKB pool
   (`0x74acb2…fba7`) on X Layer mainnet. No fake oracle, no fake liquidity.

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
