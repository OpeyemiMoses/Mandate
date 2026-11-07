"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ArrowUpRight,
  ExternalLink,
  Share2,
  Check,
  ChevronUp,
} from "lucide-react";
import { MandateLogo } from "@/components/MandateLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DocsSearchModal } from "./DocsSearchModal";
import {
  DOC_SECTIONS,
  ALL_DOC_PAGES,
  getDocPageBySlug,
  getPrevNextPages,
  type DocPageMeta,
} from "@/lib/docs/docsNavigation";

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

interface DocsLayoutProps {
  children: React.ReactNode;
  activeSlug?: string;
  headings?: HeadingItem[];
  isOverview?: boolean;
}

export function DocsLayout({
  children,
  activeSlug,
  headings = [],
  isOverview = false,
}: DocsLayoutProps) {
  const pathname = usePathname();
  const effectiveOverview = isOverview || activeSlug === "overview" || pathname === "/docs";
  const effectiveSlug = activeSlug || (effectiveOverview ? "" : "introduction");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    "getting-started": true,
    "core-concepts": true,
    "autonomous-spending": true,
    orchestration: true,
    security: true,
    integrations: true,
    developers: true,
    help: true,
  });
  const [activeHeadingId, setActiveHeadingId] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Active page lookup
  const currentPage = getDocPageBySlug(effectiveSlug) || ALL_DOC_PAGES[0];
  const { prev, next } = getPrevNextPages(currentPage.slug);
  const currentSection = DOC_SECTIONS.find((s) => s.id === currentPage.sectionId);

  // Global keyboard shortcut CMD+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (e.key === "/" && (e.target as HTMLElement)?.tagName !== "INPUT") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Intersection observer for table of contents
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) {
          setActiveHeadingId(visible.target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const copyCurrentPageUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0B0B] text-slate-900 dark:text-[#E5E7EB] flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 dark:border-[#1A1A1E] bg-white/95 dark:bg-[#0B0B0B]/90 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between shadow-sm dark:shadow-none">
        <div className="flex items-center gap-4 sm:gap-6">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-xl text-slate-600 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            aria-label="Open mobile navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link href="/" className="hover:opacity-90 transition-opacity flex items-center gap-2.5">
            <MandateLogo size="sm" />
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/30">
              Docs
            </span>
          </Link>
        </div>

        {/* Global Search Button */}
        <div className="flex-1 max-w-md mx-4 hidden md:block">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#141418] dark:hover:bg-[#1A1A20] border border-slate-200 dark:border-[#232329] text-xs text-slate-600 dark:text-[#A1A1AA] transition-all hover:border-slate-300 dark:hover:border-[#383842] shadow-sm"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#FF3B30]" />
              <span className="font-medium text-slate-600 dark:text-[#A1A1AA]">Search documentation...</span>
            </span>
            <kbd className="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-[10px] font-mono text-slate-600 dark:text-[#71717A]">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="md:hidden p-2 rounded-xl text-[#A1A1AA] hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>

          <ThemeToggle />

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_16px_rgba(255,59,48,0.35)] btn-pop"
          >
            <span>Launch App</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Main Container: 3-column architecture */}
      <div className="flex-1 flex max-w-[1520px] mx-auto w-full">
        {/* Left Sidebar (Desktop) */}
        <aside className="w-72 shrink-0 border-r border-slate-200 dark:border-[#1A1A1E] bg-white dark:bg-[#0B0B0B] hidden md:flex flex-col justify-between p-4 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar">
          <div className="space-y-5">
            <div className="px-2">
              <Link
                href="/docs"
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  pathname === "/docs"
                    ? "bg-red-50/90 text-red-700 border border-red-200 font-bold dark:bg-[#1C1417] dark:border-[#FF3B30]/40 dark:text-white shadow-sm"
                    : "text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-[#E5E7EB] dark:hover:bg-[#141418]"
                }`}
              >
                <BookOpen className="w-4 h-4 text-[#FF3B30]" />
                <span>Documentation Overview</span>
              </Link>
            </div>

            {DOC_SECTIONS.map((section) => {
              const isExpanded = expandedSections[section.id] !== false;
              const hasActivePage = section.pages.some((p) => p.slug === currentPage.slug);

              return (
                <div key={section.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:text-slate-950 dark:text-[#8E8E93] dark:hover:text-white uppercase tracking-wider transition-colors"
                  >
                    <span className="truncate">{section.title}</span>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-0.5 pl-1">
                      {section.pages.map((page) => {
                        const isActive = page.slug === currentPage.slug;
                        return (
                          <Link
                            key={page.route}
                            href={page.route}
                            className={`relative flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              isActive
                                ? "text-red-700 bg-red-50/90 border border-red-200 font-bold shadow-sm dark:text-white dark:bg-[#1C1417] dark:border-[#FF3B30]/40"
                                : "text-slate-600 hover:text-slate-950 hover:bg-slate-100 dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#141417]"
                            }`}
                          >
                            {isActive && (
                              <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-[#FF3B30]" />
                            )}
                            <span className="truncate">{page.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-[#1A1A1E] text-[11px] text-slate-500 dark:text-[#71717A] px-2 flex items-center justify-between">
            <span>Mandate Docs v1.0</span>
            <span className="font-mono text-[10px]">NEAR Testnet</span>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-80 max-w-[85%] bg-[#0E0E12] border-r border-[#22222A] h-full flex flex-col justify-between p-4 overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <MandateLogo size="sm" />
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white hover:bg-white/5"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <Link
                  href="/docs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[#161418] text-white border border-white/10"
                >
                  <BookOpen className="w-4 h-4 text-[#FF3B30]" />
                  <span>Documentation Overview</span>
                </Link>

                {DOC_SECTIONS.map((section) => (
                  <div key={section.id} className="space-y-1">
                    <div className="text-[10px] font-semibold text-[#71717A] uppercase tracking-wider px-2">
                      {section.title}
                    </div>
                    <div className="space-y-0.5">
                      {section.pages.map((page) => {
                        const isActive = page.slug === currentPage.slug;
                        return (
                          <Link
                            key={page.route}
                            href={page.route}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`block px-3 py-1.5 rounded-lg text-xs ${
                              isActive
                                ? "text-white bg-[#FF3B30]/15 font-semibold text-[#FF3B30]"
                                : "text-[#A1A1AA] hover:text-white hover:bg-[#141417]"
                            }`}
                          >
                            {page.title}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Center Main Content Area */}
        <main key={currentPage.slug} className="flex-1 min-w-0 px-6 sm:px-12 py-10 max-w-4xl mx-auto w-full animate-rise">
          {!effectiveOverview && (
            <>
              {/* Breadcrumbs */}
              <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#71717A] mb-6 font-mono">
                <Link href="/docs" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                  Docs
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                {currentSection && (
                  <>
                    <span className="truncate">{currentSection.title.split("—")[1]?.trim() || currentSection.title}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </>
                )}
                <span className="text-slate-900 dark:text-[#E5E7EB] font-bold truncate">{currentPage.title}</span>
              </nav>

              {/* Page Header */}
              <header className="border-b border-slate-200 dark:border-white/[0.08] pb-6 mb-8">
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/10 dark:border-[#FF3B30]/20 font-bold uppercase tracking-wider">
                    {currentSection?.title.split("—")[0].trim() || "Documentation"}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#71717A]">• Last verified November 2026</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-slate-950 dark:text-white tracking-tight">
                  {currentPage.title}
                </h1>
                <p className="text-base text-slate-600 dark:text-[#A1A1AA] mt-3 leading-relaxed font-normal">
                  {currentPage.description}
                </p>
              </header>
            </>
          )}

          {/* Page Body */}
          <div className="docs-content text-sm text-slate-800 dark:text-[#D4D4D8] leading-relaxed space-y-6">
            {children}
          </div>

          {/* Previous / Next Navigation */}
          {!effectiveOverview && (
            <nav className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-16 pt-8 border-t border-slate-200 dark:border-white/[0.08]">
              {prev ? (
                <Link
                  href={prev.route}
                  className="group p-4 rounded-xl bg-white hover:bg-slate-50 dark:bg-[#121215] dark:hover:bg-[#18181D] border border-slate-200 dark:border-white/[0.06] hover:border-red-300 dark:hover:border-[#FF3B30]/30 transition-all hover-pop shadow-sm flex flex-col justify-between"
                >
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#71717A] group-hover:text-[#FF3B30] transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mt-1 group-hover:text-[#FF3B30] dark:group-hover:text-white transition-colors">
                    {prev.title}
                  </div>
                </Link>
              ) : (
                <div />
              )}

              {next ? (
                <Link
                  href={next.route}
                  className="group p-4 rounded-xl bg-white hover:bg-slate-50 dark:bg-[#121215] dark:hover:bg-[#18181D] border border-slate-200 dark:border-white/[0.06] hover:border-red-300 dark:hover:border-[#FF3B30]/30 transition-all hover-pop shadow-sm flex flex-col justify-between text-right sm:text-right"
                >
                  <div className="flex items-center justify-end gap-1.5 text-xs text-slate-500 dark:text-[#71717A] group-hover:text-[#FF3B30] transition-colors">
                    <span>Next</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mt-1 group-hover:text-[#FF3B30] dark:group-hover:text-white transition-colors">
                    {next.title}
                  </div>
                </Link>
              ) : (
                <div />
              )}
            </nav>
          )}
        </main>

        {/* Right Sidebar ("On this page") (Desktop only) */}
        {headings && headings.length > 0 && (
          <aside className="w-64 shrink-0 hidden lg:block sticky top-16 h-[calc(100vh-4rem)] p-6 overflow-y-auto text-xs border-l border-slate-200 dark:border-[#1A1A1E]">
            <div className="space-y-4">
              <div className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center justify-between">
                <span>On this page</span>
              </div>

              <div className="space-y-1.5 border-l border-slate-200 dark:border-white/[0.08] pl-3">
                {headings.map((h) => {
                  const isActive = activeHeadingId === h.id;
                  return (
                    <a
                      key={h.id}
                      href={`#${h.id}`}
                      className={`block py-1 transition-colors leading-snug ${
                        isActive
                          ? "text-[#FF3B30] font-bold -ml-[13px] border-l-2 border-[#FF3B30] pl-2.5"
                          : "text-slate-600 hover:text-slate-950 dark:text-[#A1A1AA] dark:hover:text-white font-medium"
                      } ${h.level === 3 ? "pl-2 text-[11px]" : "text-xs"}`}
                    >
                      {h.text}
                    </a>
                  );
                })}
              </div>

              {/* Utility actions */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/[0.08] space-y-2 text-slate-600 dark:text-[#A1A1AA]">
                <button
                  type="button"
                  onClick={copyCurrentPageUrl}
                  className="w-full flex items-center gap-2 py-1 text-slate-600 hover:text-slate-950 dark:text-[#A1A1AA] dark:hover:text-white transition-colors"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Link copied!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Copy page link</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={scrollToTop}
                  className="w-full flex items-center gap-2 py-1 text-slate-600 hover:text-slate-950 dark:text-[#A1A1AA] dark:hover:text-white transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Back to top</span>
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Global Search Modal */}
      <DocsSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

