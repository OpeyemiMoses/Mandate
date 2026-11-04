# MANDATE — MILESTONE 13.9
## Remaining Risk Register & Production Hardening Roadmap

**Milestone:** 13.9  
**Architecture:** NEAR Protocol + OutLayer Intel SGX TEE  
**Database:** PostgreSQL 18.6 (`mandate_prod`)  
**Network:** NEAR Testnet ONLY  
**Execution Boundary:** `ExecutionBoundaryService` + OutLayer TEE  
**Audit Standard:** ISO/IEC 27005 & NIST SP 800-30 Risk Assessment  

---

### CORE PRINCIPLE
**AI proposes. Mandate enforces. The user controls. OutLayer executes.**  
*Transparency in risk posture is essential for mission-critical autonomous financial systems.*

---

## 1. COMPREHENSIVE RISK REGISTER

The following register details all identified residual risks following the completion and remediation of Milestone 13.9:

| Risk ID | Category | Risk Description | Likelihood | Impact | Inherent Risk | Existing Mandate M13.9 Controls | Residual Risk | Production Roadmap Mitigation |
|---|---|---|---|---|---|---|---|---|
| **RSK-001** | **Dependencies** | Transitive vulnerabilities in frontend wallet SDKs (`@walletconnect`, `@reown`, `@web3modal`) | Medium | Medium | Medium | **Zero Server Access:** Client-side packages run strictly in the user's browser sandbox; server-side execution uses native NEAR RPC and isolated OutLayer SDK. | **LOW** | Upgrade or pin frontend wallet dependencies once upstream fixes are published; bundle client code separately. |
| **RSK-002** | **Infrastructure** | Single-Node PostgreSQL instance as single point of failure (SPOF) for persistence | Low | High | High | PostgreSQL 18.6 transactional CAS, atomic lease fencing, and automated JSON snapshot backups in `src/lib/disaster-recovery`. | **MEDIUM** | Deploy multi-region PostgreSQL cluster with synchronous replication (e.g. AWS Aurora, GCP Cloud SQL, or Patroni HA). |
| **RSK-003** | **Network** | NEAR Testnet RPC degradation, rate limiting, or network unavailability | Medium | Medium | High | Dual-provider RPC failover (FastNEAR RPC with fallback to official NEAR Testnet RPC); circuit breakers and exponential backoff. | **LOW** | Provision dedicated private NEAR RPC nodes with SLA guarantees for production mainnet deployment. |
| **RSK-004** | **Enclave Execution** | OutLayer Intel SGX TEE development simulation mode fallback | Low | High | High | Strict `OUTLAYER_MOCK_TEE` guardrails; production environment validation throws fatal error if simulation is enabled in production. | **LOW** | Enforce strict hardware DCAP quote validation with Intel Attestation Service (IAS) / Microsoft Azure Attestation in production. |
| **RSK-005** | **Secret Management** | Master encryption keys stored in server environment variables rather than dedicated KMS | Low | Critical | High | AES-256-GCM authenticated encryption; zero seed phrases stored; automated memory cache eviction after 300s TTL. | **MEDIUM** | Integrate Cloud KMS (AWS KMS / GCP Cloud KMS / HashiCorp Vault) with envelope encryption (DEK/KEK pattern). |
| **RSK-006** | **Edge Security** | Distributed Denial of Service (DDoS) or high-frequency API abuse | Medium | Medium | Medium | In-process rate limiting via `ExecutionGateService`, Redis token buckets, and per-tenant burst limits. | **LOW** | Deploy Cloudflare Enterprise or AWS WAF at the ingress edge with IP reputation filtering and DDoS mitigation. |
| **RSK-007** | **LLM Non-Determinism** | Agent proposing hallucinatory plans or invalid tool arguments | High | Low | Medium | Five-tier plan validation (`ObjectivePlanValidationService`), static DAG decomposition, canonical plan hashing, human approval requirement. | **VERY LOW** | Continuous prompt regression evaluations and adversarial LLM output fuzzing in CI/CD pipeline. |

---

## 2. DETAILED ANALYSIS OF KEY RISKS

### 2.1 RSK-001: Client-Side Transitive Dependencies (`npm audit`)
- **Analysis:** Running `npm audit` reveals 65 reported vulnerabilities across transitive dependencies of `@reown/appkit`, `@walletconnect/ethereum-provider`, and related Web3Modal packages (primarily `ws`, `axios`, and protobuf sub-packages).
- **Security Boundary Evaluation:**
  - None of these packages are imported or executed inside `ExecutionBoundaryService`, `PolicyEngine`, `CredentialVault`, `AuditLedgerService`, or `OutLayer` integration adapters.
  - Mandate's backend execution engine runs on Node.js / PostgreSQL and communicates with NEAR Testnet via standard `fetch` and native crypto primitives.
  - Browser-side wallet connection libraries are confined to the browser DOM context and communicate only with wallet browser extensions (e.g., NEAR Wallet Selector).
- **Residual Risk:** Low. No path exists for a remote attacker to achieve server-side code execution or financial authorization bypass via these client-side dependencies.

### 2.2 RSK-002: Single-Node Database Architecture
- **Analysis:** During Milestone 13.7, Mandate successfully migrated from SQLite to PostgreSQL 18.6 (`mandate_prod`), introducing ACID transactional guarantees, row-level locks, and CAS concurrency control. However, the current deployment runs on a single local or containerized PostgreSQL instance.
- **Impact of Failure:** If the database host crashes, active background jobs and in-flight executions pause until the container restarts. Monotonic lease generations and fencing tokens prevent duplicate execution upon restart, but availability is interrupted.
- **Production Roadmap:**
  - Deploy Managed PostgreSQL with synchronous hot-standby replicas.
  - Configure automated failover with sub-30-second RTO.
  - Implement point-in-time recovery (PITR) with continuous WAL archiving to S3/GCS.

### 2.3 RSK-003: Blockchain RPC Dependency
- **Analysis:** Blockchain state queries (such as transaction finality checks and yoctoNEAR account balance verifications) depend on NEAR Testnet RPC availability. Testnet RPC nodes can experience intermittent latency spikes or downtime.
- **Mitigation Implemented:**
  - `NearRpcService` uses a multi-endpoint failover strategy:
    1. Primary: FastNEAR Testnet RPC (`https://test.rpc.fastnear.com`)
    2. Secondary: Official NEAR Testnet RPC (`https://rpc.testnet.near.org`)
  - All calls implement exponential backoff with jitter and a 10-second hard timeout.
  - If RPC verification cannot confirm finality, the transaction remains in `DISPATCHED` status and is deferred to the background reconciliation worker rather than failing open.

### 2.4 RSK-004: TEE Enclave Hardware Availability
- **Analysis:** During local testing and staging environments, Intel SGX hardware may not be available on all developer machines. Mandate provides a development fallback mode that simulates TEE attestation receipts.
- **Security Boundary:**
  - In `src/lib/production/environmentValidation.ts`, setting `NODE_ENV === "production"` with `OUTLAYER_MOCK_TEE = true` immediately halts server startup with `ConfigurationError: MOCK_TEE cannot be enabled in production`.
  - In production, real hardware attestation quotes (`SGX_DCAP` / `SGX_EPID`) are verified against Intel CRLs.

---

## 3. RISK MANAGEMENT CONCLUSION

All identified risks are well-understood, bounded by strict architectural isolation, and mitigated by fail-closed software controls. None of the residual risks undermine the core security guarantee of Milestone 13.9:
**An autonomous agent cannot exceed user-granted authority or execute unauthorized financial transactions.**

- **Overall Residual Risk Rating:** **LOW / ACCEPTABLE FOR PRODUCTION TESTING**
- **Recommended Next Review Date:** Prior to Milestone 14 (Mainnet Production Readiness)

