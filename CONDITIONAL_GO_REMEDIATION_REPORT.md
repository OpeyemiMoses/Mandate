# MANDATE — CONDITIONAL GO REMEDIATION REPORT
## Comprehensive Technical Resolution & Adversarial Evidence for M13.10 Release Conditions

**Milestone Target:** Open Public Beta Launch Preparation  
**Baseline Review:** Milestone 13.10 Conditional GO Release Report  
**Date of Certification:** November 4, 2026  
**Status:** ALL FOUR CONDITIONS RESOLVED & VERIFIED

---

# 1. ITEM 2.1: BOUNDARY EXECUTION TICKET PARAMETER BINDINGS

## 1.1 Architectural Problem Statement
In previous iterations, `BoundaryExecutionTicket` contained execution, mandate, and financial amounts, but lacked an immutable cryptographic binding to the parent `objectiveId`. An attacker with compromised internal service access could theoretically attempt to reuse an authorization ticket generated for a benign objective against a different objective under the same mandate.

## 1.2 Engineering Implementation
In [`src/lib/execution/boundaryTicket.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/execution/boundaryTicket.ts):
1. Extended `BoundaryExecutionTicketPayload` to explicitly bind all 12 parameters:
   - `executionId` (UUID string)
   - `mandateId` (UUID string)
   - `objectiveId` (UUID string)
   - `userNearAccountId` (NEAR account identifier)
   - `to` (Recipient account identifier)
   - `amountYocto` (Exact atomic integer string)
   - `network` ("testnet" ONLY)
   - `idempotencyKey` (Unique idempotency identifier)
   - `nonce` (Cryptographic random hex)
   - `issuedAt` (Unix epoch timestamp)
   - `expiresAt` (Unix epoch timestamp, valid for 60 seconds)
   - `ceilingYocto` (Enforced platform limit: $10^{23}$ yoctoNEAR)
2. Implemented HMAC-SHA256 server-side signing using `HMAC_TICKET_SECRET`:
```typescript
const payloadCanonical = [
  payload.executionId,
  payload.mandateId,
  payload.objectiveId || "NONE",
  payload.userNearAccountId,
  payload.to,
  payload.amountYocto,
  payload.network,
  payload.idempotencyKey,
  payload.nonce,
  payload.issuedAt.toString(),
  payload.expiresAt.toString(),
  payload.ceilingYocto,
].join("|");

const hmac = crypto
  .createHmac("sha256", secretKey)
  .update(payloadCanonical)
  .digest("hex");
```
3. Implemented fail-closed server-side verification in `validateBoundaryExecutionTicket`:
   - Checks expiration (`now > payload.expiresAt`).
   - Checks network (`payload.network === "testnet"`).
   - Recalculates expected HMAC and compares using `crypto.timingSafeEqual`.
   - Validates that caller parameters (`to`, `amountYocto`, `objectiveId`, `idempotencyKey`) match the ticket's bound payload exactly.

## 1.3 Adversarial Test Results
Verified via [`tests/beta-ceiling-enforcement.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/tests/beta-ceiling-enforcement.ts):
- Ticket minting: **PASSED** (all 12 parameters bound).
- Tampered `objectiveId` injection: **REJECTED** (`Objective ID mismatch: Ticket authorized for "objective-test-1", but transfer requested for "attacker-objective"`).
- Tampered amount: **REJECTED** (HMAC signature mismatch).
- Expired ticket: **REJECTED** (`TICKET_EXPIRED`).

---

# 2. ITEM 2.2: PUBLIC BETA TRANSACTION CEILING (0.1 NEAR HARD CAP)

## 2.1 Architectural Problem Statement
To prevent excessive loss of Testnet faucet liquidity or abuse during public testing, a platform-wide ceiling of 0.1 NEAR per transaction is mandated. This limit must be absolute, immutable, and enforced server-side, independent of user-configured mandate parameters (even if a user attempts to configure a mandate per-tx limit of 10.0 NEAR).

## 2.2 Engineering Implementation
In [`src/lib/execution/boundaryTicket.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/execution/boundaryTicket.ts):
```typescript
export const PUBLIC_BETA_MAX_TX_NEAR = "0.1";
export const PUBLIC_BETA_MAX_TX_YOCTO = "100000000000000000000000"; // 10^23 yoctoNEAR
```

Enforced across 3 independent defense-in-depth layers:
1. **Layer 1: Ticket Minting Gateway (`mintBoundaryExecutionTicket`)**:
   ```typescript
   if (BigInt(payload.amountYocto) > BigInt(PUBLIC_BETA_MAX_TX_YOCTO)) {
     throw new Error(
       `PLATFORM_BETA_CEILING_EXCEEDED: Transaction amount ${yoctoToNear(payload.amountYocto)} NEAR exceeds public beta limit of ${PUBLIC_BETA_MAX_TX_NEAR} NEAR`
     );
   }
   ```
2. **Layer 2: Preflight Validation (`ExecutionValidationService`)**:
   Enforces that the requested transfer cannot exceed `PUBLIC_BETA_MAX_TX_YOCTO` before budget reservation occurs.
3. **Layer 3: Execution Boundary Gateway (`ExecutionBoundaryService.execute`)**:
   Re-verifies ticket payload and amount prior to invoking the OutLayer TEE client.

## 2.3 Boundary Verification Evidence
From execution output of `tests/beta-ceiling-enforcement.ts`:
- **0.001 NEAR:** Minted and authorized successfully.
- **0.099 NEAR:** Minted and authorized successfully.
- **0.100 NEAR ($10^{23}$ yoctoNEAR):** Minted and authorized successfully (Exact boundary).
- **0.100000000000000000000001 NEAR ($10^{23} + 1$ yoctoNEAR):** **STRICTLY REJECTED**.
- **0.500 NEAR:** **STRICTLY REJECTED**.
- **1.000 NEAR:** **STRICTLY REJECTED**.

---

# 3. ITEM 2.3: DEVELOPMENT ACCOUNT & SESSION SEPARATION

## 3.1 Architectural Problem Statement
Historical test fixtures and milestone validation runs created 935 user accounts in PostgreSQL. To prepare for public onboarding, development and test data must be clearly isolated, and ordinary wallet authentication must never grant administrative capabilities.

## 3.2 Engineering Implementation
1. **Schema Augmentation:** Added `isTestAccount` boolean column to the `User` table in PostgreSQL.
2. **Classification Logic:**
   - 931 accounts with test identifiers or testnet fixtures classified as `AUTOMATED_TEST` (`isTestAccount = true`).
   - 4 internal operator accounts classified as `DEVELOPER_OPERATOR` with strict RBAC guards.
   - Public self-registration assigns `role: "CUSTOMER"` and `isTestAccount: false`.
3. **Wallet Connection Security:** Connecting a NEAR wallet (`@near-wallet-selector`) creates or attaches a `CUSTOMER` record only. Administrator capabilities require pre-seeded environment secret keys and are inaccessible via client wallet signatures.

## 3.3 Verification Evidence
PostgreSQL direct query (`prismaPg`):
- Total records: 945
- `AUTOMATED_TEST`: 931
- `DEVELOPER_OPERATOR`: 4
- `CUSTOMER`: 10 (created during customer onboarding verification)
- Admin privileges granted to wallet connects: **0**

---

# 4. ITEM 2.4: OUTLAYER DOCUMENTATION ACCURACY

## 4.1 Architectural Problem Statement
Previous documentation loosely referred to on-premise hardware enclaves. The actual production deployment leverages OutLayer's Managed Cloud TEE with dedicated execution worker wallets and server-side hardware attestation verification.

## 4.2 Engineering Implementation
Updated [`src/lib/docs/content/sectionE.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/docs/content/sectionE.tsx) under the `security/outlayer-tee` section:
1. **Managed Cloud TEE Architecture:** Clarified that execution enclaves run within OutLayer's managed cloud Intel SGX cluster with isolated RAM encryption.
2. **Dedicated Execution Wallet:** Documented that each agent is paired with a dedicated OutLayer custody address (`04fdfed3a43cd4475e3928457354d51737a5f67e865c540bf4cd35d19b1f724a`), ensuring strict isolation from customer master seed phrases.
3. **Attestation & Communication Security:** Documented that enclave quote attestation is verified server-side via OutLayer's attestation service, and all runtime communications between Mandate and OutLayer utilize TLS 1.3 with scoped worker key credentials (`wk_...`).

---

## 5. FINAL REMEDIATION VERDICT

All four Conditional GO requirements from the Milestone 13.10 review have been closed with direct code modifications, architectural guards, and verified automated tests. No open security or architectural conditions remain.

