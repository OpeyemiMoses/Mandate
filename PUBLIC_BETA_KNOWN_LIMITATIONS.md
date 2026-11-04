# MANDATE — PUBLIC BETA KNOWN LIMITATIONS
## Scope Boundaries, Operational Constraints & Customer Disclosures

**Release Target:** Open Public Beta  
**Network:** NEAR Testnet ONLY  
**Date of Certification:** November 4, 2026  
**Status:** PUBLIC DISCLOSURE APPROVED

---

# 1. NON-NEGOTIABLE FINANCIAL BOUNDARIES

### 1.1 NEAR Testnet Exclusivity
- **No Real User Funds:** Mandate operates exclusively on the NEAR Testnet. Testnet tokens ($NEAR) carry zero economic value and cannot be exchanged for real currency.
- **Mainnet Disabled:** Mainnet execution is programmatically disabled in this release. The platform will reject any attempts to configure Mainnet accounts or broadcast to Mainnet RPC nodes.

### 1.2 Platform Transaction Ceiling
- **0.1 NEAR Hard Cap:** An immutable server-side limit caps every individual financial transaction at **0.1 NEAR ($10^{23}$ yoctoNEAR)**.
- **Mandate Hierarchy:** Users cannot configure or execute transactions exceeding this cap, even if higher amounts are specified in custom prompts or settings.

---

# 2. RESOURCE QUOTAS & USAGE LIMITS

To prevent resource abuse and guarantee platform stability for all public beta participants, the following account quotas are enforced server-side:

| Resource Dimension | Public Beta Limit | Behavior Upon Exceeding |
| :--- | :--- | :--- |
| **Max Agents per User** | **5 Agents** | Modal displays `QUOTA_EXCEEDED`; prompts user to archive inactive agents. |
| **Max Mandates per User** | **10 Mandates** | Prevents new mandate issuance until existing mandates are revoked or expired. |
| **Max Objectives per Mandate** | **20 Objectives** | Closes completed objectives to free capacity. |
| **API Request Rate Limit** | **60 requests / min / IP** | Returns HTTP 429 (`Too Many Requests`) with `Retry-After` header. |
| **Ticket Expiration Window** | **60 Seconds** | Unconsumed tickets expire automatically fail-closed. |

---

# 3. TECHNICAL & INTEGRATION CONSTRAINTS

1. **Supported Asset Type:**
   - **Native NEAR Only:** The public beta supports native $NEAR transfers. Non-native NEP-141 fungible tokens and cross-chain bridging are scheduled for subsequent production milestones.
2. **TEE Custody Model:**
   - Custody wallets are provisioned through OutLayer Managed Intel SGX enclaves. Self-hosted on-premise enclaves are not supported in this public beta.
3. **Client Interface:**
   - The platform is available as a responsive web application across desktop, tablet, and mobile browsers. Native iOS/Android app store packages are not part of the initial beta release.
4. **Deterministic yoctoNEAR Arithmetic:**
   - All balance, budget, and transaction arithmetic is calculated using exact integer yoctoNEAR strings to eliminate floating-point rounding errors.

---

# 4. CUSTOMER SUPPORT & REPORTING CHANNELS

- **Incident Reporting:** Public beta users can report execution discrepancies or anomalies directly through the in-app support widget or the public GitHub repository issue tracker.
- **Support SLA:** Community support and SRE monitoring operate during standard business hours with automated alerts firing on critical discrepancies.

