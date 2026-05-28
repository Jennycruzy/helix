// Proof Passport — a single typed record of everything a judge needs to
// verify HELIX on chain. Values come from the existing deployments record
// (deployments/xlayer-mainnet.json) and from live state at render time.

export type ProofPassportBadge = 'Verified' | 'Live' | 'Needs proof' | 'Read-only' | 'Mainnet'

export type ProofPassport = {
  network: string
  chainId: number
  hookAddress: string
  poolManagerAddress?: string
  poolId?: string
  token0?: string
  token0Symbol?: string
  token1?: string
  token1Symbol?: string
  oracleAddress?: string
  deploymentTx?: string
  poolCreationTx?: string
  reflexProofTx?: string
  evolutionProofTx?: string
  verifiedContractUrl?: string
  explorerBaseUrl: string
  lastUpdated?: string
  badges: ProofPassportBadge[]
}

export function shortHex(value?: string, head = 6, tail = 4): string {
  if (!value) return 'Not provided yet'
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

export function explorerForAddress(passport: ProofPassport, address?: string): string | undefined {
  if (!address) return undefined
  return `${passport.explorerBaseUrl}/address/${address}`
}

export function explorerForTx(passport: ProofPassport, tx?: string): string | undefined {
  if (!tx) return undefined
  return `${passport.explorerBaseUrl}/tx/${tx}`
}
