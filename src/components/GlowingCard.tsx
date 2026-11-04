"use client";

import React from "react";

interface GlowingCardProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  intensity?: "subtle" | "medium" | "strong";
  glowPosition?: "top-right" | "top-left" | "bottom-right" | "none";
}

export function GlowingCard({
  children,
  className = "",
  innerClassName = "p-6",
  intensity = "medium",
  glowPosition = "top-right",
}: GlowingCardProps) {
  const glowPosClasses = {
    "top-right": "-top-20 -right-20",
    "top-left": "-top-20 -left-20",
    "bottom-right": "-bottom-20 -right-20",
    none: "hidden",
  };

  return (
    <div
      className={`relative rounded-2xl p-[1px] animate-pop hover-pop shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.7)] transition-all duration-300 hover:shadow-[0_12px_32px_rgba(255,59,48,0.14)] dark:hover:shadow-[0_20px_56px_rgba(255,59,48,0.18)] ${className}`}
      style={{
        background: `var(--glowing-card-border-${intensity})`,
      }}
    >
      <div
        className={`relative h-full w-full rounded-[15px] bg-white dark:bg-gradient-to-br dark:from-[#161214] dark:via-[#0D0D10] dark:to-[#09090B] overflow-hidden border border-slate-200/80 dark:border-white/[0.03] ${innerClassName}`}
      >
        {glowPosition !== "none" && (
          <div
            className={`pointer-events-none absolute w-44 h-44 rounded-full opacity-10 dark:opacity-20 blur-2xl ${glowPosClasses[glowPosition]}`}
            style={{ background: "#FF3B30" }}
          />
        )}
        <div className="relative z-10 h-full">{children}</div>
      </div>
    </div>
  );
}
