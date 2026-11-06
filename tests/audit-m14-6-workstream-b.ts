/**
 * MANDATE M14.6-ECA: Workstream B Census & Write-Path Audit Probe
 * Read-only census of mandate_prod Wallet table and code search for unencrypted write paths.
 */

import { prismaPg as prisma } from "../src/lib/postgresDb";

async function runWorkstreamBCensus() {
  console.log("================================================================================");
  console.log("🔬 AUDIT PROBE: WORKSTREAM B — PRODUCTION CREDENTIAL CENSUS & WRITE PATHS");
  console.log("================================================================================\n");

  const wallets = await prisma.wallet.findMany({
    select: {
      id: true,
      walletId: true,
      apiKey: true,
      nearAccountId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const total = wallets.length;
  let v2Count = 0;
  let v1Count = 0;
  let plaintextCount = 0;
  let nullCount = 0;

  const plaintextWallets: Array<{
    id: string;
    walletId: string;
    nearAccountId: string | null;
    prefix: string;
    createdAt: Date;
  }> = [];

  for (const w of wallets) {
    if (!w.apiKey) {
      nullCount++;
      continue;
    }
    const val = w.apiKey.trim();
    if (val.startsWith("v2:")) {
      v2Count++;
    } else if (val.startsWith("v1:") || (val.split(":").length === 3 && val.split(":")[0].length === 24)) {
      v1Count++;
    } else {
      plaintextCount++;
      plaintextWallets.push({
        id: w.id,
        walletId: w.walletId,
        nearAccountId: w.nearAccountId,
        prefix: val.slice(0, 12) + "...",
        createdAt: w.createdAt,
      });
    }
  }

  console.log("--- PRODUCTION WALLET CREDENTIAL CENSUS (mandate_prod) ---");
  console.log(`Total Wallet Records:   ${total}`);
  console.log(`Encrypted v2 (with AAD): ${v2Count}`);
  console.log(`Encrypted v1 (no AAD):   ${v1Count}`);
  console.log(`Plaintext Credentials:   ${plaintextCount}`);
  console.log(`Null Credentials:        ${nullCount}\n`);

  console.log("--- STATUS OF IDENTIFIED FIXTURE RECORDS ---");
  const targetIds = ["cmw5eyueb0003sbnsw6lmspul", "cmw5eyz7e0003sbopztrx7gyd"];
  for (const tid of targetIds) {
    const rec = wallets.find((w) => w.id === tid);
    if (!rec) {
      console.log(`  [NOT FOUND] ${tid}`);
    } else {
      const isEnc = rec.apiKey?.startsWith("v");
      const statusLabel = isEnc ? "ENCRYPTED" : "PLAINTEXT (STILL OPEN)";
      console.log(`  [${statusLabel}] ID: ${rec.id}`);
      console.log(`      ↳ WalletID: ${rec.walletId}`);
      console.log(`      ↳ Account:  ${rec.nearAccountId}`);
      console.log(`      ↳ Format:   ${rec.apiKey ? rec.apiKey.slice(0, 12) + "..." : "NULL"}`);
    }
  }

  console.log("\n--- COMPLETE LIST OF ALL PLAINTEXT WALLETS IN mandate_prod ---");
  plaintextWallets.forEach((pw, idx) => {
    console.log(`  ${idx + 1}. ID: ${pw.id} | Account: ${pw.nearAccountId} | Prefix: ${pw.prefix} | Created: ${pw.createdAt.toISOString()}`);
  });

  console.log("\n================================================================================");
  console.log(`WORKSTREAM B CENSUS COMPLETED: ${plaintextCount} PLAINTEXT RECORDS CONFIRMED IN mandate_prod`);
  console.log("================================================================================\n");

  return { total, v2Count, v1Count, plaintextCount, plaintextWallets };
}

runWorkstreamBCensus()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
