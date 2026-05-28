// Tool implementations for the HELIX MCP server. Each function takes a
// validated input object and returns a plain JS object an agent can
// reason about directly. Every call reads live from X Layer mainnet (or
// the deployment pointed to by env vars); nothing is cached or mocked.

import { isAddress, parseAbiItem, type Address, type Hex } from 'viem'
import {
  DEFAULT_POOL_ID,
  DEFAULT_POOL_KEY,
  HOOK_ADDRESS,
  LIVE_POOL_TOKENS,
  ORACLE_ADDRESS,
  ORACLE_READY_TOKENS,
  POOL_MANAGER_ADDRESS,
  XLAYER_CHAIN_ID,
  XLAYER_EXPLORER,
  XLAYER_RPC_URL,
  bytes32ToText,
  erc20Abi,
  explorerAddress,
  explorerTx,
  feeToBps,
  hookAbi,
  oracleAbi,
  publicClient,
} from './chain.js'

function lc(addr: string): string {
  return addr.toLowerCase()
}

function assertAddress(value: string, field: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${field} is not a valid 0x-prefixed 20-byte address: ${value}`)
  }
  return value as Address
}

function assertBytes32(value: string, field: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${field} is not a valid 0x-prefixed 32-byte hex string: ${value}`)
  }
  return value as Hex
}

// -- helix_check_mode ---------------------------------------------------------

export async function checkMode(input: { tokenAddress: string }) {
  const addr = assertAddress(input.tokenAddress, 'tokenAddress')
  const lcAddr = lc(addr)

  let name: string | null = null
  let symbol: string | null = null
  let decimals: number | null = null
  try {
    const [n, s, d] = await Promise.all([
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'name' }),
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'symbol' }),
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'decimals' }),
    ])
    name = n
    symbol = s
    decimals = Number(d)
  } catch {
    // Native zero address or non-ERC-20: leave metadata null.
  }

  let mode: 'oracle-live' | 'oracle-ready' | 'proxy'
  let rationale: string

  if (LIVE_POOL_TOKENS.some((t) => lc(t) === lcAddr)) {
    mode = 'oracle-live'
    rationale =
      'This token sits in the currently-deployed HELIX live proof pool on X Layer mainnet. Full oracle-anchored LVR mode is running on this pool right now — reflex fees and baseline-evolution events are being emitted by the hook for it.'
  } else if (ORACLE_READY_TOKENS.some((t) => lc(t) === lcAddr)) {
    mode = 'oracle-ready'
    rationale =
      'This token has a verified Chainlink price feed on X Layer but no HELIX pool has been deployed for it yet. A pool deployed for it could run Oracle-backed LVR mode (reflex + baseline evolution against the Chainlink reference). The currently-live HELIX pool is OKB/USDT0.'
  } else {
    mode = 'proxy'
    rationale =
      'No verified Chainlink feed for this token on X Layer. HELIX would defend a pool here with the HelixFlapProxyHook: launch-shield fee decaying to the baseline over its decay window, plus a one-swap size-reflex bump on outsized swaps. No external oracle is consulted in this mode.'
  }

  return {
    tokenAddress: addr,
    metadata: { name, symbol, decimals },
    recommendedMode: mode,
    label:
      mode === 'oracle-live'
        ? 'Oracle-backed LVR Mode — LIVE proof pool'
        : mode === 'oracle-ready'
          ? 'Oracle-backed LVR Mode — oracle-ready'
          : 'Launch Protection Proxy Mode',
    rationale,
    explorerUrl: explorerAddress(addr),
  }
}

// -- helix_pool_state ---------------------------------------------------------

export async function poolState(input: { poolId?: string }) {
  const poolId = input.poolId
    ? assertBytes32(input.poolId, 'poolId')
    : DEFAULT_POOL_ID
  const useDefault = lc(poolId) === lc(DEFAULT_POOL_ID)
  // currentFee / currentToxicFlowScore / currentPoolPriceE18 take a PoolKey
  // struct. We only know the PoolKey for our default pool; for a custom
  // poolId we fall back to raw poolState(bytes32).
  const [rawState, rawConfig, currentBlock] = await Promise.all([
    publicClient.readContract({
      address: HOOK_ADDRESS,
      abi: hookAbi,
      functionName: 'poolState',
      args: [poolId],
    }),
    publicClient.readContract({
      address: HOOK_ADDRESS,
      abi: hookAbi,
      functionName: 'config',
    }),
    publicClient.getBlockNumber(),
  ])

  let currentFee: number | null = null
  let toxicFlowScore: string | null = null
  let poolPriceE18: string | null = null
  let oraclePriceE18: string | null = null
  let oracleUpdatedAt: number | null = null
  if (useDefault) {
    const [feeNow, scoreNow, poolPriceNow, oracleRead] = await Promise.all([
      publicClient.readContract({
        address: HOOK_ADDRESS,
        abi: hookAbi,
        functionName: 'currentFee',
        args: [DEFAULT_POOL_KEY],
      }),
      publicClient.readContract({
        address: HOOK_ADDRESS,
        abi: hookAbi,
        functionName: 'currentToxicFlowScore',
        args: [DEFAULT_POOL_KEY],
      }),
      publicClient.readContract({
        address: HOOK_ADDRESS,
        abi: hookAbi,
        functionName: 'currentPoolPriceE18',
        args: [DEFAULT_POOL_KEY],
      }),
      publicClient.readContract({
        address: ORACLE_ADDRESS,
        abi: oracleAbi,
        functionName: 'read',
        args: [DEFAULT_POOL_KEY],
      }),
    ])
    currentFee = Number(feeNow)
    toxicFlowScore = scoreNow.toString()
    poolPriceE18 = poolPriceNow.toString()
    oraclePriceE18 = oracleRead[0].toString()
    oracleUpdatedAt = Number(oracleRead[1])
  }

  return {
    poolId,
    isDefaultPool: useDefault,
    hookAddress: HOOK_ADDRESS,
    poolManagerAddress: POOL_MANAGER_ADDRESS,
    currentBlock: currentBlock.toString(),
    live: {
      currentFee, // hundredths of a bip; divide by 100 for bps
      currentFeeBps: currentFee == null ? null : feeToBps(currentFee),
      toxicFlowScore,
      poolPriceE18,
      oraclePriceE18,
      oracleUpdatedAt,
    },
    storage: {
      baselineFee: Number(rawState[0]),
      baselineFeeBps: feeToBps(rawState[0]),
      lastReflexFee: Number(rawState[1]),
      swapsSinceEvolution: Number(rawState[2]),
      lastEvolutionBlock: rawState[3].toString(),
      cumulativeLvrSignal: rawState[4].toString(),
      lastOraclePriceE18: rawState[5].toString(),
      lastPoolPriceE18: rawState[6].toString(),
      initialized: rawState[7],
    },
    config: {
      initialFee: Number(rawConfig[0]),
      maxReflexFeeDelta: Number(rawConfig[1]),
      evolutionStepUp: Number(rawConfig[2]),
      evolutionStepDown: Number(rawConfig[3]),
      reflexThresholdBps: Number(rawConfig[4]),
      healthyThresholdBps: Number(rawConfig[5]),
      evolutionThresholdBps: Number(rawConfig[6]),
      reflexFeeMultiplierBps: Number(rawConfig[7]),
      evolutionCadence: Number(rawConfig[8]),
      maxOracleAge: Number(rawConfig[9]),
    },
  }
}

// -- helix_pool_autobiography -------------------------------------------------

// X Layer's public RPC caps eth_getLogs at 100 blocks per request. We scan
// the most recent RECENT_WINDOW blocks for live activity; for full history
// an agent owner should point at a paid RPC via XLAYER_RPC_URL.
const RECENT_WINDOW = 99n

const baselineFeeUpdatedEvent = parseAbiItem(
  'event BaselineFeeUpdated(bytes32 indexed poolId, uint24 oldFee, uint24 newFee, uint256 lvrSignal, bytes32 reason, uint32 swapsObserved, uint256 oraclePriceE18, uint256 poolPriceE18)',
)
const reflexFeeQuotedEvent = parseAbiItem(
  'event ReflexFeeQuoted(bytes32 indexed poolId, uint24 oldFee, uint24 newFee, uint256 lvrSignal, bytes32 reason, uint256 oraclePriceE18, uint256 poolPriceE18)',
)
const oracleSkippedEvent = parseAbiItem(
  'event OracleSkipped(bytes32 indexed poolId, bytes32 reason)',
)

type AutobiographyCard = {
  kind: 'EVOLUTION_UP' | 'EVOLUTION_DOWN' | 'REFLEX' | 'ORACLE_SKIPPED'
  title: string
  summary: string
  blockNumber: string
  txHash: string
  explorerUrl: string
  oldFeeBps?: string
  newFeeBps?: string
  lvrSignal?: string
  reason?: string
}

export async function poolAutobiography(input: {
  poolId?: string
  lookbackBlocks?: number
}) {
  const poolId = input.poolId
    ? assertBytes32(input.poolId, 'poolId')
    : DEFAULT_POOL_ID
  // X Layer caps at 100 blocks per getLogs request. We clamp here so an
  // agent that asks for a giant range gets a polite scan rather than an
  // RPC error.
  const lookback = BigInt(Math.min(Math.max(input.lookbackBlocks ?? 99, 1), 99))
  const head = await publicClient.getBlockNumber()
  const fromBlock = head > lookback ? head - lookback : 0n

  const [baselineLogs, reflexLogs, oracleLogs] = await Promise.all([
    publicClient
      .getLogs({
        address: HOOK_ADDRESS,
        event: baselineFeeUpdatedEvent,
        args: { poolId },
        fromBlock,
        toBlock: head,
      })
      .catch(() => []),
    publicClient
      .getLogs({
        address: HOOK_ADDRESS,
        event: reflexFeeQuotedEvent,
        args: { poolId },
        fromBlock,
        toBlock: head,
      })
      .catch(() => []),
    publicClient
      .getLogs({
        address: HOOK_ADDRESS,
        event: oracleSkippedEvent,
        args: { poolId },
        fromBlock,
        toBlock: head,
      })
      .catch(() => []),
  ])

  const cards: AutobiographyCard[] = []
  for (const log of baselineLogs) {
    if (log.transactionHash == null || log.blockNumber == null) continue
    const reason = bytes32ToText(log.args.reason!)
    const movement = `${feeToBps(log.args.oldFee!)} bps → ${feeToBps(log.args.newFee!)} bps`
    const kind = reason as 'EVOLUTION_UP' | 'EVOLUTION_DOWN'
    cards.push({
      kind,
      title:
        kind === 'EVOLUTION_UP'
          ? 'Baseline fee evolved upward'
          : 'Baseline fee evolved downward',
      summary:
        kind === 'EVOLUTION_UP'
          ? `The pool observed sustained toxic pressure over its evolution window and raised its baseline fee (${movement}) so LPs are paid more for the risk.`
          : `Recent flow looked healthier across the evolution window, so HELIX lowered its baseline fee (${movement}) to let the pool trade more freely.`,
      blockNumber: log.blockNumber.toString(),
      txHash: log.transactionHash,
      explorerUrl: explorerTx(log.transactionHash),
      oldFeeBps: feeToBps(log.args.oldFee!),
      newFeeBps: feeToBps(log.args.newFee!),
      lvrSignal: log.args.lvrSignal!.toString(),
      reason,
    })
  }
  for (const log of reflexLogs) {
    if (log.transactionHash == null || log.blockNumber == null) continue
    const movement = `${feeToBps(log.args.oldFee!)} bps → ${feeToBps(log.args.newFee!)} bps`
    cards.push({
      kind: 'REFLEX',
      title: 'Reflex defense fired',
      summary: `A toxic-looking swap arrived. HELIX applied a one-swap reflex fee override (${movement}) to protect LPs.`,
      blockNumber: log.blockNumber.toString(),
      txHash: log.transactionHash,
      explorerUrl: explorerTx(log.transactionHash),
      oldFeeBps: feeToBps(log.args.oldFee!),
      newFeeBps: feeToBps(log.args.newFee!),
      lvrSignal: log.args.lvrSignal!.toString(),
      reason: bytes32ToText(log.args.reason!),
    })
  }
  for (const log of oracleLogs) {
    if (log.transactionHash == null || log.blockNumber == null) continue
    const reason = bytes32ToText(log.args.reason!)
    cards.push({
      kind: 'ORACLE_SKIPPED',
      title: 'Unsafe oracle signal skipped',
      summary:
        'HELIX refused to learn from this swap because the oracle answer was stale or invalid. The fee was held steady instead of acting on unsafe data.',
      blockNumber: log.blockNumber.toString(),
      txHash: log.transactionHash,
      explorerUrl: explorerTx(log.transactionHash),
      reason,
    })
  }

  // Most-recent first.
  cards.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)))

  return {
    poolId,
    scanned: {
      fromBlock: fromBlock.toString(),
      toBlock: head.toString(),
      windowBlocks: Number(head - fromBlock),
    },
    cards,
    note:
      cards.length === 0
        ? 'No HELIX adaptation events in the scanned window. The public X Layer RPC caps eth_getLogs at 100 blocks per request; set XLAYER_RPC_URL to a paid provider for full history.'
        : undefined,
  }
}

// -- helix_pool_memory --------------------------------------------------------

export async function poolMemory(input: { poolId?: string }) {
  const state = await poolState(input)
  const baseline = state.storage.baselineFee
  const minFee = state.config.initialFee // close enough for messaging
  // Defense Epoch is computed the same way the dashboard computes it.
  const swapsSinceEvolution = state.storage.swapsSinceEvolution
  const cumulativeLvrSignal = BigInt(state.storage.cumulativeLvrSignal)
  const evolutionCadence = state.config.evolutionCadence
  const evolutionThresholdBps = state.config.evolutionThresholdBps
  const healthyThresholdBps = state.config.healthyThresholdBps
  const lastEvolutionBlock = BigInt(state.storage.lastEvolutionBlock)
  const currentBlock = BigInt(state.currentBlock)

  let epoch: 'LAUNCH_SHIELD' | 'ADAPTIVE_DEFENSE' | 'CALM_MARKET' | 'ORACLE_SAFE_MODE'
  let epochExplanation: string

  if (!state.storage.initialized) {
    epoch = 'LAUNCH_SHIELD'
    epochExplanation = 'Pool not yet initialized — defenses are in placeholder state.'
  } else if (swapsSinceEvolution === 0 && cumulativeLvrSignal === 0n && baseline > minFee) {
    epoch = 'ADAPTIVE_DEFENSE'
    epochExplanation = `The pool recently raised its baseline fee to ${feeToBps(baseline)} bps and reset its learning window. It is actively defending.`
  } else if (
    swapsSinceEvolution > 0 &&
    cumulativeLvrSignal === 0n &&
    swapsSinceEvolution < evolutionCadence
  ) {
    epoch = 'LAUNCH_SHIELD'
    epochExplanation = `The pool is young (${swapsSinceEvolution} metered swaps in this window), so HELIX stays more sensitive to toxic flow and launch sniping.`
  } else if (swapsSinceEvolution >= evolutionCadence) {
    epoch = 'ADAPTIVE_DEFENSE'
    epochExplanation = 'The pool has accumulated enough flow to decide whether to evolve its baseline fee on the next swap.'
  } else {
    epoch = 'CALM_MARKET'
    epochExplanation = 'Recent flow looks healthier; HELIX has relaxed defensive pressure.'
  }

  return {
    poolId: state.poolId,
    epoch,
    epochExplanation,
    baselineFeeBps: state.storage.baselineFeeBps,
    swapsSinceEvolution,
    cumulativeLvrSignal: state.storage.cumulativeLvrSignal,
    lastEvolutionBlock: lastEvolutionBlock.toString(),
    blocksSinceLastEvolution: (currentBlock - lastEvolutionBlock).toString(),
    evolutionThresholdBps,
    healthyThresholdBps,
    evolutionCadence,
    hookAddress: HOOK_ADDRESS,
    explorerUrl: explorerAddress(HOOK_ADDRESS),
  }
}

// -- helix_token_info ---------------------------------------------------------

export async function tokenInfo(input: { tokenAddress: string }) {
  const addr = assertAddress(input.tokenAddress, 'tokenAddress')
  // Native zero address is a special case.
  if (lc(addr) === '0x0000000000000000000000000000000000000000') {
    return {
      address: addr,
      isNative: true,
      name: 'OKB',
      symbol: 'OKB',
      decimals: 18,
      explorerUrl: explorerAddress(addr),
      note: 'Native gas token on X Layer (currency0 of the live HELIX OKB/USDT0 pool).',
    }
  }
  try {
    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'name' }),
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'symbol' }),
      publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'decimals' }),
    ])
    return {
      address: addr,
      isNative: false,
      name,
      symbol,
      decimals: Number(decimals),
      explorerUrl: explorerAddress(addr),
    }
  } catch (err) {
    return {
      address: addr,
      isNative: false,
      name: null,
      symbol: null,
      decimals: null,
      explorerUrl: explorerAddress(addr),
      error: `Could not read ERC-20 metadata for ${addr}. May not be an ERC-20.`,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

// -- helix_proof_passport -----------------------------------------------------

export async function proofPassport() {
  const head = await publicClient.getBlockNumber().catch(() => null)
  return {
    network: 'X Layer mainnet',
    chainId: XLAYER_CHAIN_ID,
    rpcUrl: XLAYER_RPC_URL,
    explorerBaseUrl: XLAYER_EXPLORER,
    currentBlock: head ? head.toString() : null,
    hookAddress: HOOK_ADDRESS,
    poolManagerAddress: POOL_MANAGER_ADDRESS,
    oracleAddress: ORACLE_ADDRESS,
    defaultPoolId: DEFAULT_POOL_ID,
    livePoolTokens: LIVE_POOL_TOKENS,
    oracleReadyTokens: ORACLE_READY_TOKENS,
    verifiedSourceUrl: explorerAddress(HOOK_ADDRESS),
    knownProofs: {
      deploymentTx: '0x220497b02ddf44e2b7dd23f92b7c4e4254cbc85c65f1c912041050aea12c7b7b',
      poolCreationTx: '0x47c3ae0f17960b1716b3d598894c53d06ffca6ca23cede7adba8499f14c7c9e1',
      reflexProofTx: '0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184',
      evolutionProofTxs: [
        '0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6',
        '0xda8717694ee7511908fd778e4738ea54d6726b69c6d717cd1d91e1ab05c4efcd',
      ],
    },
  }
}
