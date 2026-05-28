import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbi,
  type Address,
  type Hash,
} from 'viem'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWriteContract,
} from 'wagmi'
import './App.css'
import { XLAYER_RPC_URL } from './chainConfig'
import { buildPoolMemory } from './lib/poolMemory'
import { PoolMemoryPanel } from './components/pool-memory/PoolMemoryPanel'
import { FeeCurveEvolutionChart } from './components/pool-memory/FeeCurveEvolutionChart'
import { LearningLoopExplainer } from './components/pool-memory/LearningLoopExplainer'
import {
  FlapLaunchProtectionPanel,
  type DetectedToken,
} from './components/pool-memory/FlapLaunchProtectionPanel'
import { ProtectionModesPanel } from './components/pool-memory/ProtectionModesPanel'
import { PoolAutobiographyPanel } from './components/pool-memory/PoolAutobiographyPanel'
import { ProofPassportPanel } from './components/pool-memory/ProofPassportPanel'
import { buildPoolAutobiography } from './lib/poolAutobiography'
import type { ProofPassport } from './lib/proofPassport'
import type { FeeEvolutionPoint, PoolMemory, RawPoolState } from './types/helix'

// Proof Passport — populated directly from deployments/xlayer-mainnet.json so
// every field a judge sees is a real on-chain artifact. The frontend never
// invents a tx hash or contract; missing pieces would render as "Not provided yet".
const proofPassport: ProofPassport = {
  network: 'X Layer Mainnet',
  chainId: 196,
  hookAddress: '0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0',
  poolManagerAddress: '0x360E68faCcca8ca495c1B759Fd9EEe466db9FB32',
  poolId: '0x7e28af1b33b5a70e30ecd13e92f2d2800d59dbf1139c02e72a9a745cebdecc79',
  token0: '0x0000000000000000000000000000000000000000',
  token0Symbol: 'OKB',
  token1: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
  token1Symbol: 'USDT0',
  oracleAddress: '0xf213fC8042136682ABd25AC2106481f4B6BdAFd2',
  deploymentTx: '0x220497b02ddf44e2b7dd23f92b7c4e4254cbc85c65f1c912041050aea12c7b7b',
  poolCreationTx: '0x47c3ae0f17960b1716b3d598894c53d06ffca6ca23cede7adba8499f14c7c9e1',
  reflexProofTx: '0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184',
  evolutionProofTx: '0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6',
  verifiedContractUrl:
    'https://www.oklink.com/x-layer/address/0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0',
  explorerBaseUrl: 'https://www.oklink.com/x-layer',
  lastUpdated: '2026-05-28',
  badges: ['Mainnet', 'Live', 'Verified', 'Read-only'],
}

const chain = {
  id: 196,
  name: 'X Layer mainnet',
  rpcUrl: XLAYER_RPC_URL,
  explorer: 'https://www.oklink.com/x-layer',
}

const addresses = {
  hook: '0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0',
  oracle: '0xf213fC8042136682ABd25AC2106481f4B6BdAFd2',
  usdt0: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
  poolManager: '0x360e68faccca8ca495c1B759Fd9EEe466db9FB32',
  swapExecutor: '0xB705ca289Df4a39Ba55226C4405BA6c0143344CB',
  deployer: '0x0Ac6bf160e208e67AF06d7F00c92AEfBbf089f95',
  flapPortal: '0xb30D8c4216E1f21F27444D2FfAee3ad577808678',
  // Real Flap-launched token on X Layer (ClawHub / SKILL).
  skill: '0xed06d48a87f8b8b3e78afd7dd59717a3f7317777',
} as const

// Tokens with a verified Chainlink price feed on X Layer mainnet. The Mode
// Checker uses this list to recommend Oracle-backed LVR mode for these
// tokens (rather than defaulting every non-USDT0 token to Proxy mode).
// Chainlink feeds referenced: OKB/USD 0x4Ff345b18a2bF894F8627F41501FBf30d5C5e7BE,
// USDT/USD 0xb928a0678352005a2e51F614efD0b54C9830dB80.
const oracleReadyTokens = [
  // Native OKB (used as currency0 in the live OKB/USDT0 pool).
  '0x0000000000000000000000000000000000000000',
  // X Layer USDT (Chainlink USDT/USD feed available).
  '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
] as const

const flapSkillUrl = `https://flap.sh/xlayer/${addresses.skill}`

// Real SKILL/OKB v4 pool with the HelixFlapProxyHook attached on X Layer
// mainnet (deployed 2026-05-28). Dynamic-fee: launch shield 5.00% decays to
// 0.50% over 20000 blocks; swaps > 5% of liquidity get a one-swap +0.50%
// reflex bump. Seeding still blocked by SKILL bonding-curve restriction.
// A predecessor hookless pool (poolId 0xc910...f086, static 0.30%) was
// initialized earlier the same day; both pools coexist because v4 pools are
// immutable.
const skillPool = {
  poolId: '0x74acb2620f3c441082cae8b8af709b0b48d59ac15be9824c37c4b549dd82fba7',
  hookAddress: '0x6c3eC6213b84c7E2267A24a81A2c23147e1950c0',
  hookDeployTx: '0xcbfd2a15da866958b9ac47b6c3a69b76dfedb73a0bf9b993be71db108d23caf9' as Hash,
  hookInitializeTx: '0x42c1863ee70b96b341dbd397f4103c233da1c43dfb40d87b5d37c4cf59179c4e' as Hash,
  initializeTx: '0x08474e3f4620902515811cd995775df6ed440f79cb9118298ba7b07c65a907cf' as Hash,
  dynamicFeeFlag: 8_388_608,
  tickSpacing: 60,
  sqrtPriceX96AtInit: '292223702661591749708025597788160',
  initialTick: 164267,
  config: {
    launchFee: 50_000,
    baselineFee: 5_000,
    decayBlocks: 20_000,
    reflexFeeDelta: 5_000,
    swapSizeReflexBps: 500,
  },
  predecessor: {
    poolId: '0xc910656a0f753c9a5629cf9722038a0ded4bdc7ea6a4b95050d5375bde48f086',
    initializeTx: '0x9f293eb754b5943311aebc7d1db99011422546558175a68b7ffd07f6a4c7255a' as Hash,
    fee: 3000,
    note: 'Earlier hookless static-fee SKILL/OKB pool; superseded by the proxy-hook pool above.',
  },
} as const

const poolId = '0x7e28af1b33b5a70e30ecd13e92f2d2800d59dbf1139c02e72a9a745cebdecc79'
const dynamicFeeFlag = 8_388_608
const phase5Txs = [
  '0x9e2ce8852242a85a45f41b4fdf612f81a9a505f22b53c96b8ac846a97fd6aa92',
  '0x636dae55fa97b7916fdf44f35563095a5979782f765a268b40384a3ddf825c33',
  '0x100890416ff3abc262c8fe99fcd47c5170af659b0c87e1e7d43a0afd0f0454e6',
  '0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184',
] as const

const poolKey = {
  currency0: '0x0000000000000000000000000000000000000000' as Address,
  currency1: addresses.usdt0,
  fee: dynamicFeeFlag,
  tickSpacing: 60,
  hooks: addresses.hook,
}

const publicClient = createPublicClient({
  chain: {
    id: chain.id,
    name: chain.name,
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
  },
  transport: http(chain.rpcUrl),
})

const hookAbi = parseAbi([
  'function currentFee((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key) view returns (uint24)',
  'function currentToxicFlowScore((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key) view returns (uint256)',
  'function currentPoolPriceE18((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key) view returns (uint256)',
  'function poolState(bytes32 poolId) view returns (uint24 baselineFee,uint24 lastReflexFee,uint32 swapsSinceEvolution,uint64 lastEvolutionBlock,uint256 cumulativeLvrSignal,uint256 lastOraclePriceE18,uint256 lastPoolPriceE18,bool initialized)',
  'function config() view returns (uint24 initialFee,uint24 maxReflexFeeDelta,uint24 evolutionStepUp,uint24 evolutionStepDown,uint16 reflexThresholdBps,uint16 healthyThresholdBps,uint16 evolutionThresholdBps,uint16 reflexFeeMultiplierBps,uint32 evolutionCadence,uint64 maxOracleAge)',
  'event ReflexFeeQuoted(bytes32 indexed poolId,uint24 oldFee,uint24 newFee,uint256 lvrSignal,bytes32 reason,uint256 oraclePriceE18,uint256 poolPriceE18)',
  'event BaselineFeeUpdated(bytes32 indexed poolId,uint24 oldFee,uint24 newFee,uint256 lvrSignal,bytes32 reason,uint32 swapsObserved,uint256 oraclePriceE18,uint256 poolPriceE18)',
  'event OracleSkipped(bytes32 indexed poolId,bytes32 reason)',
])

const oracleAbi = parseAbi([
  'function read((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key) view returns (uint256 priceE18,uint256 updatedAt)',
])

const erc20Abi = parseAbi(['function approve(address spender,uint256 amount) returns (bool)'])

const erc20MetaAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
])

const erc20BalanceAbi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
])

const swapExecutorAbi = parseAbi([
  'function exactInput((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,(bool zeroForOne,int256 amountSpecified,uint160 sqrtPriceLimitX96) swap,uint256 maxInput,uint256 minOutput) payable returns (int256)',
])

type AdaptationEvent = {
  tx: Hash
  blockNumber: bigint
  type: 'EVOLUTION_UP' | 'EVOLUTION_DOWN' | 'REFLEX'
  oldFee: number
  newFee: number
  lvrSignal: string
  oraclePriceE18: string
  poolPriceE18: string
  swapsObserved?: number
}

type FlapTokenStatus = {
  name: string
  symbol: string
  decimals: number
  deployerSkillBalanceRaw: string
  deployerOkbBalanceWei: string
  detected: boolean
}

type OracleSkipRecord = {
  tx: Hash
  blockNumber: bigint
  reason: string
}

type DashboardTab = 'live' | 'autobio' | 'passport' | 'memory' | 'modes'

const TAB_DEFS: ReadonlyArray<{ id: DashboardTab; title: string; sub: string }> = [
  { id: 'live', title: 'Live Defense', sub: 'Metrics · Run swap · Chart' },
  { id: 'autobio', title: 'Pool Autobiography', sub: 'Readable defense timeline' },
  { id: 'passport', title: 'Proof Passport', sub: 'Verify on OKLink' },
  { id: 'memory', title: 'Pool Memory', sub: 'Epoch · Learning loop' },
  { id: 'modes', title: 'Protection Modes', sub: 'Flap · Checker · Events' },
]

type DashboardState = {
  currentFee: number
  toxicScore: string
  poolPrice: string
  oraclePrice: string
  oracleUpdatedAt: number
  events: AdaptationEvent[]
  oracleSkips: OracleSkipRecord[]
  feeEvolution: FeeEvolutionPoint[]
  memory: PoolMemory
  flap: FlapTokenStatus
  lastRefresh: string
  currentBlock: bigint
}

async function fetchFlapTokenStatus(): Promise<FlapTokenStatus> {
  const skill = addresses.skill as Address
  const deployer = addresses.deployer as Address
  try {
    const [name, symbol, decimals, skillBalance, okbBalance] = await Promise.all([
      publicClient.readContract({ address: skill, abi: erc20MetaAbi, functionName: 'name' }),
      publicClient.readContract({ address: skill, abi: erc20MetaAbi, functionName: 'symbol' }),
      publicClient.readContract({ address: skill, abi: erc20MetaAbi, functionName: 'decimals' }),
      publicClient.readContract({
        address: skill,
        abi: erc20BalanceAbi,
        functionName: 'balanceOf',
        args: [deployer],
      }),
      publicClient.getBalance({ address: deployer }),
    ])
    return {
      name,
      symbol,
      decimals,
      deployerSkillBalanceRaw: skillBalance.toString(),
      deployerOkbBalanceWei: okbBalance.toString(),
      detected: true,
    }
  } catch {
    return {
      name: 'Unavailable',
      symbol: 'Unavailable',
      decimals: 18,
      deployerSkillBalanceRaw: '0',
      deployerOkbBalanceWei: '0',
      detected: false,
    }
  }
}

async function fetchDashboard(extraTxs: readonly Hash[] = []): Promise<DashboardState> {
  // Read the fixed proof transactions plus any swaps run live this session, so a
  // freshly-mined swap shows up in the event log immediately.
  const txs = Array.from(new Set<Hash>([...phase5Txs, ...extraTxs]))
  const [
    currentFee,
    toxicScore,
    poolPrice,
    oracleRead,
    rawState,
    rawConfig,
    receipts,
    flap,
    currentBlock,
  ] = await Promise.all([
    publicClient.readContract({
      address: addresses.hook,
      abi: hookAbi,
      functionName: 'currentFee',
      args: [poolKey],
    }),
    publicClient.readContract({
      address: addresses.hook,
      abi: hookAbi,
      functionName: 'currentToxicFlowScore',
      args: [poolKey],
    }),
    publicClient.readContract({
      address: addresses.hook,
      abi: hookAbi,
      functionName: 'currentPoolPriceE18',
      args: [poolKey],
    }),
    publicClient.readContract({
      address: addresses.oracle,
      abi: oracleAbi,
      functionName: 'read',
      args: [poolKey],
    }),
    publicClient.readContract({
      address: addresses.hook,
      abi: hookAbi,
      functionName: 'poolState',
      args: [poolId],
    }),
    publicClient.readContract({
      address: addresses.hook,
      abi: hookAbi,
      functionName: 'config',
    }),
    Promise.all(txs.map((tx) => publicClient.getTransactionReceipt({ hash: tx }))),
    fetchFlapTokenStatus(),
    publicClient.getBlockNumber(),
  ])

  let staleOracleSkips = 0
  const events: AdaptationEvent[] = []
  const oracleSkips: OracleSkipRecord[] = []
  for (const receipt of receipts) {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== addresses.hook.toLowerCase()) continue
      const decoded = decodeEventLog({ abi: hookAbi, data: log.data, topics: log.topics })

      if (decoded.eventName === 'BaselineFeeUpdated') {
        events.push({
          tx: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          type: bytes32ToText(decoded.args.reason) as 'EVOLUTION_UP' | 'EVOLUTION_DOWN',
          oldFee: decoded.args.oldFee,
          newFee: decoded.args.newFee,
          lvrSignal: decoded.args.lvrSignal.toString(),
          oraclePriceE18: decoded.args.oraclePriceE18.toString(),
          poolPriceE18: decoded.args.poolPriceE18.toString(),
          swapsObserved: decoded.args.swapsObserved,
        })
      } else if (decoded.eventName === 'ReflexFeeQuoted') {
        events.push({
          tx: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          type: 'REFLEX',
          oldFee: decoded.args.oldFee,
          newFee: decoded.args.newFee,
          lvrSignal: decoded.args.lvrSignal.toString(),
          oraclePriceE18: decoded.args.oraclePriceE18.toString(),
          poolPriceE18: decoded.args.poolPriceE18.toString(),
        })
      } else if (decoded.eventName === 'OracleSkipped') {
        staleOracleSkips += 1
        oracleSkips.push({
          tx: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          reason: bytes32ToText(decoded.args.reason),
        })
      }
    }
  }
  events.sort((a, b) => Number(a.blockNumber - b.blockNumber))
  oracleSkips.sort((a, b) => Number(a.blockNumber - b.blockNumber))

  const feeEvolution: FeeEvolutionPoint[] = events.map((event) => ({
    blockNumber: event.blockNumber,
    txHash: event.tx,
    oldFeeBps: event.oldFee,
    newFeeBps: event.newFee,
    feeDeltaBps: event.newFee - event.oldFee,
    toxicFlowScore: event.lvrSignal,
    reason: event.type,
    kind: event.type === 'REFLEX' ? 'REFLEX' : 'BASELINE_EVOLUTION',
  }))

  const meteredSwapsFromEvolutions = events.reduce(
    (sum, event) => sum + (event.swapsObserved ?? 0),
    0,
  )

  const rawPoolState: RawPoolState = {
    baselineFee: Number(rawState[0]),
    lastReflexFee: Number(rawState[1]),
    swapsSinceEvolution: Number(rawState[2]),
    lastEvolutionBlock: rawState[3],
    cumulativeLvrSignal: rawState[4].toString(),
    lastOraclePriceE18: rawState[5].toString(),
    lastPoolPriceE18: rawState[6].toString(),
    initialized: rawState[7],
  }

  const memory = buildPoolMemory({
    poolId,
    hookAddress: addresses.hook,
    token0: poolKey.currency0,
    token1: poolKey.currency1,
    rawState: rawPoolState,
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
    events: feeEvolution,
    liveCurrentFeeBps: currentFee,
    liveToxicFlowScore: toxicScore.toString(),
    meteredSwapsFromEvolutions,
    staleOracleSkips,
  })

  return {
    currentFee,
    toxicScore: toxicScore.toString(),
    poolPrice: poolPrice.toString(),
    oraclePrice: oracleRead[0].toString(),
    oracleUpdatedAt: Number(oracleRead[1]),
    events,
    oracleSkips,
    feeEvolution,
    memory,
    flap,
    lastRefresh: new Date().toLocaleTimeString(),
    currentBlock,
  }
}

async function detectFlapToken(address: string): Promise<DetectedToken | null> {
  try {
    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: address as Address,
        abi: erc20MetaAbi,
        functionName: 'name',
      }),
      publicClient.readContract({
        address: address as Address,
        abi: erc20MetaAbi,
        functionName: 'symbol',
      }),
      publicClient.readContract({
        address: address as Address,
        abi: erc20MetaAbi,
        functionName: 'decimals',
      }),
    ])
    return { address, name, symbol, decimals }
  } catch {
    return null
  }
}

function App() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending: isConnecting, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [runStatus, setRunStatus] = useState('')
  const [lastSwapTx, setLastSwapTx] = useState<Hash | null>(null)
  const [sessionTxs, setSessionTxs] = useState<Hash[]>([])
  const [tab, setTab] = useState<DashboardTab>('live')

  // Switch tab, scroll the dashboard into view after React renders the new
  // tab, and optionally focus an input inside it (used by the hero buttons
  // for Check Flap Token / Check Any X Layer Token).
  function switchTab(next: DashboardTab, focusInputId?: string) {
    setTab(next)
    setTimeout(() => {
      scrollToId('dashboard')
      if (focusInputId) {
        setTimeout(() => {
          const el = document.getElementById(focusInputId) as HTMLInputElement | null
          el?.focus()
        }, 380)
      }
    }, 60)
  }
  const {
    data: state,
    error,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['helix-dashboard', poolId, sessionTxs.join(',')],
    queryFn: () => fetchDashboard(sessionTxs),
    refetchInterval: 20_000,
  })

  const isOwner = address?.toLowerCase() === addresses.deployer.toLowerCase()

  function handleConnect() {
    if (connectors.length === 0) return
    // Prefer the OKX Wallet connector; fall back to the generic injected one.
    const okx = connectors.find((c) => c.id === 'okxWallet')
    connect({ connector: okx ?? connectors[0] })
  }

  const status = error
    ? error instanceof Error
      ? error.message
      : 'Failed to load X Layer state'
    : isLoading
      ? 'Reading hook, oracle, and event receipts from X Layer mainnet...'
      : isRefetching
        ? 'Refreshing live X Layer state...'
        : 'Live X Layer state loaded. No mocked data is used.'

  // Hero CTA links to the MOST RECENT reflex event (or latest adaptation) from
  // the live event log — never a hardcoded transaction.
  const latestReflexTx = state?.events.filter((e) => e.type === 'REFLEX').at(-1)?.tx
  const latestEvolutionTx = state?.events
    .filter((e) => e.type === 'EVOLUTION_UP' || e.type === 'EVOLUTION_DOWN')
    .at(-1)?.tx
  const latestProofTx = latestReflexTx ?? state?.events.at(-1)?.tx

  // Compute the honest Flap proxy card status. Now that the SKILL/OKB v4 pool
  // is initialized onchain (Option A pool-ready mode), the relevant honest
  // states are: token-detection-failed, pool-initialized-awaiting-graduation
  // (current — token transfer-restricts during the Flap bonding curve), or
  // live (only after SKILL graduates and the pool is actually seeded).
  const flapStatus:
    | 'live'
    | 'pool-initialized-awaiting-graduation'
    | 'pool-creation-required'
    | 'waiting-for-token-balance'
    | 'token-detection-failed' = !state
    ? 'token-detection-failed'
    : !state.flap.detected
      ? 'token-detection-failed'
      : 'pool-initialized-awaiting-graduation'

  async function runToxicSwap() {
    if (!isOwner) {
      setRunStatus('Connect the deployer wallet to run a real toxic swap. Read-only proof remains visible.')
      return
    }

    try {
      // The wallet may be on Ethereum (or any other chain). Force X Layer (196)
      // before sending, otherwise the tx would route to the wrong network.
      if (chainId !== chain.id) {
        setRunStatus('Switching your wallet to X Layer mainnet (chainId 196)...')
        await switchChainAsync({ chainId: chain.id })
      }

      setRunStatus('Approving 0.005 USDT0 for the deployed swap executor on X Layer...')
      const approveHash = await writeContractAsync({
        chainId: chain.id,
        address: addresses.usdt0,
        abi: erc20Abi,
        functionName: 'approve',
        args: [addresses.swapExecutor, 5_000n],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })

      setRunStatus('Sending the toxic USDT0 -> OKB swap through PoolManager on X Layer...')
      const swapHash = await writeContractAsync({
        chainId: chain.id,
        address: addresses.swapExecutor,
        abi: swapExecutorAbi,
        functionName: 'exactInput',
        args: [
          poolKey,
          {
            zeroForOne: false,
            amountSpecified: -5_000n,
            sqrtPriceLimitX96: 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_341n,
          },
          5_000n,
          1n,
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: swapHash })

      setLastSwapTx(swapHash)
      setSessionTxs((prev) => (prev.includes(swapHash) ? prev : [...prev, swapHash]))
      setRunStatus('Toxic swap mined on X Layer. Event log updated below.')
      await refetch()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Swap failed.'
      setRunStatus(`Swap stopped: ${message}`)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      <div className="grid-noise" />
      <section className="hero-shell">
        <nav className="topbar">
          <div>
            <span className="eyebrow">HELIX / X Layer / Uniswap v4</span>
            <p className="muted">Self-defending liquidity for Flap-launched tokens.</p>
          </div>
          <div className="wallet-controls">
            {isConnected ? (
              <>
                <span className="wallet-pill">{shortHash(address ?? '0x')}</span>
                <button className="ghost-button" onClick={() => disconnect()} type="button">
                  Disconnect
                </button>
              </>
            ) : (
              <div className="connect-stack">
                <button
                  className="primary-button"
                  disabled={isConnecting || connectors.length === 0}
                  onClick={handleConnect}
                  type="button"
                >
                  {isConnecting ? 'Connecting…' : 'Connect OKX Wallet'}
                </button>
                {connectError ? (
                  <span className="connect-error">
                    {connectError.message.includes('not found') || connectError.message.includes('Provider')
                      ? 'No OKX Wallet detected. Install the OKX Wallet extension, then retry.'
                      : connectError.message}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="signal-chip">Live mainnet proof</span>
            <h1>The AMM that learns to defend its LPs.</h1>
            <p>
              HELIX measures pool-vs-oracle LVR pressure on every swap and rewrites its
              Uniswap v4 dynamic fee curve within a fixed 0.05%–2.00% safety band.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => switchTab('live')} type="button">
                View Live OKB/USDT0 Proof
              </button>
              <button className="ghost-button" onClick={() => switchTab('modes', 'flap-launch-input')} type="button">
                Check Flap Token
              </button>
              <button className="ghost-button" onClick={() => switchTab('modes', 'xlayer-checker-input')} type="button">
                Check Any X Layer Token
              </button>
              {latestProofTx ? (
                <a className="ghost-button" href={explorerTx(latestProofTx)} target="_blank" rel="noreferrer">
                  {latestReflexTx ? 'Latest reflex tx ↗' : 'Latest adaptation ↗'}
                </a>
              ) : null}
              <button className="ghost-button" onClick={() => void refetch()} type="button">
                Refresh chain state
              </button>
            </div>
          </div>

          <div className="orbital-card">
            <div className="ring ring-one" />
            <div className="ring ring-two" />
            <div className="core">
              <strong>{state ? feeToBps(state.currentFee) : '--'} bps</strong>
              <span>current HELIX fee</span>
            </div>
            <div className="orbit-label label-one">Oracle</div>
            <div className="orbit-label label-two">Pool</div>
            <div className="orbit-label label-three">Fee curve</div>
          </div>
        </div>
      </section>

      <section className="dashboard" id="dashboard">
        <nav className="tab-nav" aria-label="Dashboard sections">
          {TAB_DEFS.map((def) => (
            <button
              key={def.id}
              className={`tab-button${tab === def.id ? ' active' : ''}`}
              onClick={() => setTab(def.id)}
              type="button"
              aria-pressed={tab === def.id}
            >
              <span className="tab-button-title">{def.title}</span>
              <span className="tab-button-sub">{def.sub}</span>
            </button>
          ))}
        </nav>

        <div className="status-strip">
          <span>{status}</span>
          <span>Last refresh: {state?.lastRefresh ?? 'pending'}</span>
        </div>

        {tab === 'live' ? (
        <>
        <div className="metric-grid">
          <Metric label="Current fee" value={state ? `${feeToBps(state.currentFee)} bps` : '--'} source="HelixHook.currentFee" />
          <Metric label="Toxic-flow score" value={state ? compact(state.toxicScore) : '--'} source="HelixHook.currentToxicFlowScore" />
          <Metric label="Oracle raw price" value={state ? compact(state.oraclePrice) : '--'} source="TokenDecimalsChainlinkRatioOracle.read" />
          <Metric label="Pool raw price" value={state ? compact(state.poolPrice) : '--'} source="HelixHook.currentPoolPriceE18" />
        </div>

        {state ? (() => {
          // Freshness note for the metric tiles above. The "last on-chain fee
          // update" is the most recent BaselineFeeUpdated / ReflexFeeQuoted
          // event from the live event log — never a hardcoded block or tx.
          const lastFeeChange = state.events.at(-1)
          if (!lastFeeChange) {
            return (
              <p className="freshness-note">
                No on-chain fee adaptations yet. Current block on X Layer:{' '}
                <strong>{state.currentBlock.toString()}</strong>.
              </p>
            )
          }
          const delta = state.currentBlock - lastFeeChange.blockNumber
          const age = humanizeBlockAge(delta < 0n ? 0n : delta)
          const kindLabel = lastFeeChange.type === 'REFLEX' ? 'reflex' : 'baseline evolution'
          return (
            <p className="freshness-note">
              Last on-chain fee update: {kindLabel} at block{' '}
              <strong>{lastFeeChange.blockNumber.toString()}</strong> (≈{age} ago) ·{' '}
              <a href={explorerTx(lastFeeChange.tx)} target="_blank" rel="noreferrer">
                tx {shortHash(lastFeeChange.tx)} ↗
              </a>
              {'  '}· current X Layer block <strong>{state.currentBlock.toString()}</strong>.
              The fee only moves when a new reflex or baseline-evolution event lands on chain.
            </p>
          )
        })() : null}

        <section className="panel trigger-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Judge trigger</span>
              <h2>Run adversarial swap</h2>
            </div>
          </div>
          <p className="panel-copy">
            Sends a real 0.005 USDT0 toxic swap through the deployed
            <code> HelixSwapExecutor</code> on X Layer. The pool reacts on the next block —
            the fee tile above moves, a new card appears in <strong>Pool Autobiography</strong>,
            and a new point lands on the fee-evolution chart below.
          </p>
          <button className="danger-button" disabled={!isOwner} onClick={runToxicSwap} type="button">
            Run real toxic swap
          </button>
          <p className="run-status">{runStatus || (isOwner ? 'Ready to spend real USDT0.' : 'Read-only mode: connect deployer wallet to spend.')}</p>
          {lastSwapTx ? (
            <a className="swap-tx-link" href={explorerTx(lastSwapTx)} target="_blank" rel="noreferrer">
              View swap on X Layer explorer: {shortHash(lastSwapTx)} ↗
            </a>
          ) : null}
        </section>

        <FeeCurveEvolutionChart
          points={state?.feeEvolution ?? []}
          currentFeeBps={state?.currentFee ?? 0}
        />
        </>
        ) : null}

        {tab === 'autobio' ? (
          state ? (
            <PoolAutobiographyPanel
              entries={buildPoolAutobiography({
                events: state.events,
                oracleSkips: state.oracleSkips,
                memory: state.memory,
                explorerTx,
              })}
            />
          ) : (
            <p className="run-status">Loading live events from X Layer…</p>
          )
        ) : null}

        {tab === 'passport' ? (
          <ProofPassportPanel passport={proofPassport} />
        ) : null}

        {tab === 'memory' ? (
          state ? (
            <>
              <PoolMemoryPanel memory={state.memory} />
              <LearningLoopExplainer />
            </>
          ) : (
            <p className="run-status">Loading live pool memory from X Layer…</p>
          )
        ) : null}

        {tab === 'modes' ? (
          state ? (
            <>
              <ProtectionModesPanel
                oracle={{
                  currentFeeBps: feeToBps(state.currentFee),
                  toxicScoreCompact: compact(state.toxicScore),
                  latestReflexTx: latestReflexTx ?? null,
                  latestEvolutionTx: latestEvolutionTx ?? null,
                  hookAddress: addresses.hook,
                  oracleAddress: addresses.oracle,
                  poolId,
                  pairLabel: 'OKB / USDT0',
                  explorerAddress,
                  explorerTx,
                }}
                flap={{
                  flapTokenAddress: addresses.skill,
                  flapTokenName: state.flap.name,
                  flapTokenSymbol: state.flap.symbol,
                  flapTokenDecimals: state.flap.decimals,
                  flapTokenUrl: flapSkillUrl,
                  pairCandidate: `${state.flap.symbol || 'SKILL'} / OKB`,
                  status: flapStatus,
                  deployerSkillBalance: state.flap.deployerSkillBalanceRaw,
                  deployerOkbBalance: state.flap.deployerOkbBalanceWei,
                  poolId: skillPool.poolId,
                  poolManagerAddress: addresses.poolManager,
                  hookAddress: skillPool.hookAddress,
                  latestTx: skillPool.initializeTx,
                  explorerAddress,
                  explorerTx,
                }}
                modeChecker={{
                  detectToken: detectFlapToken,
                  oracleCoveredToken: addresses.usdt0,
                  oracleReadyTokens,
                }}
              />

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">Flap token pool dashboard</span>
                    <h2>Flap-ready launch protection surface</h2>
                  </div>
                  <a href={explorerAddress(addresses.flapPortal)} target="_blank">Flap Portal</a>
                </div>
                <div className="flap-grid">
                  <Fact label="Integration type" value="Contract/event-based Flap discovery + manual oracle-covered HELIX pool" />
                  <Fact label="Selected pool" value="OKB / USDT0 exact-LVR demo pool" />
                  <Fact label="Token address" value={addresses.usdt0} />
                  <Fact label="Launch timestamp" value="Unavailable: USDT0 is not a Flap-launched token" />
                  <Fact label="PoolId" value={poolId} />
                  <Fact label="Hook address" value={addresses.hook} />
                </div>
                <p className="panel-copy">
                  For a newly launched Flap token, HELIX can discover token metadata from the
                  Flap Portal events. Exact LVR still requires a real external price reference;
                  the live proof therefore uses OKB/USDT0 where Chainlink feeds exist.
                </p>
              </section>

              <FlapLaunchProtectionPanel
                oracleCoveredToken={addresses.usdt0}
                flapPortal={addresses.flapPortal}
                explorerAddress={explorerAddress}
                detectToken={detectFlapToken}
              />

              <section className="event-list">
                {state.events.map((event) => (
                  <article className="event-card" key={`${event.tx}-${event.type}`}>
                    <div>
                      <span className={`event-kind ${event.type === 'REFLEX' ? 'reflex' : 'evolution'}`}>{event.type}</span>
                      <h3>{event.oldFee} to {event.newFee}</h3>
                      <p>LVR signal {compact(event.lvrSignal)} / oracle {compact(event.oraclePriceE18)} / pool {compact(event.poolPriceE18)}</p>
                    </div>
                    <a href={explorerTx(event.tx)} target="_blank">{shortHash(event.tx)}</a>
                  </article>
                ))}
              </section>
            </>
          ) : (
            <p className="run-status">Loading X Layer state…</p>
          )
        ) : null}
      </section>
    </main>
  )
}

function Metric({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{source}</small>
    </article>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function bytes32ToText(value: `0x${string}`) {
  const hex = value.slice(2)
  let output = ''
  for (let i = 0; i < hex.length; i += 2) {
    const code = Number.parseInt(hex.slice(i, i + 2), 16)
    if (code !== 0) output += String.fromCharCode(code)
  }
  return output
}

function feeToBps(fee: number) {
  return (fee / 100).toFixed(2)
}

function compact(value: string) {
  if (value.length <= 10) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function shortHash(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

// X Layer mainnet runs at ~2 second blocks. Converts a block delta into a
// short, judge-friendly age string like "12m", "3h", "2d".
function humanizeBlockAge(blockDelta: bigint): string {
  const seconds = Number(blockDelta) * 2
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(seconds / 3600)
  if (hours < 48) return `${hours}h`
  const days = Math.round(seconds / 86400)
  return `${days}d`
}

function explorerTx(tx: string) {
  return `${chain.explorer}/tx/${tx}`
}

function explorerAddress(address_: string) {
  return `${chain.explorer}/address/${address_}`
}

function scrollToId(id: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default App
