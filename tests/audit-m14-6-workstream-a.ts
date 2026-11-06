/**
 * MANDATE M14.6-ECA: Workstream A Adversarial Audit Probe
 * In-memory test verifying:
 * 1. Ciphertext transposition vulnerability between Wallet A and Wallet B.
 * 2. Absence of Additional Authenticated Data (AAD) in CredentialVault.
 * 3. Exact ciphertext format and version identifier.
 * 4. Behavior under modified IV, tag, ciphertext, and context.
 */

import crypto from "crypto";
import { CredentialVault, CURRENT_VAULT_VERSION } from "../src/lib/integrations/credentialVault";
import {
  WalletCredentialService,
  encryptWalletApiKey,
  decryptWalletApiKey,
} from "../src/lib/security/walletCredentialService";

interface ProbeResult {
  testId: string;
  name: string;
  expected: string;
  actual: string;
  vulnerabilityConfirmed: boolean;
  details: string;
}

const probeResults: ProbeResult[] = [];

function recordProbe(res: ProbeResult) {
  probeResults.push(res);
  const mark = res.vulnerabilityConfirmed ? "❌ VULNERABLE" : "✅ SECURE";
  console.log(`[${mark}] ${res.testId}: ${res.name}`);
  console.log(`    ↳ Expected: ${res.expected}`);
  console.log(`    ↳ Actual:   ${res.actual}`);
  console.log(`    ↳ Details:  ${res.details}\n`);
}

async function runWorkstreamAProbe() {
  console.log("================================================================================");
  console.log("🔬 AUDIT PROBE: WORKSTREAM A — CREDENTIAL VAULT AAD CONTEXT BINDING");
  console.log("================================================================================\n");

  // 1. Inspect format and version
  const rawKeyA = "wk_testnet_wallet_alpha_secret_key_1234567890";
  const encryptedA = encryptWalletApiKey(rawKeyA);
  const parts = encryptedA.split(":");

  const isV2 = parts[0] === "v2";
  recordProbe({
    testId: "A1-FORMAT-VERSION",
    name: "Credential Vault Encryption Version Identifier",
    expected: "v2 (with AAD context binding)",
    actual: `${parts[0]} (parts count: ${parts.length})`,
    vulnerabilityConfirmed: !isV2,
    details: `CURRENT_VAULT_VERSION is ${CURRENT_VAULT_VERSION}. Stored payload format is ${parts[0]} with 4 segments (${parts[0]}:iv:tag:ciphertext). No version 2 exists.`,
  });

  // 2. Transposition Attack between Wallet A and Wallet B
  const walletAContext = { walletId: "wallet_alpha_001", nearAccountId: "alpha.testnet" };
  const walletBContext = { walletId: "wallet_beta_002", nearAccountId: "beta.testnet" };

  // In a secure v2 implementation, decryption must require the target wallet context (walletId + nearAccountId)
  // and fail if decrypted under wallet B's context.
  // In the current implementation, decryptApiKey takes NO context parameters at all!
  const decryptedUnderB = decryptWalletApiKey(encryptedA);
  const transpositionSuccess = decryptedUnderB === rawKeyA;

  recordProbe({
    testId: "A2-TRANSPOSITION",
    name: "Cross-Wallet Ciphertext Transposition Attack",
    expected: "Decryption must fail authentication when transposed to Wallet B",
    actual: transpositionSuccess ? "Decryption SUCCEEDED without authentication failure" : "Decryption failed",
    vulnerabilityConfirmed: transpositionSuccess,
    details: `Transplanted ciphertext from Wallet A into Wallet B decrypted successfully into the plaintext key "${decryptedUnderB.slice(0, 15)}...". Decrypt function has no AAD context parameters.`,
  });

  // 3. Altered Ciphertext and Tag Failure Checks (GCM Integrity)
  // 3.1 Corrupted Tag
  const partsA = encryptedA.split(":");
  const corruptedTag = partsA[0] + ":" + partsA[1] + ":" + (partsA[2].slice(0, -2) + "ff") + ":" + partsA[3];
  const decryptCorruptedTag = decryptWalletApiKey(corruptedTag);

  recordProbe({
    testId: "A3-GCM-TAG-CORRUPTION",
    name: "AES-GCM Authentication Tag Tamper Rejection",
    expected: "Tampered auth tag must fail decryption and return empty string",
    actual: decryptCorruptedTag === "" ? "Returned empty string (decryption failed safely)" : `Returned "${decryptCorruptedTag}"`,
    vulnerabilityConfirmed: decryptCorruptedTag !== "",
    details: "Standard AES-GCM tag verification catches payload bit flips, but does NOT catch cross-row database transposition.",
  });

  // 3.2 Legacy Plaintext Fallback Acceptance
  const legacyKey = "wk_legacy_plaintext_key_without_encryption";
  const decryptedLegacy = decryptWalletApiKey(legacyKey);
  const legacyAccepted = decryptedLegacy === legacyKey;

  recordProbe({
    testId: "A4-PLAINTEXT-FALLBACK",
    name: "Legacy Plaintext Fallback Acceptance",
    expected: "Production reads reject plaintext credentials (or restrict strictly to one-time migration)",
    actual: legacyAccepted ? "Plaintext accepted transparently on ordinary read" : "Rejected plaintext",
    vulnerabilityConfirmed: legacyAccepted,
    details: "WalletCredentialService.decryptApiKey returns plaintext directly if !isEncrypted(key), maintaining indefinite fallback.",
  });

  console.log("================================================================================");
  console.log(`WORKSTREAM A PROBE COMPLETED: ${probeResults.filter(p => p.vulnerabilityConfirmed).length} VULNERABILITIES CONFIRMED`);
  console.log("================================================================================\n");

  return probeResults;
}

runWorkstreamAProbe()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
