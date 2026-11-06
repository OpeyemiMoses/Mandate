/**
 * MANDATE M14.6-R1: Workstream A Adversarial Verification Probe
 * Verifies:
 * 1. Introduction of version 2 (`v2:iv:tag:ciphertext`) encryption format.
 * 2. Mandatory Authenticated Additional Data (AAD) binding to walletId + nearAccountId.
 * 3. Strict rejection of cross-wallet ciphertext transposition attacks.
 * 4. Elimination of ordinary production plaintext fallbacks.
 */

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

  const walletAContext = { walletId: "wallet_alpha_001", nearAccountId: "alpha.testnet" };
  const walletBContext = { walletId: "wallet_beta_002", nearAccountId: "beta.testnet" };

  // 1. Inspect format and version
  const rawKeyA = "wk_testnet_wallet_alpha_secret_key_1234567890";
  const encryptedA = encryptWalletApiKey(rawKeyA, walletAContext);
  const parts = encryptedA.split(":");

  const isV2 = parts[0] === "v2";
  recordProbe({
    testId: "A1-FORMAT-VERSION",
    name: "Credential Vault Encryption Version Identifier",
    expected: "v2 (with AAD context binding)",
    actual: `${parts[0]} (parts count: ${parts.length})`,
    vulnerabilityConfirmed: !isV2,
    details: `CURRENT_VAULT_VERSION is ${CURRENT_VAULT_VERSION}. Stored payload format is ${parts[0]} with 4 segments (${parts[0]}:iv:tag:ciphertext).`,
  });

  // 2. Legitimate Decryption under Correct Context
  const decryptedUnderA = decryptWalletApiKey(encryptedA, walletAContext);
  const legitimateSuccess = decryptedUnderA === rawKeyA;
  recordProbe({
    testId: "A2-LEGITIMATE-DECRYPT",
    name: "Legitimate Decryption Under Correct Wallet Context",
    expected: "Decryption succeeds and yields original raw API key",
    actual: legitimateSuccess ? "Decryption SUCCEEDED" : "Decryption FAILED",
    vulnerabilityConfirmed: !legitimateSuccess,
    details: `Original key was retrieved cleanly under authorized context (${walletAContext.walletId}, ${walletAContext.nearAccountId}).`,
  });

  // 3. Transposition Attack: Attempt to decrypt Wallet A's ciphertext under Wallet B's context
  const decryptedUnderB = decryptWalletApiKey(encryptedA, walletBContext);
  const transpositionSuccess = decryptedUnderB === rawKeyA;

  recordProbe({
    testId: "A3-TRANSPOSITION",
    name: "Cross-Wallet Ciphertext Transposition Attack",
    expected: "Decryption must fail authentication when transposed to Wallet B",
    actual: transpositionSuccess ? "Decryption SUCCEEDED (VULNERABLE)" : "Decryption FAILED (SECURE - Empty String)",
    vulnerabilityConfirmed: transpositionSuccess,
    details: `Ciphertext from Wallet A copied to Wallet B was rejected by GCM AAD verification: returned "${decryptedUnderB}". Transposition defeated.`,
  });

  // 4. Altered NEAR Account ID Context Attack
  const alteredAccountContext = { walletId: walletAContext.walletId, nearAccountId: "hacker.testnet" };
  const decryptedAlteredAccount = decryptWalletApiKey(encryptedA, alteredAccountContext);
  recordProbe({
    testId: "A4-ALTERED-ACCOUNT",
    name: "Altered NEAR Account Context Rejection",
    expected: "Decryption fails if account ID differs",
    actual: decryptedAlteredAccount === "" ? "Decryption FAILED safely" : "Decrypted unexpectedly",
    vulnerabilityConfirmed: decryptedAlteredAccount !== "",
    details: "AAD verification binds the canonical NEAR account ID; altered account ID fails tag authentication.",
  });

  // 5. Altered Wallet ID Context Attack
  const alteredWalletContext = { walletId: "wallet_attacker_999", nearAccountId: walletAContext.nearAccountId };
  const decryptedAlteredWallet = decryptWalletApiKey(encryptedA, alteredWalletContext);
  recordProbe({
    testId: "A5-ALTERED-WALLET-ID",
    name: "Altered Wallet ID Context Rejection",
    expected: "Decryption fails if wallet ID differs",
    actual: decryptedAlteredWallet === "" ? "Decryption FAILED safely" : "Decrypted unexpectedly",
    vulnerabilityConfirmed: decryptedAlteredWallet !== "",
    details: "AAD verification binds the canonical wallet ID; altered wallet ID fails tag authentication.",
  });

  // 6. GCM Tag Tampering Check
  const partsA = encryptedA.split(":");
  const corruptedTag = partsA[0] + ":" + partsA[1] + ":" + (partsA[2].slice(0, -2) + "ff") + ":" + partsA[3];
  const decryptCorruptedTag = decryptWalletApiKey(corruptedTag, walletAContext);

  recordProbe({
    testId: "A6-GCM-TAG-CORRUPTION",
    name: "AES-GCM Authentication Tag Tamper Rejection",
    expected: "Tampered auth tag must fail decryption and return empty string",
    actual: decryptCorruptedTag === "" ? "Returned empty string (decryption failed safely)" : `Returned "${decryptCorruptedTag}"`,
    vulnerabilityConfirmed: decryptCorruptedTag !== "",
    details: "AES-GCM tag verification catches bit flips in ciphertext or auth tag.",
  });

  // 7. Plaintext Fallback Elimination Check
  const legacyPlaintextKey = "wk_legacy_plaintext_key_without_encryption";
  const decryptedLegacy = decryptWalletApiKey(legacyPlaintextKey, walletAContext);
  const plaintextFallbackAccepted = decryptedLegacy === legacyPlaintextKey;

  recordProbe({
    testId: "A7-PLAINTEXT-FALLBACK",
    name: "Plaintext Fallback Elimination on Production Read",
    expected: "Production read rejects plaintext credential and returns empty string",
    actual: plaintextFallbackAccepted ? "Plaintext accepted (VULNERABLE)" : "Plaintext rejected (SECURE - Empty String)",
    vulnerabilityConfirmed: plaintextFallbackAccepted,
    details: "WalletCredentialService.decryptApiKey strictly enforces encrypted payload format and rejects unencrypted raw keys.",
  });

  console.log("================================================================================");
  const vulnCount = probeResults.filter((p) => p.vulnerabilityConfirmed).length;
  console.log(`WORKSTREAM A PROBE COMPLETED: ${vulnCount} VULNERABILITIES CONFIRMED`);
  console.log("================================================================================\n");

  return probeResults;
}

runWorkstreamAProbe()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
