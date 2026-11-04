"use client";

import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet, AlertTriangle, ChevronDown } from "lucide-react";
import { MandateMark } from "./MandateLogo";
import { useMandate } from "@/context/MandateContext";
import { formatAccountOrName, truncateAddress } from "@/lib/formatters";

export function RainbowConnectButton() {
  const { userProfile, userNearBalance, accountId } = useMandate();

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return (
            <div className="h-9 w-32 rounded-xl bg-[#141417] border border-[#232329] animate-pulse" />
          );
        }

        if (!connected) {
          // If we have an active NEAR testnet account logged in via context, show that
          if (accountId) {
            const displayName = formatAccountOrName(accountId, userProfile?.displayName);
            return (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openConnectModal}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#141417] hover:bg-[#19191D] border border-[#232329] hover:border-[#FF3B30]/40 transition-all text-xs font-medium text-[#E5E7EB]"
                >
                  <span className="w-5 h-5 rounded-full bg-[#1F1F24] border border-[#2E2E36] flex items-center justify-center">
                    <MandateMark className="w-3 h-2.5" />
                  </span>
                  <span className="font-mono text-xs font-semibold">{displayName}</span>
                  <span className="text-[#42424E]">·</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {userNearBalance} NEAR
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#A1A1AA]" />
                </button>
              </div>
            );
          }

          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#FF3B30] hover:bg-[#E63228] transition-all text-xs font-semibold text-white shadow-[0_0_16px_rgba(255,59,48,0.35)]"
            >
              <Wallet className="w-3.5 h-3.5" />
              Connect Wallet
            </button>
          );
        }

        // Wrong Network detected -> Prompt switch to NEAR network
        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/50 text-amber-300 hover:bg-amber-500/25 transition-all text-xs font-semibold shadow-[0_0_14px_rgba(245,158,11,0.2)]"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              Wrong Network — Switch to NEAR
            </button>
          );
        }

        // Connected to NEAR network
        const nameToDisplay = formatAccountOrName(account.address, userProfile?.displayName);
        const displayBalance =
          userNearBalance && userNearBalance !== "0.000"
            ? `${userNearBalance} NEAR`
            : account.displayBalance
            ? account.displayBalance
            : "0.000 NEAR";

        return (
          <div className="flex items-center gap-2">
            {/* Network Switcher Button */}
            <button
              type="button"
              onClick={openChainModal}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#141417] hover:bg-[#19191D] border border-[#232329] hover:border-[#FF3B30]/40 transition-all text-xs font-medium text-[#A1A1AA] hover:text-white"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{chain.name}</span>
              <ChevronDown className="w-3 h-3 text-[#71717A]" />
            </button>

            {/* Account Details & Disconnect Trigger */}
            <button
              type="button"
              onClick={openAccountModal}
              className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#141417] hover:bg-[#19191D] border border-[#232329] hover:border-[#FF3B30]/40 transition-all text-xs font-medium text-[#E5E7EB]"
            >
              <span className="w-5 h-5 rounded-full bg-[#1F1F24] border border-[#2E2E36] flex items-center justify-center">
                <MandateMark className="w-3 h-2.5" />
              </span>
              <span className="font-mono text-xs font-semibold text-white">
                {nameToDisplay}
              </span>
              <span className="text-[#42424E]">·</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {displayBalance}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#A1A1AA]" />
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

