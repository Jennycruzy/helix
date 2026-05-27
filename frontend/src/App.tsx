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
import { useAccount, useConnect, useDisconnect, useWriteContract } from 'wagmi'
import './App.css'
import { buildPoolMemory } from './lib/poolMemory'
import { PoolMemoryPanel } from './components/pool-memory/PoolMemoryPanel'
import { FeeCurveEvolutionChart } from './components/pool-memory/FeeCurveEvolutionChart'
import { LearningLoopExplainer } from './components/pool-memory/LearningLoopExplainer'
import {
  FlapLaunchProtectionPanel,
  type DetectedToken,
} from './components/pool-memory/FlapLaunchProtectionPanel'
import type { FeeEvolutionPoint, PoolMemory, RawPoolState } from './types/helix'

const chain = {
  id: 196,
  name: 'X Layer mainnet',
  rpcUrl: 'https://rpc.xlayer.tech',
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

type DashboardState = {
  currentFee: number
  toxicScore: string
  poolPrice: string
  oraclePrice: string
  oracleUpdatedAt: number
  events: AdaptationEvent[]
  feeEvolution: FeeEvolutionPoint[]
  memory: PoolMemory
  lastRefresh: string
}

async function fetchDashboard(): Promise<DashboardState> {
  const [currentFee, toxicScore, poolPrice, oracleRead, rawState, rawConfig, receipts] =
    await Promise.all([
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
      Promise.all(phase5Txs.map((tx) => publicClient.getTransactionReceipt({ hash: tx }))),
    ])

  let staleOracleSkips = 0
  const events: AdaptationEvent[] = []
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
      }
    }
  }
  events.sort((a, b) => Number(a.blockNumber - b.blockNumber))

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
    feeEvolution,
    memory,
    lastRefresh: new Date().toLocaleTimeString(),
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
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { writeContractAsync } = useWriteContract()
  const [runStatus, setRunStatus] = useState('')
  const {
    data: state,
    error,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['helix-dashboard', poolId],
    queryFn: fetchDashboard,
    refetchInterval: 20_000,
  })

  const isOwner = address?.toLowerCase() === addresses.deployer.toLowerCase()
  const status = error
    ? error instanceof Error
      ? error.message
      : 'Failed to load X Layer state'
    : isLoading
      ? 'Reading hook, oracle, and event receipts from X Layer mainnet...'
      : isRefetching
        ? 'Refreshing live X Layer state...'
        : 'Live X Layer state loaded. No mocked data is used.'

  async function runToxicSwap() {
    if (!isOwner) {
      setRunStatus('Connect the deployer wallet to run a real toxic swap. Read-only proof remains visible.')
      return
    }

    setRunStatus('Approving 0.005 USDT0 for the deployed swap executor...')
    const approveHash = await writeContractAsync({
      address: addresses.usdt0,
      abi: erc20Abi,
      functionName: 'approve',
      args: [addresses.swapExecutor, 5_000n],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })

    setRunStatus('Sending the toxic USDT0 -> OKB swap through PoolManager...')
    const swapHash = await writeContractAsync({
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

    setRunStatus(`Toxic swap mined: ${shortHash(swapHash)}. Refreshing event log...`)
    await refetch()
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
              <button
                className="primary-button"
                disabled={isConnecting || connectors.length === 0}
                onClick={() => connect({ connector: connectors[0] })}
                type="button"
              >
                Connect OKX Wallet
              </button>
            )}
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="signal-chip">Live mainnet proof</span>
            <h1>The AMM that learns to defend its LPs.</h1>
            <p>
              HELIX measures pool-vs-oracle LVR pressure on every swap and rewrites its
              Uniswap v4 dynamic fee curve inside hard-coded bounds.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href={explorerTx('0x608903dd59b131110096a748c817b00a23861c1404ca3fa8ea0aa7a8bd9f8184')} target="_blank">
                View reflex tx
              </a>
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

      <section className="dashboard">
        <div className="status-strip">
          <span>{status}</span>
          <span>Last refresh: {state?.lastRefresh ?? 'pending'}</span>
        </div>

        <div className="metric-grid">
          <Metric label="Current fee" value={state ? `${feeToBps(state.currentFee)} bps` : '--'} source="HelixHook.currentFee" />
          <Metric label="Toxic-flow score" value={state ? compact(state.toxicScore) : '--'} source="HelixHook.currentToxicFlowScore" />
          <Metric label="Oracle raw price" value={state ? compact(state.oraclePrice) : '--'} source="TokenDecimalsChainlinkRatioOracle.read" />
          <Metric label="Pool raw price" value={state ? compact(state.poolPrice) : '--'} source="HelixHook.currentPoolPriceE18" />
        </div>

        {state ? <PoolMemoryPanel memory={state.memory} /> : null}

        <div className="panel-grid">
          <FeeCurveEvolutionChart
            points={state?.feeEvolution ?? []}
            currentFeeBps={state?.currentFee ?? 0}
          />

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Judge trigger</span>
                <h2>Run adversarial swap</h2>
              </div>
            </div>
            <p className="panel-copy">
              The button sends a real 0.005 USDT0 toxic swap through the deployed
              `HelixSwapExecutor`. It is enabled only for the deployer wallet because
              that executor is deliberately owner-gated.
            </p>
            <button className="danger-button" disabled={!isOwner} onClick={runToxicSwap} type="button">
              Run real toxic swap
            </button>
            <p className="run-status">{runStatus || (isOwner ? 'Ready to spend real USDT0.' : 'Read-only mode: connect deployer to spend.')}</p>
          </section>
        </div>

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

        <LearningLoopExplainer />

        <FlapLaunchProtectionPanel
          oracleCoveredToken={addresses.usdt0}
          flapPortal={addresses.flapPortal}
          explorerAddress={explorerAddress}
          detectToken={detectFlapToken}
        />

        <section className="event-list">
          {state?.events.map((event) => (
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

function explorerTx(tx: string) {
  return `${chain.explorer}/tx/${tx}`
}

function explorerAddress(address_: string) {
  return `${chain.explorer}/address/${address_}`
}

export default App
