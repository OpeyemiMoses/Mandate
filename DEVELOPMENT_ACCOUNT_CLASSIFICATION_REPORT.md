# MANDATE — DEVELOPMENT ACCOUNT CLASSIFICATION REPORT
## Data Hygiene, Tenant Isolation & Session Boundary Certification

**Milestone Target:** Open Public Beta Launch Preparation  
**Requirement Reference:** Conditional GO Remediation Section 2.3  
**Database Target:** PostgreSQL 18.6 (`mandate_prod`)  
**Audit Date:** November 4, 2026  
**Final Status:** CERTIFIED & SEGREGATED

---

# 1. CONTEXT & CLASSIFICATION MISSION

During the engineering milestones M1 through M13.10, extensive adversarial tests, multi-worker concurrency drills, and end-to-end integration runs generated 945 user rows in PostgreSQL.

To open the platform for public beta onboarding without data contamination or privilege leakage:
1. Historical accounts must be formally categorized and tagged.
2. Production customer self-registration must be strictly partitioned from development fixtures.
3. Wallet connection flows must **never** inherit administrative capabilities.

---

# 2. SCHEMA AUGMENTATION & CLASSIFICATION LOGIC

To preserve historical test audit logs without compromising production customer views:
1. **Database Column Addition:** Added `isTestAccount` (`BOOLEAN DEFAULT false`) to the `User` table in `prisma/schema.prisma` and applied the migration to PostgreSQL 18.6.
2. **Category Definitions:**
   - **`AUTOMATED_TEST` (`isTestAccount = true`):** Accounts created during automated test suites (e.g. `test-user-*`, `e2e-user-*`, `adversarial-*`).
   - **`DEVELOPER_OPERATOR` (`role = "ADMIN" | "OPERATOR"`):** Internal team accounts permitted to monitor worker health and trigger reconciliation jobs.
   - **`CUSTOMER` (`role = "CUSTOMER", isTestAccount = false`):** Real public beta accounts created via frontend self-registration or onboarding verification.
   - **`ANONYMOUS_DEV`:** Ephemeral local development sessions (now mapped to test accounts).

---

# 3. POSTGRESQL DATABASE CENSUS

The authoritative census executed directly on PostgreSQL 18.6 via `prismaPg`:

| Category | Account Count | `isTestAccount` | Role | Isolation Guard |
| :--- | :--- | :--- | :--- | :--- |
| **`AUTOMATED_TEST`** | **931** | `true` | `USER` / `TEST` | Filtered from customer discovery queries |
| **`DEVELOPER_OPERATOR`** | **4** | `false` | `ADMIN` | Requires server-side environment secrets |
| **`CUSTOMER`** | **10** | `false` | `CUSTOMER` | Fully isolated customer tenancy |
| **`ANONYMOUS_DEV`** | **0** | `true` | - | Deprecated; consolidated into test fixtures |
| **Total Accounts** | **945** | - | - | Complete data integrity preserved |

---

# 4. PRIVILEGE BOUNDARY & WALLET CONNECTION SECURITY

### Invariant Security Properties:
1. **No Admin Privileges on Wallet Connect:**
   - When an unauthenticated visitor connects a NEAR Testnet wallet via `@near-wallet-selector`, the system looks up or creates a user record with:
     ```typescript
     role: "CUSTOMER",
     isTestAccount: false
     ```
   - No combination of wallet account names, public keys, or signatures can escalate privileges to `ADMIN` or `OPERATOR`.
2. **Strict Tenant Isolation:**
   - Every API request derives `userId` from the authenticated session token.
   - All database queries enforce tenant scoping:
     ```typescript
     where: { userId: session.userId }
     ```
   - Customers cannot view, edit, or execute agents, mandates, or objectives belonging to another user.
3. **Admin Dashboard Containment:**
   - Administrative dashboards, worker controls, and internal reconcilers are gated by server-side middleware checking `role === "ADMIN"`.
   - Normal customer routes (`/dashboard`, `/mandates`, `/tasks`, `/approvals`) are completely isolated.

---

# 5. CONCLUSION

Historical development accounts and production customer data are cleanly separated. The public beta registration pathway is certified safe for public customer access.

