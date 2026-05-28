# HELIX MCP — pluggable AI-agent skill for X Layer

HELIX is a self-defending Uniswap v4 hook on X Layer mainnet. This MCP server
turns HELIX into a **skill** that any MCP-compatible AI agent (Claude
Desktop, Cursor, Windsurf, Cline, etc.) can call with **one prompt**, for any
X Layer token of the user's choice — not just the deployed proof pool.

## What the skill exposes

Six live, read-only tools against X Layer mainnet:

| Tool | What it does |
|---|---|
| `helix_check_mode` | Recommend the protection mode for any X Layer token: `oracle-live` / `oracle-ready` / `proxy`, with rationale. |
| `helix_pool_state` | Live current fee, toxic-flow score, oracle/pool prices, full controller config, current chain head. |
| `helix_pool_autobiography` | Plain-English timeline of past defense events (reflex fees, baseline evolutions, oracle skips) with OKLink links. |
| `helix_pool_memory` | Current Defense Epoch + counters + thresholds for a pool. |
| `helix_token_info` | Live ERC-20 metadata for any X Layer token. |
| `helix_proof_passport` | Deployment addresses, proof tx hashes, verification URLs. |

All tools accept `tokenAddress` or `poolId` as arguments. The skill is
token-agnostic — your agent uses it for **whatever tokens you ask about**.

## Install for Claude Desktop

Edit your `claude_desktop_config.json` (location: macOS
`~/Library/Application Support/Claude/claude_desktop_config.json`; Windows
`%APPDATA%/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "helix": {
      "command": "npx",
      "args": ["-y", "helix-mcp@latest"]
    }
  }
}
```

Restart Claude Desktop. The six `helix_*` tools should appear in its tool
list. Then just prompt:

> *"Using HELIX, check what protection mode I should use for token
> `0xed06d48a87f8b8b3e78afd7dd59717a3f7317777` on X Layer, and pull the
> live state of the default HELIX pool."*

## Install for Cursor / Windsurf / Cline

The MCP JSON shape is the same. Add to your editor's MCP servers config:

```json
{
  "mcpServers": {
    "helix": {
      "command": "npx",
      "args": ["-y", "helix-mcp@latest"]
    }
  }
}
```

## Install from this repo (no npm publish needed)

```bash
cd helix-mcp
npm install
npm run build
```

Then point your agent's MCP config at the built binary:

```json
{
  "mcpServers": {
    "helix": {
      "command": "node",
      "args": ["/absolute/path/to/helix/helix-mcp/dist/index.js"]
    }
  }
}
```

## One-prompt usage examples

Once installed, you can say things like:

- *"Use HELIX to check protection mode for
  `0x1E4a5963aBFD975d8c9021ce480b42188849D41d` on X Layer."*
  → Agent calls `helix_check_mode` → returns
  *Oracle-backed LVR Mode — oracle-ready* + rationale.

- *"What's the current HELIX pool's defense epoch and the last time it
  evolved its fee?"*
  → Agent calls `helix_pool_memory` and `helix_pool_state` → answers in
  context.

- *"Summarize HELIX's last few defenses in plain English."*
  → Agent calls `helix_pool_autobiography` → reads cards → summarizes.

- *"Is the HELIX hook a verified contract on X Layer, and what tx proves
  the last reflex defense?"*
  → Agent calls `helix_proof_passport` → returns the verified-source
  OKLink URL + the reflex proof tx hash.

- *"Read metadata for my token `0xABC...` and tell me which HELIX mode
  applies."*
  → Agent calls `helix_token_info` and `helix_check_mode` → answers in
  one turn.

## Configuration (all optional)

Defaults point at the **live X Layer mainnet HELIX deployment** so the skill
works immediately without any configuration.

Override via the MCP server config's `env` field if you want to point the
skill at a different deployment (e.g. your own HELIX pool):

```json
{
  "mcpServers": {
    "helix": {
      "command": "npx",
      "args": ["-y", "helix-mcp@latest"],
      "env": {
        "XLAYER_RPC_URL": "https://your-paid-rpc.example.com",
        "HELIX_HOOK": "0xYourHookAddress",
        "HELIX_ORACLE": "0xYourOracleAddress",
        "HELIX_POOL_MANAGER": "0x360e68faccca8ca495c1B759Fd9EEe466db9FB32",
        "HELIX_POOL_ID": "0xYourBytes32PoolId"
      }
    }
  }
}
```

`XLAYER_RPC_URL` is most useful: the public X Layer RPC caps `eth_getLogs`
at 100 blocks per request, so the autobiography only sees the last ~3
minutes of activity. A paid RPC removes the cap and `helix_pool_autobiography`
can scan further back.

## What this does NOT do

- **No writes.** The skill never sends a transaction. It cannot adapt fees,
  swap, or move funds. Wiring write tools requires wallet integration and is
  intentionally out of scope here for safety.
- **No oracle predictions.** It reports what the hook is doing now, not what
  it might do.
- **No off-chain analytics.** Everything is on-chain reads from X Layer.

## How this skill is built

The server is a thin wrapper over [`viem`](https://viem.sh) reads of the
already-deployed HELIX hook contract. The same addresses and ABI items the
HELIX dashboard uses are reused here, so the skill mirrors the dashboard's
exact view of the chain. See `src/tools.ts` for the implementations.

If you're building a different agent skill for a Uniswap v4 hook, this is a
small, readable reference for how to wrap on-chain hook state in MCP tools.

## License

Same as the parent HELIX repo.
