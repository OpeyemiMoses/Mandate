"use client";

import React, { useState, useEffect } from "react";
import { ModalPortal } from "./ModalPortal";
import {
  X,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Copy,
  Check,
  RefreshCw,
  Zap,
  Lock,
} from "lucide-react";
import { MandateLogo, MandateMark } from "./MandateLogo";
import { useMandate } from "@/context/MandateContext";
import { useNearWalletSelector } from "@/context/NearWalletSelectorContext";
import { KeyPair } from "near-api-js";

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type WalletOptionId =
  | "intear"
  | "mynearwallet"
  | "meteor"
  | "here"
  | "sender"
  | "instant_faucet"
  | "custom";

interface WalletOption {
  id: WalletOptionId;
  name: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  iconBg: string;
  icon: React.ReactNode;
  isDetected?: boolean;
}

export function ConnectWalletModal({ isOpen, onClose }: ConnectWalletModalProps) {
  const {
    accountId,
    userNearBalance,
    walletProvider,
    connectWallet,
    disconnectWallet,
    refreshData,
  } = useMandate();
  const { openWalletModal } = useNearWalletSelector();

  const [selectedWallet, setSelectedWallet] = useState<WalletOptionId | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasInjectedNear, setHasInjectedNear] = useState(false);
  const [hasMeteor, setHasMeteor] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setHasInjectedNear(Boolean((window as any).near || (window as any).sender));
      setHasMeteor(Boolean((window as any).meteorWallet));
    }
  }, [isOpen]);

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

  if (!isOpen || !mounted) return null;

  const handleCopy = () => {
    if (accountId) {
      navigator.clipboard.writeText(accountId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConnectProvider = async (provider: WalletOption) => {
    setError(null);
    setConnectingWallet(provider.name);

    try {
      if (provider.id === "instant_faucet") {
        // Generate real NEAR testnet account via helper faucet on the fly
        const randomSuffix = Math.floor(100000 + Math.random() * 900000);
        const newAccountId = `mandate-user-${randomSuffix}.testnet`;
        const keyPair = KeyPair.fromRandom("ed25519");

        const faucetRes = await fetch("https://helper.testnet.near.org/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newAccountId,
            newAccountPublicKey: keyPair.getPublicKey().toString(),
          }),
        });

        if (!faucetRes.ok) {
          throw new Error("NEAR testnet faucet rate limited or unavailable. Try connecting existing account.");
        }

        // Store session keypair in localStorage so transactions can be signed
        try {
          localStorage.setItem(`near_key_${newAccountId}`, keyPair.toString());
        } catch {}

        const res = await connectWallet(newAccountId, "Instant Testnet Faucet");
        if (res.ok) {
          setTimeout(() => {
            setConnectingWallet(null);
            onClose();
          }, 800);
        } else {
          setError(res.error || "Failed to initialize wallet session");
          setConnectingWallet(null);
        }
        return;
      }

      // For native NEAR wallet options (Intear, MyNearWallet, Meteor, HERE, Sender, Ledger):
      // Delegate directly to the official NEAR Connector modal
      if (
        provider.id === "intear" ||
        provider.id === "mynearwallet" ||
        provider.id === "meteor" ||
        provider.id === "here" ||
        provider.id === "sender"
      ) {
        onClose();
        openWalletModal();
        return;
      }

      if (provider.id === "custom") {
        setShowCustomInput(true);
        setConnectingWallet(null);
        return;
      }

      // Default web wallet flow
      setShowCustomInput(true);
      setSelectedWallet(provider.id);
      setConnectingWallet(null);
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet");
      setConnectingWallet(null);
    }
  };

  const handleCustomSubmit = async () => {
    const acct = customInput.trim().toLowerCase();
    if (!acct) {
      setError("Please enter your NEAR testnet account ID (e.g. alice.testnet)");
      return;
    }

    setError(null);
    setConnectingWallet("Verifying Account...");

    try {
      const providerName =
        selectedWallet === "mynearwallet"
          ? "MyNearWallet"
          : selectedWallet === "meteor"
          ? "Meteor Wallet"
          : selectedWallet === "here"
          ? "HERE Wallet"
          : selectedWallet === "sender"
          ? "Sender Wallet"
          : "NEAR Web Wallet";

      const res = await connectWallet(acct, providerName);
      if (res.ok) {
        setConnectingWallet(null);
        setShowCustomInput(false);
        setCustomInput("");
        onClose();
      } else {
        setError(res.error || "Account could not be verified on NEAR testnet");
        setConnectingWallet(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet");
      setConnectingWallet(null);
    }
  };

  const WALLET_OPTIONS: WalletOption[] = [
    {
      id: "intear",
      name: "Intear Wallet",
      subtitle: "Web & Multi-chain NEAR Wallet (intea.rs)",
      badge: "Supported",
      badgeColor: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      iconBg: "bg-[#0B1E2E] border-sky-500/30",
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-sky-400 fill-none stroke-current" strokeWidth="2">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      ),
    },
    {
      id: "mynearwallet",
      name: "MyNearWallet",
      subtitle: "Official Web & Mobile NEAR Wallet",
      badge: "Popular",
      badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      iconBg: "bg-[#04281E] border-emerald-500/30",
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-emerald-400 fill-current">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      ),
    },
    {
      id: "meteor",
      name: "Meteor Wallet",
      subtitle: "DeFi & Browser Extension for NEAR",
      badge: hasMeteor ? "Detected" : "Extension",
      badgeColor: hasMeteor
        ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
        : "bg-white/10 text-zinc-400 border-white/10",
      iconBg: "bg-[#1E112A] border-purple-500/30",
      isDetected: hasMeteor,
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-purple-400 fill-current">
          <circle cx="12" cy="12" r="10" />
          <path d="M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83m13.79-4l-5.74 9.94" stroke="#FFF" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      id: "here",
      name: "HERE Wallet",
      subtitle: "Self-Custody Mobile App & Web",
      badge: "Mobile",
      badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      iconBg: "bg-[#2A1B0E] border-amber-500/30",
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-400 fill-current">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <path d="M8 8h8v8H8z" fill="#0B0B0B" />
        </svg>
      ),
    },
    {
      id: "sender",
      name: "Sender Wallet",
      subtitle: "Fast Browser Extension & Mobile",
      badge: hasInjectedNear ? "Detected" : "Extension",
      badgeColor: hasInjectedNear
        ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
        : "bg-white/10 text-zinc-400 border-white/10",
      iconBg: "bg-[#0E1B2A] border-blue-500/30",
      isDetected: hasInjectedNear,
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-400 fill-current">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
    },
    {
      id: "instant_faucet",
      name: "Instant Testnet Wallet",
      subtitle: "Auto-generate & fund fresh account via faucet",
      badge: "1-Click Setup",
      badgeColor: "bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/30",
      iconBg: "bg-[#280C0B] border-[#FF3B30]/40",
      icon: <Zap className="w-5 h-5 text-[#FF3B30]" />,
    },
    {
      id: "custom",
      name: "Connect Custom Account",
      subtitle: "Input existing NEAR testnet account ID",
      badge: "Direct RPC",
      badgeColor: "bg-white/10 text-zinc-300 border-white/15",
      iconBg: "bg-[#16161B] border-white/15",
      icon: <Wallet className="w-5 h-5 text-zinc-300" />,
    },
  ];

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-5">
        {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-red-50 dark:bg-[#1A1416] border border-red-200 dark:border-[#FF3B30]/30 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-[#FF3B30]" />
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Connect Wallet
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                  NEAR Testnet
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA]">
                Connect your personal NEAR custody wallet to authorize spending mandates.
              </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Currently Connected Banner (if active) */}
        {accountId && (
          <div className="p-4 rounded-xl bg-[#141419] border border-emerald-500/25 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Wallet ({walletProvider || "Connected"})
              </span>
              <a
                href={`https://testnet.nearblocks.io/address/${accountId}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[#A1A1AA] hover:text-white inline-flex items-center gap-1 transition-colors"
              >
                Explorer
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-sm font-bold text-white truncate">
                  {accountId}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Copy address"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] font-mono text-[#A1A1AA] block">
                  Verified Balance
                </span>
                <span className="font-mono text-sm font-bold text-emerald-400">
                  {userNearBalance} NEAR
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
              <button
                type="button"
                onClick={() => {
                  disconnectWallet();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* Custom Input View */}
        {showCustomInput ? (
          <div className="space-y-4 p-4 rounded-xl bg-[#141419] border border-[#2A2A34] animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                Enter NEAR Testnet Account
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowCustomInput(false);
                  setError(null);
                }}
                className="text-xs text-[#A1A1AA] hover:text-white"
              >
                ← Back to Wallets
              </button>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomSubmit();
                }}
                placeholder="e.g. alice.testnet or mandate-owner.testnet"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0E] border border-[#2A2A34] focus:border-[#FF3B30] focus:ring-1 focus:ring-[#FF3B30] text-sm text-white placeholder-zinc-500 font-mono outline-none transition-all"
                autoFocus
              />
              <p className="text-[11px] text-zinc-400">
                Live on-chain balance is verified directly through NEAR RPC upon connection.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCustomInput(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCustomSubmit}
                disabled={Boolean(connectingWallet) || !customInput.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_18px_rgba(255,59,48,0.35)] disabled:opacity-50"
              >
                {connectingWallet ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect Account
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* RainbowKit Wallet Options Grid */
          <div className="space-y-2">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-[#A1A1AA] block px-1">
              Select Wallet
            </span>

            {/* Quick Launch Official NEAR Connector Modal */}
            <button
              type="button"
              onClick={() => {
                onClose();
                openWalletModal();
              }}
              className="w-full p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-[#181820] to-emerald-500/5 border border-emerald-500/30 hover:border-emerald-500/60 transition-all flex items-center justify-between group mb-2"
            >
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                  N
                </span>
                <div className="text-left">
                  <div className="text-xs font-semibold text-white group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                    Launch Official NEAR Connector
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">SDK</span>
                  </div>
                  <div className="text-[11px] text-[#A1A1AA]">
                    Intear, Meteor, Ledger, Nightly, NEAR CLI
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <div className="space-y-1.5">
              {WALLET_OPTIONS.map((wallet) => (
                <button
                  key={wallet.id}
                  type="button"
                  onClick={() => handleConnectProvider(wallet)}
                  disabled={Boolean(connectingWallet)}
                  className="w-full p-3 rounded-xl bg-[#141419] hover:bg-[#1C1C24] border border-[#23232C] hover:border-[#FF3B30]/40 transition-all flex items-center justify-between group text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl ${wallet.iconBg} border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                    >
                      {wallet.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white group-hover:text-white transition-colors flex items-center gap-2">
                        <span>{wallet.name}</span>
                        {wallet.badge && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${wallet.badgeColor}`}
                          >
                            {wallet.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#A1A1AA]">
                        {wallet.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="text-zinc-500 group-hover:text-white transition-colors">
                    {connectingWallet === wallet.name ? (
                      <Loader2 className="w-4 h-4 text-[#FF3B30] animate-spin" />
                    ) : (
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/25 text-xs text-[#FF3B30]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Security invariant footer */}
        <div className="pt-2 border-t border-slate-200 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-[#A1A1AA]">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#FF3B30]" />
            <span>Non-custodial personal authorization</span>
          </div>
          <span className="font-mono text-slate-400 dark:text-zinc-500">rpc.testnet.near.org</span>
        </div>
      </div>
    </ModalPortal>
  );
}
