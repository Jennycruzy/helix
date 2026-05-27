import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { classifyFeeBand, pipsToBps, sortEvolution } from '../../lib/feeEvolution'
import type { FeeEvolutionPoint } from '../../types/helix'

export function FeeCurveEvolutionChart({
  points,
  currentFeeBps,
}: {
  points: FeeEvolutionPoint[]
  currentFeeBps: number
}) {
  const sorted = sortEvolution(points)
  const band = classifyFeeBand(currentFeeBps)

  const chartData = sorted.map((p, index) => ({
    name: `${index + 1}. ${p.kind === 'REFLEX' ? 'Reflex' : 'Evolution'}`,
    feeBps: Number(pipsToBps(p.newFeeBps)),
  }))

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Fee Curve Evolution</span>
          <h2>The fee curve evolves with pool conditions</h2>
        </div>
        <span className={`fee-band band-${band.replace(/\s+/g, '-').toLowerCase()}`}>{band}</span>
      </div>

      <p className="panel-copy">
        HELIX does not use a fixed fee. Fee increases mean the pool is defending LPs from
        toxic flow; stable or lower fees mean healthier conditions. Reflex = a temporary
        per-swap response. Baseline evolution = a longer-term curve update after the pool
        observes enough flow.
      </p>

      {chartData.length === 0 ? (
        <p className="empty-state">
          No fee-movement events available yet for this pool. The curve will populate as
          HELIX records reflex and baseline-evolution events on-chain.
        </p>
      ) : (
        <>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="feeEvoFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#f2b84b" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#f2b84b" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(50, 43, 30, 0.12)" vertical={false} />
                <XAxis dataKey="name" stroke="#645b4a" tick={{ fontSize: 11 }} />
                <YAxis stroke="#645b4a" tick={{ fontSize: 11 }} unit=" bps" width={62} />
                <Tooltip formatter={(v) => [`${v} bps`, 'Fee']} />
                <Area
                  dataKey="feeBps"
                  name="Fee (bps)"
                  stroke="#38220d"
                  fill="url(#feeEvoFill)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="evolution-list">
            {sorted.map((p) => (
              <article className="evolution-row" key={`${p.txHash}-${p.kind}-${p.blockNumber}`}>
                <span
                  className={`event-kind ${p.kind === 'REFLEX' ? 'reflex' : 'evolution'}`}
                >
                  {p.kind === 'REFLEX' ? 'REFLEX' : 'BASELINE EVOLUTION'}
                </span>
                <div className="evolution-detail">
                  <strong>
                    {pipsToBps(p.oldFeeBps)} → {pipsToBps(p.newFeeBps)} bps
                  </strong>
                  <small>
                    {p.kind === 'REFLEX'
                      ? 'Temporary fee response during a toxic-looking swap.'
                      : 'Longer-term baseline fee update after observing enough flow.'}{' '}
                    Reason: {p.reason}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
