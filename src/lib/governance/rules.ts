import {
  PolicyEvaluationContext,
  PolicyRuleDefinition,
  PolicyCheckResult,
  RuleAction,
  RuleOperator,
} from "./types";
import { yoctoToNear } from "@/lib/yocto";

/**
 * Deterministic, typed rule evaluator.
 * NEVER uses eval(), new Function(), or arbitrary dynamic code execution.
 */
export function evaluateRule(
  rule: PolicyRuleDefinition,
  context: PolicyEvaluationContext
): PolicyCheckResult {
  const isEnforced = rule.isEnforced !== false;
  if (!isEnforced) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      passed: true,
      action: "ALLOW",
      message: `Rule "${rule.ruleType}" is disabled/not enforced.`,
    };
  }

  // Extract actual field value from context based on field path or ruleType
  const actualValue = extractContextValue(rule.field, rule.ruleType, context);
  const expectedValue = rule.value;

  // Evaluate operator
  const matched = checkOperatorMatch(rule.operator, actualValue, expectedValue);

  // If rule is an ALLOW condition (e.g. ALLOWLIST), match means PASS.
  // If rule is a DENY / PROHIBITED condition (e.g. BLOCKLIST), match means VIOLATION (passed = false).
  let passed = true;
  let action: RuleAction = rule.action || "DENY";
  let message = "";

  switch (rule.ruleType) {
    case "RECIPIENT_ALLOWLIST":
    case "ALLOWED_TOOLS":
    case "ALLOWED_INTEGRATIONS":
    case "ALLOWED_OPERATIONS":
      // For allowlists: actual value MUST match expected value/list
      passed = matched;
      if (!passed) {
        action = rule.action || "DENY";
        message = `Target "${String(actualValue)}" is not in allowed list for rule ${rule.ruleType}.`;
      } else {
        message = `Target "${String(actualValue)}" is permitted by ${rule.ruleType}.`;
      }
      break;

    case "RECIPIENT_BLOCKLIST":
    case "DENIED_TOOLS":
    case "PROHIBITED_ACTION":
      // For blocklists: match means it IS in blocklist -> FAIL
      passed = !matched;
      if (!passed) {
        action = rule.action || "DENY";
        message = `Target "${String(actualValue)}" is explicitly prohibited by ${rule.ruleType}.`;
      } else {
        message = `Target "${String(actualValue)}" is not blocked by ${rule.ruleType}.`;
      }
      break;

    case "SPENDING_THRESHOLD":
    case "TRANSACTION_LIMIT":
      // If amount exceeds limit, trigger rule action (e.g. REQUIRE_APPROVAL or DENY)
      if (matched) {
        passed = false;
        action = rule.action || "REQUIRE_APPROVAL";
        message = `Proposed amount ${actualValue ? yoctoToNear(String(actualValue)) : "0"} NEAR exceeds threshold (${rule.operator} ${expectedValue ? yoctoToNear(String(expectedValue)) : "0"} NEAR).`;
      } else {
        passed = true;
        message = `Amount is within authorized threshold.`;
      }
      break;

    case "CAPABILITY_RESTRICTION":
      // Agent must have required capability or must not have restricted capability
      passed = rule.action === "ALLOW" ? matched : !matched;
      if (!passed) {
        action = rule.action;
        message = `Agent capabilities [${(context.capabilities || []).join(", ")}] violate ${rule.ruleType}.`;
      } else {
        message = `Agent capabilities satisfy ${rule.ruleType}.`;
      }
      break;

    case "APPROVAL_REQUIREMENT":
      // If condition matches, action must be REQUIRE_APPROVAL
      if (matched) {
        passed = false;
        action = "REQUIRE_APPROVAL";
        message = rule.description || `Operation requires explicit human approval under rule ${rule.ruleType}.`;
      } else {
        passed = true;
        message = `Operation does not trigger mandatory approval under this rule.`;
      }
      break;

    default:
      // Generic condition
      if (rule.action === "ALLOW") {
        passed = matched;
        message = matched
          ? `Condition met for ${rule.field}.`
          : `Field ${rule.field} (${String(actualValue)}) did not match required allow value.`;
      } else {
        passed = !matched;
        message = !passed
          ? `Field ${rule.field} (${String(actualValue)}) matched restrictive condition (${rule.operator}).`
          : `Condition not triggered for ${rule.field}.`;
      }
      break;
  }

  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    passed,
    action: passed ? "ALLOW" : action,
    message,
    field: rule.field,
    actualValue,
    expectedValue,
  };
}

/**
 * Extracts normalized value from PolicyEvaluationContext
 */
function extractContextValue(
  field: string,
  ruleType: string,
  context: PolicyEvaluationContext
): unknown {
  const normField = field.toLowerCase().trim();

  if (normField === "recipient" || ruleType === "RECIPIENT_ALLOWLIST" || ruleType === "RECIPIENT_BLOCKLIST") {
    return context.recipient?.trim().toLowerCase();
  }
  if (normField === "amountyocto" || normField === "amount" || ruleType === "SPENDING_THRESHOLD" || ruleType === "TRANSACTION_LIMIT") {
    return context.amountYocto || "0";
  }
  if (normField === "toolid" || ruleType === "ALLOWED_TOOLS" || ruleType === "DENIED_TOOLS") {
    return context.toolId?.trim().toLowerCase();
  }
  if (normField === "operation" || ruleType === "ALLOWED_OPERATIONS" || ruleType === "PROHIBITED_ACTION") {
    return context.operation?.trim().toLowerCase();
  }
  if (normField === "agenttype" || normField === "agent_type") {
    return context.agentType?.trim().toLowerCase();
  }
  if (normField === "capabilities" || ruleType === "CAPABILITY_RESTRICTION") {
    return context.capabilities || [];
  }
  if (normField === "mandateid") {
    return context.mandateId;
  }
  if (normField === "coordinationrunid") {
    return context.coordinationRunId;
  }
  if (normField === "objectiveid") {
    return context.objectiveId;
  }
  if (normField === "resource") {
    return context.resource;
  }

  // Lookup in parameters or evidence if available
  if (context.parameters && context.parameters[field] !== undefined) {
    return context.parameters[field];
  }
  if (context.evidence && context.evidence[field] !== undefined) {
    return context.evidence[field];
  }

  return undefined;
}

/**
 * Safe, deterministic operator matching
 */
function checkOperatorMatch(operator: RuleOperator, actual: unknown, expected: unknown): boolean {
  if (actual === undefined || actual === null) {
    return false;
  }

  switch (operator) {
    case "EQUALS":
      return String(actual).toLowerCase() === String(expected).toLowerCase();

    case "NOT_EQUALS":
      return String(actual).toLowerCase() !== String(expected).toLowerCase();

    case "IN": {
      const list = Array.isArray(expected)
        ? expected.map((e) => String(e).toLowerCase().trim())
        : [String(expected).toLowerCase().trim()];
      return list.includes(String(actual).toLowerCase().trim());
    }

    case "NOT_IN": {
      const list = Array.isArray(expected)
        ? expected.map((e) => String(e).toLowerCase().trim())
        : [String(expected).toLowerCase().trim()];
      return !list.includes(String(actual).toLowerCase().trim());
    }

    case "GREATER_THAN":
      return compareValues(actual, expected) > 0;

    case "GREATER_THAN_OR_EQUALS":
      return compareValues(actual, expected) >= 0;

    case "LESS_THAN":
      return compareValues(actual, expected) < 0;

    case "LESS_THAN_OR_EQUALS":
      return compareValues(actual, expected) <= 0;

    case "BETWEEN":
      if (Array.isArray(expected) && expected.length === 2) {
        return compareValues(actual, expected[0]) >= 0 && compareValues(actual, expected[1]) <= 0;
      }
      return false;

    case "CONTAINS":
      if (Array.isArray(actual)) {
        return actual.map((x) => String(x).toLowerCase()).includes(String(expected).toLowerCase());
      }
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());

    case "STARTS_WITH":
      return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());

    case "ENDS_WITH":
      return String(actual).toLowerCase().endsWith(String(expected).toLowerCase());

    default:
      return false;
  }
}

/**
 * Safely compares two values (handles BigInt strings for atomic yoctoNEAR as well as numbers)
 */
function compareValues(a: unknown, b: unknown): number {
  const strA = String(a).trim();
  const strB = String(b).trim();

  // If both are numeric integer strings (e.g. yoctoNEAR amounts)
  if (/^\d+$/.test(strA) && /^\d+$/.test(strB)) {
    const bigA = BigInt(strA);
    const bigB = BigInt(strB);
    if (bigA > bigB) return 1;
    if (bigA < bigB) return -1;
    return 0;
  }

  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }

  return strA.localeCompare(strB);
}

