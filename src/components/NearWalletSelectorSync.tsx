"use client";

import { useEffect, useRef } from "react";
import { useNearWalletSelector } from "@/context/NearWalletSelectorContext";
import { useMandate } from "@/context/MandateContext";

/**
 * NearWalletSelectorSync
 * 1. Synchronizes connected NEAR Connector account state with MandateContext.
 * 2. Honors mandate_explicitly_disconnected to prevent auto-reconnection loops.
 * 3. Triggers NEAR Connector modal when isWalletModalOpen is set.
 * 4. Inspects window URL for return redirects (transactionHashes).
 */
export function NearWalletSelectorSync() {
  const {
    accountId: nearAccountId,
    walletName,
    openWalletModal,
    isInitialized,
  } = useNearWalletSelector();

  const {
    accountId: mandateAccountId,
    connectWallet,
    isWalletModalOpen,
    setIsWalletModalOpen,
    refreshData,
  } = useMandate();

  const handledTxRef = useRef<string | null>(null);

  // Sync account from NEAR Connector into MandateContext
  useEffect(() => {
    if (!isInitialized) return;

    // Check if the user explicitly clicked Disconnect
    if (
      typeof window !== "undefined" &&
      localStorage.getItem("mandate_explicitly_disconnected") === "true"
    ) {
      return;
    }

    if (nearAccountId && nearAccountId.toLowerCase() !== mandateAccountId?.toLowerCase()) {
      connectWallet(nearAccountId, walletName || "Intear / NEAR Wallet");
    }
  }, [nearAccountId, walletName, mandateAccountId, connectWallet, isInitialized]);

  // Open NEAR Connector modal when requested via context
  useEffect(() => {
    if (isWalletModalOpen && isInitialized) {
      openWalletModal();
      setIsWalletModalOpen(false);
    }
  }, [isWalletModalOpen, isInitialized, openWalletModal, setIsWalletModalOpen]);

  // Detect wallet redirect outcomes (?transactionHashes=...)
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const txHashes = urlParams.get("transactionHashes");
      const errorCode = urlParams.get("errorCode");

      if (errorCode) {
        console.warn("NEAR Wallet returned error code:", errorCode);
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        return;
      }

      if (txHashes && txHashes !== handledTxRef.current) {
        handledTxRef.current = txHashes;
        const primaryTxHash = txHashes.split(",")[0].trim();

        // Check if there was pending funding intent in session storage
        const pendingFundingStr = sessionStorage.getItem("mandate_pending_funding");
        if (pendingFundingStr) {
          try {
            const pending = JSON.parse(pendingFundingStr);
            sessionStorage.removeItem("mandate_pending_funding");

            // Auto-confirm funding with backend
            fetch("/api/wallets/fund", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(mandateAccountId ? { "x-near-account": mandateAccountId } : {}),
              },
              body: JSON.stringify({
                txHash: primaryTxHash,
                amountNear: pending.amountNear || "1.0",
                agentId: pending.agentId,
              }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.success) {
                  refreshData();
                }
              })
              .catch((err) => {
                console.error("Auto-confirming redirected funding failed:", err);
              });
          } catch (e) {
            console.warn("Failed to parse pending funding info:", e);
          }
        }

        // Clean up URL query parameters
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {
      console.warn("Error handling wallet URL callbacks:", e);
    }
  }, [mandateAccountId, refreshData]);

  return null;
}
