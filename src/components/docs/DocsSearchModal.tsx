"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Search, X, ArrowRight, FileText, CornerDownLeft } from "lucide-react";
import { ALL_DOC_PAGES, DOC_SECTIONS, type DocPageMeta } from "@/lib/docs/docsNavigation";

interface DocsSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocsSearchModal({ isOpen, onClose }: DocsSearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard shortcut listener for escape and arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredResults.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % Math.max(1, filteredResults.length));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return ALL_DOC_PAGES.slice(0, 7); // Default popular recommendations
    }

    return ALL_DOC_PAGES.filter((page) => {
      const titleMatch = page.title.toLowerCase().includes(q);
      const descMatch = page.description.toLowerCase().includes(q);
      const keywordMatch = page.keywords.some((k) => k.toLowerCase().includes(q));
      const slugMatch = page.slug.toLowerCase().includes(q);
      return titleMatch || descMatch || keywordMatch || slugMatch;
    }).slice(0, 10);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-[#232329] shadow-2xl overflow-hidden animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#141418]">
          <Search className="w-5 h-5 text-[#FF3B30] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search documentation (e.g. Mandate, OutLayer, Budget, API, TEE)..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#71717A] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:text-[#71717A] dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-slate-500 dark:text-[#71717A] bg-slate-200/70 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded">
            ESC to close
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-white/[0.04]">
          {filteredResults.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-[#71717A]">
              No documentation pages found matching &ldquo;<span className="text-slate-900 dark:text-white font-bold">{query}</span>&rdquo;.
              <div className="mt-2 text-[11px] text-slate-600 dark:text-[#A1A1AA]">
                Try searching for <strong>mandates</strong>, <strong>spending</strong>, <strong>outlayer</strong>, or <strong>api</strong>.
              </div>
            </div>
          ) : (
            filteredResults.map((page, idx) => {
              const section = DOC_SECTIONS.find((s) => s.id === page.sectionId);
              const isSelected = idx === selectedIndex;

              return (
                <Link
                  key={page.route}
                  href={page.route}
                  onClick={onClose}
                  className={`flex items-start gap-3 p-3 rounded-xl transition-all ${
                    isSelected
                      ? "bg-red-50 text-slate-900 border border-red-200 dark:bg-[#1E1B20] dark:text-white dark:border-[#FF3B30]/30 shadow-sm"
                      : "text-slate-700 hover:bg-slate-100 dark:text-[#D4D4D8] dark:hover:bg-white/5"
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${isSelected ? "bg-red-100 text-[#FF3B30] dark:bg-[#FF3B30]/20" : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-[#A1A1AA]"}`}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {page.title}
                      </span>
                      {section && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/5 font-semibold">
                          {section.title.split("—")[0].trim()}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-[#A1A1AA] line-clamp-1 mt-0.5">
                      {page.description}
                    </p>
                  </div>
                  {isSelected && (
                    <CornerDownLeft className="w-3.5 h-3.5 text-[#FF3B30] shrink-0 mt-2" />
                  )}
                </Link>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-[#0E0E11] border-t border-slate-200 dark:border-white/[0.06] text-[11px] text-slate-500 dark:text-[#71717A]">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/5 border border-slate-300 dark:border-white/10 font-mono text-[10px] text-slate-600 dark:text-[#A1A1AA]">↑</kbd>{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/5 border border-slate-300 dark:border-white/10 font-mono text-[10px] text-slate-600 dark:text-[#A1A1AA]">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/5 border border-slate-300 dark:border-white/10 font-mono text-[10px] text-slate-600 dark:text-[#A1A1AA]">↵</kbd> Select
            </span>
          </div>
          <span>36 comprehensive pages indexed</span>
        </div>
      </div>
    </div>
  );
}

