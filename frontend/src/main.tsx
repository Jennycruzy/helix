import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain, type EIP1193Provider } from 'viem'
import './index.css'
import App from './App.tsx'

declare global {
  interface Window {
    okxwallet?: EIP1193Provider
    ethereum?: EIP1193Provider & { isOkxWallet?: boolean }
  }
}

const xLayer = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.xlayer.tech'] },
  },
  blockExplorers: {
    default: { name: 'OKLink', url: 'https://www.oklink.com/x-layer' },
  },
})

// Target the OKX Wallet provider explicitly. OKX injects `window.okxwallet`
// (and flags `window.ethereum.isOkxWallet`). A generic `injected()` fallback
// keeps the button working with any other injected wallet (e.g. MetaMask).
const okxWallet = injected({
  target() {
    const provider =
      typeof window !== 'undefined'
        ? window.okxwallet ?? (window.ethereum?.isOkxWallet ? window.ethereum : undefined)
        : undefined
    if (!provider) return undefined
    return { id: 'okxWallet', name: 'OKX Wallet', provider }
  },
})

const config = createConfig({
  chains: [xLayer],
  connectors: [okxWallet, injected()],
  transports: {
    [xLayer.id]: http('https://rpc.xlayer.tech'),
  },
})

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
