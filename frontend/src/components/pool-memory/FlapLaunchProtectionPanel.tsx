import { useState } from 'react'

export type DetectedToken = {
  address: string
  name: string
  symbol: string
  decimals: number
}

type Props = {
  // The token that the active demo pool has reliable oracle coverage for.
  oracleCoveredToken: string
  flapPortal: string
  explorerAddress: (address: string) => string
  // Reads ERC-20 metadata live from X Layer. Returns null if the address has no
  // readable metadata (so we never fake a token).
  detectToken: (address: string) => Promise<DetectedToken | null>
}

// Pull the first 0x… 40-hex address out of a pasted Flap URL or raw address.
function extractAddress(input: string): string | null {
  const match = input.match(/0x[a-fA-F0-9]{40}/)
  return match ? match[0] : null
}

export function FlapLaunchProtectionPanel({
  oracleCoveredToken,
  flapPortal,
  explorerAddress,
  detectToken,
}: Props) {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [token, setToken] = useState<DetectedToken | null>(null)
  const [loading, setLoading] = useState(false)

  const isOracleBacked =
    token != null && token.address.toLowerCase() === oracleCoveredToken.toLowerCase()
  const mode = token
    ? isOracleBacked
      ? 'Oracle-backed LVR mode'
      : 'Launch-protection proxy mode'
    : null

  async function onDetect() {
    setToken(null)
    const address = extractAddress(input.trim())
    if (!address) {
      setStatus('Paste a Flap token address (0x…) or a Flap URL that contains one.')
      return
    }
    setLoading(true)
    setStatus(`Reading ERC-20 metadata for ${address} from X Layer…`)
    try {
      const detected = await detectToken(address)
      if (!detected) {
        setStatus(
          `Could not read token metadata for ${address} on X Layer. It may not be an ERC-20 or not yet deployed.`,
        )
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
    <section className="panel flap-protection-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Flap Launch Protection</span>
          <h2>Flap launches the token. HELIX protects the liquidity after.</h2>
        </div>
        <a href={explorerAddress(flapPortal)} target="_blank" rel="noreferrer">
          Flap Portal
        </a>
      </div>

      <p className="panel-copy">
        For assets with reliable oracle coverage, HELIX uses oracle-anchored LVR-like
        signals. For very new Flap tokens without a reliable oracle, HELIX operates in
        launch-protection mode using toxic-flow proxy signals.
      </p>

      <div className="flap-detect">
        <input
          className="flap-input"
          placeholder="Paste Flap token address or Flap URL"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="ghost-button" onClick={onDetect} disabled={loading} type="button">
          {loading ? 'Detecting…' : 'Detect token'}
        </button>
      </div>

      {status ? <p className="run-status">{status}</p> : null}

      {token ? (
        <div className="flap-grid">
          <Fact label="Token name" value={token.name || 'Unavailable'} />
          <Fact label="Symbol" value={token.symbol || 'Unavailable'} />
          <Fact label="Decimals" value={String(token.decimals)} />
          <Fact label="Address" value={token.address} />
          <Fact label="HELIX mode" value={mode ?? 'Unavailable'} />
          <Fact
            label="Oracle"
            value={
              isOracleBacked
                ? 'Reliable feed available — oracle-anchored LVR active.'
                : 'No reliable feed assumed — proxy launch protection. Very new Flap tokens often have no oracle yet.'
            }
          />
        </div>
      ) : null}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
