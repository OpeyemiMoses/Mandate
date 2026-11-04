/**
/**
 * MANDATE — MILESTONE 13.5: TASK TAXONOMY & SEMANTIC MAPPING ENGINE
 *
 * Resolves M13.2 / M13.3 / M13.4 task taxonomy differences through an explicit, tested mapping.
 * STRICT INVARIANT: EXECUTION, VERIFICATION, VALIDATION, and COORDINATION are NEVER
 * silently treated as interchangeable.
 */

export type CanonicalTaskType =
  | "RESEARCH"
  | "ANALYSIS"
  | "EXECUTION"
  | "PAYMENT"
  | "VERIFICATION"
  | "COORDINATION"
  | "VALIDATION";

export interface TaskTypeRuleDefinition {
  type: CanonicalTaskType;
  description: string;
  isMutating: boolean;
  isFinancial: boolean;
  requiresIndependentEvaluator: boolean;
  requiresHumanApproval: boolean;
  permittedAgentRoles: string[];
  requiredOutputFields: string[];
}

export const CANONICAL_TASK_RULES: Record<CanonicalTaskType, TaskTypeRuleDefinition> = {
  RESEARCH: {
    type: "RESEARCH",
    description: "Passive information retrieval and web/RPC query. Cannot modify state.",
    isMutating: false,
    isFinancial: false,
    requiresIndependentEvaluator: false,
    requiresHumanApproval: false,
    permittedAgentRoles: ["research_procurement", "operations_execution"],
    requiredOutputFields: ["sources", "findings"],
  },
  ANALYSIS: {
    type: "ANALYSIS",
    description: "Structured evaluation, ranking matrix computation, and synthesis.",
    isMutating: false,
    isFinancial: false,
    requiresIndependentEvaluator: false,
    requiresHumanApproval: false,
    permittedAgentRoles: ["research_procurement", "security_auditor", "finance_treasury"],
    requiredOutputFields: ["metrics", "recommendation"],
  },
  EXECUTION: {
    type: "EXECUTION",
    description: "Active operational state modification (non-financial) via tool adapters.",
    isMutating: true,
    isFinancial: false,
    requiresIndependentEvaluator: false,
    requiresHumanApproval: false,
    permittedAgentRoles: ["operations_execution"],
    requiredOutputFields: ["operationStatus", "details"],
  },
  PAYMENT: {
    type: "PAYMENT",
    description: "Financial value transfer or atomic reservation on NEAR testnet.",
    isMutating: true,
    isFinancial: true,
    requiresIndependentEvaluator: true,
    requiresHumanApproval: true,
    permittedAgentRoles: ["finance_treasury", "research_procurement"],
    requiredOutputFields: ["amountNear", "recipientAccountId"],
  },
  VERIFICATION: {
    type: "VERIFICATION",
    description: "Independent post-hoc inspection of completed work and cryptographic proofs.",
    isMutating: false,
    isFinancial: false,
    requiresIndependentEvaluator: true,
    requiresHumanApproval: false,
    permittedAgentRoles: ["security_auditor", "operations_execution"],
    requiredOutputFields: ["auditChainStatus", "complianceRating"],
  },
  VALIDATION: {
    type: "VALIDATION",
    description: "Pre-execution invariant checking, schema validation, and policy compliance.",
    isMutating: false,
    isFinancial: false,
    requiresIndependentEvaluator: false,
    requiresHumanApproval: false,
    permittedAgentRoles: ["security_auditor", "research_procurement"],
    requiredOutputFields: ["valid", "evaluatedRules"],
  },
  COORDINATION: {
    type: "COORDINATION",
    description: "Workflow synchronization, multi-agent handoff management, and sub-DAG scheduling.",
    isMutating: false,
    isFinancial: false,
    requiresIndependentEvaluator: false,
    requiresHumanApproval: false,
    permittedAgentRoles: ["operations_execution", "research_procurement"],
    requiredOutputFields: ["dispatchedTasks", "synchronizedAgents"],
  },
};

/**
 * Normalizes any task type string to its canonical representation
 * Rejects unknown or ambiguous task types fail-closed.
 */
export function normalizeTaskType(rawType: string): CanonicalTaskType {
  const upper = (rawType || "").trim().toUpperCase();

  switch (upper) {
    case "RESEARCH":
      return "RESEARCH";
    case "ANALYSIS":
      return "ANALYSIS";
    case "EXECUTION":
    case "OPERATIONAL":
    case "ACTION":
      return "EXECUTION";
    case "PAYMENT":
    case "TRANSFER":
    case "DISBURSEMENT":
      return "PAYMENT";
    case "VERIFICATION":
    case "AUDIT":
    case "INDEPENDENT_VERIFICATION":
      return "VERIFICATION";
    case "VALIDATION":
    case "PRE_CHECK":
    case "POLICY_CHECK":
      return "VALIDATION";
    case "COORDINATION":
    case "ORCHESTRATION":
    case "HANDOFF":
      return "COORDINATION";
    default:
      throw new Error(
        `UNKNOWN_TASK_TYPE: "${rawType}" is not a recognized task category. Allowed: ${Object.keys(
          CANONICAL_TASK_RULES
        ).join(", ")}`
      );
  }
}

/**
 * Checks whether an agent's supported task types satisfy a step's required task type.
 * Enforces strict semantic separation:
 * - EXECUTION cannot satisfy VERIFICATION or VALIDATION.
 * - VERIFICATION cannot satisfy EXECUTION.
 * - VALIDATION cannot satisfy EXECUTION.
 * - COORDINATION cannot satisfy EXECUTION or VERIFICATION.
 */
export function areTaskTypesCompatible(
  agentSupportedTypes: string[],
  requiredStepType: string
): boolean {
  const normRequired = normalizeTaskType(requiredStepType);
  const normSupported = agentSupportedTypes.map((t) => {
    try {
      return normalizeTaskType(t);
    } catch {
      return null;
    }
  }).filter(Boolean) as CanonicalTaskType[];

  // Direct match always satisfies
  if (normSupported.includes(normRequired)) {
    return true;
  }

  // Strict Anti-Conflation Invariants:
  // EXECUTION requires explicit EXECUTION support
  if (normRequired === "EXECUTION") {
    return false;
  }

  // VERIFICATION requires explicit VERIFICATION support (anti-self-auditing)
  if (normRequired === "VERIFICATION") {
    return false;
  }

  // VALIDATION: Security auditors and procurement analysts can validate schemas if declared
  if (normRequired === "VALIDATION" && normSupported.includes("ANALYSIS")) {
    return true;
  }

  // COORDINATION: Can be fulfilled if agent supports both ANALYSIS and EXECUTION
  if (normRequired === "COORDINATION" && normSupported.includes("ANALYSIS") && normSupported.includes("EXECUTION")) {
    return true;
  }

  return false;
}

/**
 * Asserts compatibility and throws detailed error if incompatible
 */
export function assertTaskTypeCompatibility(
  agentId: string,
  agentSupportedTypes: string[],
  requiredStepType: string
): void {
  const normRequired = normalizeTaskType(requiredStepType);
  const compatible = areTaskTypesCompatible(agentSupportedTypes, normRequired);

  if (!compatible) {
    throw new Error(
      `TAXONOMY_INCOMPATIBILITY: Agent "${agentId}" supports [${agentSupportedTypes.join(
        ", "
      )}] but step requires "${normRequired}". Tasks of type "${normRequired}" cannot be assigned to agents lacking explicit support.`
    );
  }
}

