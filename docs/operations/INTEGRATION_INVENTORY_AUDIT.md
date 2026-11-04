# MANDATE — MILESTONE 13.8 INTEGRATION & ADAPTER AUDIT
## Comprehensive External Service Inventory & Verification Matrix

**Milestone:** 13.8  
**Audit Date:** 2026-11-04  
**Database:** PostgreSQL 18.6 (`mandate_prod`)  
**Network:** NEAR Testnet ONLY for blockchain integrations  
**Execution Boundary:** OutLayer Intel SGX TEE + `ExecutionBoundaryService`  
**Core Principle:** *AI proposes. Mandate enforces. The user controls. OutLayer executes.*

---

## 1. Executive Summary

This inventory documents all external integrations, communication adapters, and tool executors within the Mandate platform prior to Milestone 13.8 implementation. Every adapter has been audited against its real API/protocol endpoint, credential handling model, timeout and rate limiting parameters, evidence capture mechanisms, and independent verification capabilities.

---

## 2. Master Integration Inventory

### Integration 1: FastNEAR Testnet RPC (`near_rpc` / `fastnear_testnet_rpc`)
1. **Provider Name:** FastNEAR Testnet RPC
2. **Provider Category:** BLOCKCHAIN / FINANCIAL_QUERY
3. **Actual Endpoint:** `https://test.rpc.fastnear.com` (Fallback: `https://rpc.testnet.near.org`)
4. **Environment:** `TESTNET_ONLY`
5. **Authentication Method:** None (Public JSON-RPC 2.0 interface)
6. **Available Operations:**
   - `status`: Node health, sync status, chain ID, latest block height
   - `block`: Block header and chunk metadata by height or hash
   - `query_account`: Authoritative on-chain account balance, storage usage, code hash
   - `view_state`: Smart contract key-value state inspection
   - `EXPERIMENTAL_tx_status`: Authoritative transaction receipt and execution outcome
7. **Required Permissions & Scopes:** `blockchain:read`, `blockchain:verify` (Read-only, no private keys)
8. **Credential Storage Location:** None required for public queries. Controller account keys held strictly in OutLayer TEE.
9. **Timeout Configuration:** Default 10,000 ms with AbortController signal
10. **Rate Limits:** 60 requests/minute per client IP
11. **Retry Strategy:** Up to 3 retries with exponential backoff ($1000\text{ ms} \times 2^n$) and jitter
12. **Error Handling:** Returns `status: UNAVAILABLE` with circuit breaker tripped; falls back to secondary testnet RPC
13. **Evidence Returned:** Cryptographic block hashes, block heights, ISO-8601 timestamps, state root proofs, JSON-RPC correlation ID
14. **Independent Verification Method:** Cross-checked against block headers and secondary NEAR RPC nodes
15. **Current Implementation Status:** **`LIVE_AND_VERIFIED`**

---

### Integration 2: OutLayer Intel SGX TEE Custody (`outlayer_tee`)
1. **Provider Name:** OutLayer Intel SGX TEE Key Custody
2. **Provider Category:** HARDWARE_CUSTODY / FINANCIAL_EXECUTION
3. **Actual Endpoint:** `https://testnet-api.outlayer.ai`
4. **Environment:** `TESTNET_ONLY`
5. **Authentication Method:** `API_KEY` (`wk_` prefix, never exposed to LLM or client)
6. **Available Operations:**
   - `health_check`: Enclave health and readiness ping
   - `get_wallet_balance`: On-chain balance for TEE-custodied wallet
   - `sign_and_send_transaction`: Non-interactive, policy-checked transaction dispatch
   - `get_tee_attestation`: Intel SGX hardware quote and enclave measurement
7. **Required Permissions & Scopes:** `tee:custody`, `tx:sign` (Restricted by mandate spending limits and allowlisted recipients)
8. **Credential Storage Location:** Server-side AES-256-GCM encrypted via `CredentialVault` in `Wallet.apiKey` column; never stored in objective checkpoints or plain logs
9. **Timeout Configuration:** 15,000 ms; fail-closed on ambiguous timeout
10. **Rate Limits:** 30 requests/minute
11. **Retry Strategy:** Max 2 retries on network reset; strictly 0 blind retries after broadcast
12. **Error Handling:** Ambiguous timeouts mark execution as `REQUIRES_RECOVERY`; financial reservation held until authoritative on-chain reconciliation
13. **Evidence Returned:** Base58 transaction hash, signed execution receipt, enclave signature, gas/token burn stats
14. **Independent Verification Method:** FastNEAR RPC independent lookup of transaction hash, verifying sender, recipient, amount, and `final_execution_status: FINAL`
15. **Current Implementation Status:** **`LIVE_BUT_PARTIALLY_VERIFIED`** (Connectivity and balance queries verified; full hardware quote attestation requires explicit evaluation)

---

### Integration 3: DuckDuckGo Web Discovery (`duckduckgo` / `duckduckgo_search`)
1. **Provider Name:** DuckDuckGo Web Discovery & Search
2. **Provider Category:** INFORMATION_DISCOVERY / RESEARCH
3. **Actual Endpoint:** `https://html.duckduckgo.com/html/` (Fallback: `https://api.duckduckgo.com/`)
4. **Environment:** `PRODUCTION`
5. **Authentication Method:** None
6. **Available Operations:**
   - `search`: Keyword web search returning parsed titles, snippets, and source URLs
   - `market_intelligence`: Targeted vendor capability lookups
   - `validate_domain`: Verifies external domain existence
7. **Required Permissions & Scopes:** `web:read`, `search:read`
8. **Credential Storage Location:** None required
9. **Timeout Configuration:** 12,000 ms with AbortController
10. **Rate Limits:** 30 requests/minute with jitter
11. **Retry Strategy:** Max 2 retries with exponential backoff
12. **Error Handling:** Graceful degradation returning cached analytics source providers on rate limiting or HTML changes
13. **Evidence Returned:** Real public URLs, page titles, snippet text, retrieval timestamp, HTTP status
14. **Independent Verification Method:** Automated HTTP GET / HEAD verification of retrieved source URLs by independent validation agent
15. **Current Implementation Status:** **`LIVE_AND_VERIFIED`**

---

### Integration 4: Generic REST API Adapter (`rest_api` / `rest_generic`)
1. **Provider Name:** Universal REST API Adapter
2. **Provider Category:** EXTERNAL_INTEGRATION
3. **Actual Endpoint:** Configurable per tenant (e.g., `https://api.coingecko.com`, custom partner APIs)
4. **Environment:** `PRODUCTION` / `TESTNET` / `STAGING` (Per tenant config)
5. **Authentication Method:** Configurable: `API_KEY` (Header / Query), `BEARER_TOKEN`, or `BASIC_AUTH`
6. **Available Operations:**
   - `http_get`: Perform safe parameterized GET request
   - `http_post`: Perform structured POST request
   - `http_put`: Update resource
   - `http_delete`: Delete resource (Requires CRITICAL confirmation)
7. **Required Permissions & Scopes:** `http:call`, granular operation-level permissions in `IntegrationOperationPermission`
8. **Credential Storage Location:** Encrypted at rest in `IntegrationConnection.encryptedCredentials` using `CredentialVault` (AES-256-GCM)
9. **Timeout Configuration:** Configurable, default 10,000 ms (Max 30,000 ms)
10. **Rate Limits:** Enforced client-side: 60 requests/minute
11. **Retry Strategy:** Max 2 retries on 5xx / 429 with backoff; 0 retries on 4xx
12. **Error Handling:** SSRF protection filters loopback / private IP ranges (`127.0.0.1`, `10.0.0.0/8`, `169.254.169.254`); sanitizes responses
13. **Evidence Returned:** Sanitized JSON response, HTTP status code, response headers, correlation ID
14. **Independent Verification Method:** Hash comparison of returned payload, schema validation, and secondary query where supported
15. **Current Implementation Status:** **`LIVE_AND_VERIFIED`**

---

### Integration 5: Model Context Protocol Adapter (`mcp_server` / `mcp_generic`)
1. **Provider Name:** Universal Model Context Protocol (MCP) Adapter
2. **Provider Category:** EXTERNAL_INTEGRATION / AI_TOOLING
3. **Actual Endpoint:** Configurable (`http://localhost:8000/sse`, `stdio://`)
4. **Environment:** `DEVELOPMENT_ONLY` (Local or containerized MCP servers)
5. **Authentication Method:** `API_KEY` or `BEARER_TOKEN` (Header-based)
6. **Available Operations:**
   - `list_tools`: Dynamic tool discovery and schema extraction
   - `call_tool`: Governed invocation of discovered MCP tools
   - `list_resources`: Discovery of read-only context resources
   - `read_resource`: Retrieval of context documents
7. **Required Permissions & Scopes:** `mcp:tools`, `mcp:resources`
8. **Credential Storage Location:** Encrypted at rest in `IntegrationConnection.encryptedCredentials` (AES-256-GCM)
9. **Timeout Configuration:** 30,000 ms
10. **Rate Limits:** Host runtime bounded
11. **Retry Strategy:** Single retry on connection reset
12. **Error Handling:** Process isolation, schema rejection on malformed JSON-RPC 2.0 payloads
13. **Evidence Returned:** JSON-RPC 2.0 tool result payload, duration, status
14. **Independent Verification Method:** Output schema validation and cryptographic result fingerprinting
15. **Current Implementation Status:** **`CONNECTED_NOT_TESTED`**

---

### Integration 6: Slack Webhook Adapter (`slack` / `slack_webhook`)
1. **Provider Name:** Slack Webhook & Messaging Adapter
2. **Provider Category:** COMMUNICATION
3. **Actual Endpoint:** `https://hooks.slack.com/services/...`
4. **Environment:** `PRODUCTION`
5. **Authentication Method:** Webhook Token URL / `BEARER_TOKEN`
6. **Available Operations:**
   - `send_message`: Plain text notification
   - `post_block_kit`: Structured interactive card with approve/reject buttons
7. **Required Permissions & Scopes:** `notify:slack`
8. **Credential Storage Location:** Encrypted at rest in `IntegrationConnection.encryptedCredentials` (AES-256-GCM)
9. **Timeout Configuration:** 8,000 ms
10. **Rate Limits:** 1 request/second per channel (Slack rate limits)
11. **Retry Strategy:** Max 2 retries with 1000ms delay on 429/500
12. **Error Handling:** Fails gracefully without blocking core execution pipeline
13. **Evidence Returned:** HTTP 200 `ok`, timestamp, message fingerprint
14. **Independent Verification Method:** Nonce echo in block kit callback
15. **Current Implementation Status:** **`CONNECTED_NOT_TESTED`**

---

### Integration 7: Discord Webhook Adapter (`discord_webhook`)
1. **Provider Name:** Discord Webhook Adapter
2. **Provider Category:** COMMUNICATION
3. **Actual Endpoint:** `https://discord.com/api/webhooks/...`
4. **Environment:** `PRODUCTION`
5. **Authentication Method:** Webhook URL Token
6. **Available Operations:**
   - `send_message`: Channel alert
   - `post_embed`: Rich embed card
7. **Required Permissions & Scopes:** `notify:channel`
8. **Credential Storage Location:** Encrypted at rest in `IntegrationConnection.encryptedCredentials` (AES-256-GCM)
9. **Timeout Configuration:** 8,000 ms
10. **Rate Limits:** 5 requests/5 seconds
11. **Retry Strategy:** Max 2 retries respecting `Retry-After` header
12. **Error Handling:** Non-blocking notification failure logging
13. **Evidence Returned:** HTTP 204 No Content, message ID
14. **Independent Verification Method:** Discord message ID capture
15. **Current Implementation Status:** **`CONNECTED_NOT_TESTED`**

---

## 3. Classification Summary Matrix

| Provider ID | Provider Name | Category | Environment | Auth Method | Current Status |
|---|---|---|---|---|---|
| `fastnear_testnet_rpc` | FastNEAR Testnet RPC | BLOCKCHAIN | TESTNET | None | **`LIVE_AND_VERIFIED`** |
| `outlayer_tee` | OutLayer Intel SGX TEE | HARDWARE_CUSTODY | TESTNET | API_KEY | **`LIVE_BUT_PARTIALLY_VERIFIED`** |
| `duckduckgo_search` | DuckDuckGo Web Search | SEARCH | PRODUCTION | None | **`LIVE_AND_VERIFIED`** |
| `rest_api` | Generic REST API Adapter | EXTERNAL_API | PRODUCTION / TESTNET | BEARER / API_KEY | **`LIVE_AND_VERIFIED`** |
| `mcp_server` | MCP Tool Adapter | AI_TOOLING | DEVELOPMENT | BEARER | **`CONNECTED_NOT_TESTED`** |
| `slack` | Slack Webhook Adapter | COMMUNICATION | PRODUCTION | BEARER | **`CONNECTED_NOT_TESTED`** |
| `discord_webhook` | Discord Webhook Adapter | COMMUNICATION | PRODUCTION | NONE (URL Token) | **`CONNECTED_NOT_TESTED`** |

---

## 4. Architectural Findings & Action Plan for Milestone 13.8

1. **Tool Invocation Binding in Dispatch Pipeline:**
   In M13.5, agents returned structured outputs, but `ToolExecutor.execute()` was not always called during objective task steps if an agent executed an internal routine. In M13.8, we must enforce that all external interactions flow strictly through `ToolExecutor.execute()`, persisting `ToolInvocation` records with provider correlation IDs and latency metrics.

2. **Independent Verification Engine (Phase 4):**
   Extend `TaskVerificationService` and create a dedicated `IndependentEvidenceService` that enforces anti-self-certification:
   - Verifier agent MUST be distinct from the executing agent (`verifierAgentId !== executingAgentId`).
   - Verifier MUST independently fetch and validate external provider evidence (e.g., verifying that a source URL is live and contains expected content, or querying FastNEAR RPC for block state).

3. **OutLayer TEE Attestation (Phase 7):**
   Evaluate and test authenticated OutLayer TEE execution vs. endpoint availability, documenting hardware enclave quotes and cryptographic custody boundaries.

4. **Failure Injections (Phase 5):**
   Execute all 20 failure injection scenarios across providers (rate limits, timeouts, corrupted bodies, malformed responses, SSRF attempts, cross-tenant isolation).

