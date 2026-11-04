import crypto from "crypto";
import dns from "dns";
import { getToolEncryptionKey } from "@/lib/production/environmentValidation";

const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /authorization/i,
  /bearer/i,
  /private[-_]?key/i,
  /seed/i,
  /mnemonic/i,
  /credential/i,
  /wk_[a-zA-Z0-9]+/i,
];

/**
 * Recursively redacts sensitive keys and values from objects and logs
 */
export function redactSensitiveData(data: any): any {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // Check if string contains apparent keys or tokens
    if (/wk_[a-zA-Z0-9]{30,}/.test(data)) {
      return data.replace(/wk_[a-zA-Z0-9]{30,}/g, "wk_[REDACTED]");
    }
    if (/bearer\s+[a-zA-Z0-9._-]+/i.test(data)) {
      return data.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]");
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  if (typeof data === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSensitiveData(value);
      }
    }
    return result;
  }

  return data;
}

function getToolKey(): Buffer {
  return crypto.createHash("sha256").update(getToolEncryptionKey()).digest();
}

/**
 * Encrypt credentials using AES-256-GCM with authentication tag
 */
export function encryptCredentials(data: Record<string, any>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getToolKey(), iv);

  const plainText = JSON.stringify(data);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  // Output format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt credentials using AES-256-GCM
 */
export function decryptCredentials(encryptedString: string): Record<string, any> {
  const parts = encryptedString.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted credentials format");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", getToolKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

/**
 * SSRF and Unsafe Destination Guard for REST / Webhook adapters
 */
export function validateSafeUrl(urlString: string): {
  valid: boolean;
  error?: string;
  url?: URL;
} {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch (err: any) {
    return { valid: false, error: `Invalid URL format: ${err.message}` };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, error: `Disallowed protocol "${url.protocol}". Only HTTP and HTTPS are permitted.` };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Block localhost and loopback
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return { valid: false, error: "SSRF Protection: Access to localhost/loopback is forbidden." };
  }

  // Block cloud instance metadata service (169.254.169.254, link-local metadata)
  if (hostname === "169.254.169.254" || hostname.startsWith("169.254.")) {
    return { valid: false, error: "SSRF Protection: Access to cloud metadata service (169.254.0.0/16) is forbidden." };
  }

  // Comprehensive Private, Loopback, Link-Local, Carrier-Grade NAT, and Cloud Metadata check
  if (isPrivateOrReservedIp(hostname)) {
    return { valid: false, error: `SSRF Protection: Access to private/reserved IP address "${hostname}" is forbidden.` };
  }

  return { valid: true, url };
}

/**
 * Evaluates whether an IPv4 or IPv6 address belongs to private, loopback,
 * link-local, carrier-grade NAT, or cloud instance metadata ranges.
 * Fully supports IPv4-mapped IPv6 formats (both dotted-decimal and hex notation).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip) return true;
  // Strip bracket wrappers from IPv6 hostnames (e.g. [::1], [::ffff:127.0.0.1])
  const cleanIp = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");

  // IPv6 loopback and unspecified
  if (cleanIp === "::1" || cleanIp === "::" || cleanIp === "0:0:0:0:0:0:0:1") {
    return true;
  }

  // IPv4-mapped IPv6 formats (both dotted-decimal e.g. ::ffff:127.0.0.1 and hex e.g. ::ffff:7f00:1)
  if (cleanIp.includes("ffff:")) {
    const afterFfff = cleanIp.slice(cleanIp.indexOf("ffff:") + 5);
    // Dotted-decimal IPv4
    if (afterFfff.includes(".")) {
      return isPrivateOrReservedIp(afterFfff);
    }
    // Hex notation: two 16-bit blocks
    const hexParts = afterFfff.split(":");
    if (hexParts.length === 2) {
      const h1 = parseInt(hexParts[0], 16);
      const h2 = parseInt(hexParts[1], 16);
      if (!isNaN(h1) && !isNaN(h2)) {
        const o1 = (h1 >> 8) & 0xff;
        const o2 = h1 & 0xff;
        const o3 = (h2 >> 8) & 0xff;
        const o4 = h2 & 0xff;
        return isPrivateOrReservedIp(`${o1}.${o2}.${o3}.${o4}`);
      }
    }
  }

  // IPv6 Unique Local Address (ULA) fc00::/7 (fc00... or fd00...)
  if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) {
    return true;
  }

  // IPv6 Link-Local fe80::/10
  if (cleanIp.startsWith("fe8") || cleanIp.startsWith("fe9") || cleanIp.startsWith("fea") || cleanIp.startsWith("feb")) {
    return true;
  }

  // Check IPv4
  const parts = cleanIp.split(".");
  if (parts.length === 4) {
    // If any part contains non-digit characters, it is a domain name (e.g. rpc.testnet.near.org), not an IPv4 address
    if (parts.some((p) => !/^\d+$/.test(p))) {
      return false;
    }
    const octets = parts.map((p) => parseInt(p, 10));
    if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return true;

    const [o1, o2] = octets;

    // 0.0.0.0/8 (Current network)
    if (o1 === 0) return true;
    // 10.0.0.0/8 (Private)
    if (o1 === 10) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata AWS/GCP/Azure)
    if (o1 === 169 && o2 === 254) return true;
    // 172.16.0.0/12 (Private)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (o1 === 192 && o2 === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (o1 === 198 && (o2 === 18 || o2 === 19)) return true;
    // 224.0.0.0/4 (Multicast)
    if (o1 >= 224 && o1 <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (o1 >= 240) return true;
  }

  return false;
}

/**
 * Validates safe URL asynchronously including DNS resolution to protect against DNS rebinding.
 */
export async function validateSafeUrlAsync(urlString: string): Promise<{
  valid: boolean;
  error?: string;
  url?: URL;
  resolvedIps?: string[];
}> {
  const syncCheck = validateSafeUrl(urlString);
  if (!syncCheck.valid || !syncCheck.url) {
    return syncCheck;
  }

  const url = syncCheck.url;
  const hostname = url.hostname.toLowerCase();

  // If hostname is already a direct IP, it was checked by validateSafeUrl
  const isDirectIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
  if (isDirectIp) {
    if (isPrivateOrReservedIp(hostname)) {
      return {
        valid: false,
        error: `SSRF Protection: Access to private/reserved IP address "${hostname}" is forbidden.`,
      };
    }
    return { valid: true, url, resolvedIps: [hostname] };
  }

  // Resolve hostname via DNS to defeat DNS Rebinding attacks
  try {
    const records = await dns.promises.lookup(hostname, { all: true });
    const resolvedIps = records.map((r) => r.address);

    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        return {
          valid: false,
          error: `SSRF & DNS Rebinding Protection: Host "${hostname}" resolved to forbidden private/reserved IP address "${record.address}". Connection blocked.`,
          resolvedIps,
        };
      }
    }

    return { valid: true, url, resolvedIps };
  } catch (err: any) {
    return {
      valid: false,
      error: `DNS resolution failed for host "${hostname}": ${err.message}`,
    };
  }
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Safe fetch with manual redirect inspection and cross-origin credential isolation.
 */
export async function safeFetch(
  url: string,
  init?: SafeFetchOptions,
  maxRedirects: number = 3
): Promise<Response> {
  let currentUrl = url;
  const timeoutMs = init?.timeoutMs;
  const signal = init?.signal || (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined);
  const { timeoutMs: _, ...fetchInit } = init || {};
  let currentInit: RequestInit = { ...fetchInit, signal, redirect: "manual" };
  let redirectsRemaining = maxRedirects;

  const originalUrlObj = new URL(url);

  while (true) {
    // 1. Validate destination URL and resolve DNS against private IPs
    const validation = await validateSafeUrlAsync(currentUrl);
    if (!validation.valid || !validation.url) {
      throw new Error(`SSRF Blocked: ${validation.error}`);
    }

    // 2. Perform manual single-hop fetch
    const response = await fetch(currentUrl, currentInit);

    // 3. Handle redirects explicitly
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (!isRedirect) {
      return response;
    }

    if (redirectsRemaining <= 0) {
      throw new Error(`Too many redirects (exceeded maximum limit of ${maxRedirects})`);
    }
    redirectsRemaining--;

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Redirect response (${response.status}) missing Location header`);
    }

    // Resolve relative redirect against current URL
    const nextUrlObj = new URL(location, currentUrl);
    const nextUrl = nextUrlObj.toString();

    // 4. Credential Isolation: If redirect host or origin differs, strip sensitive headers
    const isDifferentHost = nextUrlObj.hostname.toLowerCase() !== originalUrlObj.hostname.toLowerCase();
    let nextHeaders: Record<string, string> = {};

    if (currentInit.headers) {
      if (currentInit.headers instanceof Headers) {
        currentInit.headers.forEach((val, key) => {
          nextHeaders[key] = val;
        });
      } else if (Array.isArray(currentInit.headers)) {
        for (const [k, v] of currentInit.headers) {
          nextHeaders[k] = v;
        }
      } else {
        nextHeaders = { ...(currentInit.headers as Record<string, string>) };
      }
    }

    if (isDifferentHost) {
      // Strip credentials to prevent token leakage across origins
      delete nextHeaders["authorization"];
      delete nextHeaders["Authorization"];
      delete nextHeaders["x-api-key"];
      delete nextHeaders["X-Api-Key"];
      delete nextHeaders["cookie"];
      delete nextHeaders["Cookie"];
      delete nextHeaders["proxy-authorization"];
    }

    currentUrl = nextUrl;
    currentInit = {
      ...currentInit,
      headers: nextHeaders,
      method: (response.status === 303 || ((response.status === 301 || response.status === 302) && currentInit.method === "POST"))
        ? "GET"
        : currentInit.method,
      body: (response.status === 303 || ((response.status === 301 || response.status === 302) && currentInit.method === "POST"))
        ? undefined
        : currentInit.body,
    };
  }
}

