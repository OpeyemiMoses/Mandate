# MANDATE — OWNER DEPLOYMENT APPROVAL CHECKLIST
## Formal Authorization Sheet for Open Public Beta Deployment & Public Cutover

**Project:** Mandate  
**Release Target:** Open Public Beta (NEAR Testnet)  
**Release Tag:** `v1.0.0-beta.1`  
**Certification Status:** READY FOR OWNER DEPLOYMENT APPROVAL  
**Guiding Invariant:** AI proposes. Mandate enforces. The user controls. OutLayer executes.

---

# 1. PREREQUISITE CERTIFICATION SUMMARY

Before public DNS cutover, production container deployment, or opening registration to the public, verify that all underlying technical milestones and launch preparation gates have been certified:

| Item | Gate Description | Evidence Reference | Verified |
| :---: | :--- | :--- | :---: |
| **01** | **M1–M13.10 Completion** | Engineering milestone programme fully completed as reported. | `OPEN_PUBLIC_BETA_READINESS_REPORT.md` | [x] |
| **02** | **Boundary Ticket Bindings** | HMAC-SHA256 binds 12 parameters including `objectiveId` and `userNearAccountId`. | `CONDITIONAL_GO_REMEDIATION_REPORT.md` | [x] |
| **03** | **0.1 NEAR Platform Ceiling** | Hard platform-wide limit of 0.1 NEAR ($10^{23}$ yoctoNEAR) strictly enforced. | `BETA_TRANSACTION_LIMIT_VERIFICATION.md` | [x] |
| **04** | **Data Separation** | 945 historical test accounts classified; wallet connect grants zero admin rights. | `DEVELOPMENT_ACCOUNT_CLASSIFICATION_REPORT.md` | [x] |
| **05** | **OutLayer Docs Accuracy** | Documentation accurately reflects managed cloud TEE and dedicated custody. | `CONDITIONAL_GO_REMEDIATION_REPORT.md` | [x] |
| **06** | **20-Step Customer Onboarding** | Full user onboarding journey passed 100% on live PostgreSQL 18.6. | `CUSTOMER_ONBOARDING_ACCEPTANCE_REPORT.md` | [x] |
| **07** | **PostgreSQL Disaster Recovery** | Sub-second SQL snapshot (39.8 MB) with cryptographic SHA-256 integrity verification. | `BACKUP_AND_RESTORE_ACCEPTANCE.md` | [x] |
| **08** | **Environment Audit** | Fail-closed guards verified; credentials and secrets protected. | `PUBLIC_BETA_ENVIRONMENT_AUDIT.md` | [x] |
| **09** | **Security Controls Checklist** | All 12 security controls verified against adversarial tampering. | `PUBLIC_BETA_SECURITY_CHECKLIST.md` | [x] |
| **10** | **Observability & Alerts** | Prometheus metrics, OpenTelemetry tracing, and emergency kill-switches active. | `OBSERVABILITY_AND_INCIDENT_READINESS.md` | [x] |
| **11** | **Deployment Preflight** | Clean build, TypeScript types verified, migration ordering established. | `DEPLOYMENT_PREFLIGHT_REPORT.md` | [x] |
| **12** | **Zero Mainnet Operations** | System locked exclusively to NEAR Testnet; Mainnet permanently disabled. | `PUBLIC_BETA_KNOWN_LIMITATIONS.md` | [x] |

---

# 2. OWNER APPROVAL HOLD POINT

> [!CAUTION]
> **STOP — MANDATORY OWNER DECISION GATE**  
> The agent has prepared, configured, and verified all components. In accordance with system instructions, **NO public DNS cutover, production container deployment, or public registration opening will occur without explicit written authorization from the project owner.**

---

# 3. OWNER SIGN-OFF & EXECUTION AUTHORIZATION

To authorize the public beta deployment, please review the 12 documentation reports and confirm below:

- [ ] **I authorize production container deployment and database migration execution.**
- [ ] **I authorize DNS cutover and routing of public internet traffic to the Mandate application.**
- [ ] **I authorize open public registration for customer accounts on NEAR Testnet.**

**Project Owner Signature:** ______________________________________  
**Date of Authorization:** ________________________________________  
**Release Tag Approved:** `v1.0.0-beta.1`

