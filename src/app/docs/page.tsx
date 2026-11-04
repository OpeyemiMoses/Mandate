import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { DOC_SECTIONS, ALL_DOC_PAGES } from "@/lib/docs/docsNavigation";
import { MandateArchitectureDiagram } from "@/components/docs/DocsDiagrams";
import {
  BookOpen,
  ArrowRight,
  Shield,
  Zap,
  Cpu,
  Lock,
  GitBranch,
  Terminal,
  HelpCircle,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Documentation Centre — Mandate Autonomous Spending & Agent Orchestration",
  description:
    "Comprehensive guides, architecture documentation, REST API references, and security verification for the Mandate platform on NEAR Protocol.",
};

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "getting-started": BookOpen,
  "core-concepts": Sparkles,
  "autonomous-spending": Lock,
  orchestration: GitBranch,
  security: Shield,
  integrations: Cpu,
  developers: Terminal,
  help: HelpCircle,
};

export default function DocsHomePage() {
  const headings = [
    { id: "getting-started-hub", text: "Featured Guides", level: 2 },
    { id: "all-sections", text: "Documentation Directory (36 Guides)", level: 2 },
    { id: "architecture-summary", text: "System Architecture", level: 2 },
  ];

  return (
    <DocsLayout activeSlug="introduction" headings={headings}>
      <div className="space-y-12">
        {/* Hub Hero Banner */}
        <div className="p-8 rounded-2xl bg-white dark:bg-gradient-to-br dark:from-[#1C1215] dark:via-[#121114] dark:to-[#0A0A0C] border border-red-200/80 dark:border-[#FF3B30]/30 shadow-xl dark:shadow-2xl relative overflow-hidden animate-pop">
          <div
            className="pointer-events-none absolute top-0 right-0 w-80 h-80 rounded-full opacity-15 dark:opacity-20 blur-3xl"
            style={{ background: "#FF3B30" }}
          />
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/30 text-xs font-mono font-bold uppercase tracking-wider mb-4">
              Public Documentation Centre
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-950 dark:text-white tracking-tight">
              Mandate Developer &amp; Architecture Reference
            </h1>
            <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-3 leading-relaxed">
              Explore the deterministic spending firewall and policy-enforced custody layer for autonomous AI agents on NEAR Protocol and OutLayer Intel SGX TEE.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <Link
                href="/docs/introduction"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_20px_rgba(255,59,48,0.4)] btn-pop"
              >
                <span>Read Introduction</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/docs/quickstart"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-800 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#161418] dark:hover:bg-[#201D24] border border-slate-200 dark:border-white/10 transition-all btn-pop shadow-sm"
              >
                <span>5-Minute Quickstart</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Featured Guides Row */}
        <section id="getting-started-hub">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#FF3B30]" />
            <span>Featured Guides</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              href="/docs/quickstart"
              className="group p-5 rounded-xl bg-white hover:bg-slate-50 dark:bg-[#121215] dark:hover:bg-[#18181E] border border-slate-200 dark:border-white/[0.06] hover:border-red-300 dark:hover:border-[#FF3B30]/40 transition-all hover-pop shadow-sm animate-pop stagger-1"
            >
              <div className="w-9 h-9 rounded-lg bg-red-50 text-[#FF3B30] dark:bg-[#FF3B30]/15 flex items-center justify-center mb-3">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-[#FF3B30] dark:group-hover:text-white transition-colors">
                Quickstart Guide
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-1 leading-relaxed">
                Connect your NEAR wallet, create an agent, set a mandate budget, and execute your first objective.
              </p>
            </Link>

            <Link
              href="/docs/autonomous-spending"
              className="group p-5 rounded-xl bg-white hover:bg-slate-50 dark:bg-[#121215] dark:hover:bg-[#18181E] border border-slate-200 dark:border-white/[0.06] hover:border-red-300 dark:hover:border-[#FF3B30]/40 transition-all hover-pop shadow-sm animate-pop stagger-2"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 flex items-center justify-center mb-3">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-[#FF3B30] dark:group-hover:text-white transition-colors">
                Autonomous Spending
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-1 leading-relaxed">
                Understand how deterministic policies evaluate yoctoNEAR limits, human thresholds, and TEE execution.
              </p>
            </Link>

            <Link
              href="/docs/api-reference"
              className="group p-5 rounded-xl bg-white hover:bg-slate-50 dark:bg-[#121215] dark:hover:bg-[#18181E] border border-slate-200 dark:border-white/[0.06] hover:border-red-300 dark:hover:border-[#FF3B30]/40 transition-all hover-pop shadow-sm animate-pop stagger-3"
            >
              <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400 flex items-center justify-center mb-3">
                <Terminal className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-[#FF3B30] dark:group-hover:text-white transition-colors">
                REST API Reference
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-1 leading-relaxed">
                Complete endpoint schemas and cURL examples for Agents, Mandates, Tasks, and Approvals.
              </p>
            </Link>
          </div>
        </section>

        {/* Complete 8-Section Documentation Directory */}
        <section id="all-sections">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Documentation Directory</h2>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-0.5">
                Explore all 36 detailed technical documentation pages organized across 8 core domains.
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-[#D4D4D8] border border-slate-200 dark:border-white/10 font-medium">
              36 Articles
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {DOC_SECTIONS.map((section, sIdx) => {
              const Icon = SECTION_ICONS[section.id] || BookOpen;
              const staggerClass = `stagger-${(sIdx % 8) + 1}`;
              return (
                <div
                  key={section.id}
                  className={`p-5 rounded-2xl bg-white dark:bg-[#121216] border border-slate-200 dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-white/10 transition-all shadow-sm hover:shadow-md animate-pop hover-pop space-y-3.5 ${staggerClass}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/25">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                        {section.title}
                      </h3>
                      <p className="text-[11px] text-slate-600 dark:text-[#A1A1AA] line-clamp-1">
                        {section.description}
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                    {section.pages.map((page) => (
                      <li key={page.route}>
                        <Link
                          href={page.route}
                          className="group flex items-center justify-between py-1 text-xs text-slate-700 hover:text-slate-950 dark:text-[#D4D4D8] dark:hover:text-white transition-colors"
                        >
                          <span className="group-hover:translate-x-1 transition-transform truncate font-medium">
                            {page.title}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#FF3B30] dark:text-[#71717A] dark:group-hover:text-[#FF3B30] transition-colors shrink-0 ml-2" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* Architecture Summary */}
        <section id="architecture-summary">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">System Architecture</h2>
          <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mb-4">
            Mandate enforces policy at the software and hardware boundary before any transfer payload is broadcast to NEAR Protocol.
          </p>
          <MandateArchitectureDiagram />
        </section>
      </div>
    </DocsLayout>
  );
}

