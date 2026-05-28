// X Layer mainnet RPC. Optional override via VITE_XLAYER_RPC_URL (set on
// Vercel if the public RPC is rate-limited or you want to point at a
// dedicated provider). Unset → falls back to the public RPC, so local dev
// and a fresh Vercel deploy both work with zero env vars.
//
// This lives in its own module so both main.tsx (which uses it to build the
// wagmi/viem config) and App.tsx (which uses it for the read-only public
// client) can import it without creating a circular dependency with the
// entry point.
export const XLAYER_RPC_URL =
  import.meta.env.VITE_XLAYER_RPC_URL ?? 'https://rpc.xlayer.tech'
