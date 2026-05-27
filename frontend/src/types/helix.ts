// HELIX pool-memory types.
//
// Every field here is derived from REAL on-chain sources only:
//   - HelixHook view getters (currentFee, currentToxicFlowScore, poolState, config)
//   - HelixHook events (ReflexFeeQuoted, BaselineFeeUpdated, OracleSkipped)
// Nothing in this layer is mocked. Each field documents where it comes from so the
// dashboard can label provenance to judges.

export type DefenseEpoch =
  | 'LAUNCH_SHIELD'
  | 'ADAPTIVE_DEFENSE'
  | 'CALM_MARKET'
  | 'ORACLE_SAFE_MODE'

export type FeeDirection = 'UP' | 'DOWN' | 'HOLD'

// One normalized fee-movement point on the evolving fee curve.
export type FeeEvolutionPoint = {
  blockNumber: bigint
  txHash: string
  oldFeeBps: number // hundredths-of-a-bip (pips) as stored on-chain
  newFeeBps: number // hundredths-of-a-bip (pips) as stored on-chain
  feeDeltaBps: number
  toxicFlowScore?: string // hook cumulativeLvrSignal, kept as string (can exceed Number)
  reason: string
  kind: 'REFLEX' | 'BASELINE_EVOLUTION'
}

// Raw live read of the hook's per-pool state struct (HelixHook.poolState mapping).
export type RawPoolState = {
  baselineFee: number
  lastReflexFee: number
  swapsSinceEvolution: number
  lastEvolutionBlock: bigint
  cumulativeLvrSignal: string
  lastOraclePriceE18: string
  lastPoolPriceE18: string
  initialized: boolean
}

// Hook safety bounds + tuning, read live from HelixHook.config().
export type HelixConfig = {
  initialFee: number
  maxReflexFeeDelta: number
  evolutionStepUp: number
  evolutionStepDown: number
  reflexThresholdBps: number
  healthyThresholdBps: number
  evolutionThresholdBps: number
  reflexFeeMultiplierBps: number
  evolutionCadence: number
  maxOracleAge: number
}

export type PoolMemory = {
  poolId: string
  hookAddress: string
  token0: string
  token1: string

  // Counts derived from verifiable HELIX events + live evolution-window counters.
  totalSwapsObserved: number // sum(BaselineFeeUpdated.swapsObserved) + live swapsSinceEvolution
  totalProtectedSwaps: number // count of ReflexFeeQuoted events
  totalAdaptations: number // reflex + baseline-evolution events
  totalBaselineEvolutions: number // count of BaselineFeeUpdated events
  staleOracleSkips: number // count of OracleSkipped events seen in proof window

  // Fee memory (hundredths-of-a-bip / pips, as stored on-chain).
  latestFeeBps: number
  highestFeeBps: number
  lowestFeeBps: number

  // Flow memory.
  currentToxicFlowScore: string // live hook cumulativeLvrSignal
  latestOraclePriceE18: string
  latestPoolPriceE18: string

  // Latest defensive action.
  latestReason: string
  latestFeeDirection: FeeDirection
  latestDefenseBlock?: bigint
  latestDefenseTx?: string

  currentEpoch: DefenseEpoch
}
