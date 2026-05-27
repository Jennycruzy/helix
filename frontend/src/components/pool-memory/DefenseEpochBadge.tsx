import { EPOCH_META } from '../../lib/defenseEpochs'
import type { PoolMemory } from '../../types/helix'

export function DefenseEpochBadge({ memory }: { memory: PoolMemory }) {
  const meta = EPOCH_META[memory.currentEpoch]
  return (
    <div className={`epoch-badge epoch-${meta.tone}`}>
      <span className="epoch-dot" />
      <div>
        <strong>{meta.label}</strong>
        <p>{meta.explain(memory)}</p>
      </div>
    </div>
  )
}
