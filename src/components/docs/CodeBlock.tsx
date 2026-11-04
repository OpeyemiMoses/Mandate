"use client";

import React, { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language = "bash", title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="my-5 rounded-xl overflow-hidden border border-slate-200 dark:border-[#22222A] bg-white dark:bg-[#0E0E11] text-xs font-mono shadow-md">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 dark:bg-[#141418] border-b border-slate-200 dark:border-white/[0.06]">
        <div className="flex items-center gap-2 text-slate-700 dark:text-[#A1A1AA]">
          <Terminal className="w-3.5 h-3.5 text-[#FF3B30]" />
          <span className="text-[11px] font-bold text-slate-900 dark:text-white">{title || language}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-sans font-medium text-slate-700 dark:text-[#A1A1AA] hover:text-slate-950 dark:hover:text-white bg-white hover:bg-slate-50 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 shadow-sm transition-colors"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto bg-slate-50/70 dark:bg-[#0E0E11] text-slate-900 dark:text-[#E5E7EB] leading-relaxed scrollbar-thin">
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

