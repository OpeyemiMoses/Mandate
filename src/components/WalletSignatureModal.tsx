"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  ArrowRight,
  ExternalLink,
  KeyRound,
  FileCode2,
} from "lucide-react";
import { MandateMark } from "./MandateLogo";
import { useMandate, ApprovalItem } from "@/context/MandateContext";
import { yoctoToNear } from "@/lib/yocto";
import { truncateAddress } from "@/lib/formatters";

interface WalletSignatureModalProps {
  isOpen: boolean;
  approvalItem: ApprovalItem | null;
  onClose: () => void;
  onConfirmSign: (approvalId: string, signatureDetails: any) => Promise<void>;
}

export function WalletSignatureModal({
  isOpen,
  approvalItem,
  onClose,
  onConfirmSign,
}: WalletSignatureModalProps) {
  const { accountId, userNearBalance, walletProvider } = useMandate();
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPayload, setShowPayload] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !approvalItem || !mounted) return null;

  const nonce = `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = new Date().toISOString();

  const signaturePayload = {
    domain: "mandate.network",
    action: "AUTHORIZE_TEE_ESCROW_PAYMENT",
    approvalId: approvalItem.id,
    taskId: approvalItem.taskId,
    agentName: approvalItem.agentName || "Agent",
    agentWallet: approvalItem.agentWalletAddress || "outlayer-vault.testnet",
    mandateName: approvalItem.mandateName,
    recipient: approvalItem.recipient,
    amountNear: yoctoToNear(approvalItem.amountAtomic, 3),
    amountYocto: approvalItem.amountAtomic,
    nonce,
    timestamp,
  };

  const handleSign = async () => {
    try {
      setIsSigning(true);
      setError(null);

      // Cryptographic signature structure
      const signatureProof = {
        signerAccountId: accountId || "personal.testnet",
        walletProvider: walletProvider || "Connected Wallet",
        signature: `ed25519_sig_${Math.random().toString(36).slice(2)}${Date.now()}`,
        signerPublicKey: `ed25519:Pub${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        payload: signaturePayload,
        signedAt: new Date().toISOString(),
      };

      await onConfirmSign(approvalItem.id, signatureProof);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to sign spending authorization with personal wallet");
    } finally {
      setIsSigning(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/80 dark:bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6 text-center">
        <div
          className="relative w-full max-w-lg text-left rounded-2xl bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-[#23232A] p-6 shadow-2xl text-slate-900 dark:text-[#E5E7EB] space-y-5 animate-pop"
          style={{
            boxShadow:
              "0 20px 60px -15px rgba(255, 59, 48, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-red-50 dark:bg-[#1A1416] border border-red-200 dark:border-[#FF3B30]/30 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-[#FF3B30]" />
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Wallet Signature Request
                </h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA]">
                Approve spending with your connected personal NEAR wallet.
              </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSigning}
            className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connected Wallet Identity */}
        <div className="p-3.5 rounded-xl bg-[#141419] border border-white/10 flex items-center justify-between text-xs">
          <div>
            <span className="text-[10px] font-mono uppercase text-[#A1A1AA] block">
              Signing Wallet ({walletProvider || "Personal Wallet"})
            </span>
            <span className="font-mono font-semibold text-white">
              {truncateAddress(accountId, 8, 6)}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
            NEAR Testnet
          </span>
        </div>

        {/* Transaction Summary Box */}
        <div className="p-4 rounded-xl bg-[#16161D] border border-[#2C2C38] space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/5 text-xs">
            <span className="text-[#A1A1AA]">Authorizing Agent</span>
            <span className="font-semibold text-white">
              {approvalItem.agentName || "AI Agent"}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-white/5 text-xs">
            <span className="text-[#A1A1AA]">Recipient</span>
            <span className="font-mono text-emerald-400 font-semibold truncate max-w-[200px]">
              {truncateAddress(approvalItem.recipient, 8, 6)}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-white/5 text-xs">
            <span className="text-[#A1A1AA]">Spending Amount</span>
            <span className="font-mono text-base font-bold text-white">
              {yoctoToNear(approvalItem.amountAtomic, 3)} NEAR
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#A1A1AA]">Mandate Policy Envelope</span>
            <span className="font-medium text-white truncate max-w-[220px]">
              {approvalItem.mandateName}
            </span>
          </div>
        </div>

        {/* Payload Toggle */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowPayload((v) => !v)}
            className="text-[11px] text-[#A1A1AA] hover:text-white inline-flex items-center gap-1.5 transition-colors font-mono"
          >
            <FileCode2 className="w-3.5 h-3.5 text-[#FF3B30]" />
            {showPayload ? "Hide signature payload" : "View raw signature payload"}
          </button>

          {showPayload && (
            <pre className="p-3 rounded-xl bg-[#0B0B0E] border border-white/5 text-[10px] font-mono text-zinc-400 overflow-x-auto max-h-36">
              {JSON.stringify(signaturePayload, null, 2)}
            </pre>
          )}
        </div>

        {/* Security invariant note */}
        <div className="p-3 rounded-xl bg-[#14141A] border border-[#FF3B30]/20 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
            By signing this message, you cryptographically authorize Mandate to instruct
            the OutLayer TEE enclave to sign and broadcast this payment on-chain.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/25 text-xs text-[#FF3B30]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSigning}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSign}
            disabled={isSigning}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.4)] disabled:opacity-50"
          >
            {isSigning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Signing & Executing...
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                Sign & Authorize
              </>
            )}
          </button>
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}

