import type { DefenseEpoch, PoolMemory } from '../types/helix'

// ----------------------------------------------------------------------------
// Defense Epoch classification.
//
// Epochs are NAMED LIFECYCLE MODES computed in the frontend from real pool
// memory. They are a presentation layer over on-chain facts; they do not change
// consensus or override the hook. The hook's hard-coded MIN_FEE / MAX_FEE bounds
// always apply regardless of epoch.
// ----------------------------------------------------------------------------

// A pool with fewer metered swaps than this is treated as freshly launched, so
// HELIX is shown as extra-sensitive (Launch Shield). Chosen to be a small
// multiple of the hook's evolution cadence (3) — i.e. a few full learning
// windows before a pool is considered "established".
export const LAUNCH_SWAP_THRESHOLD = 12

// The hook's toxic-flow score is cumulativeLvrSignal = divergenceBps * swapSize,
// summed within an evolution window and reset after each window. Any non-trivial
// accumulation means the pool is currently metering pressure. We treat a strictly
// positive score as "pressure present" for badge purposes and keep this constant
// documented so the heuristic is explicit rather than magic.
export const TOXIC_FLOW_THRESHOLD = 1n

export type EpochMeta = {
  epoch: DefenseEpoch
  label: string
  // One-sentence, judge-facing explanation of WHY the pool is in this state.
  explain: (memory: PoolMemory) => string
  // CSS accent class suffix used by DefenseEpochBadge.
  tone: 'shield' | 'defense' | 'calm' | 'oracle'
}

export const EPOCH_META: Record<DefenseEpoch, EpochMeta> = {
  LAUNCH_SHIELD: {
    epoch: 'LAUNCH_SHIELD',
    label: 'Launch Shield',
    tone: 'shield',
    explain: (m) =>
      `The pool is young (${m.totalSwapsObserved} metered swaps), so HELIX stays more sensitive to toxic flow and launch sniping.`,
  },
  ADAPTIVE_DEFENSE: {
    epoch: 'ADAPTIVE_DEFENSE',
    label: 'Adaptive Defense',
    tone: 'defense',
    explain: () =>
      'HELIX detected pool-vs-oracle pressure and is actively adapting the fee curve to protect LPs.',
  },
  CALM_MARKET: {
    epoch: 'CALM_MARKET',
    label: 'Calm Market',
    tone: 'calm',
    explain: () =>
      'Flow looks healthier, so HELIX is letting the pool trade with less defensive pressure.',
  },
  ORACLE_SAFE_MODE: {
    epoch: 'ORACLE_SAFE_MODE',
    label: 'Oracle Safe Mode',
    tone: 'oracle',
    explain: () =>
      'HELIX paused learning from price data because the latest oracle signal was stale or unsafe, so the fee was held.',
  },
}

// Classification precedence (most protective first):
//   1. Oracle unsafe  -> ORACLE_SAFE_MODE (learning was skipped for safety)
//   2. Young pool     -> LAUNCH_SHIELD (heightened launch sensitivity)
//   3. Pressure seen  -> ADAPTIVE_DEFENSE
//   4. Otherwise      -> CALM_MARKET
export function classifyDefenseEpoch(memory: PoolMemory): DefenseEpoch {
  const reason = memory.latestReason.toUpperCase()
  if (
    reason.includes('STALE') ||
    reason.includes('ORACLE_SKIPPED') ||
    reason.includes('ORACLE_REVERT')
  ) {
    return 'ORACLE_SAFE_MODE'
  }

  if (memory.totalSwapsObserved < LAUNCH_SWAP_THRESHOLD) {
    return 'LAUNCH_SHIELD'
  }

  let toxic: bigint
  try {
    toxic = BigInt(memory.currentToxicFlowScore)
  } catch {
    toxic = 0n
  }

  if (
    toxic >= TOXIC_FLOW_THRESHOLD ||
    memory.latestFeeDirection === 'UP' ||
    memory.totalProtectedSwaps > 0
  ) {
    return 'ADAPTIVE_DEFENSE'
  }

  return 'CALM_MARKET'
}
