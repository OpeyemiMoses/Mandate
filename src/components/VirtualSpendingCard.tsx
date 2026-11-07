"use client";

import React from "react";
import { Wifi, ChevronLeft, ChevronRight, Lock, RotateCw } from "lucide-react";
import { MandateMark } from "./MandateLogo";
import { truncateAddress } from "@/lib/formatters";

export type CardColorVariant = "red" | "gold" | "white" | "emerald" | "cyan" | "purple";

export interface VirtualCardProps {
  variant?: CardColorVariant;
  mandateName?: string;
  agentHolder?: string;
  vaultAddress?: string;
  cardNumberLast4?: string;
  totalBudgetNear?: string;
  spentNear?: string;
  remainingNear?: string;
  perTxLimitNear?: string;
  approvalThresholdNear?: string;
  allowedRecipients?: string[];
  expiresLabel?: string;
  status?: "active" | "revoked";
  isFrozen?: boolean;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Realistic metallic EMV smart-card chip SVG.
 */
function EmvChip({ isLightCard }: { isLightCard: boolean }) {
  return (
    <svg
      viewBox="0 0 52 40"
      className="w-11 h-8 sm:w-12 sm:h-9 rounded-[7px] shrink-0 shadow-sm"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="chipGold" x1="0" y1="0" x2="52" y2="40">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="45%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="chipSilver" x1="0" y1="0" x2="52" y2="40">
          <stop offset="0%" stopColor="#E4E4E7" />
          <stop offset="50%" stopColor="#A1A1AA" />
          <stop offset="100%" stopColor="#52525B" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="51"
        height="39"
        rx="6.5"
        fill={isLightCard ? "url(#chipSilver)" : "url(#chipGold)"}
        stroke={isLightCard ? "#71717A" : "#FDE68A"}
        strokeOpacity="0.6"
      />
      {/* Internal EMV contact pad grooves */}
      <path
        d="M17 1V39M35 1V39M1 14H17M35 14H51M1 26H17M35 26H51M17 20H35"
        stroke={isLightCard ? "#3F3F46" : "#78350F"}
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
      <rect
        x="20"
        y="11"
        width="12"
        height="18"
        rx="3"
        stroke={isLightCard ? "#3F3F46" : "#78350F"}
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/**
 * Single realistic ISO-7810 ID-1 proportion Credit Card (aspect ratio 1.586 : 1).
 */
export function VirtualSpendingCard({
  variant = "red",
  mandateName = "DeFi Research Mandate",
  agentHolder = "researcher.near",
  vaultAddress = "outlayer-vault-8f2a.testnet",
  cardNumberLast4,
  totalBudgetNear = "0.500",
  remainingNear = "0.350",
  perTxLimitNear = "0.100",
  allowedRecipients = ["researcher.near"],
  expiresLabel = "11/26",
  status = "active",
  isFrozen = false,
  onClick,
  className = "",
}: VirtualCardProps) {
  const isRevokedOrFrozen = status === "revoked" || isFrozen;
  const isWhite = variant === "white";
  const isGold = variant === "gold";
  const isEmerald = variant === "emerald";
  const isCyan = variant === "cyan";
  const isPurple = variant === "purple";
  const last4 =
    cardNumberLast4 ||
    vaultAddress.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase() ||
    "8F2A";

  // Surface backgrounds per card color
  const cardBackground =
    isRevokedOrFrozen
      ? "linear-gradient(135deg, #27272A 0%, #18181B 55%, #09090B 100%)"
      : variant === "red"
      ? "linear-gradient(135deg, #FF3B30 0%, #C81E1E 38%, #450A0A 78%, #140404 100%)"
      : variant === "gold"
      ? "linear-gradient(135deg, #FDE68A 0%, #D97706 42%, #78350F 82%, #1F0D03 100%)"
      : variant === "emerald"
      ? "linear-gradient(135deg, #10B981 0%, #059669 42%, #064E3B 82%, #02231A 100%)"
      : variant === "cyan"
      ? "linear-gradient(135deg, #06B6D4 0%, #0284C7 42%, #0C4A6E 82%, #031D2D 100%)"
      : variant === "purple"
      ? "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 42%, #3B0764 82%, #19022B 100%)"
      : "linear-gradient(135deg, #FFFFFF 0%, #F4F4F5 45%, #D4D4D8 82%, #A1A1AA 100%)";

  const outerBorder =
    isRevokedOrFrozen
      ? "linear-gradient(135deg, #52525B 0%, #27272A 100%)"
      : variant === "red"
      ? "linear-gradient(135deg, #FF857D 0%, #FF3B30 45%, rgba(255,59,48,0.3) 100%)"
      : variant === "gold"
      ? "linear-gradient(135deg, #FEF08A 0%, #F59E0B 45%, rgba(217,119,6,0.3) 100%)"
      : variant === "emerald"
      ? "linear-gradient(135deg, #6EE7B7 0%, #10B981 45%, rgba(16,185,129,0.3) 100%)"
      : variant === "cyan"
      ? "linear-gradient(135deg, #67E8F9 0%, #06B6D4 45%, rgba(6,182,212,0.3) 100%)"
      : variant === "purple"
      ? "linear-gradient(135deg, #C4B5FD 0%, #8B5CF6 45%, rgba(139,92,246,0.3) 100%)"
      : "linear-gradient(135deg, #FFFFFF 0%, #E4E4E7 50%, #71717A 100%)";

  const primaryText = isWhite ? "text-[#0B0B0B]" : "text-white";
  const secondaryText = isWhite
    ? "text-zinc-600"
    : isGold
    ? "text-amber-100/80"
    : isEmerald
    ? "text-emerald-100/80"
    : isCyan
    ? "text-cyan-100/80"
    : isPurple
    ? "text-purple-100/80"
    : "text-white/75";
  const labelText = isWhite
    ? "text-zinc-500"
    : isGold
    ? "text-amber-200/70"
    : isEmerald
    ? "text-emerald-200/70"
    : isCyan
    ? "text-cyan-200/70"
    : isPurple
    ? "text-purple-200/70"
    : "text-white/60";

  return (
    <div
      onClick={onClick}
      className={`relative w-full max-w-[430px] aspect-[1.586/1] rounded-[22px] p-[1.5px] select-none shadow-[0_24px_60px_rgba(0,0,0,0.85)] transition-all duration-500 ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
      style={{ background: outerBorder }}
    >
      {/* Inner Metallic Card Body */}
      <div
        className="mandate-card-surface relative w-full h-full rounded-[20.5px] p-5 sm:p-6 flex flex-col justify-between overflow-hidden"
        style={{ background: cardBackground }}
      >
        {/* Brushed metal specular highlight & holographic security rings */}
        <div
          className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full opacity-30 blur-2xl"
          style={{
            background: isWhite
              ? "radial-gradient(circle, #FFFFFF 0%, transparent 70%)"
              : isGold
              ? "radial-gradient(circle, #FEF08A 0%, transparent 70%)"
              : "radial-gradient(circle, #FF8A80 0%, transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background:
              "linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.45) 48%, transparent 62%)",
          }}
        />
        {/* Subtle geometric card watermark */}
        <div
          className={`pointer-events-none absolute -right-10 -bottom-10 w-44 h-44 rounded-full border ${
            isWhite ? "border-black/[0.06]" : "border-white/[0.08]"
          }`}
        />
        <div
          className={`pointer-events-none absolute -right-4 -bottom-4 w-44 h-44 rounded-full border ${
            isWhite ? "border-black/[0.06]" : "border-white/[0.08]"
          }`}
        />

        {/* TOP ROW: Mandate Brand + Spending Cap Pill */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isWhite ? (
              <MandateMark className="w-7 h-5" />
            ) : (
              <div className="w-7 h-6 rounded-md bg-black/25 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                <MandateMark className="w-5 h-4" />
              </div>
            )}
            <span
              className={`text-sm sm:text-base font-bold tracking-tight ${primaryText}`}
            >
              Mandate
            </span>
          </div>

          <div
            className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold tracking-wider uppercase backdrop-blur-md border ${
              isRevokedOrFrozen
                ? "bg-red-950/80 text-red-300 border-red-500/40 animate-pulse"
                : isWhite
                ? "bg-black/[0.07] text-[#0B0B0B] border-black/15"
                : "bg-black/30 text-white border-white/20"
            }`}
          >
            {isRevokedOrFrozen
              ? "CARD FROZEN"
              : `CAP ${totalBudgetNear} NEAR`}
          </div>
        </div>

        {/* MIDDLE ROW: Metallic EMV Chip + Contactless + Embossed Card Number */}
        <div className="relative z-10 space-y-2.5 my-auto pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <EmvChip isLightCard={isWhite} />
              <Wifi
                className={`w-4 h-4 rotate-90 ${
                  isWhite ? "text-zinc-600" : "text-white/80"
                }`}
              />
            </div>

            <div className="text-right">
              <span
                className={`text-[9px] font-mono uppercase tracking-widest block ${labelText}`}
              >
                Available to Spend
              </span>
              <span
                className={`text-sm sm:text-base font-mono font-bold ${primaryText}`}
              >
                {remainingNear} NEAR
              </span>
            </div>
          </div>

          {/* Embossed Credit Card Number */}
          <div
            className={`text-base sm:text-[19px] font-mono font-semibold tracking-[0.18em] pt-0.5 ${primaryText}`}
            style={{
              textShadow: isWhite
                ? "0 1px 0 rgba(255,255,255,0.8)"
                : "0 1px 2px rgba(0,0,0,0.65)",
            }}
          >
            4829 •••• •••• {last4}
          </div>
        </div>

        {/* BOTTOM ROW: Cardholder / Mandate, Per-Tx Limit, Valid Thru, NEAR Network Emblem */}
        <div className="relative z-10 flex items-end justify-between gap-2 pt-1">
          <div className="min-w-0">
            <div
              className={`text-[8px] font-mono uppercase tracking-widest ${labelText}`}
            >
              Agent Mandate Holder
            </div>
            <div
              className={`text-xs sm:text-sm font-semibold uppercase tracking-wider truncate ${primaryText}`}
            >
              {mandateName}
            </div>
            <div
              className={`text-[10px] font-mono truncate flex items-center gap-1 mt-0.5 ${secondaryText}`}
            >
              <Lock className="w-2.5 h-2.5 shrink-0" />
              <span>
                Allow: {truncateAddress(allowedRecipients[0] || agentHolder, 10, 4)} · Max{" "}
                {perTxLimitNear}/tx
              </span>
            </div>
          </div>

          <div className="flex items-end gap-4 shrink-0">
            <div className="text-right">
              <div
                className={`text-[8px] font-mono uppercase tracking-widest ${labelText}`}
              >
                Valid Thru
              </div>
              <div
                className={`text-xs font-mono font-semibold ${primaryText}`}
              >
                {expiresLabel}
              </div>
            </div>

            {/* Credit Card Network Mark (NEAR TEE) */}
            <div
              className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold tracking-wider uppercase border ${
                isWhite
                  ? "bg-[#0B0B0B] text-white border-black"
                  : "bg-white/15 text-white border-white/25 backdrop-blur-sm"
              }`}
            >
              NEAR
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Interactive 3-Card 3D Stack (Red, Gold, White) with click-to-flip and bottom switcher.
 */
export interface StackedCardItem {
  id: string;
  variant: CardColorVariant;
  colorName: string;
  label: string;
  mandateName: string;
  agentHolder: string;
  vaultAddress: string;
  cardNumberLast4: string;
  totalBudgetNear: string;
  spentNear: string;
  remainingNear: string;
  perTxLimitNear: string;
  approvalThresholdNear: string;
  allowedRecipients: string[];
  expiresLabel: string;
}

export function StackedVirtualCards({
  cards,
  activeIndex,
  onSelectIndex,
  frozen = false,
}: {
  cards: StackedCardItem[];
  activeIndex: number;
  onSelectIndex: (index: number) => void;
  frozen?: boolean;
}) {
  const total = cards.length;
  const nextCard = () => onSelectIndex((activeIndex + 1) % total);
  const prevCard = () => onSelectIndex((activeIndex - 1 + total) % total);

  // Auto-switch cards at regular intervals unless frozen
  React.useEffect(() => {
    if (frozen || total <= 1) return;
    const interval = setInterval(() => {
      onSelectIndex((activeIndex + 1) % total);
    }, 4200);
    return () => clearInterval(interval);
  }, [activeIndex, frozen, onSelectIndex, total]);

  return (
    <div className="flex flex-col items-center w-full">
      {/* 3D Stacked Cards Container */}
      <div className="relative w-full max-w-[340px] sm:max-w-[430px] mx-auto pt-8 sm:pt-10 pb-4 px-1 sm:px-0">
        {cards.map((card, idx) => {
          // Calculate relative position in the stack: 0 = front, 1 = middle, 2 = back
          const offset = (idx - activeIndex + total) % total;

          const transformStyle =
            offset === 0
              ? "translate3d(0px, 0px, 0px) scale(1) rotateZ(0deg)"
              : offset === 1
              ? "translate3d(10px, -16px, -40px) scale(0.95) rotateZ(2.5deg)"
              : "translate3d(20px, -30px, -80px) scale(0.90) rotateZ(5deg)";

          const zIndex = offset === 0 ? 30 : offset === 1 ? 20 : 10;
          const opacity = offset === 0 ? 1 : offset === 1 ? 0.82 : 0.6;

          return (
            <div
              key={card.id}
              onClick={nextCard}
              className={`${
                offset === 0 ? "relative" : "absolute top-10 left-2 sm:left-0 right-2 sm:right-0"
              } transition-all duration-500 ease-out cursor-pointer hover:scale-[1.02]`}
              style={{
                transform: transformStyle,
                zIndex,
                opacity,
              }}
            >
              <VirtualSpendingCard
                variant={card.variant}
                mandateName={card.mandateName}
                agentHolder={card.agentHolder}
                vaultAddress={card.vaultAddress}
                cardNumberLast4={card.cardNumberLast4}
                totalBudgetNear={card.totalBudgetNear}
                spentNear={card.spentNear}
                remainingNear={card.remainingNear}
                perTxLimitNear={card.perTxLimitNear}
                approvalThresholdNear={card.approvalThresholdNear}
                allowedRecipients={card.allowedRecipients}
                expiresLabel={card.expiresLabel}
                status={frozen && offset === 0 ? "revoked" : "active"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
