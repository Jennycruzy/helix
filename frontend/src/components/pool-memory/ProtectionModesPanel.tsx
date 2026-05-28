import { useState } from 'react'
import type { DetectedToken } from './FlapLaunchProtectionPanel'

export type OracleBackedCardProps = {
  currentFeeBps: string
  toxicScoreCompact: string
  latestReflexTx: string | null
  latestEvolutionTx: string | null
  hookAddress: string
  oracleAddress: string
  poolId: string
  pairLabel: string
  explorerAddress: (a: string) => string
  explorerTx: (t: string) => string
}

export type FlapProxyCardProps = {
  flapTokenAddress: string
  flapTokenName: string
  flapTokenSymbol: string
  flapTokenDecimals: number
  flapTokenUrl: string
  pairCandidate: string
  // 'live' = pool created and seeded
  // 'pool-initialized-awaiting-graduation' = real v4 pool exists onchain but
  //   the Flap token contract blocks DEX seeding until it graduates from the
  //   bonding curve. Honest middle state — pool is real, defense is ready,
  //   liquidity will follow.
  // 'pool-creation-required' = token verified but pool not yet created
  // 'waiting-for-token-balance' = deployer lacks SKILL or OKB to seed
  // 'token-detection-failed' = could not read ERC-20 metadata
  status:
    | 'live'
    | 'pool-initialized-awaiting-graduation'
    | 'pool-creation-required'
    | 'waiting-for-token-balance'
    | 'token-detection-failed'
  deployerSkillBalance: string
  deployerOkbBalance: string
  // v4 pools are identified by a bytes32 poolId, not a per-pool address. The
  // PoolManager address is shared by all v4 pools.
  poolId: string | null
  poolManagerAddress: string | null
  hookAddress: string | null
  latestTx: string | null
  explorerAddress: (a: string) => string
  explorerTx: (t: string) => string
}

export type ModeCheckerProps = {
  detectToken: (address: string) => Promise<DetectedToken | null>
  // Token addresses with a verified Chainlink price feed on X Layer. The
  // active deployment uses oracleCoveredToken (USDT0); other tokens in
  // oracleReadyTokens (e.g. OKB, USDT) have feeds available and could be
  // protected by Oracle-backed LVR mode if a HELIX pool were deployed for
  // them. Any token not in either list defaults to Launch Protection Proxy
  // mode in the recommendation, because we cannot honestly claim oracle
  // coverage we have not verified.
  oracleCoveredToken: string
  oracleReadyTokens: readonly string[]
}

function StatusPill({
  tone,
  children,
}: {
  tone: 'live' | 'warn' | 'wait' | 'fail'
  children: React.ReactNode
}) {
  const cls =
    tone === 'live'
      ? 'event-kind evolution'
      : tone === 'warn'
        ? 'event-kind reflex'
        : tone === 'wait'
          ? 'event-kind reflex'
          : 'event-kind reflex'
  return <span className={cls}>{children}</span>
}

function MiniFact({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--ember)', fontWeight: 900 }}>
          {value}
        </a>
      ) : (
        <strong>{value}</strong>
      )}
    </div>
  )
}

export function OracleBackedCard(props: OracleBackedCardProps) {
  return (
    <section id="oracle-backed-mode" className="panel" data-mode="oracle-backed">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Mode 1 / Oracle-backed LVR</span>
          <h2>{props.pairLabel}</h2>
        </div>
        <StatusPill tone="live">Live proof pool</StatusPill>
      </div>
      <p className="panel-copy">
        Uses reliable oracle-backed price references to prove HELIX's full LVR-style toxic-flow
        detection and dynamic-fee adaptation. Every adaptation below is a real X Layer mainnet
        transaction.
      </p>
      <div className="flap-grid">
        <MiniFact label="Current fee" value={`${props.currentFeeBps} bps`} />
        <MiniFact label="Toxic-flow score" value={props.toxicScoreCompact} />
        <MiniFact label="PoolId" value={props.poolId} />
        <MiniFact
          label="Hook address"
          value={props.hookAddress}
          href={props.explorerAddress(props.hookAddress)}
        />
        <MiniFact
          label="Oracle address"
          value={props.oracleAddress}
          href={props.explorerAddress(props.oracleAddress)}
        />
        <MiniFact
          label="Latest reflex tx"
          value={props.latestReflexTx ?? 'No reflex yet'}
          href={props.latestReflexTx ? props.explorerTx(props.latestReflexTx) : undefined}
        />
        <MiniFact
          label="Latest evolution tx"
          value={props.latestEvolutionTx ?? 'No evolution yet'}
          href={props.latestEvolutionTx ? props.explorerTx(props.latestEvolutionTx) : undefined}
        />
      </div>
    </section>
  )
}

// FlapProxyCard is a status summary card (no input). The Flap "checker" input
// lives in FlapLaunchProtectionPanel (id="flap-launch-mode").
export function FlapProxyCard(props: FlapProxyCardProps) {
  const tone =
    props.status === 'live' || props.status === 'pool-initialized-awaiting-graduation'
      ? 'live'
      : props.status === 'token-detection-failed'
        ? 'fail'
        : 'wait'

  const statusText =
    props.status === 'live'
      ? 'Live Flap pool'
      : props.status === 'pool-initialized-awaiting-graduation'
        ? 'Pool initialized — awaiting SKILL graduation'
        : props.status === 'pool-creation-required'
          ? 'Pool creation required'
          : props.status === 'waiting-for-token-balance'
            ? 'Waiting for token balance'
            : 'Token detection failed'

  return (
    <section className="panel" data-mode="flap-proxy">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Mode 2 / Flap Launch Protection Proxy</span>
          <h2>{props.pairCandidate}</h2>
        </div>
        <StatusPill tone={tone}>{statusText}</StatusPill>
      </div>
      <p className="panel-copy">
        Uses a real Flap-launched token. Because new Flap tokens may not have reliable external
        oracle feeds, this pool runs in <strong>proxy mode</strong> instead of oracle-backed LVR
        mode. The HelixFlapProxyHook is live on X Layer mainnet: a launch-window shield fee starts
        at 5.00% and linearly decays to a 0.50% baseline over 20000 blocks; any single swap larger
        than 5% of current pool liquidity gets a +0.50% size-reflex bump for that swap only. No
        external oracle is consulted.
      </p>
      <div className="flap-grid">
        <MiniFact label="Token name" value={props.flapTokenName || 'Unavailable'} />
        <MiniFact label="Symbol" value={props.flapTokenSymbol || 'Unavailable'} />
        <MiniFact label="Decimals" value={String(props.flapTokenDecimals)} />
        <MiniFact
          label="Token address"
          value={props.flapTokenAddress}
          href={props.explorerAddress(props.flapTokenAddress)}
        />
        <MiniFact label="Flap page" value="flap.sh launchpad" href={props.flapTokenUrl} />
        <MiniFact
          label="Deployer SKILL balance"
          value={props.deployerSkillBalance + ' (raw)'}
        />
        <MiniFact
          label="Deployer OKB balance"
          value={props.deployerOkbBalance + ' (wei)'}
        />
        <MiniFact label="PoolId (bytes32)" value={props.poolId ?? 'Not yet created'} />
        <MiniFact
          label="PoolManager"
          value={props.poolManagerAddress ?? 'n/a'}
          href={props.poolManagerAddress ? props.explorerAddress(props.poolManagerAddress) : undefined}
        />
        <MiniFact
          label="Hook attached"
          value={
            !props.hookAddress || props.hookAddress === '0x0000000000000000000000000000000000000000'
              ? 'None'
              : `HelixFlapProxyHook ${props.hookAddress}`
          }
          href={
            props.hookAddress && props.hookAddress !== '0x0000000000000000000000000000000000000000'
              ? props.explorerAddress(props.hookAddress)
              : undefined
          }
        />
        <MiniFact
          label="Latest tx"
          value={props.latestTx ?? 'No tx yet'}
          href={props.latestTx ? props.explorerTx(props.latestTx) : undefined}
        />
      </div>
      {props.status === 'waiting-for-token-balance' ? (
        <p className="run-status">
          Honest status: deployer wallet currently has 0 SKILL. A live Flap-token pool is not yet
          claimed. The OKB/USDT0 oracle-backed proof pool above is what carries the HELIX live
          demo.
        </p>
      ) : null}
      {props.status === 'pool-initialized-awaiting-graduation' ? (
        <p className="run-status">
          Honest status: a real Uniswap v4 SKILL/OKB pool with the HelixFlapProxyHook attached is
          live on X Layer mainnet (see poolId + initialize tx above). The hook is deployed and
          initialised; the launch-shield fee curve is in place. Liquidity seeding still reverts at
          the SKILL token contract ("Transfers to/from pools are restricted in BondingCurve
          state") because SKILL is on the Flap bonding curve. Once SKILL graduates, the same hook
          will start adapting fees on real swaps.
        </p>
      ) : null}
    </section>
  )
}

function extractAddress(input: string): string | null {
  const match = input.match(/0x[a-fA-F0-9]{40}/)
  return match ? match[0] : null
}

export function ModeCheckerCard({
  detectToken,
  oracleCoveredToken,
  oracleReadyTokens,
}: ModeCheckerProps) {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [token, setToken] = useState<DetectedToken | null>(null)
  const [loading, setLoading] = useState(false)

  const recommendation = (() => {
    if (!token) return null
    const addr = token.address.toLowerCase()
    if (addr === oracleCoveredToken.toLowerCase()) {
      return {
        label: 'Oracle-backed LVR Mode — LIVE proof pool',
        detail:
          'This is the token in the current OKB/USDT0 HELIX live proof pool on X Layer. Full oracle-anchored LVR adaptation is already running for it; the on-chain events behind every defense card come from this pool.',
      }
    }
    if (oracleReadyTokens.some((t) => t.toLowerCase() === addr)) {
      return {
        label: 'Oracle-backed LVR Mode — oracle-ready',
        detail:
          'This token has a verified Chainlink price feed on X Layer. A HELIX pool deployed for it could run full Oracle-backed LVR mode (reflex + baseline evolution against the Chainlink reference). It is not in the current live proof pool, but it is oracle-ready.',
      }
    }
    return {
      label: 'Launch Protection Proxy Mode',
      detail:
        'No verified Chainlink feed for this token on X Layer. HELIX would protect a pool here with the HelixFlapProxyHook: launch-shield fee decaying to the baseline over its decay window, plus a one-swap size-reflex bump on outsized swaps. No external oracle is consulted in this mode.',
    }
  })()

  async function onDetect() {
    setToken(null)
    setStatus('')
    const address = extractAddress(input.trim())
    if (!address) {
      setStatus('Paste an X Layer ERC-20 token address (0x…).')
      return
    }
    setLoading(true)
    setStatus(`Reading ERC-20 metadata for ${address} from X Layer…`)
    try {
      const detected = await detectToken(address)
      if (!detected) {
        setStatus(`Could not read token metadata for ${address}. May not be an ERC-20.`)
        return
      }
      setToken(detected)
      setStatus('Token metadata read live from X Layer. No mocked data.')
    } catch {
      setStatus(`Failed to read ${address} from X Layer.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="xlayer-token-checker" className="panel" data-mode="checker">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Mode 3 / Any X Layer token</span>
          <h2>Mode Checker</h2>
        </div>
      </div>
      <p className="panel-copy">
        Paste any X Layer ERC-20 token address. HELIX reads its metadata live from chain, checks
        whether it has a verified Chainlink feed on X Layer, and recommends Oracle-backed LVR or
        Launch Protection Proxy mode. (For Flap-launched tokens specifically, use the dedicated
        Flap Launch Protection panel below — it does the same check plus Flap-portal metadata.)
      </p>
      <div className="flap-detect">
        <input
          id="xlayer-checker-input"
          className="flap-input"
          placeholder="X Layer token address (0x…)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="ghost-button" onClick={onDetect} disabled={loading} type="button">
          {loading ? 'Detecting…' : 'Check mode'}
        </button>
      </div>
      {status ? <p className="run-status">{status}</p> : null}
      {token && recommendation ? (
        <div className="flap-grid">
          <MiniFact label="Name" value={token.name || 'Unavailable'} />
          <MiniFact label="Symbol" value={token.symbol || 'Unavailable'} />
          <MiniFact label="Decimals" value={String(token.decimals)} />
          <MiniFact label="Recommended mode" value={recommendation.label} />
          <div className="fact" style={{ gridColumn: 'span 3' }}>
            <span>Why</span>
            <strong style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>
              {recommendation.detail}
            </strong>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function ProtectionModesPanel({
  oracle,
  flap,
  modeChecker,
}: {
  oracle: OracleBackedCardProps
  flap: FlapProxyCardProps
  modeChecker: ModeCheckerProps
}) {
  return (
    <section className="panel" data-mode="protection-modes">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Protection Modes</span>
          <h2>HELIX is a self-defending liquidity layer for X Layer pools</h2>
        </div>
      </div>
      <p className="panel-copy">
        HELIX is not only a Flap product. Flap is the launchpad use case. The broader product is
        self-defending liquidity for X Layer pools. OKB/USDT0 proves the full oracle-backed LVR
        mode. SKILL demonstrates the Flap Launch Protection pathway.
      </p>
      <div className="protection-modes-grid">
        <OracleBackedCard {...oracle} />
        <FlapProxyCard {...flap} />
      </div>
      <div style={{ marginTop: 16 }}>
        <ModeCheckerCard {...modeChecker} />
      </div>
    </section>
  )
}
