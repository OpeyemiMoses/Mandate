"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Play,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  HelpCircle,
  Cpu,
} from "lucide-react";
import { nearToYocto } from "@/lib/yocto";

export default function PolicySimulatorPage() {
  const [operation, setOperation] = useState("execute_payment");
  const [toolId, setToolId] = useState("transfer_funds");
  const [recipient, setRecipient] = useState("vendor-hardware.testnet");
  const [amountNear, setAmountNear] = useState("0.25");
  const [agentType, setAgentType] = useState("research_procurement");

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setReport(null);

    try {
      const amountYocto = amountNear ? nearToYocto(amountNear) : "0";
      const res = await fetch("/api/governance/policies/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          toolId,
          recipient,
          amountYocto,
          agentType,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setReport(data.report);
      } else {
        alert(`Simulation error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Top Breadcrumb */}
      <div className="flex items-center gap-4 border-b border-[#232329] pb-5">
        <Link
          href="/governance"
          className="p-2 rounded-lg bg-[#141417] border border-[#232329] text-[#A1A1AA] hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-400" />
            Governance Policy Simulator
          </h1>
          <p className="text-xs text-[#A1A1AA]">
            Non-executing test environment. Validates operations against active policies with 0 side effects.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Col: Simulation Form */}
        <div className="p-6 rounded-2xl bg-[#141417] border border-[#232329] space-y-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <Cpu className="w-4 h-4 text-red-500" />
            Hypothetical Operation Parameters
          </h2>

          <form onSubmit={handleSimulate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Operation Name
              </label>
              <input
                type="text"
                value={operation}
                onChange={(e) => setOperation(e.target.value)}
                placeholder="e.g. execute_payment"
                className="w-full bg-[#0B0B0B] border border-[#232329] rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Tool ID
              </label>
              <input
                type="text"
                value={toolId}
                onChange={(e) => setToolId(e.target.value)}
                placeholder="e.g. transfer_funds"
                className="w-full bg-[#0B0B0B] border border-[#232329] rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Proposed Recipient (NEAR Account)
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="e.g. vendor-hardware.testnet"
                className="w-full bg-[#0B0B0B] border border-[#232329] rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Amount (NEAR)
              </label>
              <input
                type="number"
                step="0.001"
                value={amountNear}
                onChange={(e) => setAmountNear(e.target.value)}
                placeholder="0.25"
                className="w-full bg-[#0B0B0B] border border-[#232329] rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Agent Type
              </label>
              <select
                value={agentType}
                onChange={(e) => setAgentType(e.target.value)}
                className="w-full bg-[#0B0B0B] border border-[#232329] rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              >
                <option value="research_procurement">research_procurement (Procurement)</option>
                <option value="finance_treasury">finance_treasury (Treasury)</option>
                <option value="operations_execution">operations_execution (Operations)</option>
                <option value="security_auditor">security_auditor (Security Auditor)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-950/40 disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              {loading ? "Simulating Policy Engine..." : "Run Non-Executing Simulation"}
            </button>
          </form>
        </div>

        {/* Right Col: Simulation Output */}
        <div className="p-6 rounded-2xl bg-[#141417] border border-[#232329] space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center justify-between">
            <span>Simulation Result</span>
            {report && (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                0 SIDE EFFECTS
              </span>
            )}
          </h2>

          {!report ? (
            <div className="p-12 text-center text-[#71717A] space-y-3">
              <Shield className="w-10 h-10 mx-auto text-[#3F3F46]" />
              <p className="text-xs">
                Configure operation parameters and click &ldquo;Run Non-Executing Simulation&rdquo; to test authorization.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Verdict Header */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  report.decision === "ALLOW"
                    ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400"
                    : report.decision === "REQUIRE_APPROVAL"
                    ? "bg-amber-950/30 border-amber-500/30 text-amber-400"
                    : "bg-red-950/30 border-red-500/30 text-red-400"
                }`}
              >
                <div>
                  <div className="text-lg font-bold flex items-center gap-2">
                    {report.decision === "ALLOW" ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : report.decision === "REQUIRE_APPROVAL" ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                    {report.decision}
                  </div>
                  <p className="text-xs text-white/80 mt-1">{report.explanation}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold tracking-wider">Risk Level</div>
                  <div className="text-xs font-mono font-bold">{report.riskLevel}</div>
                </div>
              </div>

              {/* Matched Rules Breakdown */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-white">Evaluated Rules</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {report.matchedRules?.map((r: any, i: number) => (
                    <div
                      key={i}
                      className="p-2.5 rounded bg-[#0F0F12] border border-[#1E1E24] text-xs flex items-center justify-between"
                    >
                      <span className="text-[#A1A1AA] font-mono text-[11px]">{r.ruleType}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          r.passed
                            ? "text-emerald-400 bg-emerald-950/40"
                            : "text-red-400 bg-red-950/40"
                        }`}
                      >
                        {r.passed ? "PASSED" : r.action || "DENIED"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Required Approvals if any */}
              {report.approvalRequirements?.required && (
                <div className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-amber-300 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Approval Triggered
                  </div>
                  <p className="text-[11px] text-amber-200/80">
                    {report.approvalRequirements.reason || "Action exceeds autonomous execution threshold."}
                  </p>
                  <p className="text-[10px] font-mono text-[#A1A1AA] pt-1">
                    Action Hash: {report.approvalRequirements.actionPayloadHash?.slice(0, 20)}...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

