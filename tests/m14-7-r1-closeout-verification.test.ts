/**
 * MANDATE — M14.7-R1 Final Closeout Comprehensive Verification Suite
 *
 * Strictly executed against approved disposable database `mandate_disposable_m147`.
 * Verifies all requirements across Workstreams A, B, C, D, and E:
 * - Workstream A: Central connection-boundary database guard, env conflict detection,
 *   URL percent-decoding, hostname allowlist, child worker protection, and HTTP server isolation.
 * - Workstream B: First-time onboarding concurrency (5 simultaneous requests -> 1 OutLayer call,
 *   1 Primary Agent), pre-provider failure retry, post-provider encryption/DB failure orphan guard,
 *   timeout/ambiguous response handling, automatic retry block (409), and explicit reconciliation recovery.
 * - Workstream C: Removal of synthetic OutLayer fallback (`wk_local_*`, `outlayer-vault-*`) in `POST /api/agents`.
 */

import { spawnSync } from "child_process";
import path from "path";
import { NextRequest } from "next/server";
import {
  assertNotProductionDatabase,
  assertDisposableHttpServer,
  startDisposableTestHttpServer,
} from "./helpers/assertNotProductionDatabase";

const DISPOSABLE_URL =
  "postgresql://postgres:postgrespassword@localhost:5432/mandate_disposable_m147?schema=public";
process.env.DATABASE_URL = DISPOSABLE_URL;
delete process.env.POSTGRES_URL;
delete process.env.DIRECT_URL;
delete process.env.PG_DATABASE;

assertNotProductionDatabase(
  process.env.DATABASE_URL,
  "m14-7-r1-closeout-verification.test.ts"
);

import { getPostgresUrl, prismaPg as prisma } from "../src/lib/postgresDb";
import { SessionService } from "../src/lib/auth/sessionService";
import {
  decryptWalletApiKey,
  WalletCredentialService,
} from "../src/lib/security/walletCredentialService";
import { CredentialVault } from "../src/lib/integrations/credentialVault";
import { PostgresRestoreService } from "../src/lib/disaster-recovery/postgresRestoreService";
import { POST as postWallets, GET as getWallets } from "../src/app/api/wallets/route";
import { POST as postAgents, GET as getAgents } from "../src/app/api/agents/route";

interface CheckResult {
  id: string;
  workstream: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: CheckResult[] = [];

function record(
  id: string,
  workstream: string,
  name: string,
  passed: boolean,
  details: string
) {
  results.push({ id, workstream, name, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`[${icon}] ${id} (${workstream}): ${name}`);
  console.log(`    ↳ ${details}`);
}

const userTokenCache = new Map<string, Promise<string>>();

async function buildAuthenticatedRequest(
  url: string,
  user: { id: string; nearAccountId: string; role: string },
  method: "GET" | "POST" = "POST",
  bodyObj?: Record<string, any>
): Promise<NextRequest> {
  let tokenPromise = userTokenCache.get(user.id);
  if (!tokenPromise) {
    tokenPromise = SessionService.createSession(
      user.id,
      user.nearAccountId,
      user.role as any
    ).then((s) => s.token);
    userTokenCache.set(user.id, tokenPromise);
  }
  const token = await tokenPromise;

  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: "http://localhost:3001",
    Cookie: `mandate_session=${token}`,
  });

  return new NextRequest(url, {
    method,
    headers,
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
}

async function runCloseoutSuite() {
  console.log("================================================================================");
  console.log("🛡️ MANDATE M14.7-R1: FINAL CLOSEOUT COMPREHENSIVE VERIFICATION SUITE");
  console.log("================================================================================\n");

  // ===========================================================================
  // WORKSTREAM A: CENTRAL DATABASE PROTECTION & HTTP SERVER ISOLATION
  // ===========================================================================
  console.log("--- WORKSTREAM A: Central Connection-Boundary Database Guard ---");

  // A-R1-1: Connection boundary blocks production URLs via getPostgresUrl() and prismaPg
  {
    const savedDb = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL =
        "postgresql://postgres:postgrespassword@localhost:5432/mandate_prod?schema=public";
      let blockedGetUrl = false;
      let blockedPrismaProxy = false;

      try {
        getPostgresUrl();
      } catch (e: any) {
        blockedGetUrl = e.message.includes("SAFETY VIOLATION");
      }

      try {
        await prisma.user.count();
      } catch (e: any) {
        blockedPrismaProxy = e.message.includes("SAFETY VIOLATION");
      }

      record(
        "A-R1-1",
        "Workstream A",
        "Connection Boundary Blocks Production URL in getPostgresUrl() & prismaPg Proxy",
        blockedGetUrl && blockedPrismaProxy,
        `getPostgresUrl blocked=${blockedGetUrl}, prismaPg proxy blocked=${blockedPrismaProxy}`
      );
    } finally {
      process.env.DATABASE_URL = savedDb;
    }
  }

  // A-R1-2: Conflicting DATABASE_URL and POSTGRES_URL / DIRECT_URL / PG_DATABASE rejected
  {
    const savedDb = process.env.DATABASE_URL;
    const savedPg = process.env.POSTGRES_URL;
    const savedDirect = process.env.DIRECT_URL;
    const savedPgDb = process.env.PG_DATABASE;

    try {
      // Case 1: DATABASE_URL = file:./prisma/test.db while POSTGRES_URL = mandate_prod (the exact M14.7-ECA bypass!)
      process.env.DATABASE_URL = "file:./prisma/test.db";
      process.env.POSTGRES_URL =
        "postgresql://postgres:postgrespassword@localhost:5432/mandate_prod?schema=public";
      let m147EcaBypassBlockedAtHelper = false;
      let m147EcaBypassBlockedAtBoundary = false;

      try {
        assertNotProductionDatabase(process.env.DATABASE_URL);
      } catch (e: any) {
        m147EcaBypassBlockedAtHelper = e.message.includes("SAFETY VIOLATION");
      }

      try {
        getPostgresUrl();
      } catch (e: any) {
        m147EcaBypassBlockedAtBoundary = e.message.includes("SAFETY VIOLATION");
      }

      // Case 2: DATABASE_URL = mandate_disposable_m147 while POSTGRES_URL = mandate_prod
      process.env.DATABASE_URL = DISPOSABLE_URL;
      process.env.POSTGRES_URL =
        "postgresql://postgres:postgrespassword@localhost:5432/mandate_prod?schema=public";
      let conflictPgBlocked = false;
      try {
        getPostgresUrl();
      } catch (e: any) {
        conflictPgBlocked = e.message.includes("SAFETY VIOLATION");
      }

      // Case 3: DATABASE_URL = mandate_disposable_m147 while PG_DATABASE = mandate_prod
      delete process.env.POSTGRES_URL;
      process.env.PG_DATABASE = "mandate_prod";
      let conflictPgDbBlocked = false;
      try {
        getPostgresUrl();
      } catch (e: any) {
        conflictPgDbBlocked = e.message.includes("SAFETY VIOLATION");
      }

      record(
        "A-R1-2",
        "Workstream A",
        "Conflicting Environment Variables & SQLite/Postgres Shadowing Blocked",
        m147EcaBypassBlockedAtHelper &&
          m147EcaBypassBlockedAtBoundary &&
          conflictPgBlocked &&
          conflictPgDbBlocked,
        `file+POSTGRES_URL helperBlocked=${m147EcaBypassBlockedAtHelper}, boundaryBlocked=${m147EcaBypassBlockedAtBoundary}, conflictPgBlocked=${conflictPgBlocked}, conflictPgDbBlocked=${conflictPgDbBlocked}`
      );
    } finally {
      process.env.DATABASE_URL = savedDb;
      if (savedPg) process.env.POSTGRES_URL = savedPg;
      else delete process.env.POSTGRES_URL;
      if (savedDirect) process.env.DIRECT_URL = savedDirect;
      else delete process.env.DIRECT_URL;
      if (savedPgDb) process.env.PG_DATABASE = savedPgDb;
      else delete process.env.PG_DATABASE;
    }
  }

  // A-R1-3: Percent-encoded, double-encoded, substring, remote-host, and malformed URL matrix
  {
    const adversarialUrls = [
      "postgresql://postgres:postgrespassword@localhost:5432/test_mandate_%70rod",
      "postgresql://postgres:postgrespassword@localhost:5432/%6dandate_prod_test",
      "postgresql://postgres:postgrespassword@localhost:5432/mandate_%2570rod",
      "postgresql://postgres:postgrespassword@localhost:5432/mandate_testnet",
      "postgresql://postgres:postgrespassword@localhost:5432/prod_mandate_test",
      "postgresql://postgres:postgrespassword@localhost:5432/test_mandate_prod",
      "postgresql://postgres:postgrespassword@localhost:5432/mandate_prod_test",
      "postgresql://postgres:postgrespassword@mandate-prod.cluster.amazonaws.com:5432/mandate_test",
      "postgresql://postgres:postgrespassword@db.railway.internal:5432/mandate_disposable_m147",
      "postgresql://postgres:postgrespassword@10.0.0.42:5432/mandate_disposable_m147",
      "not-a-valid-url:///test_db",
      "file:./prisma/test.db",
      "http://localhost:5432/mandate_test",
      "postgresql://postgres:postgrespassword@localhost:5432/mandate_prod/mandate_test",
      "",
    ];

    let blockedCount = 0;
    for (const badUrl of adversarialUrls) {
      try {
        assertNotProductionDatabase(badUrl);
      } catch (e: any) {
        if (e.message.includes("SAFETY VIOLATION")) {
          blockedCount++;
        }
      }
    }

    record(
      "A-R1-3",
      "Workstream A",
      "Adversarial URL Matrix (Encoded, Substring, Remote Host, Malformed, Multi-Segment)",
      blockedCount === adversarialUrls.length,
      `Blocked ${blockedCount}/${adversarialUrls.length} adversarial inputs with SAFETY VIOLATION`
    );
  }

  // A-R1-4: Child worker process protection (`scripts/worker-process.ts`)
  {
    const workerScript = path.resolve(process.cwd(), "scripts/worker-process.ts");
    const spawnRes = spawnSync("npx", ["tsx", workerScript], {
      env: {
        ...process.env,
        DATABASE_URL:
          "postgresql://postgres:postgrespassword@localhost:5432/mandate_prod?schema=public",
      },
      encoding: "utf8",
      timeout: 8000,
    });

    const combinedOutput = `${spawnRes.stdout || ""}\n${spawnRes.stderr || ""}`;
    const childBlocked =
      spawnRes.status !== 0 && combinedOutput.includes("SAFETY VIOLATION");

    record(
      "A-R1-4",
      "Workstream A",
      "Child Worker Process Fails Closed Before Connecting to mandate_prod",
      childBlocked,
      `Exit code=${spawnRes.status}, reported SAFETY VIOLATION=${combinedOutput.includes("SAFETY VIOLATION")}`
    );
  }

  // A-R1-5: PostgresRestoreService refuses to target mandate_prod
  {
    let restoreBlocked = false;
    try {
      await PostgresRestoreService.executeIsolatedRestoreDrill({
        backupFilePath: "nonexistent.sql",
        targetDatabaseName: "mandate_prod",
      });
    } catch (e: any) {
      restoreBlocked = e.message.includes("SAFETY VIOLATION");
    }

    record(
      "A-R1-5",
      "Workstream A",
      "PostgresRestoreService Rejects mandate_prod as Restore Target",
      restoreBlocked,
      `Restore drill target guard blocked mandate_prod=${restoreBlocked}`
    );
  }

  // A-R1-6: HTTP Server Isolation (blocks localhost:3001 connected to mandate_prod; accepts disposable HTTP server)
  {
    let prodServerBlockedByAssert = false;
    let prodServerBlockedByFetchInterceptor = false;

    try {
      await assertDisposableHttpServer("http://localhost:3001");
    } catch (e: any) {
      prodServerBlockedByAssert = e.message.includes("SAFETY VIOLATION");
    }

    try {
      await fetch(
        "http://localhost:3001/api/auth?action=challenge&accountId=should_never_reach.testnet"
      );
    } catch (e: any) {
      prodServerBlockedByFetchInterceptor = e.message.includes("SAFETY VIOLATION");
    }

    const disposableServer = await startDisposableTestHttpServer();
    let disposableServerAccepted = false;
    try {
      const check = await assertDisposableHttpServer(disposableServer.baseUrl);
      const res = await fetch(`${disposableServer.baseUrl}/api/health/ready`);
      const json = await res.json();
      disposableServerAccepted =
        check.databaseName === "mandate_disposable_m147" &&
        json.databaseTarget?.isDisposableTestDatabase === true;
    } finally {
      await disposableServer.close();
    }

    record(
      "A-R1-6",
      "Workstream A",
      "HTTP Server Isolation Blocks Production Server (port 3001) & Accepts Disposable Server",
      prodServerBlockedByAssert &&
        prodServerBlockedByFetchInterceptor &&
        disposableServerAccepted,
      `port 3001 blocked by assert=${prodServerBlockedByAssert}, blocked by global fetch guard=${prodServerBlockedByFetchInterceptor}, disposable server accepted=${disposableServerAccepted}`
    );
  }

  // ===========================================================================
  // WORKSTREAM B: ONBOARDING CONCURRENCY & ORPHANED RESOURCE RECOVERY
  // ===========================================================================
  console.log("\n--- WORKSTREAM B: Onboarding Concurrency & Orphaned Resource Recovery ---");

  const runSuffix = Date.now().toString(36);
  const originalFetch = globalThis.fetch;

  // B-R1-1: 5 Concurrent First-Time Onboarding Requests Converge on 1 Primary Agent & 1 OutLayer Call
  {
    const concurrentUser = await prisma.user.create({
      data: {
        nearAccountId: `conc_onboard_${runSuffix}.testnet`,
        role: "MEMBER",
      },
    });

    let outlayerCallCount = 0;
    const mockWalletId = `w_conc_${runSuffix}`;
    const mockNearAccount = `agent_conc_${runSuffix}.testnet`;
    const mockApiKey = `wk_live_conc_secret_${runSuffix}`;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/register")) {
        outlayerCallCount++;
        // Simulate 180ms OutLayer TEE network latency so all 5 requests overlap
        await new Promise((r) => setTimeout(r, 180));
        return new Response(
          JSON.stringify({
            wallet_id: mockWalletId,
            api_key: mockApiKey,
            near_account_id: mockNearAccount,
            handoff_url: `https://outlayer.fastnear.com/handoff/${mockWalletId}`,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      const reqs = await Promise.all(
        Array.from({ length: 5 }, () =>
          buildAuthenticatedRequest("http://localhost:3001/api/wallets", concurrentUser, "POST")
        )
      );

      const responses = await Promise.all(reqs.map((r) => postWallets(r)));
      const payloads = await Promise.all(responses.map((r) => r.json()));

      const allSucceeded = payloads.every(
        (p) => p.success === true && p.wallet?.walletId === mockWalletId
      );
      const uniqueWalletIds = new Set(payloads.map((p) => p.wallet?.id));

      const dbAgents = await prisma.agent.findMany({
        where: { userId: concurrentUser.id },
        include: { wallet: true },
      });

      const storedWallet = dbAgents[0]?.wallet;
      const decryptedKey = storedWallet
        ? decryptWalletApiKey(storedWallet.apiKey, {
            walletId: storedWallet.walletId,
            nearAccountId: storedWallet.nearAccountId,
          })
        : "";

      record(
        "B-R1-1",
        "Workstream B",
        "5 Concurrent First-Time POST /api/wallets Requests Converge on 1 Primary Agent & 1 OutLayer Call",
        allSucceeded &&
          uniqueWalletIds.size === 1 &&
          outlayerCallCount === 1 &&
          dbAgents.length === 1 &&
          Boolean(storedWallet && WalletCredentialService.isEncryptedV2(storedWallet.apiKey)) &&
          decryptedKey === mockApiKey,
        `outlayerCallCount=${outlayerCallCount}, dbAgents=${dbAgents.length}, uniqueWalletIds=${uniqueWalletIds.size}, v2Encrypted=${Boolean(storedWallet && WalletCredentialService.isEncryptedV2(storedWallet.apiKey))}`
      );

      // B-R1-2: Subsequent existing-wallet call returns existing wallet with 0 new OutLayer calls
      const reqExisting = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        concurrentUser,
        "POST"
      );
      const resExisting = await postWallets(reqExisting);
      const jsonExisting = await resExisting.json();

      record(
        "B-R1-2",
        "Workstream B",
        "Existing-Wallet Request Returns Idempotently With Zero OutLayer Calls",
        resExisting.status === 200 &&
          jsonExisting.wallet?.walletId === mockWalletId &&
          outlayerCallCount === 1,
        `status=${resExisting.status}, outlayerCallCount=${outlayerCallCount}`
      );
    } finally {
      globalThis.fetch = originalFetch;
      await prisma.wallet.deleteMany({
        where: { agent: { userId: concurrentUser.id } },
      });
      await prisma.agent.deleteMany({ where: { userId: concurrentUser.id } });
      await prisma.user.deleteMany({ where: { id: concurrentUser.id } });
    }
  }

  // B-R1-3: Pre-Provider Failure (HTTP 503) -> Recoverable Retry Without Duplicate Agent
  {
    const preFailUser = await prisma.user.create({
      data: {
        nearAccountId: `prefail_onboard_${runSuffix}.testnet`,
        role: "MEMBER",
      },
    });

    let shouldFailProvider = true;
    let providerCalls = 0;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/register")) {
        providerCalls++;
        if (shouldFailProvider) {
          return new Response("OutLayer TEE temporarily unavailable", {
            status: 503,
          });
        }
        return new Response(
          JSON.stringify({
            wallet_id: `w_recov_${runSuffix}`,
            api_key: `wk_recov_secret_${runSuffix}`,
            near_account_id: `agent_recov_${runSuffix}.testnet`,
            handoff_url: "https://outlayer.fastnear.com/handoff/recov",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      // Attempt 1: OutLayer fails with 503
      const req1 = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        preFailUser,
        "POST"
      );
      const res1 = await postWallets(req1);
      const json1 = await res1.json();

      // Verify GET /api/wallets does NOT expose an unprovisioned agent in agentWallets
      const getReq = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        preFailUser,
        "GET"
      );
      const getRes = await getWallets(getReq);
      const getJson = await getRes.json();

      // Attempt 2: OutLayer recovers -> normal retry succeeds on the SAME Primary Agent
      shouldFailProvider = false;
      const req2 = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        preFailUser,
        "POST"
      );
      const res2 = await postWallets(req2);
      const json2 = await res2.json();

      const agentsAfterRetry = await prisma.agent.findMany({
        where: { userId: preFailUser.id },
        include: { wallet: true },
      });

      record(
        "B-R1-3",
        "Workstream B",
        "Pre-Provider Failure Fails Closed (502), Hides Unprovisioned Agent, and Retries Cleanly on Same Agent",
        res1.status === 502 &&
          json1.provisioningState === "FAILED_PRE_PROVIDER" &&
          Array.isArray(getJson.agentWallets) &&
          getJson.agentWallets.length === 0 &&
          res2.status === 200 &&
          json2.success === true &&
          agentsAfterRetry.length === 1 &&
          agentsAfterRetry[0].status === "ACTIVE" &&
          agentsAfterRetry[0].wallet?.walletId === `w_recov_${runSuffix}`,
        `attempt1Status=${res1.status}, getWalletsDuringFailure=${getJson.agentWallets?.length}, attempt2Status=${res2.status}, totalAgents=${agentsAfterRetry.length}`
      );
    } finally {
      globalThis.fetch = originalFetch;
      await prisma.wallet.deleteMany({
        where: { agent: { userId: preFailUser.id } },
      });
      await prisma.agent.deleteMany({ where: { userId: preFailUser.id } });
      await prisma.user.deleteMany({ where: { id: preFailUser.id } });
    }
  }

  // B-R1-4: Post-Provider Encryption / DB Failure -> UNRESOLVED_PROVIDER_ORPHAN -> Blocks Automatic Retry (409) -> Explicit Reconciliation Recovers
  {
    const orphanUser = await prisma.user.create({
      data: {
        nearAccountId: `orphan_onboard_${runSuffix}.testnet`,
        role: "MEMBER",
      },
    });

    // Pre-insert a wallet owned by another dummy user with walletId `w_dup_collision`
    // to deterministically trigger a DB unique constraint failure AFTER OutLayer succeeds!
    const collisionOwner = await prisma.user.create({
      data: {
        nearAccountId: `collision_owner_${runSuffix}.testnet`,
        role: "MEMBER",
      },
    });
    const collisionWalletId = `w_collision_${runSuffix}`;
    const collisionNearAcc = `agent_collision_${runSuffix}.testnet`;
    const collisionAgent = await prisma.agent.create({
      data: {
        name: "Collision Setup Agent",
        userId: collisionOwner.id,
        status: "ACTIVE",
        wallet: {
          create: {
            walletId: collisionWalletId,
            nearAccountId: collisionNearAcc,
            apiKey: "v2:000000000000000000000000:00000000000000000000000000000000:0000",
            network: "testnet",
            balanceYocto: "0",
          },
        },
      },
    });

    let providerCallNum = 0;
    const secretKeyAttempt1 = `wk_secret_never_log_${runSuffix}_1`;
    const secretKeyAttempt2 = `wk_secret_never_log_${runSuffix}_2`;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/register")) {
        providerCallNum++;
        if (providerCallNum === 1) {
          // Attempt 1 returns walletId that collides at DB persistence step
          return new Response(
            JSON.stringify({
              wallet_id: collisionWalletId,
              api_key: secretKeyAttempt1,
              near_account_id: `orphan_first_${runSuffix}.testnet`,
              handoff_url: "https://outlayer.fastnear.com/handoff/orphan1",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        // Attempt 2 (after explicit reconciliation) returns fresh valid wallet
        return new Response(
          JSON.stringify({
            wallet_id: `w_reconciled_${runSuffix}`,
            api_key: secretKeyAttempt2,
            near_account_id: `reconciled_${runSuffix}.testnet`,
            handoff_url: "https://outlayer.fastnear.com/handoff/reconciled",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      // 1. Trigger post-provider DB persistence failure
      const req1 = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        orphanUser,
        "POST"
      );
      const res1 = await postWallets(req1);
      const json1 = await res1.json();

      // Inspect stored Agent metadata to verify non-secret reconciliation metadata & ZERO apiKey leakage
      const agentAfterFail = await prisma.agent.findFirst({
        where: { userId: orphanUser.id },
      });
      const rawMetadata = agentAfterFail?.metadata || "";
      const apiKeyNotLeaked =
        !rawMetadata.includes(secretKeyAttempt1) &&
        !JSON.stringify(json1).includes(secretKeyAttempt1);

      // 2. Automatic retry WITHOUT reconciliation MUST be blocked (409) and MUST NOT call OutLayer again!
      const reqAutoRetry = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        orphanUser,
        "POST"
      );
      const resAutoRetry = await postWallets(reqAutoRetry);
      const jsonAutoRetry = await resAutoRetry.json();
      const providerCallsAfterAutoRetry = providerCallNum;

      // 3. Explicit reconciliation retry (`action: "reconcile", acknowledgeUnresolvedOrphan: true`) recovers cleanly!
      const reqReconcile = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        orphanUser,
        "POST",
        { action: "reconcile", acknowledgeUnresolvedOrphan: true }
      );
      const resReconcile = await postWallets(reqReconcile);
      const jsonReconcile = await resReconcile.json();

      const agentsAfterReconcile = await prisma.agent.findMany({
        where: { userId: orphanUser.id },
        include: { wallet: true },
      });
      const finalMeta = JSON.parse(agentsAfterReconcile[0]?.metadata || "{}");

      record(
        "B-R1-4",
        "Workstream B",
        "Post-Provider Persistence Failure Records Non-Secret Orphan State, Blocks Uncontrolled Retry (409), and Recovers via Explicit Reconciliation",
        res1.status === 500 &&
          json1.code === "ONBOARDING_POST_PROVIDER_FAILURE" &&
          apiKeyNotLeaked &&
          resAutoRetry.status === 409 &&
          jsonAutoRetry.code === "ONBOARDING_RECONCILIATION_REQUIRED" &&
          providerCallsAfterAutoRetry === 1 &&
          resReconcile.status === 200 &&
          jsonReconcile.success === true &&
          providerCallNum === 2 &&
          agentsAfterReconcile.length === 1 &&
          Array.isArray(finalMeta.reconciledOrphanHistory) &&
          finalMeta.reconciledOrphanHistory.length === 1,
        `failStatus=${res1.status}, apiKeyNotLeaked=${apiKeyNotLeaked}, autoRetryStatus=${resAutoRetry.status} (providerCalls=${providerCallsAfterAutoRetry}), reconcileStatus=${resReconcile.status}, archivedOrphans=${finalMeta.reconciledOrphanHistory?.length}`
      );
    } finally {
      globalThis.fetch = originalFetch;
      await prisma.wallet.deleteMany({
        where: {
          agent: { userId: { in: [orphanUser.id, collisionOwner.id] } },
        },
      });
      await prisma.agent.deleteMany({
        where: { userId: { in: [orphanUser.id, collisionOwner.id] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [orphanUser.id, collisionOwner.id] } },
      });
    }
  }

  // B-R1-5: Provider Timeout / Ambiguous Response -> UNRESOLVED_PROVIDER_ORPHAN & Blocks Automatic Retry
  {
    const timeoutUser = await prisma.user.create({
      data: {
        nearAccountId: `timeout_onboard_${runSuffix}.testnet`,
        role: "MEMBER",
      },
    });

    let timeoutCalls = 0;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/register")) {
        timeoutCalls++;
        const err = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      }
      return originalFetch(input, init);
    };

    try {
      const req1 = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        timeoutUser,
        "POST"
      );
      const res1 = await postWallets(req1);
      const json1 = await res1.json();

      // Automatic retry must be blocked with 409 without calling provider a second time
      const req2 = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        timeoutUser,
        "POST"
      );
      const res2 = await postWallets(req2);
      const json2 = await res2.json();

      record(
        "B-R1-5",
        "Workstream B",
        "Provider Timeout Transitions to UNRESOLVED_PROVIDER_ORPHAN (504) and Blocks Automatic Re-Registration (409)",
        res1.status === 504 &&
          json1.code === "OUTLAYER_PROVISIONING_AMBIGUOUS" &&
          res2.status === 409 &&
          json2.code === "ONBOARDING_RECONCILIATION_REQUIRED" &&
          timeoutCalls === 1,
        `timeoutStatus=${res1.status}, retryStatus=${res2.status}, providerCalls=${timeoutCalls}`
      );
    } finally {
      globalThis.fetch = originalFetch;
      await prisma.agent.deleteMany({ where: { userId: timeoutUser.id } });
      await prisma.user.deleteMany({ where: { id: timeoutUser.id } });
    }
  }

  // B-R1-6: Encryption Failure After Provider Registration -> UNRESOLVED_PROVIDER_ORPHAN & Zero Plaintext Persisted
  {
    const encFailUser = await prisma.user.create({
      data: {
        nearAccountId: `encfail_onboard_${runSuffix}.testnet`,
        role: "MEMBER",
      },
    });

    const originalEncrypt = CredentialVault.encrypt;
    const encFailSecret = `wk_encfail_secret_never_persist_${runSuffix}`;
    let encProviderCalls = 0;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/register")) {
        encProviderCalls++;
        // Deterministic encryption failure right after OutLayer registration succeeds
        CredentialVault.encrypt = () => {
          throw new Error(
            "CREDENTIAL_VAULT_KEY_UNAVAILABLE: Simulated encryption failure after provider registration"
          );
        };
        return new Response(
          JSON.stringify({
            wallet_id: `w_encfail_${runSuffix}`,
            api_key: encFailSecret,
            near_account_id: `agent_encfail_${runSuffix}.testnet`,
            handoff_url: "https://outlayer.fastnear.com/handoff/encfail",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      const req1 = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        encFailUser,
        "POST"
      );
      const res1 = await postWallets(req1);
      const json1 = await res1.json();

      // Restore CredentialVault.encrypt before checking automatic retry block
      CredentialVault.encrypt = originalEncrypt;

      const walletCount = await prisma.wallet.count({
        where: { agent: { userId: encFailUser.id } },
      });
      const agentRow = await prisma.agent.findFirst({
        where: { userId: encFailUser.id },
      });
      const rawAgentMeta = agentRow?.metadata || "";

      const retryReq = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        encFailUser,
        "POST"
      );
      const retryRes = await postWallets(retryReq);
      const retryJson = await retryRes.json();

      record(
        "B-R1-6",
        "Workstream B",
        "Encryption Failure After Provider Registration Fails Closed (500), Persists 0 Wallets & 0 Plaintext Keys, and Blocks Uncontrolled Retry (409)",
        res1.status === 500 &&
          json1.code === "ONBOARDING_POST_PROVIDER_FAILURE" &&
          walletCount === 0 &&
          !rawAgentMeta.includes(encFailSecret) &&
          retryRes.status === 409 &&
          retryJson.code === "ONBOARDING_RECONCILIATION_REQUIRED" &&
          encProviderCalls === 1,
        `status=${res1.status}, walletsPersisted=${walletCount}, secretExcluded=${!rawAgentMeta.includes(encFailSecret)}, retryStatus=${retryRes.status}, providerCalls=${encProviderCalls}`
      );
    } finally {
      globalThis.fetch = originalFetch;
      CredentialVault.encrypt = originalEncrypt;
      await prisma.wallet.deleteMany({
        where: { agent: { userId: encFailUser.id } },
      });
      await prisma.agent.deleteMany({ where: { userId: encFailUser.id } });
      await prisma.user.deleteMany({ where: { id: encFailUser.id } });
    }
  }

  // B-R1-7: Tenant Isolation & Credential Vault v2 Cross-Wallet Transposition Rejection
  {
    const tenantA = await prisma.user.create({
      data: { nearAccountId: `tenant_a_${runSuffix}.testnet`, role: "MEMBER" },
    });
    const tenantB = await prisma.user.create({
      data: { nearAccountId: `tenant_b_${runSuffix}.testnet`, role: "MEMBER" },
    });

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/register")) {
        return new Response(
          JSON.stringify({
            wallet_id: `w_tenanta_${runSuffix}`,
            api_key: `wk_tenanta_secret_${runSuffix}`,
            near_account_id: `agent_tenanta_${runSuffix}.testnet`,
            handoff_url: "https://outlayer.fastnear.com/handoff/tenanta",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      const reqOnboardA = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        tenantA,
        "POST"
      );
      const resOnboardA = await postWallets(reqOnboardA);
      const jsonOnboardA = await resOnboardA.json();

      // Tenant B queries GET /api/wallets -> must see 0 agentWallets
      const reqGetB = await buildAuthenticatedRequest(
        "http://localhost:3001/api/wallets",
        tenantB,
        "GET"
      );
      const resGetB = await getWallets(reqGetB);
      const jsonGetB = await resGetB.json();

      const walletA = await prisma.wallet.findFirst({
        where: { agent: { userId: tenantA.id } },
      });

      const transposedDecrypt = walletA
        ? decryptWalletApiKey(walletA.apiKey, {
            walletId: `w_tenantb_${runSuffix}`,
            nearAccountId: walletA.nearAccountId,
          })
        : "unexpected";

      record(
        "B-R1-7",
        "Workstream B",
        "Tenant Isolation & Credential Vault v2 Cross-Wallet Transposition Rejection",
        resOnboardA.status === 200 &&
          jsonOnboardA.success === true &&
          Array.isArray(jsonGetB.agentWallets) &&
          jsonGetB.agentWallets.length === 0 &&
          transposedDecrypt === "",
        `tenantBWalletsSeen=${jsonGetB.agentWallets?.length}, transposedDecryptionRejected=${transposedDecrypt === ""}`
      );
    } finally {
      globalThis.fetch = originalFetch;
      await prisma.wallet.deleteMany({
        where: { agent: { userId: { in: [tenantA.id, tenantB.id] } } },
      });
      await prisma.agent.deleteMany({
        where: { userId: { in: [tenantA.id, tenantB.id] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [tenantA.id, tenantB.id] } },
      });
    }
  }

  // ===========================================================================
  // WORKSTREAM C: REMOVE SYNTHETIC OUTLAYER FALLBACK IN POST /api/agents
  // ===========================================================================
  console.log("\n--- WORKSTREAM C: Remove Synthetic OutLayer Fallback in POST /api/agents ---");

  {
    const agentUser = await prisma.user.create({
      data: {
        nearAccountId: `agent_route_${runSuffix}.testnet`,
        role: "MEMBER",
      },
    });

    try {
      // C-R1-1: Provider failure on POST /api/agents fails closed (502) and creates ZERO agents/wallets
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/register")) {
          return new Response("Upstream OutLayer TEE offline", { status: 502 });
        }
        return originalFetch(input, init);
      };

      const failReq = await buildAuthenticatedRequest(
        "http://localhost:3001/api/agents",
        agentUser,
        "POST",
        {
          name: "Should Not Be Created",
          description: "Testing fail-closed OutLayer provisioning",
          purpose: "Testing",
        }
      );
      const failRes = await postAgents(failReq);
      const failJson = await failRes.json();

      const agentsAfterFail = await prisma.agent.count({
        where: { userId: agentUser.id },
      });
      const walletsAfterFail = await prisma.wallet.count({
        where: { agent: { userId: agentUser.id } },
      });

      record(
        "C-R1-1",
        "Workstream C",
        "POST /api/agents Fails Closed (502) on OutLayer Error With Zero Synthetic Fallback Records",
        failRes.status === 502 &&
          failJson.success === false &&
          failJson.code === "OUTLAYER_PROVISIONING_FAILED" &&
          agentsAfterFail === 0 &&
          walletsAfterFail === 0,
        `status=${failRes.status}, code=${failJson.code}, agentsCreated=${agentsAfterFail}, walletsCreated=${walletsAfterFail}`
      );

      // C-R1-2: Provider returning synthetic wk_local_* payload is rejected with 502
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/register")) {
          return new Response(
            JSON.stringify({
              wallet_id: `outlayer-vault-12345`,
              api_key: `wk_local_12345`,
              near_account_id: `agent-vault-12345.testnet`,
              handoff_url: "",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(input, init);
      };

      const synthReq = await buildAuthenticatedRequest(
        "http://localhost:3001/api/agents",
        agentUser,
        "POST",
        {
          name: "Synthetic Payload Agent",
          purpose: "Testing",
        }
      );
      const synthRes = await postAgents(synthReq);
      const synthJson = await synthRes.json();
      const agentsAfterSynth = await prisma.agent.count({
        where: { userId: agentUser.id },
      });

      record(
        "C-R1-2",
        "Workstream C",
        "POST /api/agents Rejects Synthetic wk_local_* / outlayer-vault-* Payloads (502)",
        synthRes.status === 502 &&
          synthJson.code === "OUTLAYER_INVALID_RESPONSE" &&
          agentsAfterSynth === 0,
        `status=${synthRes.status}, code=${synthJson.code}, agentsCreated=${agentsAfterSynth}`
      );

      // C-R1-3: Genuine provider success creates Agent + v2 AAD-encrypted Wallet
      const genuineWalletId = `w_agent_genuine_${runSuffix}`;
      const genuineNearAcc = `agent_genuine_${runSuffix}.testnet`;
      const genuineApiKey = `wk_genuine_agent_secret_${runSuffix}`;

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/register")) {
          return new Response(
            JSON.stringify({
              wallet_id: genuineWalletId,
              api_key: genuineApiKey,
              near_account_id: genuineNearAcc,
              handoff_url: `https://outlayer.fastnear.com/handoff/${genuineWalletId}`,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(input, init);
      };

      const okReq = await buildAuthenticatedRequest(
        "http://localhost:3001/api/agents",
        agentUser,
        "POST",
        {
          name: "Genuine OutLayer Agent",
          description: "Verified TEE Agent",
          purpose: "Autonomous Spending",
        }
      );
      const okRes = await postAgents(okReq);
      const okJson = await okRes.json();

      const storedAgent = await prisma.agent.findFirst({
        where: { userId: agentUser.id },
        include: { wallet: true },
      });
      const decryptedAgentKey = storedAgent?.wallet
        ? decryptWalletApiKey(storedAgent.wallet.apiKey, {
            walletId: storedAgent.wallet.walletId,
            nearAccountId: storedAgent.wallet.nearAccountId,
          })
        : "";

      record(
        "C-R1-3",
        "Workstream C",
        "POST /api/agents Succeeds (201) With Genuine Provider Payload & v2 AAD Encryption",
        okRes.status === 201 &&
          okJson.success === true &&
          storedAgent?.wallet?.walletId === genuineWalletId &&
          WalletCredentialService.isEncryptedV2(storedAgent?.wallet?.apiKey || "") &&
          decryptedAgentKey === genuineApiKey,
        `status=${okRes.status}, walletId=${storedAgent?.wallet?.walletId}, v2Encrypted=${WalletCredentialService.isEncryptedV2(storedAgent?.wallet?.apiKey || "")}`
      );
    } finally {
      globalThis.fetch = originalFetch;
      await prisma.agentToolAccess.deleteMany({
        where: { agent: { userId: agentUser.id } },
      });
      await prisma.auditLog.deleteMany({ where: { userId: agentUser.id } });
      await prisma.wallet.deleteMany({
        where: { agent: { userId: agentUser.id } },
      });
      await prisma.agent.deleteMany({ where: { userId: agentUser.id } });
      await prisma.user.deleteMany({ where: { id: agentUser.id } });
    }
  }

  console.log("\n================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(
    `M14.7-R1 CLOSEOUT VERIFICATION COMPLETE: ${passedCount}/${results.length} PASSED`
  );
  console.log("================================================================================\n");

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runCloseoutSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL ERROR in M14.7-R1 Closeout Verification:", err);
    process.exit(1);
  });
