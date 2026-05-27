import type {
  FeeDirection,
  FeeEvolutionPoint,
  HelixConfig,
  PoolMemory,
  RawPoolState,
} from '../types/helix'
import { classifyDefenseEpoch } from './defenseEpochs'
import { highestFee, lowestFee, sortEvolution } from './feeEvolution'

export type BuildPoolMemoryArgs = {
  poolId: string
  hookAddress: string
  token0: string
  token1: string
  rawState: RawPoolState
  config: HelixConfig
  events: FeeEvolutionPoint[]
  // Live current baseline fee from HelixHook.currentFee (pips).
  liveCurrentFeeBps: number
  // Live cumulativeLvrSignal from HelixHook.currentToxicFlowScore.
  liveToxicFlowScore: string
  // Sum of BaselineFeeUpdated.swapsObserved across all baseline events (real,
  // from event payloads). Each value is the swap count of one completed
  // evolution window.
  meteredSwapsFromEvolutions: number
  // OracleSkipped events seen in the proof window (stale / reverted oracle).
  staleOracleSkips: number
}

function directionFor(point: FeeEvolutionPoint): FeeDirection {
  if (point.kind === 'REFLEX') return 'UP' // reflex is always a temporary fee bump
  if (point.reason.includes('UP')) return 'UP'
  if (point.reason.includes('DOWN')) return 'DOWN'
  return 'HOLD'
}

export function buildPoolMemory(args: BuildPoolMemoryArgs): PoolMemory {
  const sorted = sortEvolution(args.events)
  const latest = sorted[sorted.length - 1]

  const reflexCount = sorted.filter((e) => e.kind === 'REFLEX').length
  const evolutionCount = sorted.filter((e) => e.kind === 'BASELINE_EVOLUTION').length

  // Total swaps HELIX has metered = swaps from completed evolution windows
  // (real, from BaselineFeeUpdated.swapsObserved) + swaps in the in-progress
  // window (live RawPoolState.swapsSinceEvolution).
  const totalSwapsObserved =
    args.meteredSwapsFromEvolutions + args.rawState.swapsSinceEvolution

  const memory: PoolMemory = {
    poolId: args.poolId,
    hookAddress: args.hookAddress,
    token0: args.token0,
    token1: args.token1,
    totalSwapsObserved,
    totalProtectedSwaps: reflexCount,
    totalAdaptations: sorted.length,
    totalBaselineEvolutions: evolutionCount,
    staleOracleSkips: args.staleOracleSkips,
    latestFeeBps: args.liveCurrentFeeBps,
    highestFeeBps: highestFee(sorted, args.liveCurrentFeeBps),
    lowestFeeBps: lowestFee(sorted, args.config.initialFee),
    currentToxicFlowScore: args.liveToxicFlowScore,
    latestOraclePriceE18: args.rawState.lastOraclePriceE18,
    latestPoolPriceE18: args.rawState.lastPoolPriceE18,
    latestReason: latest?.reason ?? 'NONE',
    latestFeeDirection: latest ? directionFor(latest) : 'HOLD',
    latestDefenseBlock: latest?.blockNumber,
    latestDefenseTx: latest?.txHash,
    currentEpoch: 'CALM_MARKET', // placeholder, set below
  }

  memory.currentEpoch = classifyDefenseEpoch(memory)
  return memory
}
