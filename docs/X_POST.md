# X / Twitter Post Drafts

Partners to tag: **@XLayerOfficial @Uniswap @flapdotsh**

---

## Main launch post

> Meet HELIX — the first AMM that learns, on-chain, to defend its own LPs. 🧬
>
> A @Uniswap v4 hook that measures Loss-Versus-Rebalancing on every swap and rewrites its own
> dynamic-fee curve — autonomously, inside hard bounds — to protect liquidity providers.
>
> Live on @XLayerOfficial mainnet. Built for Flap-launched tokens. 🧵👇

---

## Thread

**2/** The problem: a freshly launched @flapdotsh token has thin liquidity. Thin liquidity attracts
toxic arbitrage. Early LPs bleed value every time the pool price gets pushed off-market.

**3/** HELIX watches the gap between the pool price and a real Chainlink oracle. Arbitrage that
closes that gap = the toxic flow that bleeds LPs. That's the LVR signal — measured on-chain, every
swap.

**4/** Two-tier defence, fully on-chain:
• REFLEX — an acutely toxic swap pays an elevated fee for that swap only (v4 OVERRIDE_FEE_FLAG)
• EVOLUTION — sustained toxicity ratchets the baseline fee up; healthy flow relaxes it back down

**5/** It's bounded by design. The fee can NEVER leave 0.05%–2.0%. No upgradeable proxy, no admin
key that can drain the pool. The "self-rewriting" is parameter tuning inside a hard-coded envelope.

**6/** And it's real. On X Layer mainnet, HELIX raised its own baseline fee 0.30% → 0.40% after a
toxic cadence, then reflex-charged the next toxic swap 0.4086% — verifiable on the explorer:
https://www.oklink.com/x-layer/tx/0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6

**7/** Reflex proof tx:
https://www.oklink.com/x-layer/tx/0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184

Hook: 0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0

**8/** Dynamic-fee hooks exist. LVR-minimization is research. HELIX is the working synthesis —
autonomous, on-chain, LP-first. Self-defending liquidity for the @flapdotsh ecosystem on
@XLayerOfficial, powered by @Uniswap v4.

#OKXBuildX #UniswapV4 #DeFi

---

## Short / single-tweet version

> HELIX: a @Uniswap v4 hook that measures LVR and rewrites its own fee curve on-chain to defend LPs
> — within hard bounds it can never exceed. Live on @XLayerOfficial, built for @flapdotsh launches.
> The first AMM that learns to protect its own liquidity. ⛓️🧬
