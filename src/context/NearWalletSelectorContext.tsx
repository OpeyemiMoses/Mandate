"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { NearConnector } from "@hot-labs/near-connect";
import type { NearWalletBase, Account } from "@hot-labs/near-connect/build/types";
import { nearToYocto } from "@/lib/yocto";

export interface TransferResult {
  txHash: string;
  isRedirect?: boolean;
}

export interface SignedAuthResult {
  accountId: string;
  publicKey: string;
  signature: string;
}

interface NearWalletSelectorContextValue {
  connector: NearConnector | null;
  accounts: Account[];
  accountId: string | null;
  activeWallet: NearWalletBase | null;
  walletName: string | null;
  isInitialized: boolean;
  openWalletModal: () => Promise<void>;
  signOut: () => Promise<void>;
  signAndSendTransfer: (params: {
    receiverId: string;
    amountNear: string;
    callbackUrl?: string;
  }) => Promise<TransferResult>;
  signAuthChallenge: (params: {
    message: string;
    recipient: string;
    nonce: string;
  }) => Promise<SignedAuthResult>;
}

const NearWalletSelectorContext = createContext<NearWalletSelectorContextValue | null>(null);

export function NearWalletSelectorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [activeWallet, setActiveWallet] = useState<NearWalletBase | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize official NEAR Connector SDK on client mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;
    const isExplicitlyDisconnected =
      localStorage.getItem("mandate_explicitly_disconnected") === "true";

    const _connector = new NearConnector({
      network: "testnet",
      autoConnect: !isExplicitlyDisconnected,
    });

    setConnector(_connector);

    // Event listener: wallet:signIn
    _connector.on("wallet:signIn", async ({ wallet, accounts: signedInAccounts }) => {
      if (!isMounted) return;
      if (
        typeof window !== "undefined" &&
        localStorage.getItem("mandate_explicitly_disconnected") === "true"
      ) {
        return;
      }

      setActiveWallet(wallet);
      setWalletName(wallet.manifest.name);
      setAccounts(signedInAccounts);
      const activeAcct = signedInAccounts[0]?.accountId || null;
      setAccountId(activeAcct);
    });

    // Event listener: wallet:signOut
    _connector.on("wallet:signOut", () => {
      if (!isMounted) return;
      setActiveWallet(null);
      setWalletName(null);
      setAccounts([]);
      setAccountId(null);
    });

    // Check if a wallet is already connected and user did not explicitly disconnect
    _connector.whenManifestLoaded.then(async () => {
      if (!isMounted) return;

      if (!isExplicitlyDisconnected) {
        try {
          const connected = await _connector.getConnectedWallet();
          if (connected && connected.accounts?.length > 0) {
            setActiveWallet(connected.wallet);
            setWalletName(connected.wallet.manifest.name);
            setAccounts(connected.accounts);
            setAccountId(connected.accounts[0].accountId);
          }
        } catch (e) {
          // No wallet currently selected
        }
      }

      setIsInitialized(true);
    });

    return () => {
      isMounted = false;
      _connector.removeAllListeners();
    };
  }, []);

  /**
   * Opens the official NEAR Connector modal.
   * Displays all manifest wallets: Intear Wallet, Meteor Wallet, Ledger, Nightly, NEAR CLI, HOT, MyNearWallet.
   */
  const openWalletModal = useCallback(async () => {
    if (!connector) {
      console.warn("NEAR Connector not yet initialized");
      return;
    }

    try {
      localStorage.removeItem("mandate_explicitly_disconnected");
    } catch {}

    try {
      const wallet = await connector.connect();
      if (wallet) {
        setActiveWallet(wallet);
        setWalletName(wallet.manifest.name);
        const accts = await wallet.getAccounts({ network: "testnet" });
        setAccounts(accts);
        if (accts.length > 0) {
          setAccountId(accts[0].accountId);
        }
      }
    } catch (err: any) {
      // User closed modal or aborted
      console.log("NEAR Connector connection dialog closed or aborted:", err?.message);
    }
  }, [connector]);

  /**
   * Explicitly disconnects the active wallet and sets mandate_explicitly_disconnected = true
   * to strictly prevent automatic reconnection loops.
   */
  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth", {
        method: "DELETE",
        credentials: "include",
      });
    } catch {}

    try {
      localStorage.setItem("mandate_explicitly_disconnected", "true");
      localStorage.removeItem("selected-wallet");
      localStorage.removeItem("mandate_active_account_v2");
      localStorage.removeItem("mandate_session_token");
      localStorage.removeItem("mandate_wallet_provider");
      localStorage.removeItem("wagmi.store");
      localStorage.removeItem("wagmi.recentConnectorId");
      sessionStorage.removeItem("mandate_pending_funding");
    } catch {}

    if (connector) {
      try {
        await connector.disconnect();
      } catch (e) {
        console.warn("Connector disconnect call returned:", e);
      }
    }

    setAccountId(null);
    setActiveWallet(null);
    setWalletName(null);
    setAccounts([]);
  }, [connector]);

  /**
   * 1-Click native NEAR token transfer using the connected wallet.
   */
  const signAndSendTransfer = useCallback(
    async ({
      receiverId,
      amountNear,
      callbackUrl,
    }: {
      receiverId: string;
      amountNear: string;
      callbackUrl?: string;
    }): Promise<TransferResult> => {
      if (!connector) {
        throw new Error("NEAR Connector not initialized");
      }

      let wallet = activeWallet;
      if (!wallet) {
        try {
          const connected = await connector.getConnectedWallet();
          wallet = connected.wallet;
        } catch {
          throw new Error("No active NEAR wallet connected. Please connect a wallet first.");
        }
      }

      const depositYocto = nearToYocto(String(amountNear));

      const res = await wallet.signAndSendTransaction({
        receiverId,
        actions: [
          {
            type: "Transfer",
            params: {
              deposit: depositYocto,
            },
          },
        ],
      });

      // Browser wallets redirect if needed
      if (!res) {
        return { txHash: "", isRedirect: true };
      }

      const txHash =
        (res as any)?.transaction?.hash ||
        (res as any)?.transaction_outcome?.id ||
        (typeof res === "string" ? res : "");

      return { txHash, isRedirect: false };
    },
    [connector, activeWallet]
  );

  /**
   * Signs an NEP-413 authentication challenge using the active connected NEAR wallet.
   */
  const signAuthChallenge = useCallback(
    async (params: { message: string; recipient: string; nonce: string }): Promise<SignedAuthResult> => {
      let wallet = activeWallet;
      if (!wallet && connector) {
        try {
          const connected = await connector.getConnectedWallet();
          wallet = connected.wallet;
        } catch {}
      }

      if (!wallet) {
        throw new Error("No active NEAR wallet connected. Please connect your wallet first.");
      }

      if (typeof (wallet as any).signMessage !== "function") {
        throw new Error(`The connected wallet (${walletName || "Wallet"}) does not support message signing (NEP-413).`);
      }

      const nonceBytes = Buffer.from(params.nonce, "hex");
      const signed = await (wallet as any).signMessage({
        message: params.message,
        recipient: params.recipient,
        nonce: nonceBytes,
      });

      if (!signed || !signed.signature) {
        throw new Error("Wallet signature was rejected or aborted by user.");
      }

      let sigStr = "";
      if (typeof signed.signature === "string") {
        sigStr = signed.signature;
      } else if (Buffer.isBuffer(signed.signature) || signed.signature instanceof Uint8Array) {
        sigStr = Buffer.from(signed.signature).toString("base64");
      } else if (signed.signature && typeof signed.signature === "object") {
        sigStr = Buffer.from(Object.values(signed.signature) as number[]).toString("base64");
      }

      let pubKeyStr = "";
      if (typeof signed.publicKey === "string") {
        pubKeyStr = signed.publicKey;
      } else if (signed.publicKey && typeof (signed.publicKey as any).toString === "function") {
        pubKeyStr = (signed.publicKey as any).toString();
      } else if (signed.publicKey) {
        pubKeyStr = String(signed.publicKey);
      }

      return {
        accountId: signed.accountId || accountId || "",
        publicKey: pubKeyStr,
        signature: sigStr,
      };
    },
    [connector, activeWallet, walletName, accountId]
  );

  return (
    <NearWalletSelectorContext.Provider
      value={{
        connector,
        accounts,
        accountId,
        activeWallet,
        walletName,
        isInitialized,
        openWalletModal,
        signOut,
        signAndSendTransfer,
        signAuthChallenge,
      }}
    >
      {children}
    </NearWalletSelectorContext.Provider>
  );
}

export function useNearWalletSelector() {
  const ctx = useContext(NearWalletSelectorContext);
  if (!ctx) {
    throw new Error(
      "useNearWalletSelector must be used within a NearWalletSelectorProvider"
    );
  }
  return ctx;
}
