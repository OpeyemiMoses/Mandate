"use client";

import React, { useState, useEffect } from "react";
import "@rainbow-me/rainbowkit/styles.css";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
  useConnectModal,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider, useAccount } from "wagmi";
import { auroraTestnet, aurora } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMandate } from "@/context/MandateContext";

// Define the NEAR Aurora chains so the label is clearly NEAR
export const nearAuroraTestnet = {
  ...auroraTestnet,
  id: 1313161555,
  name: "NEAR (Aurora Testnet)",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet.aurora.dev"] },
    public: { http: ["https://testnet.aurora.dev"] },
  },
  blockExplorers: {
    default: {
      name: "Aurorascan Testnet",
      url: "https://testnet.aurorascan.dev",
    },
  },
  testnet: true,
} as const;

export const nearAuroraMainnet = {
  ...aurora,
  id: 1313161554,
  name: "NEAR (Aurora Mainnet)",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.aurora.dev"] },
    public: { http: ["https://mainnet.aurora.dev"] },
  },
  blockExplorers: {
    default: {
      name: "Aurorascan",
      url: "https://aurorascan.dev",
    },
  },
} as const;

export const wagmiConfig = getDefaultConfig({
  appName: "Mandate",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "21fef48091f12692cad574a6f7753643",
  chains: [nearAuroraTestnet, nearAuroraMainnet],
  ssr: true,
});

const mandateTheme = darkTheme({
  accentColor: "#FF3B30",
  accentColorForeground: "#FFFFFF",
  borderRadius: "large",
  fontStack: "system",
  overlayBlur: "small",
});

/**
 * Synchronizes connected RainbowKit/Wagmi account state with MandateContext & backend.
 */
function WagmiMandateSync() {
  const { address, isConnected, connector } = useAccount();
  const { accountId, connectWallet } = useMandate();

  useEffect(() => {
    // If the user explicitly disconnected, prevent auto-reconnection
    if (
      typeof window !== "undefined" &&
      localStorage.getItem("mandate_explicitly_disconnected") === "true"
    ) {
      return;
    }

    if (isConnected && address) {
      if (address.toLowerCase() !== accountId?.toLowerCase()) {
        connectWallet(address, connector?.name || "Browser Wallet");
      }
    }
  }, [isConnected, address, connector, accountId, connectWallet]);

  return null;
}

/**
 * Automatically triggers RainbowKit's connect modal when any app component
 * requests wallet connection via isWalletModalOpen.
 */
function RainbowModalSync() {
  const { openConnectModal } = useConnectModal();
  const { isWalletModalOpen, setIsWalletModalOpen } = useMandate();

  useEffect(() => {
    if (isWalletModalOpen && openConnectModal) {
      openConnectModal();
      setIsWalletModalOpen(false);
    }
  }, [isWalletModalOpen, openConnectModal, setIsWalletModalOpen]);

  return null;
}

export function RainbowKitProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={mandateTheme} modalSize="compact">
          <WagmiMandateSync />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

