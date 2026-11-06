"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Wallet,
  ChevronDown,
  Copy,
  Check,
  LogOut,
  ExternalLink,
  ArrowRightLeft,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { MandateMark } from "./MandateLogo";
import { useNearWalletSelector } from "@/context/NearWalletSelectorContext";
import { useMandate } from "@/context/MandateContext";
import { useDisconnect } from "wagmi";
import { formatAccountOrName, truncateAddress } from "@/lib/formatters";

export function NearWalletConnectButton() {
  const {
    accountId: nearAccountId,
    walletName,
    openWalletModal,
    signOut,
  } = useNearWalletSelector();

  const {
    accountId: mandateAccountId,
    userProfile,
    userNearBalance,
    disconnectWallet,
    setIsWalletModalOpen,
  } = useMandate();

  const { disconnect: disconnectWagmi } = useDisconnect();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeAccount = nearAccountId || mandateAccountId;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopy = () => {
    if (activeAccount) {
      navigator.clipboard.writeText(activeAccount);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = async () => {
    setDropdownOpen(false);
    try {
      disconnectWagmi();
    } catch {}
    await signOut();
    disconnectWallet();
  };

  if (!activeAccount) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => openWalletModal()}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#FF3B30] hover:bg-[#E63228] transition-all text-xs font-semibold text-white shadow-[0_0_16px_rgba(255,59,48,0.35)]"
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Connect NEAR Wallet</span>
        </button>
      </div>
    );
  }

  const displayName = formatAccountOrName(activeAccount, userProfile?.displayName);
  const providerLabel = walletName || "NEAR Wallet";

  const isAuthenticated = Boolean(mandateAccountId);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#141417] hover:bg-[#19191D] border transition-all text-xs font-medium text-[#E5E7EB] ${
          isAuthenticated
            ? "border-[#232329] hover:border-[#FF3B30]/40"
            : "border-amber-500/40 hover:border-amber-500/70"
        }`}
      >
        <span className="w-5 h-5 rounded-full bg-[#1F1F24] border border-[#2E2E36] flex items-center justify-center">
          <MandateMark className="w-3 h-2.5" />
        </span>
        <span className="font-mono text-xs font-semibold text-white">
          {displayName}
        </span>
        <span className="text-[#42424E]">·</span>
        {isAuthenticated ? (
          <span className="font-mono text-emerald-400 font-semibold">
            {userNearBalance || "0.000"} NEAR
          </span>
        ) : (
          <span className="text-amber-400 font-semibold text-[11px] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Auth Needed
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-[#A1A1AA]" />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#141417] border border-[#232329] p-3 shadow-2xl z-50 space-y-3">
          {!isAuthenticated && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-2">
              <div className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Wallet Proof Required
              </div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                Your wallet is connected, but a cryptographic proof signature is required to open an authenticated session.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  setIsWalletModalOpen(true);
                }}
                className="w-full py-1.5 px-3 rounded-lg bg-[#FF3B30] hover:bg-[#E63228] text-white text-xs font-semibold transition-all shadow-md shadow-red-500/20"
              >
                Sign In With Wallet
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pb-2 border-b border-[#232329]">
            <div>
              <div className="text-[10px] text-[#A1A1AA] uppercase font-semibold tracking-wider">
                Connected Provider
              </div>
              <div className="text-xs font-medium text-white flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${isAuthenticated ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                {providerLabel}
              </div>
            </div>
            <a
              href={`https://testnet.nearblocks.io/address/${activeAccount}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#A1A1AA] hover:text-white p-1 rounded-lg hover:bg-[#1E1E24] transition-colors"
              title="View on NearBlocks"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-[#A1A1AA] uppercase font-semibold tracking-wider">
              NEAR Testnet Account
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-[#0E0E11] border border-[#1E1E24]">
              <span className="font-mono text-xs text-white truncate max-w-[180px]">
                {activeAccount}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[#A1A1AA] hover:text-white transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                openWalletModal();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#E5E7EB] hover:bg-[#1E1E24] transition-colors text-left"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#FF3B30]" />
              Switch Wallet or Account
            </button>

            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 transition-colors text-left"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

