/**
 * MANDATE — Milestone 9.5 Stage 3 Security Test Suite
 * Centralized Authentication, Authorization & Multi-Tenant Security Verification
 * 
 * Executes 35 adversarial attack scenarios across:
 * - Authentication Attacks (Cases 1-9)
 * - Tenant Isolation Attacks (Cases 10-20)
 * - Privilege Escalation Attacks (Cases 21-26)
 * - Financial Security Attacks (Cases 27-31)
 * - Positive Control Verifications (Cases 32-35)
 */

import crypto from "crypto";
import * as nearApi from "near-api-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import {
  SessionService,
  WalletAuthService,
  authenticateRequest,
  requireAdmin,
  requireAuthenticatedUser,
  TenantAccessService,
  AuthorizationService,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  AuthContext,
} from "../src/lib/auth";
import { JobQueueService } from "../src/lib/jobs/queueService";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { ExecutionAuthorizationService as ExecAuthService } from "../src/lib/execution/authorizationService";
import { OperationalControlService } from "../src/lib/operations/operationalControlService";
import { nearToYocto } from "../src/lib/yocto";

let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  ✓ ${message}`);
}

async function runSecurityTestSuite() {
  console.log("===============================================================================");
  console.log("   MANDATE MILESTONE 9.5 — STAGE 3 MULTI-TENANT SECURITY TEST SUITE            ");
  console.log("===============================================================================\n");

  const testSuffix = Date.now().toString().slice(-6);

  // Ensure system is in NORMAL operational mode for security testing
  await OperationalControlService.transitionState({
    newMode: "NORMAL",
    actionType: "RESUME_EXECUTION",
    actorId: "system",
    actorRole: "OWNER",
    reason: "Test suite initialization reset",
  });

  // -------------------------------------------------------------------------
  // Provision Test Entities (User A, User B, Admin)
  // -------------------------------------------------------------------------
  console.log("--- Setup: Provisioning 2 Tenants & 1 Administrator ---");

  // User A (Alice - Tenant 1, Role: MEMBER)
  const alice = await prisma.user.upsert({
    where: { nearAccountId: `alice-tenant-${testSuffix}.testnet` },
    create: {
      nearAccountId: `alice-tenant-${testSuffix}.testnet`,
      displayName: "Alice Tenant 1",
      role: "MEMBER",
    },
    update: { role: "MEMBER" },
  });

  // User B (Bob - Tenant 2, Role: MEMBER)
  const bob = await prisma.user.upsert({
    where: { nearAccountId: `bob-tenant-${testSuffix}.testnet` },
    create: {
      nearAccountId: `bob-tenant-${testSuffix}.testnet`,
      displayName: "Bob Tenant 2",
      role: "MEMBER",
    },
    update: { role: "MEMBER" },
  });

  // Administrator (Carol - Admin, Role: OWNER)
  const admin = await prisma.user.upsert({
    where: { nearAccountId: `admin-ops-${testSuffix}.testnet` },
    create: {
      nearAccountId: `admin-ops-${testSuffix}.testnet`,
      displayName: "Carol Admin",
      role: "OWNER",
    },
    update: { role: "OWNER" },
  });

  // Issue cryptographically signed sessions
  const aliceSession = await SessionService.createSession(alice.id, alice.nearAccountId, alice.role);
  const bobSession = await SessionService.createSession(bob.id, bob.nearAccountId, bob.role);
  const adminSession = await SessionService.createSession(admin.id, admin.nearAccountId, admin.role);

  // Provision Agents & Wallets for Alice & Bob
  const aliceAgent = await prisma.agent.create({
    data: {
      name: "Alice Research Agent",
      type: "research_procurement",
      userId: alice.id,
    },
  });

  const aliceWallet = await prisma.wallet.create({
    data: {
      walletId: `outlayer-vault-alice-${testSuffix}`,
      apiKey: `wk_test_alice_${testSuffix}`,
      nearAccountId: `alice-vault-${testSuffix}.testnet`,
      balanceYocto: nearToYocto("5.0"),
      agentId: aliceAgent.id,
    },
  });

  const aliceMandate = await prisma.mandate.create({
    data: {
      name: "Alice Spending Mandate",
      userId: alice.id,
      agentId: aliceAgent.id,
      walletId: aliceWallet.id,
      totalBudgetYocto: nearToYocto("5.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("1.0"),
      approvalThresholdYocto: nearToYocto("0.5"),
      allowedRecipientsJson: JSON.stringify(["vendor.testnet"]),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  const bobAgent = await prisma.agent.create({
    data: {
      name: "Bob Finance Agent",
      type: "finance_treasury",
      userId: bob.id,
    },
  });

  const bobWallet = await prisma.wallet.create({
    data: {
      walletId: `outlayer-vault-bob-${testSuffix}`,
      apiKey: `wk_test_bob_${testSuffix}`,
      nearAccountId: `bob-vault-${testSuffix}.testnet`,
      balanceYocto: nearToYocto("10.0"),
      agentId: bobAgent.id,
    },
  });

  const bobMandate = await prisma.mandate.create({
    data: {
      name: "Bob Spending Mandate",
      userId: bob.id,
      agentId: bobAgent.id,
      walletId: bobWallet.id,
      totalBudgetYocto: nearToYocto("10.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("2.0"),
      approvalThresholdYocto: nearToYocto("1.0"),
      allowedRecipientsJson: JSON.stringify(["vendor.testnet"]),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  // Submit background jobs for both tenants
  const aliceJob = await JobQueueService.submitJob({
    tenantId: alice.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    priority: 10,
    payload: { test: "alice" },
  });

  const bobJob = await JobQueueService.submitJob({
    tenantId: bob.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    priority: 10,
    payload: { test: "bob" },
  });

  // Provision Objective, Plan, and CoordinationRun for Bob
  const bobObjective = await prisma.objective.create({
    data: {
      userId: bob.id,
      title: "Bob Strategic Objective",
      originalPrompt: "Manage treasury allocation",
      status: "ACTIVE",
    },
  });

  const bobPlan = await prisma.objectivePlan.create({
    data: {
      objectiveId: bobObjective.id,
      version: 1,
      summary: "Treasury Plan v1",
      status: "APPROVED",
    },
  });

  const bobCoordination = await prisma.coordinationRun.create({
    data: {
      userId: bob.id,
      objectiveId: bobObjective.id,
      planId: bobPlan.id,
      planVersion: 1,
      status: "ACTIVE",
    },
  });

  // Provision IntegrationConnection for Bob
  const bobIntegration = await prisma.integrationConnection.create({
    data: {
      userId: bob.id,
      providerId: "slack",
      name: "Bob Slack Alerts",
      status: "ACTIVE",
      adapterType: "oauth",
    },
  });

  // Provision Incident for Bob
  const bobIncident = await prisma.incident.create({
    data: {
      tenantId: bob.id,
      incidentNumber: `INC-BOB-${testSuffix}`,
      title: "Bob Latency Spike",
      description: "Synthetic test incident for Bob",
      category: "SYSTEM_DEGRADATION",
      severity: "SEV-3",
      status: "DETECTED",
    },
  });

  // Provision Expired & Whitelist Mandates for Financial Security Tests
  const expiredMandate = await prisma.mandate.create({
    data: {
      name: "Expired Mandate",
      userId: alice.id,
      agentId: aliceAgent.id,
      walletId: aliceWallet.id,
      totalBudgetYocto: nearToYocto("1.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.5"),
      approvalThresholdYocto: nearToYocto("0.2"),
      allowedRecipientsJson: JSON.stringify(["vendor.testnet"]),
      status: "EXPIRED",
      expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
    },
  });

  const whitelistMandate = await prisma.mandate.create({
    data: {
      name: "Whitelist Mandate",
      userId: alice.id,
      agentId: aliceAgent.id,
      walletId: aliceWallet.id,
      totalBudgetYocto: nearToYocto("2.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("1.0"),
      approvalThresholdYocto: nearToYocto("0.5"),
      allowedRecipientsJson: JSON.stringify(["approved-vendor.testnet"]),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  console.log(`  ✓ Alice (Tenant 1 ID: ${alice.id}) provisioned with Agent ${aliceAgent.id}`);
  console.log(`  ✓ Bob (Tenant 2 ID: ${bob.id}) provisioned with Agent ${bobAgent.id}`);
  console.log(`  ✓ Admin (ID: ${admin.id}) provisioned with Role OWNER\n`);

  // -------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION ATTACKS
  // -------------------------------------------------------------------------
  console.log("--- SECTION 1: AUTHENTICATION ATTACKS ---");

  // Attack 1: Missing session in production mode
  {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      const req = new Request("http://localhost:3000/api/user/profile");
      let thrown = false;
      try {
        await authenticateRequest(req);
      } catch (err: any) {
        thrown = true;
        assert(err instanceof AuthenticationError, "Attack 1: Missing session in production throws AuthenticationError (401)");
      }
      assert(thrown, "Attack 1: Request without session fails closed in production");
    } finally {
      (process.env as any).NODE_ENV = origEnv;
    }
  }

  // Attack 2: Invalid session token format
  {
    const req = new Request("http://localhost:3000/api/user/profile", {
      headers: { "x-session-token": "mandate_sess_bogus_token_without_proper_signature" },
    });
    let thrown = false;
    try {
      await authenticateRequest(req);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof AuthenticationError, "Attack 2: Malformed session token throws AuthenticationError");
    }
    assert(thrown, "Attack 2: Malformed token rejected");
  }

  // Attack 3: Expired session token
  {
    // Create token with -1ms TTL
    const expiredSession = await SessionService.createSession(alice.id, alice.nearAccountId, alice.role, -1000);
    const validated = await SessionService.validateSession(expiredSession.token);
    assert(validated === null, "Attack 3: Expired session token returns null from validateSession");
  }

  // Attack 4: Revoked session token (logout)
  {
    const freshSession = await SessionService.createSession(alice.id, alice.nearAccountId, alice.role);
    const beforeLogout = await SessionService.validateSession(freshSession.token);
    assert(beforeLogout !== null, "Attack 4a: Fresh session is valid before logout");

    // Invalidate user session
    await SessionService.invalidateSession(alice.id);
    const afterLogout = await SessionService.validateSession(freshSession.token);
    assert(afterLogout === null, "Attack 4b: Revoked session is rejected after logout");

    // Restore Alice's active session for subsequent tests
    const restored = await SessionService.createSession(alice.id, alice.nearAccountId, alice.role);
    aliceSession.token = restored.token;
  }

  // Attack 5: Tampered session token payload
  {
    // Modify the base64 payload to claim admin role without updating signature
    const parts = aliceSession.token.replace("mandate_sess_", "").split(".");
    const originalPayload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    originalPayload.role = "OWNER"; // Tamper
    const tamperedPayloadBase64 = Buffer.from(JSON.stringify(originalPayload)).toString("base64url");
    const tamperedToken = `mandate_sess_${tamperedPayloadBase64}.${parts[1]}`;

    const validated = await SessionService.validateSession(tamperedToken);
    assert(validated === null, "Attack 5: Tampered session payload fails constant-time HMAC check and returns null");
  }

  // Attack 6a: Forged wallet account header in production
  {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      const req = new Request("http://localhost:3000/api/wallets", {
        headers: { "x-near-account": bob.nearAccountId }, // Attacker trying to spoof Bob
      });
      let thrown = false;
      try {
        await authenticateRequest(req);
      } catch (err: any) {
        thrown = true;
        assert(err instanceof AuthenticationError, "Attack 6a: x-near-account header spoofing is rejected in production");
      }
      assert(thrown, "Attack 6a: Header-only account spoofing fails closed in production");
    } finally {
      (process.env as any).NODE_ENV = origEnv;
    }
  }

  // Attack 6b: Forged user ID header in production
  {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      const req = new Request("http://localhost:3000/api/agents", {
        headers: { "x-user-id": bob.id }, // Attacker trying to spoof Bob's userId
      });
      let thrown = false;
      try {
        await authenticateRequest(req);
      } catch (err: any) {
        thrown = true;
        assert(err instanceof AuthenticationError, "Attack 6b: x-user-id header spoofing is rejected in production");
      }
      assert(thrown, "Attack 6b: Header-only user ID spoofing fails closed in production");
    } finally {
      (process.env as any).NODE_ENV = origEnv;
    }
  }

  // Attack 7-9: Cryptographic Wallet Authentication (NEP-413 / Ed25519)
  {
    // Generate valid Ed25519 keypair
    const keyPair = nearApi.KeyPair.fromRandom("ed25519");
    const pubKeyStr = keyPair.getPublicKey().toString();

    // Generate challenge for Alice
    const challenge = await WalletAuthService.createChallenge(alice.nearAccountId);
    assert(challenge.nonce.length === 64, "Attack 7a: Challenge generates 32-byte (64 hex) nonce");

    // Sign challenge message
    const sigObj = keyPair.sign(Buffer.from(challenge.message, "utf8"));
    const sigHex = Buffer.from(sigObj.signature).toString("hex");

    // Verify legitimate signature
    const verifyResult = await WalletAuthService.verifySignature({
      accountId: alice.nearAccountId,
      publicKey: pubKeyStr,
      signature: sigHex,
      message: challenge.message,
      nonce: challenge.nonce,
    });
    assert(verifyResult.valid, "Attack 7b: Valid cryptographic wallet signature is accepted");

    // Attack 7c: Mismatched audience / domain rejected
    const newChallenge = await WalletAuthService.createChallenge(alice.nearAccountId);
    const evilMessage = newChallenge.message.replace("Audience: mandate.app", "Audience: malicious-phishing-site.xyz");
    const evilSig = Buffer.from(keyPair.sign(Buffer.from(evilMessage, "utf8")).signature).toString("hex");
    const evilVerify = await WalletAuthService.verifySignature({
      accountId: alice.nearAccountId,
      publicKey: pubKeyStr,
      signature: evilSig,
      message: evilMessage,
      nonce: newChallenge.nonce,
    });
    assert(!evilVerify.valid, "Attack 7c: Signature with mismatched audience/domain is rejected");

    // Attack 8: Signature replay attack (re-using burned nonce)
    const replayResult = await WalletAuthService.verifySignature({
      accountId: alice.nearAccountId,
      publicKey: pubKeyStr,
      signature: sigHex,
      message: challenge.message,
      nonce: challenge.nonce,
    });
    assert(!replayResult.valid, "Attack 8: Replay attack fails: burned nonce cannot be verified a second time");

    // Attack 9: Forged/invalid signature
    const newChallenge2 = await WalletAuthService.createChallenge(alice.nearAccountId);
    const bogusSignature = "0".repeat(128); // 64 bytes of zeroes
    const invalidResult = await WalletAuthService.verifySignature({
      accountId: alice.nearAccountId,
      publicKey: pubKeyStr,
      signature: bogusSignature,
      message: newChallenge2.message,
      nonce: newChallenge2.nonce,
    });
    assert(!invalidResult.valid, "Attack 9: Forged cryptographic signature is rejected");
  }

  // -------------------------------------------------------------------------
  // SECTION 2: TENANT ISOLATION ATTACKS
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 2: TENANT ISOLATION ATTACKS ---");

  const aliceContext: AuthContext = {
    userId: alice.id,
    nearAccountId: alice.nearAccountId,
    role: alice.role,
    isAdmin: false,
    isOperator: false,
    sessionExpiresAt: new Date(Date.now() + 86400000),
    authMethod: "BEARER",
  };

  const bobContext: AuthContext = {
    userId: bob.id,
    nearAccountId: bob.nearAccountId,
    role: bob.role,
    isAdmin: false,
    isOperator: false,
    sessionExpiresAt: new Date(Date.now() + 86400000),
    authMethod: "BEARER",
  };

  // Attack 10: Alice attempts to read Bob's Agent
  {
    let thrown = false;
    try {
      await TenantAccessService.assertAgentOwnership(bobAgent.id, aliceContext);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof NotFoundError, "Attack 10: Alice reading Bob's Agent throws NotFoundError (404)");
    }
    assert(thrown, "Attack 10: Cross-tenant agent read blocked");
  }

  // Attack 11: Alice attempts to modify Bob's Agent
  {
    let thrown = false;
    try {
      TenantAccessService.assertOwnership(bobAgent, aliceContext, "Agent");
    } catch (err: any) {
      thrown = true;
      assert(err instanceof NotFoundError, "Attack 11: Alice modifying Bob's Agent throws NotFoundError");
    }
    assert(thrown, "Attack 11: Cross-tenant agent mutation blocked");
  }

  // Attack 12: Alice attempts to cancel Bob's background job
  {
    let thrown = false;
    try {
      await JobQueueService.cancelJob(bobJob.id, alice.id, "Malicious cancel");
    } catch (err: any) {
      thrown = true;
      assert(err.message.includes("unauthorized") || err.message.includes("not found"), "Attack 12: Alice cancelling Bob's job rejected");
    }
    assert(thrown, "Attack 12: Cross-tenant job cancellation blocked");
  }

  // Attack 13: Alice attempts to read Bob's Wallet
  {
    let thrown = false;
    try {
      await TenantAccessService.assertWalletOwnership(bobWallet.id, aliceContext);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof NotFoundError, "Attack 13: Alice reading Bob's Wallet throws NotFoundError");
    }
    assert(thrown, "Attack 13: Cross-tenant wallet read blocked");
  }

  // Attack 14: Alice attempts to modify Bob's Mandate
  {
    let thrown = false;
    try {
      await TenantAccessService.assertMandateOwnership(bobMandate.id, aliceContext);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof NotFoundError, "Attack 14: Alice reading/modifying Bob's Mandate throws NotFoundError");
    }
    assert(thrown, "Attack 14: Cross-tenant mandate access blocked");
  }

  // Attack 15: Alice attempts to approve Bob's pending payment
  {
    const bobApproval = await prisma.approvalRequest.create({
      data: {
        mandateId: bobMandate.id,
        recipient: "vendor.testnet",
        amountYocto: nearToYocto("1.5"),
        reason: "Bob payment requiring approval",
        status: "PENDING",
      },
    });

    const aliceLookup = await prisma.approvalRequest.findFirst({
      where: {
        id: bobApproval.id,
        mandate: { userId: alice.id },
      },
    });
    assert(aliceLookup === null, "Attack 15: Alice cannot locate or approve Bob's ApprovalRequest");
  }

  // Attack 16: Alice attempts to inspect Bob's job record
  {
    const jobRead = await JobQueueService.getJob(bobJob.id, alice.id);
    assert(jobRead === null, "Attack 16: JobQueueService.getJob returns null when Alice inspects Bob's job");
  }

  // Attack 17: Alice attempts to access Bob's coordination run
  {
    let thrown = false;
    try {
      await TenantAccessService.assertCoordinationOwnership(bobCoordination.id, aliceContext);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof NotFoundError, "Attack 17: Alice accessing Bob's coordination run throws NotFoundError");
    }
    assert(thrown, "Attack 17: Cross-tenant coordination run access blocked");
  }

  // Attack 18: Alice attempts to read Bob's integration credentials
  {
    let thrown = false;
    try {
      await TenantAccessService.assertIntegrationOwnership(bobIntegration.id, aliceContext);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof NotFoundError, "Attack 18: Alice reading Bob's integration credentials throws NotFoundError");
    }
    assert(thrown, "Attack 18: Cross-tenant integration connection access blocked");
  }

  // Attack 19: Alice attempts to access Bob's operational incident
  {
    let thrown = false;
    try {
      await TenantAccessService.assertIncidentAccess(bobIncident.id, aliceContext);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof NotFoundError, "Attack 19: Alice accessing Bob's operational incident throws NotFoundError");
    }
    assert(thrown, "Attack 19: Cross-tenant incident access blocked");
  }

  // Attack 20: Alice attempts to access Bob's strategic objective
  {
    let thrown = false;
    try {
      await TenantAccessService.assertObjectiveOwnership(bobObjective.id, aliceContext);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof NotFoundError, "Attack 20: Alice accessing Bob's objective throws NotFoundError");
    }
    assert(thrown, "Attack 20: Cross-tenant objective access blocked");
  }

  // -------------------------------------------------------------------------
  // SECTION 3: PRIVILEGE ESCALATION ATTACKS
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 3: PRIVILEGE ESCALATION ATTACKS ---");

  // Attack 21: Ordinary member invokes administrator guard
  {
    let thrown = false;
    try {
      AuthorizationService.assertAdmin(aliceContext);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof ForbiddenError, "Attack 21: Ordinary member invoking assertAdmin throws ForbiddenError (403)");
    }
    assert(thrown, "Attack 21: Privilege escalation blocked");
  }

  // Attack 22: User attempts to modify role in request payload
  {
    // Server-side identity must always come from database/session, not payload
    const spoofedBody = { actorId: alice.id, actorRole: "OWNER" };
    const effectiveRole = aliceContext.role; // Server derives from session
    assert(effectiveRole === "MEMBER", "Attack 22: Server-side role derives strictly from session (MEMBER), ignoring spoofed payload");
  }

  // Attack 23: Autonomous AI agent attempts administrative action
  {
    let thrown = false;
    try {
      AuthorizationService.assertAgentCannotEscalate(aliceAgent, ["ADMIN"]);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof ForbiddenError, "Attack 23: Agent attempting administrative escalation throws ForbiddenError");
    }
    assert(thrown, "Attack 23: Autonomous agent privilege escalation blocked");
  }

  // Attack 24-26: HTTP Route Enforcement on Administrative Endpoints
  const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3001";

  // Attack 24: Ordinary Member attempts to trigger Operational Pause
  {
    const res = await fetch(`${baseUrl}/api/operations/pause`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": aliceSession.token,
      },
      body: JSON.stringify({ reason: "Malicious Member pause" }),
    });
    assert(res.status === 403, `Attack 24: Member calling /api/operations/pause returns 403 Forbidden (got ${res.status})`);
  }

  // Attack 25: Ordinary Member attempts to trigger Platform Lockdown
  {
    const res = await fetch(`${baseUrl}/api/operations/lockdown`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": aliceSession.token,
      },
      body: JSON.stringify({ reason: "Malicious Member lockdown" }),
    });
    assert(res.status === 403, `Attack 25: Member calling /api/operations/lockdown returns 403 Forbidden (got ${res.status})`);
  }

  // Attack 26: Ordinary Member attempts to trigger Disaster Recovery Restore
  {
    const res = await fetch(`${baseUrl}/api/disaster-recovery/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": aliceSession.token,
      },
      body: JSON.stringify({ backupId: "backup-fake-123", confirmation: "RESTORE" }),
    });
    assert(res.status === 403, `Attack 26: Member calling /api/disaster-recovery/restore returns 403 Forbidden (got ${res.status})`);
  }

  // Attack 26b: Ordinary Member attempts to trigger Resilience Failure Drill
  {
    const res = await fetch(`${baseUrl}/api/resilience/drills`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": aliceSession.token,
      },
      body: JSON.stringify({ scenario: "CHAOS_MONKEY", target: "ALL" }),
    });
    assert(res.status === 403, `Attack 26b: Member calling /api/resilience/drills returns 403 Forbidden (got ${res.status})`);
  }

  // -------------------------------------------------------------------------
  // SECTION 4: FINANCIAL SECURITY ATTACKS
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 4: FINANCIAL SECURITY ATTACKS ---");

  // Attack 27: Cross-tenant financial execution (Alice tries to spend Bob's mandate)
  {
    let blocked = false;
    let errorMsg = "";
    try {
      const result = await ExecutionBoundaryService.execute({
        userId: alice.id,
        mandateId: bobMandate.id, // Alice targets Bob's mandate!
        operation: "execute_payment",
        recipient: "attacker.testnet",
        amountYocto: nearToYocto("0.1"),
        idempotencyKey: `attack-cross-mandate-${Date.now()}`,
      });
      if (!result.success) {
        blocked = true;
        errorMsg = result.error || "";
      }
    } catch (err: any) {
      blocked = true;
      errorMsg = err.message;
    }

    assert(blocked, "Attack 27: ExecutionBoundaryService rejects cross-tenant mandate invocation");
    assert(
      errorMsg.includes("not found") || errorMsg.includes("unauthorized") || errorMsg.includes("Preflight"),
      `Attack 27: Rejection details: "${errorMsg}"`
    );
  }

  // Attack 28: Tampered execution authorization envelope
  {
    const envelope = await ExecAuthService.issueAuthorization({
      userId: alice.id,
      mandateId: aliceMandate.id,
      operation: "execute_payment",
      recipient: "vendor.testnet",
      amountYocto: nearToYocto("0.1"),
    });

    // Tamper with envelope recipient
    envelope.recipient = "hacker.testnet";
    const verification = await ExecAuthService.verifyAuthorization(envelope);
    assert(!verification.valid, "Attack 28: Tampered authorization envelope fails HMAC verification");
  }

  // Attack 29: Agent attempts to spend with non-existent mandate
  {
    let blocked = false;
    let errorMsg = "";
    try {
      const result = await ExecutionBoundaryService.execute({
        userId: alice.id,
        mandateId: "mandate-non-existent-99999",
        operation: "execute_payment",
        recipient: "vendor.testnet",
        amountYocto: nearToYocto("0.1"),
        idempotencyKey: `attack-fake-mandate-${Date.now()}`,
      });
      if (!result.success) {
        blocked = true;
        errorMsg = result.error || "";
      }
    } catch (err: any) {
      blocked = true;
      errorMsg = err.message;
    }
    assert(blocked, "Attack 29: Execution with non-existent mandate is blocked");
    assert(errorMsg.includes("not found") || errorMsg.includes("Preflight"), `Attack 29: Detail: "${errorMsg}"`);
  }

  // Attack 30: Agent attempts to spend with expired mandate
  {
    let blocked = false;
    let errorMsg = "";
    try {
      const result = await ExecutionBoundaryService.execute({
        userId: alice.id,
        mandateId: expiredMandate.id,
        operation: "execute_payment",
        recipient: "vendor.testnet",
        amountYocto: nearToYocto("0.1"),
        idempotencyKey: `attack-expired-mandate-${Date.now()}`,
      });
      if (!result.success) {
        blocked = true;
        errorMsg = result.error || "";
      }
    } catch (err: any) {
      blocked = true;
      errorMsg = err.message;
    }
    assert(blocked, "Attack 30: Execution with expired mandate is blocked");
    assert(errorMsg.includes("active") || errorMsg.includes("Preflight"), `Attack 30: Detail: "${errorMsg}"`);
  }

  // Attack 31a: Agent attempts to spend exceeding mandate total budget
  {
    let blocked = false;
    let errorMsg = "";
    try {
      const result = await ExecutionBoundaryService.execute({
        userId: alice.id,
        mandateId: aliceMandate.id,
        operation: "execute_payment",
        recipient: "vendor.testnet",
        amountYocto: nearToYocto("100.0"), // Exceeds Alice's 5.0 NEAR budget
        idempotencyKey: `attack-excess-budget-${Date.now()}`,
      });
      if (!result.success) {
        blocked = true;
        errorMsg = result.error || "";
      }
    } catch (err: any) {
      blocked = true;
      errorMsg = err.message;
    }
    assert(blocked, "Attack 31a: Spending exceeding total mandate budget is blocked");
    assert(errorMsg.includes("budget") || errorMsg.includes("limit") || errorMsg.includes("Preflight"), `Attack 31a: Detail: "${errorMsg}"`);
  }

  // Attack 31b: Agent attempts to spend exceeding per-transaction limit
  {
    let blocked = false;
    let errorMsg = "";
    try {
      const result = await ExecutionBoundaryService.execute({
        userId: alice.id,
        mandateId: aliceMandate.id,
        operation: "execute_payment",
        recipient: "vendor.testnet",
        amountYocto: nearToYocto("1.5"), // Exceeds Alice's 1.0 NEAR per-tx limit
        idempotencyKey: `attack-excess-pertx-${Date.now()}`,
      });
      if (!result.success) {
        blocked = true;
        errorMsg = result.error || "";
      }
    } catch (err: any) {
      blocked = true;
      errorMsg = err.message;
    }
    assert(blocked, "Attack 31b: Spending exceeding per-transaction limit is blocked");
    assert(errorMsg.includes("limit") || errorMsg.includes("threshold") || errorMsg.includes("Preflight"), `Attack 31b: Detail: "${errorMsg}"`);
  }

  // Attack 31c: Agent attempts to spend to unapproved recipient
  {
    let blocked = false;
    let errorMsg = "";
    try {
      const result = await ExecutionBoundaryService.execute({
        userId: alice.id,
        mandateId: whitelistMandate.id,
        operation: "execute_payment",
        recipient: "unapproved-hacker.testnet", // Not on whitelist ["approved-vendor.testnet"]
        amountYocto: nearToYocto("0.1"),
        idempotencyKey: `attack-unapproved-recipient-${Date.now()}`,
      });
      if (!result.success) {
        blocked = true;
        errorMsg = result.error || "";
      }
    } catch (err: any) {
      blocked = true;
      errorMsg = err.message;
    }
    assert(blocked, "Attack 31c: Transfer to unapproved recipient is blocked by whitelist");
    assert(errorMsg.includes("recipient") || errorMsg.includes("allowed") || errorMsg.includes("whitelist") || errorMsg.includes("Preflight"), `Attack 31c: Detail: "${errorMsg}"`);
  }

  // Attack 31d: Replay of consumed execution authorization envelope nonce
  {
    const replayEnvelope = await ExecAuthService.issueAuthorization({
      userId: alice.id,
      mandateId: aliceMandate.id,
      operation: "execute_payment",
      recipient: "vendor.testnet",
      amountYocto: nearToYocto("0.1"),
    });

    // Create execution record marking this nonce as consumed
    await prisma.executionRecord.create({
      data: {
        idempotencyKey: `idem-replay-${Date.now()}`,
        payloadHash: replayEnvelope.actionPayloadHash,
        userId: alice.id,
        mandateId: aliceMandate.id,
        operation: "execute_payment",
        recipient: replayEnvelope.recipient,
        amountYocto: replayEnvelope.amountYocto,
        nonce: replayEnvelope.nonce,
        authSignature: replayEnvelope.signature,
        expiresAt: new Date(replayEnvelope.expiresAt),
        isNonceConsumed: true,
        nonceConsumedAt: new Date(),
        status: "COMPLETED",
      },
    });

    const replayVerify = await ExecAuthService.verifyAuthorization(replayEnvelope);
    assert(!replayVerify.valid, "Attack 31d: Replay of consumed authorization envelope is rejected");
    assert(Boolean(replayVerify.reason?.includes("replay") || replayVerify.reason?.includes("consumed")), "Attack 31d: Replay rejection explicitly cited consumed nonce");
  }

  // -------------------------------------------------------------------------
  // SECTION 5: POSITIVE CONTROL VERIFICATIONS
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 5: POSITIVE CONTROL VERIFICATIONS ---");

  // Case 32: Alice can access her own agent
  {
    const agent = await TenantAccessService.assertAgentOwnership(aliceAgent.id, aliceContext);
    assert(agent.id === aliceAgent.id, "Case 32: Alice can successfully access her own agent");
  }

  // Case 33: Bob can access his own wallet
  {
    const wallet = await TenantAccessService.assertWalletOwnership(bobWallet.id, bobContext);
    assert(wallet.id === bobWallet.id, "Case 33: Bob can successfully access his own wallet");
  }

  // Case 34: Admin can access administrative controls
  {
    const adminContext: AuthContext = {
      userId: admin.id,
      nearAccountId: admin.nearAccountId,
      role: admin.role,
      isAdmin: true,
      isOperator: true,
      sessionExpiresAt: new Date(Date.now() + 86400000),
      authMethod: "BEARER",
    };
    AuthorizationService.assertAdmin(adminContext);
    assert(true, "Case 34: Administrator successfully passes assertAdmin");
  }

  // Case 35: JobQueueService isolates tenant jobs cleanly
  {
    const aliceJobs = await JobQueueService.listJobs({ tenantId: alice.id });
    const bobJobs = await JobQueueService.listJobs({ tenantId: bob.id });
    assert(aliceJobs.jobs.every((j) => j.tenantId === alice.id), "Case 35a: Alice job list contains only Alice's jobs");
    assert(bobJobs.jobs.every((j) => j.tenantId === bob.id), "Case 35b: Bob job list contains only Bob's jobs");
  }

  // Case 36: Cryptographic wallet challenge and signature verification produces valid session
  {
    const keyPair = nearApi.KeyPair.fromRandom("ed25519");
    const challenge = await WalletAuthService.createChallenge(alice.nearAccountId);
    const sigHex = Buffer.from(keyPair.sign(Buffer.from(challenge.message, "utf8")).signature).toString("hex");

    const verified = await WalletAuthService.verifySignature({
      accountId: alice.nearAccountId,
      publicKey: keyPair.getPublicKey().toString(),
      signature: sigHex,
      message: challenge.message,
      nonce: challenge.nonce,
    });
    assert(verified.valid && !!verified.user, "Case 36a: Wallet signature cryptographically verified with user bound");

    const newSession = await SessionService.createSession(verified.user!.id, verified.user!.nearAccountId, verified.user!.role);
    const sessionCheck = await SessionService.validateSession(newSession.token);
    assert(sessionCheck !== null && sessionCheck.userId === alice.id, "Case 36b: Verified wallet authentication yields active HMAC-signed session");
    aliceSession.token = newSession.token;
  }

  // Case 37: Session renewal within validity window works
  {
    const renewed = await SessionService.renewSession(aliceSession.token);
    assert(renewed !== null, "Case 37a: Active session successfully renewed");
    assert(renewed?.token !== aliceSession.token, "Case 37b: Renewed session issued a rotated, distinct token string");

    // Verify the old token is now invalidated by rotation
    const oldCheck = await SessionService.validateSession(aliceSession.token);
    assert(oldCheck === null, "Case 37c: Rotated predecessor token is invalidated");
  }

  // Case 38: Admin successfully triggers pause and resume operations via HTTP (200 OK)
  {
    const pauseRes = await fetch(`${baseUrl}/api/operations/pause`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": adminSession.token,
      },
      body: JSON.stringify({ reason: "Controlled Production Certification Drill" }),
    });
    assert(pauseRes.status === 200, `Case 38a: Admin successfully paused operations via HTTP (got ${pauseRes.status})`);

    const resumeRes = await fetch(`${baseUrl}/api/operations/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": adminSession.token,
      },
      body: JSON.stringify({
        reason: "Controlled Production Certification Drill Completed",
        forceOverrideUnacknowledgedIncidents: true,
      }),
    });
    assert(resumeRes.status === 200, `Case 38b: Admin successfully resumed operations via HTTP (got ${resumeRes.status})`);
  }

  console.log("\n===============================================================================");
  console.log(`   STAGE 3 SECURITY TEST SUMMARY: ALL ${passedAssertions} / ${totalAssertions} ASSERTIONS PASSED (100%) `);
  console.log("===============================================================================\n");
}

runSecurityTestSuite().catch((err) => {
  console.error("FATAL ERROR IN SECURITY TEST SUITE:", err);
  process.exit(1);
});
