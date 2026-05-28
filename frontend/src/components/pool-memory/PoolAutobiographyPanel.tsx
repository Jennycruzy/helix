import type { PoolAutobiographyEntry, AutobiographySeverity } from '../../lib/poolAutobiography'
import { EPOCH_META } from '../../lib/defenseEpochs'

type Props = {
  entries: readonly PoolAutobiographyEntry[]
}

const SEVERITY_LABEL: Record<AutobiographySeverity, string> = {
  INFO: 'Calm',
  DEFENSE: 'Defense',
  EVOLUTION: 'Evolution',
  WARNING: 'Safety',
}

const SEVERITY_CLASS: Record<AutobiographySeverity, string> = {
  INFO: 'autobio-pill autobio-pill-info',
  DEFENSE: 'autobio-pill autobio-pill-defense',
  EVOLUTION: 'autobio-pill autobio-pill-evolution',
  WARNING: 'autobio-pill autobio-pill-warning',
}

function shortHash(hash?: string): string {
  if (!hash) return ''
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

function feeMovement(entry: PoolAutobiographyEntry): string | null {
  if (entry.oldFeeBps == null || entry.newFeeBps == null) return null
  const oldBps = (entry.oldFeeBps / 100).toFixed(2)
  const newBps = (entry.newFeeBps / 100).toFixed(2)
  const arrow = entry.newFeeBps > entry.oldFeeBps ? '↑' : entry.newFeeBps < entry.oldFeeBps ? '↓' : '→'
  return `${oldBps} bps ${arrow} ${newBps} bps`
}

export function PoolAutobiographyPanel({ entries }: Props) {
  return (
    <section id="pool-autobiography" className="panel autobio-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Pool Autobiography</span>
          <h2>A readable history of how this pool defended itself.</h2>
        </div>
      </div>
      <p className="panel-copy">
        Every card below is reconstructed from a real HelixHook event on X Layer mainnet (or from
        live pool memory). No story is invented; the pool tells you, in plain English, what it did
        and why.
      </p>

      {entries.length === 0 ? (
        <p className="run-status">
          No defense events recorded yet for this pool. The autobiography will populate as soon as
          REFLEX or EVOLUTION events arrive on chain.
        </p>
      ) : (
        <ol className="autobio-timeline">
          {entries.map((entry) => {
            const movement = feeMovement(entry)
            const epochLabel = entry.epoch ? EPOCH_META[entry.epoch].label : null
            return (
              <li key={entry.id} className={`autobio-card autobio-${entry.severity.toLowerCase()}`}>
                <div className="autobio-card-header">
                  <span className={SEVERITY_CLASS[entry.severity]}>{SEVERITY_LABEL[entry.severity]}</span>
                  {epochLabel ? <span className="autobio-epoch-chip">{epochLabel}</span> : null}
                  <span className="autobio-reason">{entry.reason}</span>
                </div>
                <h3 className="autobio-title">{entry.title}</h3>
                <p className="autobio-summary">{entry.summary}</p>
                <dl className="autobio-meta">
                  {entry.blockNumber != null ? (
                    <div>
                      <dt>Block</dt>
                      <dd>{entry.blockNumber.toString()}</dd>
                    </div>
                  ) : null}
                  {movement ? (
                    <div>
                      <dt>Fee</dt>
                      <dd>{movement}</dd>
                    </div>
                  ) : null}
                  {entry.toxicFlowScore && entry.toxicFlowScore !== '0' ? (
                    <div>
                      <dt>LVR signal</dt>
                      <dd>{entry.toxicFlowScore}</dd>
                    </div>
                  ) : null}
                  {entry.txHash ? (
                    <div>
                      <dt>Tx</dt>
                      <dd>
                        {entry.explorerUrl ? (
                          <a href={entry.explorerUrl} target="_blank" rel="noreferrer">
                            {shortHash(entry.txHash)} ↗
                          </a>
                        ) : (
                          shortHash(entry.txHash)
                        )}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
