// X Layer mainnet defaults for the HELIX deployment. Everything is
// env-overridable so an agent can point the skill at a different deployment
// (e.g. a forked test deployment, or a future HELIX pool the user owns)
// without code changes.

import { createPublicClient, http, parseAbi, type Address, type Hex } from 'viem'

export const XLAYER_RPC_URL =
  process.env.XLAYER_RPC_URL ?? 'https://rpc.xlayer.tech'

export const XLAYER_CHAIN_ID = 196
export const XLAYER_EXPLORER = 'https://www.oklink.com/x-layer'

// Default to the deployed live OKB/USDT0 proof pool on X Layer. An agent
// owner who deploys their own HELIX pool can override these to point at
// it (HELIX_HOOK, HELIX_ORACLE, HELIX_POOL_ID env vars).
export const HOOK_ADDRESS = (
  process.env.HELIX_HOOK ?? '0x9918CDcF5a70CfA7F52D06ed9DE8fE95197450C0'
) as Address
export const ORACLE_ADDRESS = (
  process.env.HELIX_ORACLE ?? '0xf213fC8042136682ABd25AC2106481f4B6BdAFd2'
) as Address
export const POOL_MANAGER_ADDRESS = (
  process.env.HELIX_POOL_MANAGER ?? '0x360e68faccca8ca495c1B759Fd9EEe466db9FB32'
) as Address
export const DEFAULT_POOL_ID = (
  process.env.HELIX_POOL_ID ??
  '0x7e28af1b33b5a70e30ecd13e92f2d2800d59dbf1139c02e72a9a745cebdecc79'
) as Hex

// PoolKey for the default HELIX pool. v4 pools are identified by a hashed
// PoolKey; we keep both forms so tools can call view functions that take
// either a PoolKey struct or a bytes32 poolId.
export const DEFAULT_POOL_KEY = {
  currency0: '0x0000000000000000000000000000000000000000' as Address,
  currency1: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' as Address,
  fee: 8_388_608, // DYNAMIC_FEE_FLAG
  tickSpacing: 60,
  hooks: HOOK_ADDRESS,
}

// Tokens that sit IN the currently-deployed live HELIX pool on X Layer
// (OKB/USDT0 = native OKB + USDT0). A token here means oracle-anchored
// LVR is already running for it on chain right now.
export const LIVE_POOL_TOKENS: Address[] = [
  '0x0000000000000000000000000000000000000000',
  '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
]

// Tokens with verified Chainlink price feeds on X Layer but NOT in the
// current live HELIX pool. A pool deployed for one of these could run
// Oracle-backed LVR mode against its Chainlink reference.
//   CHAINLINK_USDT_USD = 0xb928a0678352005a2e51F614efD0b54C9830dB80
export const ORACLE_READY_TOKENS: Address[] = [
  '0x1E4a5963aBFD975d8c9021ce480b42188849D41d', // X Layer USDT
]

export const publicClient = createPublicClient({
  chain: {
    id: XLAYER_CHAIN_ID,
    name: 'X Layer mainnet',
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: { default: { http: [XLAYER_RPC_URL] } },
  } as never,
  transport: http(XLAYER_RPC_URL),
})

export const hookAbi = parseAbi([
  'function currentFee((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key) view returns (uint24)',
  'function currentToxicFlowScore((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key) view returns (uint256)',
  'function currentPoolPriceE18((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key) view returns (uint256)',
  'function poolState(bytes32 poolId) view returns (uint24 baselineFee,uint24 lastReflexFee,uint32 swapsSinceEvolution,uint64 lastEvolutionBlock,uint256 cumulativeLvrSignal,uint256 lastOraclePriceE18,uint256 lastPoolPriceE18,bool initialized)',
  'function config() view returns (uint24 initialFee,uint24 maxReflexFeeDelta,uint24 evolutionStepUp,uint24 evolutionStepDown,uint16 reflexThresholdBps,uint16 healthyThresholdBps,uint16 evolutionThresholdBps,uint16 reflexFeeMultiplierBps,uint32 evolutionCadence,uint64 maxOracleAge)',
  'function MIN_FEE() view returns (uint24)',
  'function MAX_FEE() view returns (uint24)',
  'event ReflexFeeQuoted(bytes32 indexed poolId,uint24 oldFee,uint24 newFee,uint256 lvrSignal,bytes32 reason,uint256 oraclePriceE18,uint256 poolPriceE18)',
  'event BaselineFeeUpdated(bytes32 indexed poolId,uint24 oldFee,uint24 newFee,uint256 lvrSignal,bytes32 reason,uint32 swapsObserved,uint256 oraclePriceE18,uint256 poolPriceE18)',
  'event OracleSkipped(bytes32 indexed poolId,bytes32 reason)',
])

export const oracleAbi = parseAbi([
  'function read((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key) view returns (uint256 priceE18,uint256 updatedAt)',
])

export const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
])

export function explorerAddress(addr: string): string {
  return `${XLAYER_EXPLORER}/address/${addr}`
}

export function explorerTx(tx: string): string {
  return `${XLAYER_EXPLORER}/tx/${tx}`
}

export function bytes32ToText(value: Hex): string {
  const hex = value.slice(2)
  let out = ''
  for (let i = 0; i < hex.length; i += 2) {
    const code = Number.parseInt(hex.slice(i, i + 2), 16)
    if (code !== 0) out += String.fromCharCode(code)
  }
  return out
}

export function feeToBps(fee: number | bigint): string {
  return (Number(fee) / 100).toFixed(2)
}
