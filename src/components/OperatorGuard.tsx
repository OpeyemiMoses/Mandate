"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { useMandate } from "@/context/MandateContext";

interface OperatorGuardProps {
  children: React.ReactNode;
}

export function OperatorGuard({ children }: OperatorGuardProps) {
  const { userProfile, isLoading } = useMandate();

  const isAdmin =
    userProfile?.role === "OWNER" ||
    userProfile?.role === "ADMIN" ||
    userProfile?.role === "SECURITY_ADMIN";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#FF3B30] border-t-transparent animate-spin" />
          <span className="text-xs text-[#A1A1AA]">Verifying operator authorization...</span>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-2xl bg-[#121215] border border-[#FF3B30]/30 text-center space-y-5 shadow-[0_0_50px_rgba(255,59,48,0.15)]">
          <div className="w-14 h-14 rounded-2xl bg-[#FF3B30]/15 border border-[#FF3B30]/35 text-[#FF3B30] flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Access Restricted: Operator Console
            </h2>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              This area is strictly restricted to platform operators and security administrators (<code className="text-zinc-300">ADMIN</code>, <code className="text-zinc-300">SECURITY_ADMIN</code>, <code className="text-zinc-300">OWNER</code>). Member accounts only have access to customer workspace tools.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Workspace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

