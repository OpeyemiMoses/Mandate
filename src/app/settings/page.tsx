"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  RotateCcw,
  Lock,
  ExternalLink,
  Wallet,
  User,
  Mail,
  Briefcase,
  Check,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { MandateMark } from "@/components/MandateLogo";
import { useMandate } from "@/context/MandateContext";
import { truncateAddress } from "@/lib/formatters";

export default function SettingsPage() {
  const {
    accountId,
    userNearBalance,
    walletProvider,
    userProfile,
    updateUserProfile,
    walletAddress,
    twoFactorEnabled,
    emailNotifications,
    toggleTwoFactor,
    toggleEmailNotifications,
    setIsWalletModalOpen,
    disconnectWallet,
  } = useMandate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || "");
      setEmail(userProfile.email || "");
      setBio(userProfile.bio || "");
    } else if (accountId) {
      if ((accountId.endsWith(".testnet") || accountId.endsWith(".near")) && accountId.length < 24) {
        setDisplayName(accountId.split(".")[0]);
      } else {
        setDisplayName("");
      }
    }
  }, [userProfile, accountId]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);

    const ok = await updateUserProfile({
      displayName: displayName.trim(),
      email: email.trim(),
      bio: bio.trim(),
    });

    setIsSaving(false);
    if (ok) {
      setSaveMessage("Profile saved! Your identity is associated with this wallet.");
      setTimeout(() => setSaveMessage(null), 3000);
    } else {
      setSaveMessage("Failed to update profile. Please try again.");
    }
  };

  return (
    <AppShell>
      <div className="space-y-8 max-w-3xl relative">
        <div className="animate-rise">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Settings &amp; Account Identity
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-1">
            Associate your profile with your connected personal NEAR wallet.
          </p>
        </div>

        {/* Account Association Profile Section */}
        <GlowingCard
          intensity="strong"
          innerClassName="p-6 space-y-5"
          glowPosition="top-left"
          className="animate-pop hover-pop stagger-1"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-red-50 dark:bg-[#1A1416] border border-red-200 dark:border-[#FF3B30]/30 flex items-center justify-center text-[#FF3B30]">
                <User className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  User Account Association
                </h2>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA]">
                  Identifies who you are when you reconnect this wallet.
                </p>
              </div>
            </div>

            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25">
              Persistent Profile
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#FF3B30]" />
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex Chen, Alice Vance"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#141419] border border-slate-200 dark:border-[#2A2A34] focus:border-[#FF3B30] text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none transition-all font-medium shadow-sm"
                />
                <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                  Used in Dashboard greetings and audit logs.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#FF3B30]" />
                  Alerts Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@enterprise.ai"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#141419] border border-slate-200 dark:border-[#2A2A34] focus:border-[#FF3B30] text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none transition-all shadow-sm"
                />
                <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                  For policy threshold approvals and budget notifications.
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-[#FF3B30]" />
                Role / Organization
              </label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. Lead Treasury Engineer, Autonomous Systems"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#141419] border border-slate-200 dark:border-[#2A2A34] focus:border-[#FF3B30] text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none transition-all shadow-sm"
              />
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs">
                {saveMessage && (
                  <span
                    className={`inline-flex items-center gap-1.5 font-medium ${
                      saveMessage.includes("saved")
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-[#FF3B30]"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {saveMessage}
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_18px_rgba(255,59,48,0.35)] disabled:opacity-50 self-end sm:self-auto btn-pop"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Account Profile
                  </>
                )}
              </button>
            </div>
          </form>
        </GlowingCard>

        {/* Connected Wallet Section */}
        <GlowingCard
          intensity="medium"
          innerClassName="p-6 space-y-4"
          glowPosition="top-right"
          className="animate-pop hover-pop stagger-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Personal NEAR Wallet</h2>
            {accountId && (
              <a
                href={`https://testnet.nearblocks.io/address/${accountId}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white inline-flex items-center gap-1 transition-colors"
              >
                View on Explorer
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-[#181316] border border-red-200 dark:border-[#FF3B30]/35 flex items-center justify-center">
                <MandateMark className="w-5 h-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="font-mono font-bold">{truncateAddress(accountId, 8, 6) || "No Wallet Connected"}</span>
                  {accountId && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25">
                      {userNearBalance} NEAR
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-slate-500 dark:text-[#A1A1AA] mt-0.5">
                  Provider: {walletProvider || "MyNearWallet"} · Network: NEAR Testnet
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-800 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-200 dark:text-white dark:bg-[#1C1C24] dark:hover:bg-[#252530] dark:border-white/10 transition-colors btn-pop"
              >
                {accountId ? "Switch Wallet" : "Connect Wallet"}
              </button>

              {accountId && (
                <button
                  type="button"
                  onClick={disconnectWallet}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#FF3B30] bg-red-50 hover:bg-red-100 border border-red-200 dark:bg-[#FF3B30]/10 dark:hover:bg-[#FF3B30]/20 dark:border-[#FF3B30]/30 transition-colors btn-pop"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </GlowingCard>

        {/* Security Section */}
        <GlowingCard
          intensity="medium"
          innerClassName="p-6 space-y-4"
          glowPosition="top-left"
          className="animate-pop hover-pop stagger-3"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Security &amp; Firewall Rules</h2>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-[#A1A1AA]" />
              <span className="text-sm text-slate-800 dark:text-[#E5E7EB]">
                Two-factor human approval signatures
              </span>
            </div>

            <button
              type="button"
              onClick={toggleTwoFactor}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors btn-pop ${
                twoFactorEnabled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30"
                  : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-[#1A1A20] dark:text-[#A1A1AA] dark:border-[#2A2A34]"
              }`}
            >
              {twoFactorEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/[0.07]">
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-[#FF3B30]" />
              <div>
                <div className="text-sm text-slate-800 dark:text-[#E5E7EB]">
                  Fail-Closed Deterministic Policy Gate
                </div>
                <div className="text-xs text-slate-600 dark:text-[#A1A1AA]">
                  Atomic yoctoNEAR validation &amp; OutLayer TEE verification
                </div>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-mono bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#181316] dark:text-white dark:border-[#FF3B30]/35 font-semibold">
              Locked On
            </span>
          </div>
        </GlowingCard>

        {/* Notifications Section */}
        <GlowingCard
          intensity="subtle"
          innerClassName="p-6 space-y-4"
          glowPosition="none"
          className="animate-pop hover-pop stagger-4"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h2>

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-slate-800 dark:text-[#E5E7EB]">Email spending alerts</span>

            <button
              type="button"
              role="switch"
              aria-checked={emailNotifications}
              onClick={toggleEmailNotifications}
              className={`w-11 h-6 rounded-full transition-colors relative px-0.5 flex items-center btn-pop ${
                emailNotifications ? "bg-[#FF3B30]" : "bg-slate-300 dark:bg-[#24242D]"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                  emailNotifications ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </GlowingCard>

        {/* Session Management & Audit Export */}
        <GlowingCard
          intensity="subtle"
          innerClassName="p-6 space-y-4"
          glowPosition="bottom-right"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Session & Data Management
              </h2>
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                Active session bound to {accountId || "unauthenticated state"}. Role: {userProfile?.role || "MEMBER"}.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/audit");
                    if (res.ok) {
                      const data = await res.json();
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `mandate-audit-log-${Date.now()}.json`;
                      a.click();
                      setExportMessage("Audit trail exported successfully.");
                      setTimeout(() => setExportMessage(null), 3000);
                    }
                  } catch {
                    setExportMessage("Failed to export audit trail.");
                  }
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#141417] hover:bg-[#1C1C22] text-[#E5E7EB] border border-white/10 transition-colors"
              >
                Export Audit Log
              </button>

              <button
                type="button"
                onClick={() => disconnectWallet()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#181316] hover:bg-[#22191D] text-[#FF3B30] border border-[#FF3B30]/35 transition-colors"
              >
                Disconnect Session
              </button>
            </div>
          </div>

          {exportMessage && (
            <p className="text-xs text-emerald-400 font-mono">{exportMessage}</p>
          )}
        </GlowingCard>
      </div>
    </AppShell>
  );
}
