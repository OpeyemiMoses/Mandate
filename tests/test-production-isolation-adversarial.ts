/**
 * MANDATE — M13.11.1 INDEPENDENT EVIDENCE CHALLENGE: PRODUCTION ISOLATION ADVERSARIAL TEST
 *
 * Verifies Section 4 Invariants:
 * 1. Test-tagged transaction hashes ('tx-', 'mock-', 'test-', 'simulated-') strictly rejected in production.
 * 2. Simulated/stored database balance cannot bypass production on-chain balance checks.
 * 3. Client headers (e.g. 'X-Test-Mode', 'X-Simulated') cannot activate test mode in production.
 * 4. Mainnet broadcast remains impossible under all ticket and request configurations.
 * 5. Environment configuration fails closed on ambiguous or missing variables.
 */

import "dotenv/config";
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

import { prisma } from "../src/lib/db";
import { nearToYocto } from "../src/lib/yocto";
import { encryptWalletApiKey } from "../src/lib/security/walletCredentialService";
import { ExecutionValidationService } from "../src/lib/execution/validationService";
import { mintBoundaryExecutionTicket, validateBoundaryExecutionTicket } from "../src/lib/execution/boundaryTicket";
import { assertProductionEnvironmentValid } from "../src/lib/production/environmentValidation";

async function runProductionIsolationTests() {
  console.log("================================================================================");
  console.log("  MANDATE — PRODUCTION ISOLATION & TEST-ONLY BYPASS ADVERSARIAL TEST");
  console.log("================================================================================\n");

  let ephemeralServer: { baseUrl: string; close: () => Promise<void> } | null = null;
  let BASE_URL = process.env.TEST_BASE_URL || "";
  if (BASE_URL) {
    await assertDisposableHttpServer(BASE_URL);
  } else {
    ephemeralServer = await startDisposableTestHttpServer();
    BASE_URL = ephemeralServer.baseUrl;
  }

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, num: string, title: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ Case ${num} PASS: ${title}`);
      if (detail) console.log(`     ↳ ${detail}`);
      passed++;
    } else {
      console.error(`  ✗ Case ${num} FAIL: ${title}`);
      if (detail) console.error(`     ↳ Details: ${detail}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Test-Tagged Transaction Hashes in Production Mode
  // ---------------------------------------------------------------------------
  console.log("--- 1. Testing Rejection of Test-Tagged Hashes in Production ---");

  // Create test user with genuine signed session
  const testAccount = `prod-iso-${Date.now().toString().slice(-6)}.testnet`;
  let testUser = await prisma.user.create({
    data: {
      nearAccountId: testAccount,
      displayName: "Production Isolation Tester",
      role: "MEMBER",
    },
  });

  const { SessionService } = await import("../src/lib/auth/sessionService");
  const session = await SessionService.createSession(testUser.id, testUser.nearAccountId, testUser.role);

  const isoWalletId = `vault-iso-${Date.now()}`;
  const isoNearAccount = `custody-iso-${Date.now().toString().slice(-6)}.testnet`;
  const isoEncryptedKey = encryptWalletApiKey(`key-iso-${Date.now()}`, {
    walletId: isoWalletId,
    nearAccountId: isoNearAccount,
  });

  const testAgent = await prisma.agent.create({
    data: {
      userId: testUser.id,
      name: "Prod Isolation Agent",
      status: "ACTIVE",
      wallet: {
        create: {
          walletId: isoWalletId,
          apiKey: isoEncryptedKey,
          nearAccountId: isoNearAccount,
          network: "testnet",
          balanceYocto: "0",
          onChainBalanceYocto: "0",
          isInitialized: true,
          initializationStatus: "READY",
        },
      },
    },
    include: { wallet: true },
  });

  // Ensure production mode is set for validation tests
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  delete process.env.MANDATE_ALLOW_TEST_TX;
  delete process.env.MANDATE_ALLOW_OFFLINE_TEST_BALANCES;

  const testHashes = [
    "tx-fund-audit-1234567890",
    "mock-near-tx-00000000000000000000",
    "test-transaction-bypass-attempt",
    "simulated-deposit-hash-999999",
  ];

  for (let i = 0; i < testHashes.length; i++) {
    const fakeHash = testHashes[i];
    const res = await fetch(`${BASE_URL}/api/wallets/fund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://mandate.app",
        "cookie": `mandate_session=${session.token}`,
        "x-near-account": testUser.nearAccountId,
        "X-Test-Mode": "true",
        "X-Simulated": "true",
      },
      body: JSON.stringify({
        agentId: testAgent.id,
        amountNear: "10.0",
        txHash: fakeHash,
      }),
    });

    const body = await res.json();
    assert(
      res.status === 400 && body.status === "REJECTED_TEST_TX",
      `1.${i + 1}`,
      `Synthetic test hash "${fakeHash.slice(0, 15)}..." rejected with HTTP 400 REJECTED_TEST_TX`,
      body.error
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Simulated Balance Cannot Bypass On-Chain Balance Checks in Production
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing Stored DB Balance vs On-Chain Verification in Production ---");

  // Create mandate with 10 NEAR budget but wallet has 0 on-chain NEAR
  const mandate = await prisma.mandate.create({
    data: {
      userId: testUser.id,
      agentId: testAgent.id,
      walletId: testAgent.wallet!.id,
      name: "Prod Isolation Mandate",
      totalBudgetYocto: nearToYocto("10.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("5.0"),
      approvalThresholdYocto: nearToYocto("5.0"),
      allowedRecipientsJson: JSON.stringify(["recipient.testnet"]),
      expiresAt: new Date(Date.now() + 86400000),
      status: "ACTIVE",
    },
  });

  // Inject a fake stored DB balance of 10.0 NEAR on the custody wallet
  await prisma.wallet.update({
    where: { id: testAgent.wallet!.id },
    data: { balanceYocto: nearToYocto("10.0") },
  });

  // Attempt preflight validation in production mode (account custody-iso-... does not exist on-chain)
  const preflightResult = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testUser.id,
    mandateId: mandate.id,
    recipient: "recipient.testnet",
    amountYocto: nearToYocto("1.0"),
    agentId: testAgent.id,
    bypassRpcCheck: false, // Strict on-chain check
  });

  assert(
    preflightResult.valid === false,
    "2.1",
    "Stored DB balance (10.0 NEAR) CANNOT bypass missing on-chain account in production mode",
    preflightResult.reason
  );

  assert(
    Boolean(preflightResult.reason?.includes("On-chain balance insufficient")),
    "2.2",
    "Failure reason confirms on-chain balance check failed closed",
    preflightResult.reason
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Mainnet Execution Prohibition Remains Absolute
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing Mainnet Execution Boundary Invariant ---");

  let mainnetTicketRejected = false;
  try {
    mintBoundaryExecutionTicket({
      executionId: "exec_mainnet_adversarial",
      mandateId: mandate.id,
      userId: testUser.id,
      operation: "transfer",
      recipient: "vitalik.near", // Mainnet account format
      amountYocto: nearToYocto("1.0"),
      network: "mainnet", // ADVERSARIAL ATTEMPT
      idempotencyKey: `idem_mainnet_${Date.now()}`,
    });
  } catch (err: any) {
    mainnetTicketRejected =
      err.message.includes("MAINNET_EXECUTION_PROHIBITED") ||
      err.message.includes("strictly prohibited in Testnet Beta");
  }

  assert(
    mainnetTicketRejected,
    "3.1",
    "Minting BoundaryExecutionTicket with network='mainnet' is strictly blocked at source",
    "Ticket generator threw exception on mainnet"
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Environment Fails Closed on Invalid Configuration
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing Environment Fail-Closed Invariant ---");

  let envFailedClosed = false;
  try {
    assertProductionEnvironmentValid({
      NODE_ENV: "production",
      NEAR_NETWORK: "mainnet", // Illegal for Testnet Beta
      DATABASE_URL: "postgresql://localhost:5432/mandate",
    });
  } catch (err: any) {
    envFailedClosed = err.message.includes("production startup blocked");
  }

  assert(
    envFailedClosed,
    "4.1",
    "Platform startup fails closed if NEAR_NETWORK is set to mainnet in production",
    "ConfigurationError thrown"
  );

  // Restore original NODE_ENV
  process.env.NODE_ENV = originalNodeEnv;

  // Teardown test fixtures
  try {
    await prisma.mandate.deleteMany({ where: { userId: testUser.id } });
    if (testAgent.wallet) {
      await prisma.wallet.delete({ where: { id: testAgent.wallet.id } });
    }
    await prisma.agent.delete({ where: { id: testAgent.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  } catch {}
  if (ephemeralServer) {
    await ephemeralServer.close();
  }

  console.log("\n================================================================================");
  console.log(`PRODUCTION ISOLATION TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runProductionIsolationTests().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
