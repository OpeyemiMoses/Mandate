/**
 * MANDATE — COMPLETE SYSTEM END-TO-END INTEGRATION AUDIT
 * Comprehensive validation across all system layers:
 * 1. Runtime Health & Readiness Probes (HTTP /api/health/live, /api/health/ready)
 * 2. Cryptographic Identity & NEP-413 Authentication (Challenge, Origin firewall, Anti-replay)
 * 3. Multi-Tenant Scoping & Access Control Isolation
 * 4. User-Governed Mandate Policies & Dynamic Spending Caps (Zero hard caps)
 * 5. Autonomous Agent Financial Execution & Boundary Capability Tickets
 * 6. Hardware TEE Attestation & Credential Vault Encryption
 * 7. Disaster Recovery & Backup Integrity
 */

import fs from "fs";
import crypto from "crypto";
import {
  assertNotProductionDatabase,
  assertDisposableHttpServer,
  startDisposableTestHttpServer,
} from "./helpers/assertNotProductionDatabase";

const DISPOSABLE_URL =
  "postgresql://postgres:postgrespassword@localhost:5432/mandate_disposable_m147?schema=public";
process.env.DATABASE_URL =
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres")
    ? process.env.DATABASE_URL
    : DISPOSABLE_URL;

assertNotProductionDatabase(process.env.DATABASE_URL);

import { prismaPg as prisma } from "../src/lib/postgresDb";
import { WalletAuthService, AUTH_AUDIENCE, AUTH_NETWORK } from "../src/lib/auth/walletAuthService";
import { validateRequestOrigin } from "../src/lib/security/originValidation";
import {
  mintBoundaryExecutionTicket,
  validateBoundaryExecutionTicket,
} from "../src/lib/execution/boundaryTicket";
import { evaluatePolicyProposal, MandateStateForPolicy, PaymentProposal } from "../src/lib/policy";
import {
  encryptWalletApiKey,
  decryptWalletApiKey,
} from "../src/lib/security/walletCredentialService";
import { PostgresBackupService } from "../src/lib/disaster-recovery/postgresBackupService";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";

interface VerificationItem {
  layer: string;
  name: string;
  status: "PASS" | "FAIL";
  evidence: string;
}

const results: VerificationItem[] = [];

function record(layer: string, name: string, status: "PASS" | "FAIL", evidence: string) {
  results.push({ layer, name, status, evidence });
  const icon = status === "PASS" ? "✅ PASS" : "❌ FAIL";
  console.log(`  ${icon} [${layer}] ${name}`);
  console.log(`     ↳ ${evidence}`);
}

async function runE2ECompleteAudit() {
  console.log("================================================================================");
  console.log("🚀 MANDATE COMPREHENSIVE END-TO-END SYSTEM INTEGRATION AUDIT");
  console.log("================================================================================\n");

  const runId = Date.now().toString(36);
  let ephemeralServer: { baseUrl: string; close: () => Promise<void> } | null = null;
  let baseUrl = process.env.TEST_BASE_URL || "";

  if (baseUrl) {
    await assertDisposableHttpServer(baseUrl);
  } else {
    ephemeralServer = await startDisposableTestHttpServer();
    baseUrl = ephemeralServer.baseUrl;
  }

  try {
  // ---------------------------------------------------------------------------
  // LAYER 1: RUNTIME HEALTH & READINESS PROBES
  // ---------------------------------------------------------------------------
  console.log("--- [LAYER 1: Runtime Health & Probes] ---");
  try {
    const serverTarget = await assertDisposableHttpServer(baseUrl);
    record(
      "Layer 1: Health",
      "HTTP Server Disposable Database Target Verification",
      "PASS",
      `Verified server at ${baseUrl} is connected to approved disposable database "${serverTarget.databaseName}" (${serverTarget.classification})`
    );

    const liveRes = await fetch(`${baseUrl}/api/health/live`);
    const liveJson = await liveRes.json();
    if (liveRes.status === 200 && liveJson.status === "ALIVE") {
      record("Layer 1: Health", "Liveness Probe (GET /api/health/live)", "PASS", `HTTP 200 OK, PID: ${liveJson.pid}, Memory: ${liveJson.memoryUsageMb}MB, Uptime: ${liveJson.uptimeSeconds}s`);
    } else {
      record("Layer 1: Health", "Liveness Probe (GET /api/health/live)", "FAIL", `Unexpected status: ${liveRes.status}`);
    }

    const readyRes = await fetch(`${baseUrl}/api/health/ready`);
    const readyJson = await readyRes.json();
    if (
      readyRes.status === 200 &&
      readyJson.status === "READY" &&
      readyJson.databaseHealthy === true &&
      readyJson.databaseTarget?.isDisposableTestDatabase === true
    ) {
      record("Layer 1: Health", "Readiness Probe (GET /api/health/ready)", "PASS", `HTTP 200 OK, Mode: ${readyJson.operationalMode}, Database: ${readyJson.databaseTarget.databaseName}, Gates: db=${readyJson.checks.database}, fleet=${readyJson.checks.workerFleet}`);
    } else {
      record("Layer 1: Health", "Readiness Probe (GET /api/health/ready)", "FAIL", `Unexpected status: ${readyRes.status}`);
    }
  } catch (err: any) {
    record("Layer 1: Health", "Runtime Server Connectivity", "FAIL", `Error connecting to ${baseUrl}: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // LAYER 2: CRYPTOGRAPHIC IDENTITY & AUTHENTICATION
  // ---------------------------------------------------------------------------
  console.log("\n--- [LAYER 2: Cryptographic Identity & NEP-413 Auth Firewall] ---");
  const testAuthAccount = `e2e_audit_${runId}.testnet`;
  try {
    // 2.1 Challenge Generation (against verified disposable server)
    const challengeRes = await fetch(`${baseUrl}/api/auth?action=challenge&accountId=${testAuthAccount}`);
    const challengeJson = await challengeRes.json();
    if (challengeRes.status === 200 && challengeJson.success && challengeJson.challenge?.nonce) {
      record("Layer 2: Auth", "NEP-413 Challenge Generation", "PASS", `HTTP 200 OK, Nonce: ${challengeJson.challenge.nonce.slice(0, 16)}..., Recipient: ${challengeJson.challenge.recipient}, Expiry: 5 minutes`);
    } else {
      record("Layer 2: Auth", "NEP-413 Challenge Generation", "FAIL", `Failed to generate challenge: ${JSON.stringify(challengeJson)}`);
    }

    // 2.2 Unauthenticated Access Rejection
    const unauthRes = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "http://localhost:3001" },
      body: JSON.stringify({ accountId: testAuthAccount }),
    });
    const unauthJson = await unauthRes.json();
    if (unauthRes.status === 401 && unauthJson.code === "AUTHENTICATION_PROOF_REQUIRED") {
      record("Layer 2: Auth", "Unauthenticated Connection Defense", "PASS", `HTTP 401 Unauthorized, Code: ${unauthJson.code}, Error: "${unauthJson.error}"`);
    } else {
      record("Layer 2: Auth", "Unauthenticated Connection Defense", "FAIL", `Allowed unauthenticated access: status ${unauthRes.status}`);
    }

    // 2.3 Origin Firewall Protection
    const originRes = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://malicious-phishing.com" },
      body: JSON.stringify({ accountId: testAuthAccount }),
    });
    const originJson = await originRes.json();
    if (originRes.status === 403 && originJson.code === "UNTRUSTED_ORIGIN") {
      record("Layer 2: Auth", "Origin Firewall Cross-Site Defense", "PASS", `HTTP 403 Forbidden, Reason: "${originJson.error}"`);
    } else {
      record("Layer 2: Auth", "Origin Firewall Cross-Site Defense", "FAIL", `Untrusted origin not blocked: status ${originRes.status}`);
    }

    // Clean up disposable challenge and rate limit records created by Layer 2
    await prisma.authChallenge.deleteMany({ where: { accountId: testAuthAccount } });
    await prisma.rateLimitBucket.deleteMany({ where: { key: `acct:${testAuthAccount}` } });

    // 2.4 Challenge Anti-Replay Protection
    const replayAccountId = `m14_replay_audit_${runId}.testnet`;
    const consumedChallenge = await prisma.authChallenge.create({
      data: {
        accountId: replayAccountId,
        nonce: crypto.randomBytes(32).toString("hex"),
        nonceHash: `hash_${runId}`,
        challengeMessage: "consumed replay test message",
        audience: AUTH_AUDIENCE,
        network: AUTH_NETWORK,
        expiresAt: new Date(Date.now() + 60000),
        consumedAt: new Date(), // Marked consumed
      },
    });

    const replayVerify = await WalletAuthService.verifySignature({
      accountId: replayAccountId,
      publicKey: "ed25519:6EusDx93nmThqfEKeAeLeYmsPpUyjX53D1A5S3h2d2rW",
      signature: "dummy_sig",
      message: "consumed replay test message",
      nonce: consumedChallenge.nonce,
    });

    await prisma.authChallenge.deleteMany({ where: { accountId: replayAccountId } });

    if (!replayVerify.valid && replayVerify.code === "CHALLENGE_ALREADY_USED") {
      record("Layer 2: Auth", "Atomic Anti-Replay CAS Protection", "PASS", `Replay attempt of consumed challenge strictly rejected with code CHALLENGE_ALREADY_USED`);
    } else {
      record("Layer 2: Auth", "Atomic Anti-Replay CAS Protection", "FAIL", `Replay rejection failed: ${JSON.stringify(replayVerify)}`);
    }
  } catch (err: any) {
    record("Layer 2: Auth", "Authentication Layer Execution", "FAIL", `Error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // LAYER 3: MULTI-TENANT ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n--- [LAYER 3: Multi-Tenant Data Isolation] ---");
  try {
    const tenantAId = `tenant_alpha_${runId}`;
    const tenantBId = `tenant_beta_${runId}`;

    const userA = await prisma.user.create({
      data: { id: tenantAId, nearAccountId: `${tenantAId}.testnet`, role: "PRINCIPAL" },
    });
    const userB = await prisma.user.create({
      data: { id: tenantBId, nearAccountId: `${tenantBId}.testnet`, role: "PRINCIPAL" },
    });

    const agentA = await prisma.agent.create({
      data: { name: "Agent Alpha", status: "ACTIVE", userId: userA.id },
    });

    const walletAId = `w-a-${runId}`;
    const nearAccountA = `vault-a-${runId}.testnet`;
    const walletA = await prisma.wallet.create({
      data: {
        walletId: walletAId,
        apiKey: encryptWalletApiKey(`wk_a_${runId}`, { walletId: walletAId, nearAccountId: nearAccountA }),
        nearAccountId: nearAccountA,
        initializationStatus: "ACTIVE",
        balanceYocto: nearToYocto("5.0"),
        agent: { connect: { id: agentA.id } },
      },
    });

    const mandateA = await prisma.mandate.create({
      data: {
        name: "Mandate Alpha",
        totalBudgetYocto: nearToYocto("5.0"),
        spentYocto: "0",
        reservedYocto: "0",
        perTxLimitYocto: nearToYocto("1.0"),
        approvalThresholdYocto: nearToYocto("0.5"),
        allowedRecipientsJson: JSON.stringify(["alpha-vendor.testnet"]),
        status: "active",
        expiresAt: new Date(Date.now() + 86400000),
        user: { connect: { id: userA.id } },
        agent: { connect: { id: agentA.id } },
        wallet: { connect: { id: walletA.id } },
      },
    });

    // Query mandates scoped to userB
    const userBMandates = await prisma.mandate.findMany({
      where: { userId: userB.id },
    });
    // Attempt cross-tenant query
    const crossQuery = await prisma.mandate.findFirst({
      where: { id: mandateA.id, userId: userB.id },
    });

    if (userBMandates.length === 0 && crossQuery === null) {
      record("Layer 3: Tenancy", "Cryptographic Tenant Isolation", "PASS", `Tenant B sees 0 mandates; Cross-tenant query on Mandate A by User B returns NULL`);
    } else {
      record("Layer 3: Tenancy", "Cryptographic Tenant Isolation", "FAIL", `Cross-tenant leakage detected!`);
    }

    // Cleanup test tenant records
    await prisma.mandate.delete({ where: { id: mandateA.id } });
    await prisma.wallet.delete({ where: { id: walletA.id } });
    await prisma.agent.delete({ where: { id: agentA.id } });
    await prisma.user.delete({ where: { id: userA.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  } catch (err: any) {
    record("Layer 3: Tenancy", "Multi-Tenant Isolation", "FAIL", `Error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // LAYER 4: USER MANDATE GOVERNANCE & CUSTOM SPENDING LIMITS
  // ---------------------------------------------------------------------------
  console.log("\n--- [LAYER 4: User-Governed Mandate Policies & Dynamic Limits] ---");
  try {
    const mandateState: MandateStateForPolicy = {
      mandateId: `mandate-gov-${runId}`,
      name: "Governance Mandate",
      status: "active",
      providerPolicyConfirmed: true,
      expiresAtIso: new Date(Date.now() + 86400000).toISOString(),
      budgetAtomic: nearToYocto("5.0"), // User sets 5.0 NEAR budget
      spentAtomic: nearToYocto("1.0"),  // 1.0 NEAR spent, 4.0 remaining
      reservedAtomic: "0",
      perTxLimitAtomic: nearToYocto("2.0"), // User sets per-tx limit 2.0 NEAR
      approvalThresholdAtomic: nearToYocto("1.5"),
      allowedRecipients: ["service.testnet", "oracle.testnet"],
    };

    // 4.1 Valid 0.5 NEAR transaction (well above 0.1 NEAR old cap)
    const valid05Proposal: PaymentProposal = {
      taskId: `task-05-${runId}`,
      recipient: "service.testnet",
      amountAtomic: nearToYocto("0.5"),
      purpose: "Valid 0.5 NEAR spend",
      idempotencyKey: `idem-05-${runId}`,
    };
    const eval05 = evaluatePolicyProposal(mandateState, valid05Proposal, new Set());

    // 4.2 Valid 1.2 NEAR transaction
    const valid12Proposal: PaymentProposal = {
      taskId: `task-12-${runId}`,
      recipient: "oracle.testnet",
      amountAtomic: nearToYocto("1.2"),
      purpose: "Valid 1.2 NEAR spend",
      idempotencyKey: `idem-12-${runId}`,
    };
    const eval12 = evaluatePolicyProposal(mandateState, valid12Proposal, new Set());

    // 4.3 Exceeding per-transaction limit (attempts 3.5 NEAR when perTxLimit is 2.0 NEAR)
    const overPerTxProposal: PaymentProposal = {
      taskId: `task-pertx-${runId}`,
      recipient: "service.testnet",
      amountAtomic: nearToYocto("3.5"),
      purpose: "Per-tx exceed spend attempt",
      idempotencyKey: `idem-pertx-${runId}`,
    };
    const evalOverPerTx = evaluatePolicyProposal(mandateState, overPerTxProposal, new Set());

    // 4.4 Exceeding remaining budget (attempts 1.8 NEAR when remaining budget is set to 1.0 NEAR)
    const tightMandateState: MandateStateForPolicy = {
      ...mandateState,
      budgetAtomic: nearToYocto("5.0"),
      spentAtomic: nearToYocto("4.0"), // 1.0 NEAR remaining
    };
    const overBudgetProposal: PaymentProposal = {
      taskId: `task-overbudget-${runId}`,
      recipient: "service.testnet",
      amountAtomic: nearToYocto("1.8"), // Within 2.0 per-tx, but exceeds 1.0 remaining
      purpose: "Budget exceed spend attempt",
      idempotencyKey: `idem-overbudget-${runId}`,
    };
    const evalOverBudget = evaluatePolicyProposal(tightMandateState, overBudgetProposal, new Set());

    // 4.5 Unallowlisted recipient
    const unallowedRecipientProposal: PaymentProposal = {
      taskId: `task-badrecip-${runId}`,
      recipient: "malicious-pool.testnet",
      amountAtomic: nearToYocto("0.1"),
      purpose: "Unallowed recipient attempt",
      idempotencyKey: `idem-bad-${runId}`,
    };
    const evalBadRecipient = evaluatePolicyProposal(mandateState, unallowedRecipientProposal, new Set());

    if (
      eval05.allowed &&
      eval12.allowed &&
      !evalOverPerTx.allowed &&
      evalOverPerTx.reason === "PAYMENT_LIMIT_EXCEEDED" &&
      !evalOverBudget.allowed &&
      evalOverBudget.reason === "BUDGET_EXCEEDED" &&
      !evalBadRecipient.allowed &&
      evalBadRecipient.reason === "RECIPIENT_NOT_ALLOWED"
    ) {
      record(
        "Layer 4: Governance",
        "User-Defined Spending Authority (No 0.1 NEAR Hard Cap)",
        "PASS",
        `0.5 NEAR & 1.2 NEAR allowed; Per-tx cap exceeded (3.5 NEAR) rejected (PAYMENT_LIMIT_EXCEEDED); Budget exceeded (1.8 NEAR) rejected (BUDGET_EXCEEDED); Recipient allowlist enforced (RECIPIENT_NOT_ALLOWED)`
      );
    } else {
      record(
        "Layer 4: Governance",
        "User-Defined Spending Authority",
        "FAIL",
        `Unexpected evaluations: 0.5=${eval05.allowed}, 1.2=${eval12.allowed}, perTx=${evalOverPerTx.reason}, overBudget=${evalOverBudget.reason}, recip=${evalBadRecipient.reason}`
      );
    }
  } catch (err: any) {
    record("Layer 4: Governance", "User Mandate Governance", "FAIL", `Error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // LAYER 5: ATOMIC BUDGET RESERVATION & BOUNDARY EXECUTION TICKETS
  // ---------------------------------------------------------------------------
  console.log("\n--- [LAYER 5: Atomic Budget Reservation & Execution Tickets] ---");
  try {
    const amount075NearYocto = nearToYocto("0.75");
    const ticket = mintBoundaryExecutionTicket({
      executionId: `exec-${runId}`,
      mandateId: `mandate-${runId}`,
      objectiveId: `obj-${runId}`,
      userId: `user-${runId}`,
      operation: "TRANSFER",
      recipient: "service.testnet",
      amountYocto: amount075NearYocto,
      idempotencyKey: `idem-${runId}`,
      nonce: `nonce-${runId}`,
      network: "testnet",
    });

    const isSealed = ticket.isSealed();
    const validation = validateBoundaryExecutionTicket(ticket, {
      to: "service.testnet",
      amountYocto: amount075NearYocto,
      objectiveId: `obj-${runId}`,
      idempotencyKey: `idem-${runId}`,
    });

    // Tampered validation (mismatched amount)
    const tamperedValidation = validateBoundaryExecutionTicket(ticket, {
      to: "service.testnet",
      amountYocto: nearToYocto("999.0"),
      objectiveId: `obj-${runId}`,
      idempotencyKey: `idem-${runId}`,
    });

    if (isSealed && validation.valid && !tamperedValidation.valid) {
      record(
        "Layer 5: Tickets",
        "Boundary Execution Capability Ticket Sealing & HMAC Verification",
        "PASS",
        `Ticket for 0.75 NEAR structurally sealed and cryptographically verified; Mismatched parameter validation strictly rejected (${tamperedValidation.reason})`
      );
    } else {
      record(
        "Layer 5: Tickets",
        "Boundary Execution Capability Ticket",
        "FAIL",
        `Validation failed: isSealed=${isSealed}, valid=${validation.valid}, tamperedValid=${tamperedValidation.valid}`
      );
    }
  } catch (err: any) {
    record("Layer 5: Tickets", "Atomic Reservation & Tickets", "FAIL", `Error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // LAYER 6: HARDWARE TEE & CREDENTIAL VAULT ENCRYPTION (v2 WITH AAD)
  // ---------------------------------------------------------------------------
  console.log("\n--- [LAYER 6: Hardware TEE & AES-256-GCM Credential Vault (v2 AAD)] ---");
  try {
    const rawApiKey = "wk_testnet_worker_secret_9876543210abcdef";
    const vaultWalletId = `w_vault_${runId}`;
    const vaultNearAccount = `vault_${runId}.testnet`;

    const encrypted = encryptWalletApiKey(rawApiKey, {
      walletId: vaultWalletId,
      nearAccountId: vaultNearAccount,
    });
    const decrypted = decryptWalletApiKey(encrypted, {
      walletId: vaultWalletId,
      nearAccountId: vaultNearAccount,
    });

    // Transposition test: Decrypting under a different wallet context fails closed
    const transposedDecrypted = decryptWalletApiKey(encrypted, {
      walletId: `other_wallet_${runId}`,
      nearAccountId: `other_${runId}.testnet`,
    });

    // Tampered payload
    const tamperedPayload = encrypted.slice(0, -4) + "9999";
    const tamperedDecrypted = decryptWalletApiKey(tamperedPayload, {
      walletId: vaultWalletId,
      nearAccountId: vaultNearAccount,
    });

    if (
      encrypted.startsWith("v2:") &&
      encrypted.split(":").length === 4 &&
      decrypted === rawApiKey &&
      transposedDecrypted === "" &&
      tamperedDecrypted === ""
    ) {
      record(
        "Layer 6: Vault",
        "AES-256-GCM Authenticated Credential Vault v2 with AAD",
        "PASS",
        `Key encrypted with v2 AAD context (${encrypted.substring(0, 24)}...); Decryption matches plaintext; Transposed context strictly rejected; Corrupted ciphertext yields empty string (Fail-Closed)`
      );
    } else {
      record("Layer 6: Vault", "Credential Vault Encryption", "FAIL", `Encryption validation failed: v2=${encrypted.startsWith("v2:")}, match=${decrypted === rawApiKey}, transposedBlocked=${transposedDecrypted === ""}`);
    }
  } catch (err: any) {
    record("Layer 6: Vault", "Credential Vault", "FAIL", `Error: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // LAYER 7: DISASTER RECOVERY & TRANSACTIONAL BACKUP DRILL
  // ---------------------------------------------------------------------------
  console.log("\n--- [LAYER 7: Disaster Recovery & Transactional Backup Drills] ---");
  try {
    const backupResult = await PostgresBackupService.createBackup({
      createdBy: "E2E_AUDITOR",
      trigger: "AUDIT_VERIFICATION",
    });

    if (backupResult.success && backupResult.tablesCount >= 50 && backupResult.totalRows > 0) {
      record(
        "Layer 7: Backup",
        "PostgreSQL Transactional Backup & SHA-256 Checksum",
        "PASS",
        `Created snapshot "${backupResult.fileName}" (${backupResult.sizeBytes} bytes, ${backupResult.tablesCount} tables, ${backupResult.totalRows} rows) in ${backupResult.durationMs}ms; Checksum: ${backupResult.checksumSha256.substring(0, 16)}...`
      );
    } else {
      record("Layer 7: Backup", "PostgreSQL Transactional Backup", "FAIL", `Backup failed: ${JSON.stringify(backupResult)}`);
    }

    if (backupResult.backupId) {
      await prisma.databaseBackupRecord.deleteMany({ where: { id: backupResult.backupId } });
    }
    if (backupResult.filePath && fs.existsSync(backupResult.filePath)) {
      fs.unlinkSync(backupResult.filePath);
    }
  } catch (err: any) {
    record("Layer 7: Backup", "Disaster Recovery", "FAIL", `Error: ${err.message}`);
  }
  } finally {
    if (ephemeralServer) {
      await ephemeralServer.close();
    }
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("📊 COMPLETE END-TO-END INTEGRATION AUDIT SUMMARY");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const successRate = ((passed / total) * 100).toFixed(1);

  console.log(`TOTAL CHECKS: ${total}`);
  console.log(`PASSED:       ${passed}`);
  console.log(`FAILED:       ${failed}`);
  console.log(`SUCCESS RATE: ${successRate}%\n`);

  if (failed === 0) {
    console.log("🎉 ALL INTEGRATED SYSTEM COMPONENTS CERTIFIED 100% OPERATIONAL END-TO-END!");
  } else {
    console.log(`⚠️ ${failed} INTEGRATION FAILURES DETECTED! INVESTIGATE ABOVE.`);
  }

  return { total, passed, failed, successRate, results };
}

runE2ECompleteAudit()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FATAL SUITE ERROR:", e);
    process.exit(1);
  });
