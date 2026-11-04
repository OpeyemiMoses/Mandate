"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className = "", showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center gap-2 p-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 dark:text-[#A1A1AA] dark:hover:text-white dark:bg-[#141417] dark:hover:bg-[#1C1C22] dark:border-[#232329] dark:hover:border-[#383842] shadow-sm transition-all duration-200 active:scale-95 ${className}`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-amber-400 animate-pop" />
      ) : (
        <Moon className="w-4 h-4 text-indigo-500 animate-pop" />
      )}
      {showLabel && (
        <span className="text-xs font-medium">
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </button>
  );
}
