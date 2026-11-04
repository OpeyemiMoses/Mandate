import { PolicyTemplateDefinition } from "./types";
import { nearToYocto } from "@/lib/yocto";

export const POLICY_TEMPLATES: Record<string, PolicyTemplateDefinition> = {
  RESEARCH_ONLY: {
    id: "RESEARCH_ONLY",
    name: "Research-Only Governance Policy",
    description: "Strictly confines agent to analytical research and web browsing. Prohibits all financial transfers, wallet actions, and mutation APIs.",
    scope: "AGENT",
    riskLevel: "LOW",
    rules: [
      {
        ruleType: "DENIED_TOOLS",
        operator: "IN",
        field: "toolId",
        value: ["transfer_funds", "near_transfer", "outlayer_vault", "execute_payment", "wallet_withdraw"],
        action: "DENY",
        description: "Deny all payment and wallet mutation tools for research agents.",
        isEnforced: true,
      },
      {
        ruleType: "PROHIBITED_ACTION",
        operator: "CONTAINS",
        field: "operation",
        value: "transfer",
        action: "DENY",
        description: "Prohibit any transfer operations.",
        isEnforced: true,
      },
      {
        ruleType: "TRANSACTION_LIMIT",
        operator: "GREATER_THAN",
        field: "amountYocto",
        value: "0",
        action: "DENY",
        description: "Zero budget allocation. Financial transactions are completely blocked.",
        isEnforced: true,
      },
    ],
  },

  PROCUREMENT_APPROVED_RECIPIENTS: {
    id: "PROCUREMENT_APPROVED_RECIPIENTS",
    name: "Procurement with Approved Vendor Whitelist",
    description: "Restricts procurement agent disbursements to explicit vendor allowlists with a 5 NEAR per-transaction cap and mandatory approval above 0.5 NEAR.",
    scope: "AGENT",
    riskLevel: "MEDIUM",
    rules: [
      {
        ruleType: "RECIPIENT_ALLOWLIST",
        operator: "IN",
        field: "recipient",
        value: ["vendor-hardware.testnet", "cloud-provider.testnet", "custody-vendor.testnet", "outlayer-vault.testnet"],
        action: "DENY",
        description: "Only verified vendor recipients are authorized for disbursement.",
        isEnforced: true,
      },
      {
        ruleType: "TRANSACTION_LIMIT",
        operator: "GREATER_THAN",
        field: "amountYocto",
        value: nearToYocto("5.0"),
        action: "DENY",
        description: "Hard cap: reject any single transaction exceeding 5.0 NEAR.",
        isEnforced: true,
      },
      {
        ruleType: "SPENDING_THRESHOLD",
        operator: "GREATER_THAN",
        field: "amountYocto",
        value: nearToYocto("0.5"),
        action: "REQUIRE_APPROVAL",
        description: "Require human signature for vendor payments exceeding 0.5 NEAR.",
        isEnforced: true,
      },
    ],
  },

  TREASURY_SPENDING_LIMITS: {
    id: "TREASURY_SPENDING_LIMITS",
    name: "Treasury Guardrails & Liquidity Limits",
    description: "Enforces strict limits on treasury operations, capping individual disbursements at 10 NEAR and mandating multi-signature approval for any allocation > 2 NEAR.",
    scope: "MANDATE",
    riskLevel: "HIGH",
    rules: [
      {
        ruleType: "TRANSACTION_LIMIT",
        operator: "GREATER_THAN",
        field: "amountYocto",
        value: nearToYocto("10.0"),
        action: "DENY",
        description: "Hard limit: absolute maximum single treasury transaction is 10.0 NEAR.",
        isEnforced: true,
      },
      {
        ruleType: "SPENDING_THRESHOLD",
        operator: "GREATER_THAN",
        field: "amountYocto",
        value: nearToYocto("2.0"),
        action: "REQUIRE_APPROVAL",
        description: "Require human approval for treasury transfers exceeding 2.0 NEAR.",
        isEnforced: true,
      },
      {
        ruleType: "PROHIBITED_ACTION",
        operator: "EQUALS",
        field: "operation",
        value: "wallet_withdraw",
        action: "DENY",
        description: "Direct wallet withdrawal requires manual off-chain escalation.",
        isEnforced: true,
      },
    ],
  },

  EXTERNAL_MESSAGING_APPROVAL: {
    id: "EXTERNAL_MESSAGING_APPROVAL",
    name: "External Communication Gatekeeper",
    description: "Enforces a human-in-the-loop approval gate before an agent can publish messages or send notifications to external channels (Slack, Email, GitHub).",
    scope: "USER",
    riskLevel: "MEDIUM",
    rules: [
      {
        ruleType: "APPROVAL_REQUIREMENT",
        operator: "IN",
        field: "operation",
        value: ["send_message", "post_notification", "publish_slack_alert", "send_email"],
        action: "REQUIRE_APPROVAL",
        description: "External notifications require explicit approval to prevent hallucinated communications.",
        isEnforced: true,
      },
    ],
  },

  HIGH_VALUE_ACTION_APPROVAL: {
    id: "HIGH_VALUE_ACTION_APPROVAL",
    name: "High-Value Action Approval Policy",
    description: "Universal security rule: any operation with financial exposure exceeding 1.0 NEAR automatically triggers a mandatory cryptographic approval gate.",
    scope: "USER",
    riskLevel: "HIGH",
    rules: [
      {
        ruleType: "SPENDING_THRESHOLD",
        operator: "GREATER_THAN",
        field: "amountYocto",
        value: nearToYocto("1.0"),
        action: "REQUIRE_APPROVAL",
        description: "Any operation exceeding 1.0 NEAR requires explicit human approval.",
        isEnforced: true,
      },
    ],
  },

  RESTRICTED_INTEGRATION_ACCESS: {
    id: "RESTRICTED_INTEGRATION_ACCESS",
    name: "Restricted Integration Access Policy",
    description: "Limits access to connected external integrations to read-only queries and approved endpoints, blocking destructive deletion and credential management.",
    scope: "INTEGRATION",
    riskLevel: "MEDIUM",
    rules: [
      {
        ruleType: "DENIED_TOOLS",
        operator: "CONTAINS",
        field: "operation",
        value: "delete",
        action: "DENY",
        description: "Prohibit delete operations on external integrations.",
        isEnforced: true,
      },
      {
        ruleType: "DENIED_TOOLS",
        operator: "CONTAINS",
        field: "operation",
        value: "revoke",
        action: "DENY",
        description: "Prevent agents from autonomously revoking integration credentials.",
        isEnforced: true,
      },
    ],
  },

  READ_ONLY_SECURITY_AUDITOR: {
    id: "READ_ONLY_SECURITY_AUDITOR",
    name: "Read-Only Security Auditor Policy",
    description: "Restricts security auditor agents strictly to read, inspect, and verify operations. Completely blocks financial transfers and external state mutations.",
    scope: "AGENT",
    riskLevel: "LOW",
    rules: [
      {
        ruleType: "ALLOWED_OPERATIONS",
        operator: "IN",
        field: "operation",
        value: [
          "compliance_audit",
          "transaction_verification",
          "policy_validation",
          "read_audit_chain",
          "inspect_balances",
          "get_status",
        ],
        action: "DENY",
        description: "Only explicit read and verification operations permitted.",
        isEnforced: true,
      },
      {
        ruleType: "TRANSACTION_LIMIT",
        operator: "GREATER_THAN",
        field: "amountYocto",
        value: "0",
        action: "DENY",
        description: "Security auditor cannot hold or disburse funds.",
        isEnforced: true,
      },
    ],
  },
};

export function getAvailableTemplates(): PolicyTemplateDefinition[] {
  return Object.values(POLICY_TEMPLATES);
}

