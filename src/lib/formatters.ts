/**
 * Universal Display & Address Formatters
 * Ensures addresses are never displayed as long unwieldy hex strings in the UI.
 * Prioritizes the user's chosen display name / username.
 */

export function truncateAddress(
  address?: string | null,
  start: number = 6,
  end: number = 4
): string {
  if (!address) return "";
  const str = address.trim();
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
}

export function formatAccountOrName(
  accountId?: string | null,
  displayName?: string | null
): string {
  if (displayName && displayName.trim().length > 0) {
    return displayName.trim();
  }
  if (!accountId || accountId.trim().length === 0) {
    return "Anonymous";
  }

  const clean = accountId.trim();

  // If standard named NEAR account that is short and legible
  if (
    (clean.endsWith(".testnet") || clean.endsWith(".near")) &&
    clean.length <= 24
  ) {
    return clean;
  }

  // 0x EVM address or 64-character hex implicit account
  if (clean.startsWith("0x")) {
    return truncateAddress(clean, 6, 4);
  }

  if (clean.length === 64) {
    return truncateAddress(clean, 6, 4);
  }

  if (clean.length > 24) {
    return truncateAddress(clean, 6, 4);
  }

  return clean;
}

export function formatNearAmount(
  amount?: string | number | null,
  decimals: number = 3
): string {
  if (amount === undefined || amount === null || amount === "") return "0.000";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0.000";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

