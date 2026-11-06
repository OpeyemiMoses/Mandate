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
    signAuthChallenge,
  } = useNearWalletSelector();

  const {
    accountId: mandateAccountId,
    connectWallet,
    isWalletModalOpen,
    setIsWalletModalOpen,
    refreshData,
  } = useMandate();

  const handledTxRef = useRef<string | null>(null);
  const isSigningRef = useRef(false);
  const attemptedAccountRef = useRef<string | null>(null);

  // Reset attempted account if user disconnected or switched account
  useEffect(() => {
    if (!nearAccountId) {
      attemptedAccountRef.current = null;
    } else if (
      attemptedAccountRef.current &&
      attemptedAccountRef.current.toLowerCase() !== nearAccountId.toLowerCase()
    ) {
      attemptedAccountRef.current = null;
    }
  }, [nearAccountId]);

  // Register global signer for MandateContext fallback
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).signNearAuthChallenge = signAuthChallenge;
    }
  }, [signAuthChallenge]);

  // Sync account from NEAR Connector into MandateContext via mandatory cryptographic proof
  useEffect(() => {
    if (!isInitialized) return;

    // Check if the user explicitly clicked Disconnect
    if (
      typeof window !== "undefined" &&
      localStorage.getItem("mandate_explicitly_disconnected") === "true"
    ) {
      return;
    }

    if (
      nearAccountId &&
      nearAccountId.toLowerCase() !== mandateAccountId?.toLowerCase() &&
      attemptedAccountRef.current?.toLowerCase() !== nearAccountId.toLowerCase() &&
      !isSigningRef.current
    ) {
      isSigningRef.current = true;
      (async () => {
        try {
          const chRes = await fetch(`/api/auth?action=challenge&accountId=${encodeURIComponent(nearAccountId)}`);
          const chData = await chRes.json();
          if (!chRes.ok || !chData.success || !chData.challenge) {
            console.warn("Authentication challenge request unsuccessful:", chData?.error || chRes.statusText);
            attemptedAccountRef.current = nearAccountId;
            return;
          }

          const signed = await signAuthChallenge({
            message: chData.challenge.message,
            recipient: "mandate.app",
            nonce: chData.challenge.nonce,
          });

          const connRes = await connectWallet(nearAccountId, walletName || "NEAR Wallet", {
            publicKey: signed.publicKey,
            signature: signed.signature,
            message: chData.challenge.message,
            nonce: chData.challenge.nonce,
          });

          if (!connRes.ok) {
            console.warn("Wallet authentication session issuance failed:", connRes.error);
            attemptedAccountRef.current = nearAccountId;
          } else {
            attemptedAccountRef.current = null;
          }
        } catch (err: any) {
          console.warn("Wallet authentication signing rejected or cancelled:", err?.message || err);
          attemptedAccountRef.current = nearAccountId;
        } finally {
          isSigningRef.current = false;
        }
      })();
    }
  }, [nearAccountId, walletName, mandateAccountId, connectWallet, isInitialized, signAuthChallenge]);

  // Open NEAR Connector modal when requested via context
  useEffect(() => {
    if (isWalletModalOpen && isInitialized) {
      attemptedAccountRef.current = null;
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
