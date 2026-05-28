#!/usr/bin/env node
// HELIX MCP server — exposes HELIX (a self-defending Uniswap v4 hook on
// X Layer) as a pluggable AI-agent skill. Tools are read-only and live
// against X Layer mainnet; all token / pool inputs are accepted as
// arguments so an agent can use the skill for any token of the user's
// choice — not just the deployed OKB/USDT0 proof pool.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
  checkMode,
  poolAutobiography,
  poolMemory,
  poolState,
  proofPassport,
  tokenInfo,
} from './tools.js'

const TOOLS = [
  {
    name: 'helix_check_mode',
    description:
      'Recommend the HELIX protection mode for any X Layer ERC-20 token. Reads ERC-20 metadata live and classifies the token as oracle-live (in the live HELIX pool), oracle-ready (Chainlink coverage but no HELIX pool yet), or proxy (no oracle; use HelixFlapProxyHook). Returns a rationale string suitable for surfacing to the user.',
    inputSchema: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: '0x-prefixed 20-byte token address on X Layer mainnet.',
        },
      },
      required: ['tokenAddress'],
    },
  },
  {
    name: 'helix_pool_state',
    description:
      'Read live HELIX pool state from X Layer: current fee (live), toxic-flow score, oracle/pool prices, baseline fee from storage, last evolution block, full controller config, current chain head. Defaults to the live OKB/USDT0 proof pool when poolId is omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: {
          type: 'string',
          description:
            'Optional bytes32 v4 pool id. Omit to read the live OKB/USDT0 proof pool. For non-default pools the live currentFee / toxicScore / oracle / pool price values may be null because they require a PoolKey we do not know.',
        },
      },
      required: [],
    },
  },
  {
    name: 'helix_pool_autobiography',
    description:
      'Plain-English timeline of HELIX defenses for a pool: ReflexFeeQuoted / BaselineFeeUpdated / OracleSkipped events decoded into readable cards with block, tx hash, OKLink explorer URL, and fee movement. Scans up to the last 99 blocks (~3.3 min on X Layer) — set XLAYER_RPC_URL to a paid provider for full history. Most-recent-first ordering.',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: {
          type: 'string',
          description: 'Optional bytes32 v4 pool id. Defaults to the live OKB/USDT0 proof pool.',
        },
        lookbackBlocks: {
          type: 'integer',
          description:
            'How many blocks to scan back from head. Clamped to [1, 99] because the public X Layer RPC caps eth_getLogs at 100 blocks per request.',
          minimum: 1,
          maximum: 99,
        },
      },
      required: [],
    },
  },
  {
    name: 'helix_pool_memory',
    description:
      'Summarize a HELIX pool\'s memory state: current Defense Epoch (LAUNCH_SHIELD / ADAPTIVE_DEFENSE / CALM_MARKET / ORACLE_SAFE_MODE), baseline fee, swaps since last evolution, cumulative LVR signal, blocks since last evolution, and controller thresholds. Same epoch logic the HELIX dashboard uses.',
    inputSchema: {
      type: 'object',
      properties: {
        poolId: {
          type: 'string',
          description: 'Optional bytes32 v4 pool id. Defaults to the live OKB/USDT0 proof pool.',
        },
      },
      required: [],
    },
  },
  {
    name: 'helix_token_info',
    description:
      'Read live ERC-20 metadata (name, symbol, decimals) for any X Layer token, plus its OKLink explorer URL. Native zero address returns OKB metadata directly. Returns an error field if the address is not an ERC-20.',
    inputSchema: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: '0x-prefixed 20-byte token address on X Layer.',
        },
      },
      required: ['tokenAddress'],
    },
  },
  {
    name: 'helix_proof_passport',
    description:
      'Return the HELIX deployment proof passport: network, chain id, hook / PoolManager / oracle addresses, default pool id, verified source URL, deployment / pool-creation / reflex / evolution tx hashes, and current chain head. Use this when a user asks how to verify HELIX is real on chain.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
] as const

const server = new Server(
  {
    name: 'helix-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS as unknown as typeof TOOLS,
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name
  const args = (req.params.arguments ?? {}) as Record<string, unknown>
  try {
    let result: unknown
    switch (name) {
      case 'helix_check_mode':
        result = await checkMode({ tokenAddress: String(args.tokenAddress) })
        break
      case 'helix_pool_state':
        result = await poolState({
          poolId: args.poolId == null ? undefined : String(args.poolId),
        })
        break
      case 'helix_pool_autobiography':
        result = await poolAutobiography({
          poolId: args.poolId == null ? undefined : String(args.poolId),
          lookbackBlocks:
            args.lookbackBlocks == null ? undefined : Number(args.lookbackBlocks),
        })
        break
      case 'helix_pool_memory':
        result = await poolMemory({
          poolId: args.poolId == null ? undefined : String(args.poolId),
        })
        break
      case 'helix_token_info':
        result = await tokenInfo({ tokenAddress: String(args.tokenAddress) })
        break
      case 'helix_proof_passport':
        result = await proofPassport()
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, bigintReplacer, 2),
        },
      ],
    }
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `helix-mcp tool '${name}' failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      ],
    }
  }
})

// JSON.stringify can't serialize bigint by default; surface them as strings.
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Note: do NOT write to stdout. MCP uses stdio for JSON-RPC framing; any
  // stray stdout write corrupts the stream. Log to stderr instead.
  process.stderr.write(
    `helix-mcp v0.1.0 ready (X Layer mainnet, hook ${process.env.HELIX_HOOK ?? '0x9918…50C0'}).\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`helix-mcp fatal error: ${String(err)}\n`)
  process.exit(1)
})
