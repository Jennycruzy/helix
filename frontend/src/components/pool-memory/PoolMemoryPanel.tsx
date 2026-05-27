import { pipsToBps } from '../../lib/feeEvolution'
import type { PoolMemory } from '../../types/helix'
import { DefenseEpochBadge } from './DefenseEpochBadge'

function MemoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="memory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function directionLabel(direction: PoolMemory['latestFeeDirection']) {
  if (direction === 'UP') return 'Fee raised (UP)'
  if (direction === 'DOWN') return 'Fee relaxed (DOWN)'
  return 'Fee held (HOLD)'
}

export function PoolMemoryPanel({ memory }: { memory: PoolMemory }) {
  return (
    <section className="panel pool-memory-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Pool Memory</span>
          <h2>What the market did to this pool</h2>
        </div>
      </div>

      <p className="panel-copy">
        This pool has metered {memory.totalSwapsObserved} swaps, defended{' '}
        {memory.totalProtectedSwaps} times with a reflex fee, and evolved its baseline
        fee {memory.totalBaselineEvolutions} time
        {memory.totalBaselineEvolutions === 1 ? '' : 's'}.
      </p>

      <DefenseEpochBadge memory={memory} />

      <div className="memory-grid">
        <MemoryStat label="Latest fee" value={`${pipsToBps(memory.latestFeeBps)} bps`} />
        <MemoryStat label="Highest fee reached" value={`${pipsToBps(memory.highestFeeBps)} bps`} />
        <MemoryStat label="Lowest fee reached" value={`${pipsToBps(memory.lowestFeeBps)} bps`} />
        <MemoryStat label="Total adaptations" value={String(memory.totalAdaptations)} />
        <MemoryStat label="Protected swaps" value={String(memory.totalProtectedSwaps)} />
        <MemoryStat label="Baseline evolutions" value={String(memory.totalBaselineEvolutions)} />
        <MemoryStat label="Toxic-flow score" value={shortNumber(memory.currentToxicFlowScore)} />
        <MemoryStat label="Stale-oracle skips" value={String(memory.staleOracleSkips)} />
      </div>

      <div className="memory-latest">
        <span className="eyebrow">Last defense action</span>
        <p>
          {directionLabel(memory.latestFeeDirection)} — reason{' '}
          <code>{memory.latestReason}</code>
          {memory.latestDefenseBlock ? ` at block ${memory.latestDefenseBlock}` : ''}.
        </p>
      </div>

      <p className="memory-source">
        Memory source: computed from HELIX hook events (ReflexFeeQuoted,
        BaselineFeeUpdated, OracleSkipped) and live poolState. No mocked data.
      </p>
    </section>
  )
}

function shortNumber(value: string) {
  if (value.length <= 9) return value
  return `${value.slice(0, 4)}…${value.slice(-3)}`
}
