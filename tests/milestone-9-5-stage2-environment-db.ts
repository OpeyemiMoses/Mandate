/**
 * MANDATE — Milestone 9.5 Stage 2 Test Suite
 * Environment Security, Cryptographic Secret Validation & Database Production Readiness
 */

import {
  validateEnvironment,
  assertProductionEnvironmentValid,
  isKnownInsecureSecret,
  hasSufficientEntropy,
  redactSecret,
  getExecutionSigningSecret,
  getCredentialVaultMasterKey,
  getToolEncryptionKey,
  KNOWN_INSECURE_SECRETS,
  ConfigurationError,
} from "../src/lib/production/environmentValidation";
import { runStartupPreflight } from "../src/lib/production/startupPreflight";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  ✓ ${message}`);
}

async function runStage2Tests() {
  console.log("===============================================================================");
  console.log("   MANDATE MILESTONE 9.5 — STAGE 2 ENVIRONMENT & DATABASE READINESS TEST SUITE  ");
  console.log("===============================================================================\n");

  // -------------------------------------------------------------------------
  // 1. Missing Production Secrets Test
  // -------------------------------------------------------------------------
  console.log("--- 1. Testing Missing Production Secrets ---");
  {
    const emptyEnv: Record<string, string> = {
      NODE_ENV: "production",
    };
    const report = validateEnvironment(emptyEnv, true);
    assert(!report.valid, "Validation reports invalid when production secrets are missing");
    assert(report.missingCount >= 3, `Identified at least 3 missing required production secrets (got ${report.missingCount})`);
    assert(report.criticalErrors.some((e) => e.includes("EXECUTION_SIGNING_SECRET")), "Critical error identifies missing EXECUTION_SIGNING_SECRET");
    assert(report.criticalErrors.some((e) => e.includes("CREDENTIAL_VAULT_KEY_V1")), "Critical error identifies missing CREDENTIAL_VAULT_KEY_V1");
    assert(report.criticalErrors.some((e) => e.includes("TOOL_ENCRYPTION_KEY")), "Critical error identifies missing TOOL_ENCRYPTION_KEY");

    let thrown = false;
    try {
      assertProductionEnvironmentValid(emptyEnv);
    } catch (err: any) {
      thrown = true;
      assert(err instanceof ConfigurationError, "assertProductionEnvironmentValid throws ConfigurationError");
      assert(err.criticalErrors.length > 0, "ConfigurationError contains structured criticalErrors list");
    }
    assert(thrown, "assertProductionEnvironmentValid fails closed when secrets are missing");
  }

  // -------------------------------------------------------------------------
  // 2. Known Insecure Fallback Secrets Rejection
  // -------------------------------------------------------------------------
  console.log("\n--- 2. Testing Known Insecure Fallback Secrets Rejection ---");
  {
    for (const knownDefault of Array.from(KNOWN_INSECURE_SECRETS)) {
      assert(isKnownInsecureSecret(knownDefault), `isKnownInsecureSecret detects default: "${knownDefault.slice(0, 20)}..."`);
    }

    const insecureEnv: Record<string, string> = {
      NODE_ENV: "production",
      EXECUTION_SIGNING_SECRET: "mandate-execution-signing-secret-v1-production-boundary",
      CREDENTIAL_VAULT_KEY_V1: "mandate-credential-vault-master-key-v1-secret-32bytes",
      TOOL_ENCRYPTION_KEY: "mandate-universal-tools-master-encryption-key-v1",
      NEAR_NETWORK: "testnet",
      NEAR_RPC_URL: "https://test.rpc.fastnear.com",
      OUTLAYER_API_BASE_URL: "https://testnet-api.outlayer.ai",
      DATABASE_URL: "file:./dev.db",
    };

    const report = validateEnvironment(insecureEnv, true);
    assert(!report.valid, "Environment is flagged invalid when known fallback defaults are used");
    assert(report.invalidCount >= 3, `Flags at least 3 known insecure secrets (got ${report.invalidCount})`);
    assert(report.variables.EXECUTION_SIGNING_SECRET.status === "INSECURE_DEFAULT", "EXECUTION_SIGNING_SECRET marked INSECURE_DEFAULT");
    assert(report.variables.CREDENTIAL_VAULT_KEY_V1.status === "INSECURE_DEFAULT", "CREDENTIAL_VAULT_KEY_V1 marked INSECURE_DEFAULT");
    assert(report.variables.TOOL_ENCRYPTION_KEY.status === "INSECURE_DEFAULT", "TOOL_ENCRYPTION_KEY marked INSECURE_DEFAULT");
  }

  // -------------------------------------------------------------------------
  // 3. Insufficient Secret Length & Entropy
  // -------------------------------------------------------------------------
  console.log("\n--- 3. Testing Secret Length & Entropy Enforcement ---");
  {
    assert(!hasSufficientEntropy("short"), "Short string rejected");
    assert(!hasSufficientEntropy("1234567890123456789012345678901"), "31 characters rejected (< 32 minimum)");
    assert(!hasSufficientEntropy("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "32 identical characters rejected (zero entropy)");

    const weakEnv: Record<string, string> = {
      NODE_ENV: "production",
      EXECUTION_SIGNING_SECRET: "short-secret-under-32-chars",
      CREDENTIAL_VAULT_KEY_V1: "another-too-short-secret-1234",
      TOOL_ENCRYPTION_KEY: "short-tool-key-abcdef",
      NEAR_NETWORK: "testnet",
      NEAR_RPC_URL: "https://test.rpc.fastnear.com",
      OUTLAYER_API_BASE_URL: "https://testnet-api.outlayer.ai",
      DATABASE_URL: "file:./dev.db",
    };

    const report = validateEnvironment(weakEnv, true);
    assert(!report.valid, "Environment is flagged invalid when secrets are short");
    assert(report.variables.EXECUTION_SIGNING_SECRET.status === "INSUFFICIENT_LENGTH", "Weak EXECUTION_SIGNING_SECRET marked INSUFFICIENT_LENGTH");
  }

  // -------------------------------------------------------------------------
  // 4. Valid Production Configuration
  // -------------------------------------------------------------------------
  console.log("\n--- 4. Testing Valid Production Configuration ---");
  {
    const secureSigningKey = "prod_exec_sec_89d34fc9b147e8103c809174fec401a8";
    const secureVaultKey = "prod_vault_k1_11c08a9f3b52d8e4179e850b91d24c3a";
    const secureToolKey = "prod_tool_sec_99a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4";

    assert(hasSufficientEntropy(secureSigningKey), "Secure signing key has sufficient entropy");
    assert(hasSufficientEntropy(secureVaultKey), "Secure vault key has sufficient entropy");
    assert(hasSufficientEntropy(secureToolKey), "Secure tool key has sufficient entropy");

    const validProdEnv: Record<string, string> = {
      NODE_ENV: "production",
      EXECUTION_SIGNING_SECRET: secureSigningKey,
      CREDENTIAL_VAULT_KEY_V1: secureVaultKey,
      TOOL_ENCRYPTION_KEY: secureToolKey,
      NEAR_NETWORK: "testnet",
      NEAR_RPC_URL: "https://test.rpc.fastnear.com",
      OUTLAYER_API_BASE_URL: "https://testnet-api.outlayer.ai",
      DATABASE_URL: "file:./dev.db",
    };

    const report = validateEnvironment(validProdEnv, true);
    assert(report.valid, "Environment validation succeeds with high-entropy production keys");
    assert(report.criticalErrors.length === 0, "Zero critical errors on valid production configuration");
    assert(report.variables.EXECUTION_SIGNING_SECRET.status === "VALID", "EXECUTION_SIGNING_SECRET is VALID");
    assert(report.variables.CREDENTIAL_VAULT_KEY_V1.status === "VALID", "CREDENTIAL_VAULT_KEY_V1 is VALID");
    assert(report.variables.TOOL_ENCRYPTION_KEY.status === "VALID", "TOOL_ENCRYPTION_KEY is VALID");
  }

  // -------------------------------------------------------------------------
  // 5. Development Mode Fallback Compatibility
  // -------------------------------------------------------------------------
  console.log("\n--- 5. Testing Development Mode Fallback Compatibility ---");
  {
    const origNodeEnv = process.env.NODE_ENV;
    const origExec = process.env.EXECUTION_SIGNING_SECRET;
    const origVault = process.env.CREDENTIAL_VAULT_KEY_V1;
    const origTool = process.env.TOOL_ENCRYPTION_KEY;

    try {
      delete process.env.EXECUTION_SIGNING_SECRET;
      delete process.env.CREDENTIAL_VAULT_KEY_V1;
      delete process.env.TOOL_ENCRYPTION_KEY;
      (process.env as any).NODE_ENV = "development";

      const execKey = getExecutionSigningSecret();
      assert(typeof execKey === "string" && execKey.length > 0, "getExecutionSigningSecret returns dev fallback in development");

      const vaultKey = getCredentialVaultMasterKey(1);
      assert(typeof vaultKey === "string" && vaultKey.length > 0, "getCredentialVaultMasterKey returns dev fallback in development");

      const toolKey = getToolEncryptionKey();
      assert(typeof toolKey === "string" && toolKey.length > 0, "getToolEncryptionKey returns dev fallback in development");

      // Verify that in production mode, calling these without env throws
      (process.env as any).NODE_ENV = "production";
      let thrown = false;
      try {
        getExecutionSigningSecret();
      } catch (err: any) {
        thrown = true;
        assert(err instanceof ConfigurationError, "getExecutionSigningSecret throws ConfigurationError in production without env");
      }
      assert(thrown, "getExecutionSigningSecret fails closed in production");
    } finally {
      (process.env as any).NODE_ENV = origNodeEnv;
      if (origExec) process.env.EXECUTION_SIGNING_SECRET = origExec;
      if (origVault) process.env.CREDENTIAL_VAULT_KEY_V1 = origVault;
      if (origTool) process.env.TOOL_ENCRYPTION_KEY = origTool;
    }
  }

  // -------------------------------------------------------------------------
  // 6. Secret Redaction & Zero Leakage
  // -------------------------------------------------------------------------
  console.log("\n--- 6. Testing Secret Redaction & Leakage Prevention ---");
  {
    const secret = "super-secret-high-entropy-signing-key-998877";
    const redacted = redactSecret(secret);
    assert(!redacted.includes("high-entropy"), "Redacted string does not contain core secret text");
    assert(redacted.includes("••••••••"), "Redacted string contains bullet mask");
    assert(redactSecret(null) === "[NOT SET]", "Null secret returns [NOT SET]");
    assert(redactSecret("12345678") === "••••••••", "Short secret is fully masked");
  }

  // -------------------------------------------------------------------------
  // 7. Startup Preflight Live Probe & Topology Inspection
  // -------------------------------------------------------------------------
  console.log("\n--- 7. Testing Startup Preflight Live Probe ---");
  {
    const preflight = await runStartupPreflight(5000);
    assert(preflight.overallStatus === "READY" || preflight.overallStatus === "DEGRADED", `Preflight returns valid overall status (${preflight.overallStatus})`);
    assert(preflight.checks.database.status === "CONFIGURED", "Database check reports CONFIGURED");
    assert(preflight.checks.database.latencyMs! >= 0, `Database latency is tracked (${preflight.checks.database.latencyMs}ms)`);
    assert(preflight.checks.nearRpc.status === "CONFIGURED" || preflight.checks.nearRpc.status === "UNAVAILABLE", "NEAR RPC check reports valid status");
    assert(preflight.topology.databaseProvider === "sqlite", "Topology correctly detects SQLite provider");
    assert(preflight.topology.singleWriterConstraint === true, "Topology correctly warns of SQLite single-writer constraint");
    assert(preflight.topology.multiInstanceReady === false, "Topology correctly indicates SQLite is not multi-instance ready");
    assert(typeof preflight.topology.warning === "string", "Topology includes descriptive scaling warning");
  }

  // -------------------------------------------------------------------------
  // 8. Prisma Schema Validation (Both SQLite & PostgreSQL)
  // -------------------------------------------------------------------------
  console.log("\n--- 8. Testing Prisma Schema Validation ---");
  {
    // SQLite schema validation
    const sqliteVal = execSync("npx prisma validate --schema prisma/schema.prisma", { encoding: "utf8" });
    assert(sqliteVal.includes("is valid"), "SQLite schema (prisma/schema.prisma) is 100% valid");

    // PostgreSQL schema validation
    const pgVal = execSync(
      'DATABASE_URL="postgresql://user:pass@localhost:5432/mandate?schema=public" npx prisma validate --schema prisma/schema.postgresql.prisma',
      { encoding: "utf8" }
    );
    assert(pgVal.includes("is valid"), "PostgreSQL schema (prisma/schema.postgresql.prisma) is 100% valid");
  }

  // -------------------------------------------------------------------------
  // 9. PostgreSQL Schema Completeness & Model Parity
  // -------------------------------------------------------------------------
  console.log("\n--- 9. Testing PostgreSQL Schema Completeness & Model Parity ---");
  {
    const sqliteContent = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const pgContent = fs.readFileSync(path.join(process.cwd(), "prisma/schema.postgresql.prisma"), "utf8");

    const getModels = (text: string) => {
      const matches = text.match(/^model\s+([A-Za-z0-9_]+)\s+\{/gm) || [];
      return matches.map((m) => m.replace(/^model\s+/, "").replace(/\s+\{$/, "")).sort();
    };

    const sqliteModels = getModels(sqliteContent);
    const pgModels = getModels(pgContent);

    assert(sqliteModels.length === 68, `SQLite schema has exactly 68 models (found ${sqliteModels.length})`);
    assert(pgModels.length === 68, `PostgreSQL schema has exactly 68 models (found ${pgModels.length})`);

    const missingInPg = sqliteModels.filter((m) => !pgModels.includes(m));
    assert(missingInPg.length === 0, `All SQLite models exist in PostgreSQL schema (missing: ${missingInPg.join(", ") || "none"})`);

    // Verify BigInt financial fields exist in PostgreSQL schema
    assert(pgContent.includes("balanceYocto"), "PostgreSQL schema contains balanceYocto");
    assert(pgContent.includes("reservedYocto"), "PostgreSQL schema contains reservedYocto");
    assert(pgContent.includes("amountYocto"), "PostgreSQL schema contains amountYocto");
  }

  console.log("\n===============================================================================");
  console.log(`   STAGE 2 TEST SUMMARY: ALL ${passedAssertions} / ${totalAssertions} ASSERTIONS PASSED (100%)    `);
  console.log("===============================================================================\n");
}

runStage2Tests().catch((err) => {
  console.error("FATAL ERROR IN STAGE 2 TESTS:", err);
  process.exit(1);
});
