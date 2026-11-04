/**
 * Atomic NEAR <-> yoctoNEAR string conversion utilities.
 * 1 NEAR = 10^24 yoctoNEAR.
 * Never uses floating-point arithmetic.
 */

const YOCTO_DECIMALS = 24;
const TEN_POW_24 = BigInt("1000000000000000000000000");

/**
 * Validates that a string is a valid non-negative integer in yoctoNEAR.
 */
export function isValidYoctoString(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  return /^\d+$/.test(value.trim());
}

/**
 * Validates that a string is a strictly positive (> 0) integer in yoctoNEAR.
 */
export function isPositiveYoctoString(value: string): boolean {
  if (!isValidYoctoString(value)) return false;
  try {
    return BigInt(value.trim()) > BigInt(0);
  } catch {
    return false;
  }
}

/**
 * Converts a human-readable NEAR string (e.g. "0.5", "1.250", "5") into an exact yoctoNEAR integer string.
 * Throws if input is malformed or negative.
 */
export function nearToYocto(nearAmountStr: string): string {
  const cleaned = nearAmountStr.trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`Invalid NEAR amount format: "${nearAmountStr}"`);
  }

  const [wholePart, fracPart = ""] = cleaned.split(".");
  if (fracPart.length > YOCTO_DECIMALS) {
    throw new Error(`NEAR fractional precision exceeds ${YOCTO_DECIMALS} decimals`);
  }

  const paddedFrac = fracPart.padEnd(YOCTO_DECIMALS, "0");
  const combined = `${wholePart}${paddedFrac}`.replace(/^0+(?=\d)/, "");
  return combined || "0";
}

/**
 * Converts an atomic yoctoNEAR integer string into a formatted human-readable NEAR string
 * without floating-point math.
 */
export function yoctoToNear(yoctoStr: string, decimals = 3): string {
  if (!isValidYoctoString(yoctoStr)) {
    return "0." + "0".repeat(decimals);
  }

  const val = BigInt(yoctoStr.trim());
  const whole = val / TEN_POW_24;
  const remainder = val % TEN_POW_24;

  if (decimals <= 0) {
    return whole.toString();
  }

  const remainderPadded = remainder.toString().padStart(YOCTO_DECIMALS, "0");
  const slice = remainderPadded.slice(0, decimals);
  return `${whole.toString()}.${slice}`;
}

/**
 * Adds two yoctoNEAR strings safely using BigInt.
 */
export function addYocto(a: string, b: string): string {
  return (BigInt(a || "0") + BigInt(b || "0")).toString();
}

/**
 * Subtracts b from a safely using BigInt (clamped at 0 if displaySafe is true).
 */
export function subYocto(a: string, b: string, clampZero = true): string {
  const diff = BigInt(a || "0") - BigInt(b || "0");
  if (clampZero && diff < BigInt(0)) return "0";
  return diff.toString();
}

/**
 * Compares two yoctoNEAR strings: returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareYocto(a: string, b: string): -1 | 0 | 1 {
  const bigA = BigInt(a || "0");
  const bigB = BigInt(b || "0");
  if (bigA < bigB) return -1;
  if (bigA > bigB) return 1;
  return 0;
}

