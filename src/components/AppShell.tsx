"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Shield,
  CheckSquare,
  CheckCircle2,
  Activity,
  Settings,
  ChevronDown,
  ChevronRight,
  Lock,
  ArrowUpRight,
  Wallet,
  Bot,
  Wrench,
  Target,
  Compass,
  Network,
  Scale,
  Layers,
  BarChart3,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Radio,
  Database,
  Zap,
} from "lucide-react";
import { MandateLogo } from "./MandateLogo";
import { useMandate } from "@/context/MandateContext";
import { NearWalletConnectButton } from "./NearWalletConnectButton";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const CUSTOMER_NAV_SECTIONS: NavSection[] = [
  {
    title: "Platform",
    items: [
      { label: "Overview", href: "/dashboard", icon: Home },
      { label: "Activity", href: "/activity", icon: Activity },
    ],
  },
  {
    title: "Treasury & Agents",
    items: [
      { label: "Agents", href: "/agents", icon: Bot },
      { label: "Wallets", href: "/wallets", icon: Wallet },
      { label: "Mandates", href: "/mandates", icon: Shield },
    ],
  },
  {
    title: "Execution",
    items: [
      { label: "Objectives", href: "/objectives", icon: Target },
      { label: "Tasks", href: "/tasks", icon: CheckSquare },
      { label: "Approvals", href: "/approvals", icon: CheckCircle2 },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Integrations", href: "/integrations", icon: Wrench },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: Home },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Wallets", href: "/wallets", icon: Wallet },
  { label: "Mandates", href: "/mandates", icon: Shield },
  { label: "Approvals", href: "/approvals", icon: CheckCircle2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { approvals } = useMandate();
  const pendingApprovalCount = approvals.filter(
    (a) => a.status === "pending"
  ).length;

  const renderNavLink = (item: NavItem) => {
    const Icon = item.icon;
    const isActive =
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname?.startsWith(item.href));

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
          isActive
            ? "text-red-700 bg-red-50/90 border border-red-200 dark:text-white dark:bg-[#1C1417] dark:border-[#FF3B30]/40 shadow-sm"
            : "text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-[#A1A1AA] dark:hover:text-[#F3F4F6] dark:hover:bg-[#141418]"
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#FF3B30]" />
        )}
        <span className="flex items-center gap-2.5">
          <Icon
            className={`w-4 h-4 ${
              isActive ? "text-[#FF3B30]" : "text-slate-500 dark:text-[#A1A1AA]"
            }`}
          />
          <span className={isActive ? "text-red-700 dark:text-white font-bold" : "text-slate-700 dark:text-[#A1A1AA]"}>
            {item.label}
          </span>
        </span>
        {item.label === "Approvals" && pendingApprovalCount > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-red-100 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/20 dark:border-[#FF3B30]/30">
            {pendingApprovalCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0B0B] text-slate-900 dark:text-[#E5E7EB] flex flex-col">
      {/* Top Navbar */}
      <header className="h-16 border-b border-slate-200 dark:border-[#1A1A1E] bg-white/90 dark:bg-[#0B0B0B]/90 backdrop-blur-md sticky top-0 z-30 px-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <MandateLogo size="md" />
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-[#141417] border border-slate-200 dark:border-[#232329] text-slate-600 dark:text-[#A1A1AA]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            NEAR Testnet · OutLayer TEE
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden md:inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors px-2.5 py-1.5"
          >
            Overview
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>

          {/* Theme toggle in top navbar */}
          <ThemeToggle />

          {/* Native NEAR Wallet Selector Connected Account Pill or Connect Button */}
          <NearWalletConnectButton />
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Left Sidebar structured into customer sections */}
        <aside className="w-60 border-r border-slate-200 dark:border-[#1A1A1E] bg-white dark:bg-[#0B0B0B] hidden md:flex flex-col justify-between p-4 shrink-0">
          <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-14rem)] pr-1 custom-scrollbar">
            {CUSTOMER_NAV_SECTIONS.map((section) => (
              <div key={section.title} className="space-y-1">
                <div className="px-3 pt-1 text-[10px] font-semibold text-slate-400 dark:text-[#71717A] uppercase tracking-wider">
                  {section.title}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => renderNavLink(item))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 mt-4">
            {/* Bottom Security Status Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-[#1E1E24] space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-900 dark:text-[#E5E7EB] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#FF3B30]" />
                  Fail-Closed Guard
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20">
                  ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-700 dark:text-[#A1A1AA] leading-relaxed font-medium">
                AI holds zero keys. All proposals validated in atomic yoctoNEAR.
              </p>
            </div>

            {/* Appearance Mode Toggle in Sidenav */}
            <div className="pt-2 border-t border-slate-200 dark:border-[#1A1A1E] flex items-center justify-between px-1">
              <span className="text-[11px] text-slate-700 dark:text-[#A1A1AA] font-semibold">Appearance</span>
              <ThemeToggle showLabel />
            </div>
          </div>
        </aside>

        {/* Mobile Bottom Navigation with 5 Primary Destinations */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#0B0B0B]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#1F1F24] px-2 py-1.5 flex items-center justify-around">
          {MOBILE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] ${
                  isActive ? "text-[#FF3B30] font-bold" : "text-slate-600 dark:text-[#A1A1AA]"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
                {item.label === "Approvals" && pendingApprovalCount > 0 && (
                  <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-[#FF3B30]" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Main Content Area with Dynamic Keyed Rise-In Entrance for All Pages */}
        <main className="flex-1 min-w-0 p-6 md:p-10 pb-24 md:pb-12 max-w-6xl mx-auto w-full">
          <div key={pathname} className="animate-rise">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
