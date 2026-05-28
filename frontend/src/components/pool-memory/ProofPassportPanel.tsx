import { useState } from 'react'
import type { ProofPassport, ProofPassportBadge } from '../../lib/proofPassport'
import { explorerForAddress, explorerForTx, shortHex } from '../../lib/proofPassport'

type Props = {
  passport: ProofPassport
}

type RowKind = 'address' | 'tx' | 'plain'

type Row = {
  label: string
  value?: string
  kind: RowKind
  href?: string
}

const BADGE_CLASS: Record<ProofPassportBadge, string> = {
  Live: 'passport-badge passport-badge-live',
  Verified: 'passport-badge passport-badge-verified',
  Mainnet: 'passport-badge passport-badge-mainnet',
  'Read-only': 'passport-badge passport-badge-readonly',
  'Needs proof': 'passport-badge passport-badge-needsproof',
}

function CopyButton({ value }: { value?: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <button
      type="button"
      className="passport-copy-button"
      aria-label={`Copy ${value}`}
      onClick={async (e) => {
        e.preventDefault()
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Some browsers gate clipboard.writeText behind a user gesture/permission.
          // Fall back silently — judges can still read the value next to the button.
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function PassportRow({ row }: { row: Row }) {
  const isMissing = !row.value
  const display = isMissing ? 'Not provided yet' : shortHex(row.value, 8, 6)
  return (
    <div className={`passport-row${isMissing ? ' passport-row-missing' : ''}`}>
      <div className="passport-row-label">{row.label}</div>
      <div className="passport-row-value">
        {row.href && row.value ? (
          <a href={row.href} target="_blank" rel="noreferrer" className="passport-row-link">
            {display} ↗
          </a>
        ) : (
          <span>{display}</span>
        )}
        {row.value ? <CopyButton value={row.value} /> : null}
      </div>
    </div>
  )
}

export function ProofPassportPanel({ passport }: Props) {
  const rows: Row[] = [
    { label: 'Network', value: passport.network, kind: 'plain' },
    { label: 'Chain ID', value: String(passport.chainId), kind: 'plain' },
    {
      label: 'Hook address',
      value: passport.hookAddress,
      kind: 'address',
      href: explorerForAddress(passport, passport.hookAddress),
    },
    {
      label: 'PoolManager',
      value: passport.poolManagerAddress,
      kind: 'address',
      href: explorerForAddress(passport, passport.poolManagerAddress),
    },
    {
      label: 'Pool ID',
      value: passport.poolId,
      kind: 'address',
    },
    {
      label: 'Protected pair',
      value:
        passport.token0Symbol && passport.token1Symbol
          ? `${passport.token0Symbol} / ${passport.token1Symbol}`
          : undefined,
      kind: 'plain',
    },
    {
      label: 'Token0',
      value: passport.token0,
      kind: 'address',
      href: explorerForAddress(passport, passport.token0),
    },
    {
      label: 'Token1',
      value: passport.token1,
      kind: 'address',
      href: explorerForAddress(passport, passport.token1),
    },
    {
      label: 'Oracle',
      value: passport.oracleAddress,
      kind: 'address',
      href: explorerForAddress(passport, passport.oracleAddress),
    },
    {
      label: 'Deployment tx',
      value: passport.deploymentTx,
      kind: 'tx',
      href: explorerForTx(passport, passport.deploymentTx),
    },
    {
      label: 'Pool creation tx',
      value: passport.poolCreationTx,
      kind: 'tx',
      href: explorerForTx(passport, passport.poolCreationTx),
    },
    {
      label: 'Reflex proof tx',
      value: passport.reflexProofTx,
      kind: 'tx',
      href: explorerForTx(passport, passport.reflexProofTx),
    },
    {
      label: 'Evolution proof tx',
      value: passport.evolutionProofTx,
      kind: 'tx',
      href: explorerForTx(passport, passport.evolutionProofTx),
    },
    {
      label: 'Verified source',
      value: passport.verifiedContractUrl,
      kind: 'plain',
      href: passport.verifiedContractUrl,
    },
  ]

  return (
    <section id="proof-passport" className="panel passport-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Proof Passport</span>
          <h2>Everything judges need to verify HELIX onchain.</h2>
        </div>
        <div className="passport-badges">
          {passport.badges.map((b) => (
            <span key={b} className={BADGE_CLASS[b]}>
              {b}
            </span>
          ))}
        </div>
      </div>
      <p className="panel-copy">
        Network details, contract addresses, and the live transactions that prove HELIX adapted
        fees on chain. Every link opens the OKLink X Layer explorer. Anything we cannot prove yet
        is shown as <strong>Not provided yet</strong> instead of hidden.
      </p>
      <div className="passport-grid">
        {rows.map((row) => (
          <PassportRow key={row.label} row={row} />
        ))}
      </div>
      {passport.lastUpdated ? (
        <p className="passport-footer">Snapshot last updated {passport.lastUpdated}.</p>
      ) : null}
    </section>
  )
}
