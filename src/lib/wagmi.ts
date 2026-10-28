import { createConfig, http, injected } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { CHAIN_ID, PUBLIC_RPC } from './config';

export const targetChain = CHAIN_ID === 97 ? bscTestnet : bsc;

/**
 * Injected connectors only (MetaMask, Binance Wallet, OKX, TokenPocket… all inject a provider).
 * EIP-6963 discovery lists each installed wallet separately; the generic `injected()` connector is
 * the fallback for in-app wallet browsers. No WalletConnect project id is needed.
 */
export const wagmiConfig = createConfig({
  chains: [bsc, bscTestnet],
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: true,
  ssr: true,
  transports: {
    [bsc.id]: http(CHAIN_ID === 56 ? PUBLIC_RPC : undefined),
    [bscTestnet.id]: http(CHAIN_ID === 97 ? PUBLIC_RPC : undefined),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
