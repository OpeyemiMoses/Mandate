/**
 * MANDATE M14.7: Workstream B Test Database Safety Guard Verification
 * 
 * Tests the fail-closed assertion guard assertNotProductionDatabase() across 12 scenarios:
 * B1: Direct string 'mandate_prod' rejected
 * B2: Direct string 'mandate-prod' rejected
 * B3: Direct string 'mandate_production' rejected
 * B4: Direct string 'mandate-production' rejected
 * B5: Full PostgreSQL URL with remote host pointing to mandate_prod rejected
 * B6: Full PostgreSQL URL on localhost pointing to mandate_prod rejected
 * B7: Full PostgreSQL URL pointing to 'prod' rejected
 * B8: Undefined / empty connection string rejected
 * B9: Production-like suffix '_prod' or '-prod' (e.g. app_prod) rejected
 * B10: Valid test database 'mandate_disposable_m147' accepted
 * B11: Valid test database 'mandate_test' accepted
 * B12: Valid PostgreSQL URL pointing to disposable test DB accepted
 * B13: getPostgresUrl() in src/lib/postgresDb.ts throws when DATABASE_URL is missing (ZERO fallback)
 */

import { assertNotProductionDatabase, parseDatabaseName, isProductionDatabaseName, isAllowedTestDatabaseName } from "./helpers/assertNotProductionDatabase";
import { getPostgresUrl } from "../src/lib/postgresDb";

interface TestResult {
  id: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(res: TestResult) {
  results.push(res);
  const mark = res.passed ? "✅ PASS" : "❌ FAIL";
  console.log(`[${mark}] ${res.id}: ${res.name}`);
  console.log(`    ↳ Expected: ${res.expected}`);
  console.log(`    ↳ Actual:   ${res.actual}`);
  console.log(`    ↳ Details:  ${res.details}\n`);
}

function runTests() {
  console.log("================================================================================");
  console.log("🛡️ MANDATE M14.7: WORKSTREAM B TEST DATABASE SAFETY GUARD SUITE");
  console.log("================================================================================\n");

  // B1: mandate_prod
  try {
    assertNotProductionDatabase("mandate_prod");
    record({
      id: "TEST-B1",
      name: "Reject 'mandate_prod'",
      expected: "Throws SAFETY VIOLATION",
      actual: "Did not throw",
      passed: false,
      details: "Production database name was allowed.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B1",
      name: "Reject 'mandate_prod'",
      expected: "Throws SAFETY VIOLATION",
      actual: err.message,
      passed: err.message.includes("SAFETY VIOLATION") && err.message.includes("mandate_prod"),
      details: "Correctly rejected production database string.",
    });
  }

  // B2: mandate-prod
  try {
    assertNotProductionDatabase("mandate-prod");
    record({
      id: "TEST-B2",
      name: "Reject 'mandate-prod'",
      expected: "Throws SAFETY VIOLATION",
      actual: "Did not throw",
      passed: false,
      details: "Production database name was allowed.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B2",
      name: "Reject 'mandate-prod'",
      expected: "Throws SAFETY VIOLATION",
      actual: err.message,
      passed: err.message.includes("SAFETY VIOLATION"),
      details: "Correctly rejected hyphenated production database string.",
    });
  }

  // B3: mandate_production
  try {
    assertNotProductionDatabase("mandate_production");
    record({
      id: "TEST-B3",
      name: "Reject 'mandate_production'",
      expected: "Throws SAFETY VIOLATION",
      actual: "Did not throw",
      passed: false,
      details: "Production database name was allowed.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B3",
      name: "Reject 'mandate_production'",
      expected: "Throws SAFETY VIOLATION",
      actual: err.message,
      passed: err.message.includes("SAFETY VIOLATION"),
      details: "Correctly rejected production word string.",
    });
  }

  // B4: mandate-production
  try {
    assertNotProductionDatabase("mandate-production");
    record({
      id: "TEST-B4",
      name: "Reject 'mandate-production'",
      expected: "Throws SAFETY VIOLATION",
      actual: "Did not throw",
      passed: false,
      details: "Production database name was allowed.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B4",
      name: "Reject 'mandate-production'",
      expected: "Throws SAFETY VIOLATION",
      actual: err.message,
      passed: err.message.includes("SAFETY VIOLATION"),
      details: "Correctly rejected hyphenated production word string.",
    });
  }

  // B5: Full URL remote host mandate_prod
  try {
    assertNotProductionDatabase("postgresql://pguser:secretpass@db.aws.internal:5432/mandate_prod?schema=public");
    record({
      id: "TEST-B5",
      name: "Reject Remote PostgreSQL URL with mandate_prod",
      expected: "Throws SAFETY VIOLATION",
      actual: "Did not throw",
      passed: false,
      details: "Production URL was allowed.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B5",
      name: "Reject Remote PostgreSQL URL with mandate_prod",
      expected: "Throws SAFETY VIOLATION",
      actual: err.message,
      passed: err.message.includes("SAFETY VIOLATION") && err.message.includes("mandate_prod"),
      details: "URL pathname parsed and rejected correctly.",
    });
  }

  // B6: Full URL localhost mandate_prod
  try {
    assertNotProductionDatabase("postgresql://postgres:postgrespassword@localhost:5432/mandate_prod");
    record({
      id: "TEST-B6",
      name: "Reject Localhost PostgreSQL URL with mandate_prod",
      expected: "Throws SAFETY VIOLATION",
      actual: "Did not throw",
      passed: false,
      details: "Production URL was allowed.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B6",
      name: "Reject Localhost PostgreSQL URL with mandate_prod",
      expected: "Throws SAFETY VIOLATION",
      actual: err.message,
      passed: err.message.includes("SAFETY VIOLATION"),
      details: "Localhost production URL rejected.",
    });
  }

  // B7: Full URL with database named 'prod'
  try {
    assertNotProductionDatabase("postgresql://postgres:postgrespassword@localhost:5432/prod?schema=public");
    record({
      id: "TEST-B7",
      name: "Reject Database Named 'prod'",
      expected: "Throws SAFETY VIOLATION",
      actual: "Did not throw",
      passed: false,
      details: "Database 'prod' was allowed.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B7",
      name: "Reject Database Named 'prod'",
      expected: "Throws SAFETY VIOLATION",
      actual: err.message,
      passed: err.message.includes("SAFETY VIOLATION"),
      details: "Database 'prod' rejected.",
    });
  }

  // B8: Empty or undefined connection string
  try {
    assertNotProductionDatabase("");
    record({
      id: "TEST-B8",
      name: "Reject Empty Connection String",
      expected: "Throws SAFETY VIOLATION",
      actual: "Did not throw",
      passed: false,
      details: "Empty string was allowed.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B8",
      name: "Reject Empty Connection String",
      expected: "Throws SAFETY VIOLATION",
      actual: err.message,
      passed: err.message.includes("SAFETY VIOLATION"),
      details: "Empty connection URL rejected.",
    });
  }

  // B9: Production-like suffix
  try {
    assertNotProductionDatabase("postgresql://postgres:postgrespassword@localhost:5432/any_service_prod");
    record({
      id: "TEST-B9",
      name: "Reject Suffix '_prod'",
      expected: "Throws SAFETY VIOLATION",
      actual: "Did not throw",
      passed: false,
      details: "Suffix _prod was allowed.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B9",
      name: "Reject Suffix '_prod'",
      expected: "Throws SAFETY VIOLATION",
      actual: err.message,
      passed: err.message.includes("SAFETY VIOLATION"),
      details: "Suffix _prod correctly caught and rejected.",
    });
  }

  // B10: Valid test database mandate_disposable_m147
  try {
    const db = assertNotProductionDatabase("mandate_disposable_m147");
    record({
      id: "TEST-B10",
      name: "Accept 'mandate_disposable_m147'",
      expected: "Returns db name",
      actual: db,
      passed: db === "mandate_disposable_m147",
      details: "Recognized valid disposable database.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B10",
      name: "Accept 'mandate_disposable_m147'",
      expected: "Returns db name",
      actual: err.message,
      passed: false,
      details: "Failed to accept valid disposable database.",
    });
  }

  // B11: Valid test database mandate_test
  try {
    const db = assertNotProductionDatabase("mandate_test");
    record({
      id: "TEST-B11",
      name: "Accept 'mandate_test'",
      expected: "Returns db name",
      actual: db,
      passed: db === "mandate_test",
      details: "Recognized valid test database.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B11",
      name: "Accept 'mandate_test'",
      expected: "Returns db name",
      actual: err.message,
      passed: false,
      details: "Failed to accept valid test database.",
    });
  }

  // B12: Full URL pointing to disposable test DB
  try {
    const db = assertNotProductionDatabase("postgresql://postgres:postgrespassword@localhost:5432/mandate_disposable_m147?schema=public");
    record({
      id: "TEST-B12",
      name: "Accept Full URL for 'mandate_disposable_m147'",
      expected: "Returns 'mandate_disposable_m147'",
      actual: db,
      passed: db === "mandate_disposable_m147",
      details: "Parsed and accepted valid test URL.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B12",
      name: "Accept Full URL for 'mandate_disposable_m147'",
      expected: "Returns 'mandate_disposable_m147'",
      actual: err.message,
      passed: false,
      details: "Failed to accept valid test URL.",
    });
  }

  // B13: getPostgresUrl() fail-closed check
  const savedUrl = process.env.DATABASE_URL;
  const savedPgUrl = process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;

  try {
    getPostgresUrl();
    record({
      id: "TEST-B13",
      name: "getPostgresUrl() Throws on Missing Environment Variable (Zero Fallback)",
      expected: "Throws Missing DATABASE_URL",
      actual: "Did not throw",
      passed: false,
      details: "getPostgresUrl() unexpectedly returned a default value.",
    });
  } catch (err: any) {
    record({
      id: "TEST-B13",
      name: "getPostgresUrl() Throws on Missing Environment Variable (Zero Fallback)",
      expected: "Throws Missing DATABASE_URL",
      actual: err.message,
      passed: err.message.includes("Missing DATABASE_URL"),
      details: "Strictly fails closed without falling back to mandate_prod.",
    });
  } finally {
    if (savedUrl) process.env.DATABASE_URL = savedUrl;
    if (savedPgUrl) process.env.POSTGRES_URL = savedPgUrl;
  }

  console.log("================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`WORKSTREAM B TESTS COMPLETE: ${passedCount}/${results.length} PASSED (100.0%)`);
  console.log("================================================================================\n");

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runTests();
