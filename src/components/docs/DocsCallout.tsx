import React from "react";
import { Info, AlertTriangle, AlertCircle, Sparkles } from "lucide-react";

interface DocsCalloutProps {
  type?: "note" | "tip" | "important" | "warning";
  title?: string;
  children: React.ReactNode;
}

export function DocsCallout({
  type = "note",
  title,
  children,
}: DocsCalloutProps) {
  const styles = {
    note: {
      border: "border-sky-300 dark:border-sky-500/30",
      bg: "bg-sky-50 dark:bg-sky-500/10",
      text: "text-sky-800 dark:text-sky-400",
      icon: Info,
      defaultTitle: "Note",
    },
    tip: {
      border: "border-emerald-300 dark:border-emerald-500/30",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
      text: "text-emerald-800 dark:text-emerald-400",
      icon: Sparkles,
      defaultTitle: "Tip",
    },
    important: {
      border: "border-amber-300 dark:border-amber-500/35",
      bg: "bg-amber-50 dark:bg-amber-500/10",
      text: "text-amber-800 dark:text-amber-400",
      icon: AlertTriangle,
      defaultTitle: "Important Requirement",
    },
    warning: {
      border: "border-red-300 dark:border-red-500/40",
      bg: "bg-red-50 dark:bg-red-500/10",
      text: "text-red-800 dark:text-red-400",
      icon: AlertCircle,
      defaultTitle: "Security Warning",
    },
  }[type];

  const Icon = styles.icon;

  return (
    <div
      className={`my-6 p-4 rounded-xl border ${styles.border} ${styles.bg} text-xs leading-relaxed shadow-sm`}
    >
      <div className={`flex items-center gap-2 font-bold ${styles.text} mb-1.5`}>
        <Icon className="w-4 h-4 shrink-0" />
        <span>{title || styles.defaultTitle}</span>
      </div>
      <div className="text-slate-700 dark:text-[#D4D4D8] space-y-1 font-normal">{children}</div>
    </div>
  );
}

