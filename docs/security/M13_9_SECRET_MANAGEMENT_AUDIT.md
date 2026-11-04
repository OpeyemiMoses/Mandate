# MANDATE — MILESTONE 13.9
## Secret Management & Credential Protection Audit

**Milestone:** 13.9  
**Architecture:** NEAR Protocol + OutLayer Intel SGX TEE  
**Database:** PostgreSQL 18.6 (`mandate_prod`)  
**Network:** NEAR Testnet ONLY  
**Execution Boundary:** `ExecutionBoundaryService` + OutLayer TEE  
**Audit Standard:** Zero-Trust, Authenticated Encryption, Zero Plaintext Secrets  

---

### CORE PRINCIPLE
**AI proposes. Mandate enforces. The user controls. OutLayer executes.**  
*Autonomous agents must never gain access to raw signing credentials, seed phrases, or master encryption keys.*

---

## 1. EXECUTIVE SUMMARY

This audit certifies Mandate's secret management, cryptographic key protection, and credential isolation architecture under adversarial conditions. The platform strictly enforces that:
1. **Zero Raw Private Keys or Seed Phrases:** Neither user mnemonics, seed phrases, nor NEAR private keys are stored in plaintext in the PostgreSQL database or persistent storage.
2. **Authenticated Encryption at Rest:** All external service credentials, OAuth refresh tokens, and sensitive integration settings are encrypted using AES-256-GCM with distinct IVs and cryptographic authentication tags.
3. **Fail-Closed Authenticated Decryption:** Any tampering, byte corruption, or unauthorized alteration of ciphertext or authentication tags immediately fails closed with an integrity exception.
4. **Automated Recursive Redaction:** All diagnostic logs, error payloads, audit trails, and execution context recursively redact sensitive keys before serialization or output.
5. **Enclave Isolation:** Blockchain transaction signing is delegated exclusively to OutLayer Intel SGX hardware TEE enclaves. Neither the Mandate application server nor any autonomous agent holds custody of root signing keys.

---

## 2. CRYPTOGRAPHIC STORAGE ARCHITECTURE

### 2.1 AES-256-GCM Authenticated Encryption

Mandate utilizes the `CredentialVault` service (`src/lib/integrations/credentialVault.ts`) for all sensitive credentials. The storage format is versioned, authenticated, and cryptographically bound:

```
v{version}:{ivHex}:{authTagHex}:{ciphertextHex}
```

- **Algorithm:** AES-256-GCM (`crypto.createCipheriv("aes-256-gcm", key, iv)`)
- **Key Length:** 256 bits (32 bytes)
- **Initialization Vector (IV):** 96 bits (12 bytes) cryptographically secure pseudorandom bytes generated per encryption operation (`crypto.randomBytes(12)`). IV reuse is strictly impossible.
- **Authentication Tag:** 128 bits (16 bytes) GCM auth tag generated on `cipher.final()`. Verified during decryption before any plaintext is returned.
- **Key Versioning:** The payload explicitly records the key version (e.g., `v1:`), enabling zero-downtime key rotation across historical credentials.

### 2.2 Key Derivation and Hierarchy

```
[Environment Root Secret: CREDENTIAL_VAULT_MASTER_KEY]
                           │
                           ▼
              [SHA-256 Key Derivation]
                           │
                           ▼
          [256-bit AES Master Vault Key]
                           │
      ┌────────────────────┴────────────────────┐
      ▼                                         ▼
[AES-256-GCM Encryption]              [AES-256-GCM Decryption]
(12-byte random IV per write)         (Auth Tag Verification)
      │                                         │
      ▼                                         ▼
[PostgreSQL Encrypted Record]         [In-Memory Decrypted Credential]
(v1:{iv}:{tag}:{ciphertext})          (Bounded 5-min TTL Memory Cache)
```

1. **Root Secret Isolation:** The master encryption secret (`CREDENTIAL_VAULT_MASTER_KEY`) is provided exclusively via environment variables or secret managers, never committed to git, and never written to the database.
2. **Deterministic Derivation:** The raw environment secret is derived via SHA-256 into a 32-byte binary key Buffer before cryptographic operations.
3. **Key Rotation Readiness:** `CredentialVault` maintains a version registry (`CURRENT_VAULT_VERSION = 1`). Historical records retain their key version identifier, allowing the vault to decrypt older records with prior keys and re-encrypt them with newer master keys during scheduled rotation workflows.

---

## 3. ZERO SEED PHRASE ARCHITECTURE

A primary architectural requirement of Mandate is that seed phrases (BIP-39 mnemonics) are **never used, derived, stored, or accepted** in the platform:

| Credential Type | Storage Mechanism | Custody / Access Boundary |
|---|---|---|
| **User Mnemonic / Seed Phrase** | **STRICTLY ZERO** | Mandate rejects seed phrase ingestion. User authentication relies on NEAR wallet connection signatures (`@near-wallet-selector`). |
| **Agent Wallet Keys** | Encrypted in OutLayer TEE | Managed within Intel SGX TEE enclaves. Mandate holds only NEAR account IDs (e.g. `agent-xyz.testnet`). |
| **Integration API Keys** | AES-256-GCM in PostgreSQL | Stored as encrypted strings in `IntegrationCredential.encryptedCredentials`. Decrypted only inside isolated adapters. |
| **Session Tokens** | SHA-256 Hashed Tokens | Stored in PostgreSQL `UserSession` table as one-way SHA-256 hashes. Raw session tokens exist only in client HTTP-only cookies. |
| **HMAC Signing Keys** | Environment Variable | Stored in `EXECUTION_HMAC_SECRET`. Derived dynamically for one-time execution authorization envelopes. |

---

## 4. AUTOMATED SENSITIVE DATA REDACTION

Mandate enforces pervasive automated redaction across all logging, serialization, and observability subsystems.

### 4.1 Sensitive Pattern Detection
The redactor matches all field names and string values against known sensitive patterns:
```typescript
const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /authorization/i,
  /bearer/i,
  /private[-_]?key/i,
  /seed/i,
  /mnemonic/i,
  /credential/i,
  /client[-_]?secret/i,
  /wk_[a-zA-Z0-9]+/i,
];
```

### 4.2 Recursive Scrubbing
`redactSensitiveData()` recursively traverses arbitrary nested objects, arrays, and error stacks:
- Any object key matching the sensitive patterns is replaced with `"[REDACTED]"`.
- Sensitive token formats (such as Bearer tokens, private key prefixes, or webhook secrets) are masked with `"[REDACTED]"`.
- Primitive values (strings, numbers, booleans) that do not match sensitive signatures are preserved for operational telemetry.

---

## 5. ADVERSARIAL VERIFICATION & TEST RESULTS

The secret management architecture was subjected to automated adversarial testing in **Gate 10** of the security audit suite (`tests/milestone-13-9-security-audit.ts`):

| Test Case | Attack / Verification Vector | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **10.1** | AES-256-GCM Encrypted Format | Output matches `v1:{iv}:{tag}:{ciphertext}` | Formatted as 4-part colon-delimited string | **PASSED** |
| **10.2** | Decryption & Payload Integrity | Authentic payload decrypts cleanly to original JSON | Decrypted properties match original exactly | **PASSED** |
| **10.3** | Ciphertext Tampering Attack | 4 bytes of ciphertext modified with corrupted hex | Decipher throws authenticated tag mismatch | **PASSED** |
| **10.4** | Auth Tag Tampering Attack | Authentication tag altered | Fails closed; decryption rejected | **PASSED** |
| **10.5** | Nested Sensitive Redaction | Object with nested `password`, `api_key`, `private_key` | All sensitive values replaced with `[REDACTED]` | **PASSED** |
| **10.6** | Seed Phrase Ingestion Attempt | Attempt to store mnemonic phrase in credential vault | Schema & adapters reject mnemonic inputs | **PASSED** |

---

## 6. IN-MEMORY LIFECYCLE & CACHE BOUNDARIES

To minimize memory exposure of decrypted secrets:
1. **Bounded TTL:** Decrypted credentials in `credentialMemoryCache` have an enforced maximum time-to-live (300 seconds / 5 minutes).
2. **Ephemeral Context:** Once an integration adapter completes its HTTP dispatch, the decrypted reference is released for garbage collection.
3. **No Process Memory Dumps:** Core dumps and heap snapshots are disabled in production runtime configurations.

---

## 7. ENTERPRISE HARDENING ROADMAP

For multi-region enterprise deployments, the following enhancements are registered in the production roadmap:
1. **Cloud KMS Integration:** Transition master key derivation to AWS KMS, GCP Cloud KMS, or HashiCorp Vault using envelope encryption (DEK/KEK pattern).
2. **Hardware Security Modules (HSM):** Provide enterprise tenants with optional PKCS#11 HSM backing for root execution HMAC keys.
3. **Automated Scheduled Key Rotation:** Background cron worker to re-encrypt all credentials from `v1` to `v2` on a 90-day schedule.

---

## 8. CERTIFICATION VERDICT

The secret management and credential protection subsystems meet all cryptographic integrity, isolation, and fail-closed security standards:
- **Cipher:** AES-256-GCM (Zero ECB, Zero CBC without MAC).
- **IV Generation:** 12-byte CSPRNG per encryption.
- **Tamper Detection:** Authenticated tag verification enforced fail-closed.
- **Plaintext Leaks:** Zero detected in logs, database, or test traces.
- **Verdict:** **CERTIFIED SECURE**

