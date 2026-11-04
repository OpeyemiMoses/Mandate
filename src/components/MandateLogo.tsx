import React from "react";

interface MandateLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  subtitle?: string;
  className?: string;
}

export function MandateMark({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Left slanted pillar */}
      <path
        d="M4 36L14.5 4H23.5L13 36H4Z"
        fill="#FF3B30"
      />
      {/* Center fold shadow */}
      <path
        d="M17.5 14L23.5 4L28.5 24L21.5 32L17.5 14Z"
        fill="#B91C1C"
      />
      {/* Right slanted pillar */}
      <path
        d="M21 36L31.5 4H40.5L30 36H21Z"
        fill="#FF3B30"
      />
      {/* Right outer wing */}
      <path
        d="M34.5 15L40.5 4L45 36H36.5L34.5 15Z"
        fill="#DC2626"
      />
    </svg>
  );
}

export function MandateLogo({
  size = "md",
  showText = true,
  subtitle,
  className = "",
}: MandateLogoProps) {
  const markSizes = {
    sm: "w-6 h-5",
    md: "w-8 h-6",
    lg: "w-10 h-8",
    xl: "w-12 h-10",
  };

  const textSizes = {
    sm: "text-base font-semibold tracking-tight",
    md: "text-lg font-semibold tracking-tight",
    lg: "text-2xl font-bold tracking-tight",
    xl: "text-3xl font-bold tracking-tight",
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <MandateMark className={markSizes[size]} />
      {showText && (
        <div className="flex flex-col">
          <span className={`text-white leading-none ${textSizes[size]}`}>
            Mandate
          </span>
          {subtitle && (
            <span className="text-[11px] text-[#A1A1AA] mt-1 font-normal tracking-normal">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

