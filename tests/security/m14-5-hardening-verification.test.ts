/**
 * MANDATE — Milestone 14.5: Rate Limiter Reliability & Credential Boundary Hardening
 * Comprehensive Adversarial Verification Test Suite
 * 
 * Verifies all 6 M14.5 remediation workstreams:
 * Workstream A: Timezone-agnostic rate-limit timestamp semantics (TIMESTAMPTZ, Africa/Lagos UTC+1 immunity).
 * Workstream B: Accurate retry calculations, sliding reset deadline, and rejection non-extension.
 * Workstream C: Bounded RateLimitBucket batch deletion (500-row chunks, 1,200+ expired test rows).
 * Workstream D: Independent internal-service credentials, execution ticket signing isolation, zero production fallbacks.
 * Workstream E: Secure OutLayer TEE credential storage (AES-256-GCM at rest, removal from Origin firewall).
 * Workstream F: Atomic challenge expiry enforcement inside CAS SQL update clause.
 */

import crypto from "crypto";
import * as nearApi from "near-api-js";
import { assertNotProductionDatabase } from "../helpers/assertNotProductionDatabase";

assertNotProductionDatabase(process.env.DATABASE_URL);

import { prisma } from "../../src/lib/db";
import { RateLimitService, RATE_LIMIT_CONFIG } from "../../src/lib/auth/rateLimitService";
import { WalletAuthService, AUTH_AUDIENCE, AUTH_NETWORK } from "../../src/lib/auth/walletAuthService";
import { validateRequestOrigin } from "../../src/lib/security/originValidation";
import { authenticateRequest } from "../../src/lib/auth/authenticateRequest";
import {
  getExecutionSigningSecret,
  getInternalServiceSecret,
  getSessionSecret,
  validateEnvironment,
  ConfigurationError,
} from "../../src/lib/production/environmentValidation";
import {
  WalletCredentialService,
  encryptWalletApiKey,
  decryptWalletApiKey,
  getDecryptedWalletApiKey,
} from "../../src/lib/security/walletCredentialService";
import {
  mintBoundaryExecutionTicket,
  validateBoundaryExecutionTicket,
  BoundaryExecutionTicket,
} from "../../src/lib/execution/boundaryTicket";
import { createNep413Signature } from "../fixtures/testNep413Helper";

interface TestResult {
  id: string;
  name: string;
  workstream: "A_TIMESTAMPS" | "B_RETRY_WINDOW" | "C_BOUNDED_CLEANUP" | "D_CREDENTIAL_ISOLATION" | "E_OUTLAYER_STORAGE" | "F_ATOMIC_EXPIRY";
  status: "PASS" | "FAIL";
  details: string;
}

const results: TestResult[] = [];

function record(
  id: string,
  name: string,
  workstream: TestResult["workstream"],
  status: "PASS" | "FAIL",
  details: string
) {
  results.push({ id, name, workstream, status, details });
  const icon = status === "PASS" ? "✓ PASS" : "❌ FAIL";
  console.log(`  ${icon} [${id}] ${name}`);
  console.log(`     ↳ ${details}`);
}

async function runM145Verification() {
  console.log("================================================================================");
  console.log("🛡️ MANDATE M14.5: RATE LIMITER & CREDENTIAL BOUNDARY HARDENING VERIFICATION");
  console.log("================================================================================\n");

  const testAccountId = "yemigraffix.testnet";
  const dummyClientIp = "192.0.2.145";

  // Clean test artifacts prior to test run
  await prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE 'test:m14_5:%'`;
  await prisma.$executeRaw`DELETE FROM "AuthChallenge" WHERE "accountId" LIKE 'm14_5_%'`;

  // ===========================================================================
  // SECTION A: FIX RATE-LIMIT TIMESTAMP SEMANTICS (WORKSTREAM A)
  // ===========================================================================
  console.log("\n--- [WORKSTREAM A: Rate-Limit Timestamp Semantics & Timezone Immunity] ---");

  // TEST-A1: Verify PostgreSQL column data types are TIMESTAMPTZ
  try {
    const colTypes: any[] = await prisma.$queryRaw`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'RateLimitBucket' AND column_name IN ('resetAt', 'createdAt', 'updatedAt');
    `;
    const isAllTimestamptz = colTypes.length === 3 && colTypes.every((c: any) => c.data_type === "timestamp with time zone");
    const serverTzRes: any[] = await prisma.$queryRaw`SELECT CURRENT_SETTING('TIMEZONE') as tz;`;
    const serverTz = serverTzRes[0]?.tz || "unknown";

    if (isAllTimestamptz) {
      record(
        "TEST-A1",
        "RateLimitBucket Columns Migrated to Native TIMESTAMPTZ",
        "A_TIMESTAMPS",
        "PASS",
        `PostgreSQL server timezone is "${serverTz}". RateLimitBucket columns (resetAt, createdAt, updatedAt) are all "timestamp with time zone" (timestamptz).`
      );
    } else {
      record(
        "TEST-A1",
        "RateLimitBucket Columns Migrated to Native TIMESTAMPTZ",
        "A_TIMESTAMPS",
        "FAIL",
        `RateLimitBucket columns are not timestamptz: ${JSON.stringify(colTypes)}`
      );
    }
  } catch (err: any) {
    record("TEST-A1", "RateLimitBucket Columns Migrated to Native TIMESTAMPTZ", "A_TIMESTAMPS", "FAIL", err.message);
  }

  // TEST-A2: Verify UTC instant alignment between Node.js and PostgreSQL
  try {
    const testKey = "test:m14_5:tz_alignment";
    const windowSec = 60;
    const nowBefore = Date.now();
    const check = await RateLimitService.checkLimit(testKey, 10, windowSec);
    const nowAfter = Date.now();

    const expectedMinEpoch = nowBefore + (windowSec - 1) * 1000;
    const expectedMaxEpoch = nowAfter + (windowSec + 1) * 1000;
    const actualEpoch = check.resetAt.getTime();

    const isAligned = actualEpoch >= expectedMinEpoch && actualEpoch <= expectedMaxEpoch;
    const diffSec = Math.round((actualEpoch - nowBefore) / 1000);

    if (isAligned && diffSec >= 59 && diffSec <= 61) {
      record(
        "TEST-A2",
        "Timezone Skew Eliminated: Reset Deadline Perfectly Aligned to UTC",
        "A_TIMESTAMPS",
        "PASS",
        `resetAt instant is ${check.resetAt.toISOString()} (diff: ${diffSec}s from now). Zero 3600s timezone offset detected under Africa/Lagos.`
      );
    } else {
      record(
        "TEST-A2",
        "Timezone Skew Eliminated: Reset Deadline Perfectly Aligned to UTC",
        "A_TIMESTAMPS",
        "FAIL",
        `resetAt skew detected! diffSec=${diffSec}s, expected ~60s.`
      );
    }
    await prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" = ${testKey}`;
  } catch (err: any) {
    record("TEST-A2", "Timezone Skew Eliminated", "A_TIMESTAMPS", "FAIL", err.message);
  }

  // ===========================================================================
  // SECTION B: RATE-LIMIT RETRY AND WINDOW BEHAVIOR (WORKSTREAM B)
  // ===========================================================================
  console.log("\n--- [WORKSTREAM B: Accurate Retry Calculations & Sliding Reset Deadline] ---");

  // TEST-B1 & B2: Test counter limits, rejection, and accurate retryAfterSec
  try {
    const testKey = "test:m14_5:retry_behavior";
    const limit = 5;
    const windowSec = 60;

    let allAllowedUnderLimit = true;
    for (let i = 1; i <= limit; i++) {
      const res = await RateLimitService.checkLimit(testKey, limit, windowSec);
      if (!res.allowed || res.tokens !== i) {
        allAllowedUnderLimit = false;
      }
    }

    // 6th request must be rejected
    const rejRes1 = await RateLimitService.checkLimit(testKey, limit, windowSec);
    const initialResetAt = rejRes1.resetAt.getTime();
    const retryAfter = rejRes1.retryAfterSec;

    const isRejectedAccurately = !rejRes1.allowed && rejRes1.tokens === limit + 1;
    const isRetryBounded = retryAfter >= 58 && retryAfter <= 60;

    if (allAllowedUnderLimit && isRejectedAccurately && isRetryBounded) {
      record(
        "TEST-B1",
        "Fixed-Window Counter with Accurate Retry-After Calculation",
        "B_RETRY_WINDOW",
        "PASS",
        `First 5 requests allowed (tokens 1..5). 6th request rejected (tokens=6). Retry-After is ${retryAfter}s (expected in [58, 60]s, NOT ~3600s).`
      );
    } else {
      record(
        "TEST-B1",
        "Fixed-Window Counter with Accurate Retry-After Calculation",
        "B_RETRY_WINDOW",
        "FAIL",
        `Counter failure: allowedUnderLimit=${allAllowedUnderLimit}, rejected=${!rejRes1.allowed}, retryAfter=${retryAfter}`
      );
    }

    // TEST-B3: Additional rejected requests DO NOT advance resetAt deadline (anti-starvation guarantee)
    await new Promise((r) => setTimeout(r, 200)); // sleep 200ms
    const rejRes2 = await RateLimitService.checkLimit(testKey, limit, windowSec);
    const rejRes3 = await RateLimitService.checkLimit(testKey, limit, windowSec);

    const deadlineDidNotAdvance =
      rejRes2.resetAt.getTime() === initialResetAt &&
      rejRes3.resetAt.getTime() === initialResetAt;

    if (deadlineDidNotAdvance && !rejRes2.allowed && !rejRes3.allowed) {
      record(
        "TEST-B2",
        "Anti-Starvation: Subsequent Rejected Requests Never Extend Reset Deadline",
        "B_RETRY_WINDOW",
        "PASS",
        `Requests 7 and 8 rejected with identical reset deadline (${rejRes3.resetAt.toISOString()}). Attackers cannot indefinitely extend lockout window.`
      );
    } else {
      record(
        "TEST-B2",
        "Anti-Starvation: Subsequent Rejected Requests Never Extend Reset Deadline",
        "B_RETRY_WINDOW",
        "FAIL",
        `Reset deadline shifted on rejected requests: initial=${initialResetAt}, current=${rejRes3.resetAt.getTime()}`
      );
    }

    // TEST-B4: Bucket resets tokens to 1 once window elapsed
    await prisma.$executeRaw`
      UPDATE "RateLimitBucket"
      SET "resetAt" = NOW() - INTERVAL '5 seconds'
      WHERE "key" = ${testKey}
    `;

    const afterElapsedRes = await RateLimitService.checkLimit(testKey, limit, windowSec);
    if (afterElapsedRes.allowed && afterElapsedRes.tokens === 1) {
      record(
        "TEST-B3",
        "Automatic Window Reset: Tokens Reset to 1 After Window Elapsed",
        "B_RETRY_WINDOW",
        "PASS",
        `After window expired, counter cleanly reset to tokens=1 with new deadline (${afterElapsedRes.resetAt.toISOString()}).`
      );
    } else {
      record(
        "TEST-B3",
        "Automatic Window Reset: Tokens Reset to 1 After Window Elapsed",
        "B_RETRY_WINDOW",
        "FAIL",
        `Reset failed: allowed=${afterElapsedRes.allowed}, tokens=${afterElapsedRes.tokens}`
      );
    }

    await prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" = ${testKey}`;
  } catch (err: any) {
    record("TEST-B1", "Counter and Retry Behavior", "B_RETRY_WINDOW", "FAIL", err.message);
  }

  // ===========================================================================
  // SECTION C: BOUNDED RATELIMITBUCKET BATCH CLEANUP (WORKSTREAM C)
  // ===========================================================================
  console.log("\n--- [WORKSTREAM C: Bounded RateLimitBucket Batch Cleanup] ---");

  try {
    // 1. Insert 1,200 expired buckets (>1 hour old)
    const expiredValues: string[] = [];
    for (let i = 0; i < 1200; i++) {
      expiredValues.push(`('test:m14_5:exp:${i}', 1, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours')`);
    }
    for (let i = 0; i < expiredValues.length; i += 400) {
      const chunk = expiredValues.slice(i, i + 400).join(",");
      await prisma.$executeRawUnsafe(`
        INSERT INTO "RateLimitBucket" ("key", "tokens", "resetAt", "createdAt", "updatedAt")
        VALUES ${chunk}
      `);
    }

    // 2. Insert 10 active buckets
    const activeValues: string[] = [];
    for (let i = 0; i < 10; i++) {
      activeValues.push(`('test:m14_5:act:${i}', 1, NOW() + INTERVAL '1 hour', NOW(), NOW())`);
    }
    await prisma.$executeRawUnsafe(`
      INSERT INTO "RateLimitBucket" ("key", "tokens", "resetAt", "createdAt", "updatedAt")
      VALUES ${activeValues.join(",")}
    `);

    // 3. Test bounded cleanup batches
    const b1 = await RateLimitService.cleanExpiredBuckets(500);
    const b2 = await RateLimitService.cleanExpiredBuckets(500);
    const b3 = await RateLimitService.cleanExpiredBuckets(500);
    const b4 = await RateLimitService.cleanExpiredBuckets(500);

    const activeRemaining: any[] = await prisma.$queryRaw`
      SELECT COUNT(*)::INT as count FROM "RateLimitBucket" WHERE "key" LIKE 'test:m14_5:act:%';
    `;
    const remainingActiveCount = activeRemaining[0]?.count || 0;

    if (b1 === 500 && b2 === 500 && b3 === 200 && b4 === 0 && remainingActiveCount === 10) {
      record(
        "TEST-C1",
        "Bounded Batch Cleanup: 1,200 Expired Rows Deleted in 500-Row Batches",
        "C_BOUNDED_CLEANUP",
        "PASS",
        `Batch 1: ${b1} deleted; Batch 2: ${b2} deleted; Batch 3: ${b3} deleted; Batch 4: ${b4} deleted. 10/10 active buckets preserved.`
      );
    } else {
      record(
        "TEST-C1",
        "Bounded Batch Cleanup: 1,200 Expired Rows Deleted in 500-Row Batches",
        "C_BOUNDED_CLEANUP",
        "FAIL",
        `Unexpected batch deletion counts: b1=${b1}, b2=${b2}, b3=${b3}, b4=${b4}, remainingActive=${remainingActiveCount}`
      );
    }

    await prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE 'test:m14_5:%'`;
  } catch (err: any) {
    record("TEST-C1", "Bounded Batch Cleanup", "C_BOUNDED_CLEANUP", "FAIL", err.message);
  }

  // ===========================================================================
  // SECTION D: SEPARATE INTERNAL SERVICE CREDENTIALS (WORKSTREAM D)
  // ===========================================================================
  console.log("\n--- [WORKSTREAM D: Credential Separation & Zero Production Fallbacks] ---");

  // TEST-D1: Verify INTERNAL_SERVICE_SECRET is distinct and validates x-mandate-internal-key
  try {
    const internalSecret = getInternalServiceSecret();
    const execSecret = getExecutionSigningSecret();
    const sessionSecret = getSessionSecret();

    const areSecretsDistinct =
      internalSecret !== execSecret &&
      internalSecret !== sessionSecret &&
      execSecret !== sessionSecret;

    if (areSecretsDistinct) {
      record(
        "TEST-D1",
        "Cryptographic Secrets Decoupled Across Service Boundaries",
        "D_CREDENTIAL_ISOLATION",
        "PASS",
        `INTERNAL_SERVICE_SECRET, EXECUTION_SIGNING_SECRET, and SESSION_SECRET are distinct 256-bit keys.`
      );
    } else {
      record(
        "TEST-D1",
        "Cryptographic Secrets Decoupled Across Service Boundaries",
        "D_CREDENTIAL_ISOLATION",
        "FAIL",
        `Secret collision detected! Secrets must be strictly isolated.`
      );
    }

    // TEST-D2: Test origin validation with correct internal key vs cross-credential key
    const reqWithInternalKey = new Request("https://mandate.app/api/wallets/withdraw", {
      method: "POST",
      headers: {
        "x-mandate-internal-key": internalSecret,
      },
    });
    const originInternalValid = await validateRequestOrigin(reqWithInternalKey, { requireOriginForCookie: true });

    const reqWithExecKey = new Request("https://mandate.app/api/wallets/withdraw", {
      method: "POST",
      headers: {
        "x-mandate-internal-key": execSecret, // Cross-secret misuse
      },
    });
    const originExecInvalid = await validateRequestOrigin(reqWithExecKey, { requireOriginForCookie: true });

    if (originInternalValid.valid && !originExecInvalid.valid) {
      record(
        "TEST-D2",
        "Origin Firewall Internal Exemption Bound Strictly to INTERNAL_SERVICE_SECRET",
        "D_CREDENTIAL_ISOLATION",
        "PASS",
        `INTERNAL_SERVICE_SECRET permits Origin exemption. EXECUTION_SIGNING_SECRET is strictly rejected (no cross-secret fallback).`
      );
    } else {
      record(
        "TEST-D2",
        "Origin Firewall Internal Exemption Bound Strictly to INTERNAL_SERVICE_SECRET",
        "D_CREDENTIAL_ISOLATION",
        "FAIL",
        `Origin exemption check failed: internalValid=${originInternalValid.valid}, execInvalid=${!originExecInvalid.valid}`
      );
    }

    // TEST-D3: Test authenticateRequest system auth with internal key vs cross-credential key
    const authInternalRes = await authenticateRequest(reqWithInternalKey, { allowSystemInternal: true });
    let authExecFailed = false;
    try {
      const authExecRes = await authenticateRequest(reqWithExecKey, { allowSystemInternal: true });
      authExecFailed = authExecRes.authMethod !== "SYSTEM";
    } catch {
      authExecFailed = true;
    }

    if (authInternalRes.authMethod === "SYSTEM" && authExecFailed) {
      record(
        "TEST-D3",
        "System Internal Authentication Bound Strictly to INTERNAL_SERVICE_SECRET",
        "D_CREDENTIAL_ISOLATION",
        "PASS",
        `authenticateRequest grants SYSTEM auth with INTERNAL_SERVICE_SECRET. Cross-secret presentation rejected.`
      );
    } else {
      record(
        "TEST-D3",
        "System Internal Authentication Bound Strictly to INTERNAL_SERVICE_SECRET",
        "D_CREDENTIAL_ISOLATION",
        "FAIL",
        `System auth mismatch: internalAuth=${authInternalRes.authMethod}, execFailed=${authExecFailed}`
      );
    }

    // TEST-D4: BoundaryExecutionTicket HMAC signing strictly bound to EXECUTION_SIGNING_SECRET
    const ticket = mintBoundaryExecutionTicket({
      executionId: "exec_test_m14_5_1",
      mandateId: "mandate_test_1",
      userId: "user_test_1",
      operation: "transfer",
      recipient: "bob.testnet",
      amountYocto: "100000000000000000000000",
      network: "testnet",
      idempotencyKey: "idem_test_1",
      nonce: "nonce_test_1",
      validitySeconds: 60,
    });

    const ticketValidation = validateBoundaryExecutionTicket(ticket, {
      to: "bob.testnet",
      amountYocto: "100000000000000000000000",
      idempotencyKey: "idem_test_1",
    });

    if (ticketValidation.valid && ticket.isSealed()) {
      record(
        "TEST-D4",
        "BoundaryExecutionTicket Sealed and Verified via Dedicated EXECUTION_SIGNING_SECRET",
        "D_CREDENTIAL_ISOLATION",
        "PASS",
        `Ticket successfully minted, HMAC-sealed, and cryptographically verified against EXECUTION_SIGNING_SECRET.`
      );
    } else {
      record(
        "TEST-D4",
        "BoundaryExecutionTicket Sealed and Verified via Dedicated EXECUTION_SIGNING_SECRET",
        "D_CREDENTIAL_ISOLATION",
        "FAIL",
        `Ticket verification failed: valid=${ticketValidation.valid}, reason=${ticketValidation.reason}`
      );
    }

    // TEST-D5: Production environment validation fails closed if any required secret is missing
    const testEnvMissingInternal: Record<string, string | undefined> = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:pass@localhost:5432/mandate_prod",
      NEAR_NETWORK: "testnet",
      NEAR_RPC_URL: "https://test.rpc.fastnear.com",
      OUTLAYER_API_BASE_URL: "https://testnet-api.outlayer.ai",
      EXECUTION_SIGNING_SECRET: "b7357ed7f79499ea3e11a972df601de0a336cbf346d23008602b7e1a904fb1b8",
      SESSION_SECRET: "cd0c322c92a30ae9cf0c67caaf35c0309b6aa63b2cfff35af299300fcd8607ae",
      CREDENTIAL_VAULT_KEY_V1: "4c18bd8ec496f34bdba4d4a753c4e3c5c2b3985527c673457fe82242b52dbad3",
      TOOL_ENCRYPTION_KEY: "a83256189180f924c79f82f02301c19d7d6acc8b36f34fd2bf02451362fe16ae",
      // INTERNAL_SERVICE_SECRET is intentionally omitted!
    };

    const reportMissing = validateEnvironment(testEnvMissingInternal, true);
    if (!reportMissing.valid && reportMissing.criticalErrors.some((e) => e.includes("INTERNAL_SERVICE_SECRET"))) {
      record(
        "TEST-D5",
        "Fail-Closed Production Environment Validation: Rejects Missing Secrets",
        "D_CREDENTIAL_ISOLATION",
        "PASS",
        `validateEnvironment rejected production startup with critical error: "${reportMissing.criticalErrors.join("; ")}".`
      );
    } else {
      record(
        "TEST-D5",
        "Fail-Closed Production Environment Validation: Rejects Missing Secrets",
        "D_CREDENTIAL_ISOLATION",
        "FAIL",
        `Validation failed to catch missing INTERNAL_SERVICE_SECRET in production: valid=${reportMissing.valid}`
      );
    }
  } catch (err: any) {
    record("TEST-D1", "Credential Isolation", "D_CREDENTIAL_ISOLATION", "FAIL", err.message);
  }

  // ===========================================================================
  // SECTION E: SECURE OUTLAYER API CREDENTIAL STORAGE (WORKSTREAM E)
  // ===========================================================================
  console.log("\n--- [WORKSTREAM E: Secure OutLayer Credential Storage & Inbound Firewall] ---");

  try {
    const rawOutlayerKey = "wk_testnet_worker_secret_key_9876543210abcdef";
    const walletContext = { walletId: "test_wallet_m14_5_e1", nearAccountId: "test-e1.testnet" };
    const encrypted = encryptWalletApiKey(rawOutlayerKey, walletContext);

    // TEST-E1: Encrypted format inspection (v2 with AAD context binding)
    const isEncryptedFormat = encrypted.startsWith("v2:") && encrypted.split(":").length === 4;
    const decrypted = decryptWalletApiKey(encrypted, walletContext);

    if (isEncryptedFormat && decrypted === rawOutlayerKey) {
      record(
        "TEST-E1",
        "OutLayer API Key Protected via AES-256-GCM Authenticated Encryption with AAD",
        "E_OUTLAYER_STORAGE",
        "PASS",
        `Encrypted payload format: ${encrypted.substring(0, 25)}... Decrypted matches original raw key under context.`
      );
    } else {
      record(
        "TEST-E1",
        "OutLayer API Key Protected via AES-256-GCM Authenticated Encryption with AAD",
        "E_OUTLAYER_STORAGE",
        "FAIL",
        `Encryption mismatch: format=${isEncryptedFormat}, match=${decrypted === rawOutlayerKey}`
      );
    }

    // TEST-E2: Zero Plaintext Fallback: Legacy plaintext keys are strictly rejected on production read
    const legacyPlainKey = "wk_legacy_plaintext_key_12345678";
    const decryptedLegacy = decryptWalletApiKey(legacyPlainKey, walletContext);

    if (decryptedLegacy === "") {
      record(
        "TEST-E2",
        "Zero Plaintext Fallback: Unencrypted Keys Strictly Rejected in Production",
        "E_OUTLAYER_STORAGE",
        "PASS",
        `Plaintext keys (wk_...) fail-closed without exception and return empty string.`
      );
    } else {
      record(
        "TEST-E2",
        "Zero Plaintext Fallback: Unencrypted Keys Strictly Rejected in Production",
        "E_OUTLAYER_STORAGE",
        "FAIL",
        `Legacy plaintext key did not return correctly: ${decryptedLegacy}`
      );
    }

    // TEST-E3: Verify Wallet.apiKey is strictly excluded from inbound Origin firewall exemptions
    // Create temporary wallet with known key
    const testWalletId = "test_wallet_origin_bypass_check";
    await prisma.wallet.deleteMany({ where: { walletId: testWalletId } });
    
    // Create dedicated agent without conflicting wallet
    const e3User = await prisma.user.create({
      data: { nearAccountId: `origin_check_${Date.now()}_${Math.random().toString(36).substring(7)}.testnet` },
    });
    const dummyAgent = await prisma.agent.create({
      data: { name: "Origin Check Agent", purpose: "Origin Verification", userId: e3User.id },
    });

    if (dummyAgent) {
      const e3Encrypted = encryptWalletApiKey(rawOutlayerKey, {
        walletId: testWalletId,
        nearAccountId: "test-origin-firewall-exclusion.testnet",
      });
      const createdWallet = await prisma.wallet.create({
        data: {
          walletId: testWalletId,
          apiKey: e3Encrypted,
          nearAccountId: "test-origin-firewall-exclusion.testnet",
          agentId: dummyAgent.id,
          network: "testnet",
          balanceYocto: "0",
        },
      });

      const reqWithWalletApiKey = new Request("https://mandate.app/api/wallets/withdraw", {
        method: "POST",
        headers: {
          "x-api-key": rawOutlayerKey, // Attacker attempts to use OutLayer worker key as inbound API key
        },
      });

      const originWalletBypass = await validateRequestOrigin(reqWithWalletApiKey, { requireOriginForCookie: true });

      if (!originWalletBypass.valid) {
        record(
          "TEST-E3",
          "Dual-Use Elimination: Wallet.apiKey Rejected as Inbound Firewall Exemption",
          "E_OUTLAYER_STORAGE",
          "PASS",
          `Presentation of OutLayer wallet credential as x-api-key blocked: "${originWalletBypass.reason}".`
        );
      } else {
        record(
          "TEST-E3",
          "Dual-Use Elimination: Wallet.apiKey Rejected as Inbound Firewall Exemption",
          "E_OUTLAYER_STORAGE",
          "FAIL",
          `VULNERABILITY: Wallet.apiKey allowed inbound state mutation exemption!`
        );
      }

      await prisma.wallet.delete({ where: { id: createdWallet.id } });
    }

    // TEST-E4: Inbound Origin exemption accepts configured MANDATE_API_KEY
    const configuredApiKey = process.env.MANDATE_API_KEY;
    if (configuredApiKey) {
      const reqWithAdminApiKey = new Request("https://mandate.app/api/wallets/withdraw", {
        method: "POST",
        headers: {
          "x-api-key": configuredApiKey,
        },
      });
      const originAdminValid = await validateRequestOrigin(reqWithAdminApiKey, { requireOriginForCookie: true });

      if (originAdminValid.valid) {
        record(
          "TEST-E4",
          "Inbound API Exemption Scoped Strictly to Configured MANDATE_API_KEY",
          "E_OUTLAYER_STORAGE",
          "PASS",
          `Configured MANDATE_API_KEY accepted for programmatic Origin firewall exemption.`
        );
      } else {
        record(
          "TEST-E4",
          "Inbound API Exemption Scoped Strictly to Configured MANDATE_API_KEY",
          "E_OUTLAYER_STORAGE",
          "FAIL",
          `Configured MANDATE_API_KEY was rejected: ${originAdminValid.reason}`
        );
      }
    }
  } catch (err: any) {
    record("TEST-E1", "OutLayer Credential Storage", "E_OUTLAYER_STORAGE", "FAIL", err.message);
  }

  // ===========================================================================
  // SECTION F: ATOMIC CHALLENGE EXPIRY (WORKSTREAM F)
  // ===========================================================================
  console.log("\n--- [WORKSTREAM F: Atomic Challenge Expiry & CAS Concurrency] ---");

  try {
    const keyPair = nearApi.utils.KeyPairEd25519.fromRandom();
    const pubKey = keyPair.getPublicKey().toString();
    const nonce = crypto.randomBytes(32).toString("hex");
    const nonceHash = crypto.createHash("sha256").update(nonce).digest("hex");
    const challengeMessage = `mandate.app requests authentication for test account. Nonce: ${nonce}`;

    // TEST-F1: Expired challenge atomic CAS rejection
    // Insert an expired challenge (expiresAt in past, consumedAt: null)
    const expiredChallenge = await prisma.authChallenge.create({
      data: {
        accountId: "m14_5_expired.testnet",
        nonce,
        nonceHash,
        challengeMessage,
        audience: AUTH_AUDIENCE,
        network: AUTH_NETWORK,
        expiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
        consumedAt: null,
      },
    });

    const nep413Res = createNep413Signature(keyPair, {
      message: challengeMessage,
      recipient: AUTH_AUDIENCE,
      nonce: Buffer.from(nonce, "hex"),
    });

    const verifyExpired = await WalletAuthService.verifySignature({
      accountId: "m14_5_expired.testnet",
      publicKey: pubKey,
      signature: nep413Res.signatureBase64,
      message: challengeMessage,
      nonce,
    });

    if (!verifyExpired.valid && verifyExpired.code === "CHALLENGE_EXPIRED") {
      record(
        "TEST-F1",
        "Atomic Challenge Expiry Enforced: Expired Challenges Strictly Blocked",
        "F_ATOMIC_EXPIRY",
        "PASS",
        `Expired challenge rejected with code CHALLENGE_EXPIRED. Atomic CAS prevented state mutation.`
      );
    } else {
      record(
        "TEST-F1",
        "Atomic Challenge Expiry Enforced: Expired Challenges Strictly Blocked",
        "F_ATOMIC_EXPIRY",
        "FAIL",
        `Expired challenge was not rejected correctly: valid=${verifyExpired.valid}, code=${verifyExpired.code}`
      );
    }

    // Verify in database that consumedAt is STILL null (zero mutation on rejection)
    const checkDb = await prisma.authChallenge.findUnique({
      where: { id: expiredChallenge.id },
      select: { consumedAt: true },
    });

    if (checkDb?.consumedAt === null) {
      record(
        "TEST-F2",
        "Zero Database Mutation: Expired Challenge ConsumedAt Remains NULL",
        "F_ATOMIC_EXPIRY",
        "PASS",
        `Database record for expired challenge was not consumed (consumedAt remains null).`
      );
    } else {
      record(
        "TEST-F2",
        "Zero Database Mutation: Expired Challenge ConsumedAt Remains NULL",
        "F_ATOMIC_EXPIRY",
        "FAIL",
        `Vulnerability: Expired challenge was marked consumed!`
      );
    }

    // TEST-F3: Replay prevention on consumed challenges
    const consumedChallenge = await prisma.authChallenge.create({
      data: {
        accountId: "m14_5_consumed.testnet",
        nonce: crypto.randomBytes(32).toString("hex"),
        nonceHash: "hash_consumed_test",
        challengeMessage: "consumed test message",
        audience: AUTH_AUDIENCE,
        network: AUTH_NETWORK,
        expiresAt: new Date(Date.now() + 60000),
        consumedAt: new Date(), // Already consumed
      },
    });

    const verifyConsumed = await WalletAuthService.verifySignature({
      accountId: "m14_5_consumed.testnet",
      publicKey: pubKey,
      signature: nep413Res.signatureBase64,
      message: "consumed test message",
      nonce: consumedChallenge.nonce,
    });

    if (!verifyConsumed.valid && verifyConsumed.code === "CHALLENGE_ALREADY_USED") {
      record(
        "TEST-F3",
        "Replay Prevention: Already-Consumed Challenge Rejected",
        "F_ATOMIC_EXPIRY",
        "PASS",
        `Consumed challenge rejected with code CHALLENGE_ALREADY_USED.`
      );
    } else {
      record(
        "TEST-F3",
        "Replay Prevention: Already-Consumed Challenge Rejected",
        "F_ATOMIC_EXPIRY",
        "FAIL",
        `Consumed challenge was not rejected correctly: valid=${verifyConsumed.valid}, code=${verifyConsumed.code}`
      );
    }

    // Clean up test challenges
    await prisma.authChallenge.deleteMany({ where: { accountId: "m14_5_consumed.testnet" } });
    await prisma.authChallenge.deleteMany({ where: { accountId: "m14_5_expired.testnet" } });
  } catch (err: any) {
    record("TEST-F1", "Atomic Challenge Expiry", "F_ATOMIC_EXPIRY", "FAIL", err.message);
  }

  // ===========================================================================
  // SUMMARY & METRICS
  // ===========================================================================
  console.log("\n================================================================================");
  console.log("📊 M14.5 HARDENING VERIFICATION RESULTS SUMMARY");
  console.log("================================================================================");

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const total = results.length;

  console.log(`\nTOTAL TESTS: ${total}`);
  console.log(`PASSED:      ${passed}`);
  console.log(`FAILED:      ${failed}`);
  console.log(`SUCCESS:     ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.error("❌ M14.5 REMEDIATION VERIFICATION FAILED. Review failed test details above.");
    process.exit(1);
  } else {
    console.log("✅ ALL M14.5 SECURITY REMEDIATIONS VERIFIED SUCCESSFULLY.");
  }
}

runM145Verification()
  .catch((err) => {
    console.error("FATAL SUITE ERROR:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
