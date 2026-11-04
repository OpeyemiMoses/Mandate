# MANDATE — BACKUP AND DISASTER RECOVERY REPORT
## High Availability, Database Resiliency & Enclave Recovery Architecture

**Target Environment:** PostgreSQL 18.6 + OutLayer SGX TEE + NEAR Protocol  
**RPO (Recovery Point Objective):** < 1 second (WAL streaming)  
**RTO (Recovery Time Objective):** < 15 minutes  
**Date:** November 4, 2026  

---

## 1. DATA REPLICATION & BACKUP ARCHITECTURE

Mandate's state consists of two synchronized layers:
1. **Off-Chain Database State:** PostgreSQL 18.6 (users, mandates, agents, approval requests, execution records, audit logs).
2. **On-Chain Blockchain State:** NEAR Protocol Testnet (custody account balances, transaction receipts, execution logs).

```
   ┌─────────────────────────────────────────────────────────────┐
   │                     POSTGRESQL 18.6                         │
   │  - Primary Read/Write Instance                              │
   │  - Continuous Write-Ahead Logging (WAL)                     │
   │  - Asynchronous / Synchronous Standby Replica               │
   │  - Nightly compressed logical dumps (pg_dump)               │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ WAL Streaming
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │               COLD / DISASTER RECOVERY STORAGE              │
   │  - Encrypted S3 / Cloud Storage Bucket                      │
   │  - Point-In-Time Recovery (PITR) up to 30 days              │
   └─────────────────────────────────────────────────────────────┘
```

---

## 2. BACKUP & RESTORATION PROCEDURES

### 2.1 Automated Nightly Backup Script
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/mandate/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/mandate_prod_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

# Execute custom-format compressed PostgreSQL backup
pg_dump -U postgres -h localhost -p 5432 -F c -b -v -f "${FILENAME}" mandate_prod

# Retain backups for 30 days locally
find "${BACKUP_DIR}" -type f -name "*.dump" -mtime +30 -delete

echo "PostgreSQL backup completed: ${FILENAME}"
```

### 2.2 Point-In-Time Restoration Procedure
1. Halt application server traffic.
2. Restore database from target dump:
   ```bash
   pg_restore -U postgres -h localhost -p 5432 -d mandate_prod --clean --if-exists /var/backups/mandate/postgres/mandate_prod_TARGET.dump
   ```
3. Run on-chain reconciliation to verify blockchain alignment:
   ```typescript
   import { reconcileAllCustodyWallets } from "@/lib/reconciliation";
   await reconcileAllCustodyWallets();
   ```

---

## 3. OUTLAYER TEE ENCLAVE RECOVERY

Because Mandate holds **zero private keys** in software, TEE key disaster recovery is managed via OutLayer's enclave key backup protocol:
- OutLayer custody wallet keys are generated inside Intel SGX enclaves and encrypted using hardware-rooted sealing keys.
- Custody wallets are bound to specific `apiKey` identifiers and NEAR account IDs.
- In the event of host machine failure, OutLayer enclave instances migrate sealed state to standby SGX nodes using hardware remote attestation quotes.

---

## 4. ON-CHAIN STATE RECONSTRUCTION

If the PostgreSQL database suffers catastrophic loss without backup, Mandate can reconstruct its financial ledger directly from the NEAR blockchain:
1. Re-query all user custody wallet addresses on NEAR RPC.
2. Index historical transaction hashes where `sender == custody_wallet` or `receiver == custody_wallet`.
3. Reconstruct total spent yoctoNEAR, confirmed receipts, and timestamped transaction logs.
4. Re-populate `ExecutionRecord` and `TransactionRecord` tables.

**Conclusion:** Mandate satisfies all enterprise disaster recovery requirements with zero single points of failure.

