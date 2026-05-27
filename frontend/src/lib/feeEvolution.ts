import type { FeeEvolutionPoint } from '../types/helix'

// ----------------------------------------------------------------------------
// Fee Curve Evolution helpers.
//
// HELIX distinguishes two kinds of fee movement, both emitted on-chain:
//   - REFLEX  (ReflexFeeQuoted): a TEMPORARY per-swap fee override applied while
//             a single toxic-looking swap is in flight. It does not move the
//             baseline curve.
//   - BASELINE_EVOLUTION (BaselineFeeUpdated): a LONGER-TERM update to the
//             baseline dynamic fee after the pool has metered enough flow
//             (one evolution cadence window).
//
// This is a BOUNDED CONTROLLER / learning loop, not "AI". All fees stay within
// the hook's hard-coded MIN_FEE / MAX_FEE.
// ----------------------------------------------------------------------------

// On-chain hook bounds (mirror HelixHook.MIN_FEE / MAX_FEE), in pips.
export const MIN_FEE = 500
export const MAX_FEE = 20_000

export type FeeBand = 'Low Defense' | 'Balanced' | 'High Defense' | 'Max Clamp'

// Fee in hundredths-of-a-bip (pips). 100 pips = 1 bp. Bands are documented
// breakpoints used only for the dashboard label.
//   - Max Clamp:    at the hard MAX_FEE ceiling (200 bps)
//   - High Defense: >= 80 bps, actively defending
//   - Balanced:     near the 30 bps initial fee
//   - Low Defense:  <= 15 bps, relaxed
export function classifyFeeBand(feeBps: number): FeeBand {
  if (feeBps >= MAX_FEE) return 'Max Clamp'
  if (feeBps >= 8_000) return 'High Defense'
  if (feeBps <= 1_500) return 'Low Defense'
  return 'Balanced'
}

// Convert raw pips to a human bps string (100 pips = 1 bp).
export function pipsToBps(pips: number): string {
  return (pips / 100).toFixed(2)
}

// Sort evolution points oldest-first for timeline display.
export function sortEvolution(points: FeeEvolutionPoint[]): FeeEvolutionPoint[] {
  return [...points].sort((a, b) => Number(a.blockNumber - b.blockNumber))
}

export function highestFee(points: FeeEvolutionPoint[], fallback: number): number {
  return points.reduce((max, p) => Math.max(max, p.newFeeBps, p.oldFeeBps), fallback)
}

export function lowestFee(points: FeeEvolutionPoint[], fallback: number): number {
  return points.reduce((min, p) => Math.min(min, p.newFeeBps, p.oldFeeBps), fallback)
}
