import {
  ClarificationQuestion,
  ObjectiveCategory,
  ObjectiveConstraints,
  StructuredGoal,
  StructuredObjectiveUnderstanding,
  SuccessCriterionDefinition,
} from "./types";
import { classifyCategory } from "./interpreter";

const ONE_NEAR_YOCTO = BigInt("1000000000000000000000000");

/**
 * Converts NEAR decimal string to integer yoctoNEAR BigInt string safely without float errors
 */
export function nearToYoctoBigIntStr(nearStr: string): string {
  const clean = nearStr.trim();
  if (!clean || isNaN(Number(clean))) return "0";

  const parts = clean.split(".");
  const whole = BigInt(parts[0] || "0") * ONE_NEAR_YOCTO;
  if (parts.length < 2 || !parts[1]) {
    return whole.toString();
  }

  const fractionStr = parts[1].padEnd(24, "0").slice(0, 24);
  const fraction = BigInt(fractionStr);
  return (whole + fraction).toString();
}

/**
 * Sanitizes untrusted user/AI prompt string
 */
export function sanitizePrompt(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

export interface UnderstandObjectiveParams {
  prompt: string;
  constraints?: ObjectiveConstraints;
  existingMandateId?: string;
  categoryOverride?: ObjectiveCategory;
}

/**
 * Objective Understanding Service
 * Normalizes user outcomes into structured, dependency-ready definitions.
 * Emits explicit clarification requests instead of hallucinating missing parameters.
 */
export class ObjectiveUnderstandingService {
  public static understand(params: UnderstandObjectiveParams): StructuredObjectiveUnderstanding {
    const rawPrompt = params.prompt || "";
    const cleanPrompt = sanitizePrompt(rawPrompt);
    const constraints = params.constraints || {};

    const clarificationQuestions: ClarificationQuestion[] = [];
    const missingInfo: string[] = [];
    const unfulfillable: string[] = [];
    const assumptions: string[] = [];
    const warnings: string[] = [];

    // 1. Guard against empty / trivial prompt
    if (cleanPrompt.length < 5) {
      clarificationQuestions.push({
        id: "clarify_intent",
        question: "Please specify what you would like Mandate agents to achieve.",
        field: "prompt",
        reason: "Prompt is too short or empty to construct an actionable objective.",
      });
      return {
        intent: cleanPrompt || "Unspecified objective",
        category: "CUSTOM",
        desiredDeliverables: [],
        successCriteria: [],
        requiredCapabilities: [],
        requiredTools: [],
        financialRestrictions: { currency: "NEAR" },
        assumptions: [],
        missingInformation: ["Target outcome is undefined."],
        unfulfillableRequirements: [],
        clarificationQuestions,
        needsClarification: true,
      };
    }

    // 2. Classify Category
    const category = params.categoryOverride || classifyCategory(cleanPrompt);

    // 3. Inspect for unfulfillable chain / network requests
    const lower = cleanPrompt.toLowerCase();
    if (lower.includes("solana") || lower.includes("ethereum") || lower.includes("bitcoin") || lower.includes("polygon")) {
      unfulfillable.push("Mandate currently operates exclusively on the NEAR Protocol (Testnet). Other networks are not supported.");
    }
    if (lower.includes("mainnet")) {
      unfulfillable.push("Safety policy restriction: Execution is restricted to NEAR Testnet only.");
    }

    // 4. Financial & Budget Normalization
    let maxNear = constraints.maxBudgetNear;
    let maxBudgetYocto = constraints.maxBudgetYocto;

    if (!maxNear) {
      const budgetMatch = cleanPrompt.match(/(?:budget|max|up to|under|limit of)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:near|N)/i);
      if (budgetMatch && budgetMatch[1]) {
        maxNear = budgetMatch[1];
      }
    }

    if (maxNear && !maxBudgetYocto) {
      maxBudgetYocto = nearToYoctoBigIntStr(maxNear);
    } else if (maxBudgetYocto && !maxNear) {
      // derive near representation for readability
      const yocto = BigInt(maxBudgetYocto);
      const whole = yocto / ONE_NEAR_YOCTO;
      const frac = (yocto % ONE_NEAR_YOCTO).toString().padStart(24, "0").slice(0, 4);
      maxNear = `${whole}.${frac}`;
    }

    // 5. Category-Specific Deliverables & Capabilities
    const deliverables: string[] = [];
    const requiredCapabilities: string[] = [];
    const requiredTools: string[] = [];
    const successCriteria: SuccessCriterionDefinition[] = [];

    if (category === "PROCUREMENT") {
      deliverables.push("Vendor discovery dossier with verified public endpoints and pricing");
      deliverables.push("Multi-attribute vendor comparison and ranking matrix");
      deliverables.push("Firewalled procurement spending proposal in yoctoNEAR");

      requiredCapabilities.push("web_research", "provider_benchmarking", "procurement_proposal");
      requiredTools.push("duckduckgo_search");

      successCriteria.push({
        criterionId: "crit_vendor_discovered",
        description: "At least one candidate provider identified with verified price and endpoint",
        measurementType: "BOOLEAN",
        target: "true",
        verificationMethod: "TOOL_RESULT",
      });
      successCriteria.push({
        criterionId: "crit_matrix_generated",
        description: "Benchmark comparison matrix produced with ranking rationale",
        measurementType: "BOOLEAN",
        target: "true",
        verificationMethod: "EXTERNAL_EVIDENCE",
      });

      if (!maxNear && !params.existingMandateId) {
        clarificationQuestions.push({
          id: "clarify_procurement_budget",
          question: "What is your maximum budget in NEAR for this procurement?",
          options: ["0.01 NEAR", "0.05 NEAR", "0.10 NEAR", "0.50 NEAR"],
          field: "maxBudgetNear",
          reason: "Procurement objectives require an authorized spending ceiling.",
        });
        missingInfo.push("Spending budget ceiling not specified.");
      }

      assumptions.push("Candidate services accept NEAR testnet settlement.");
      assumptions.push("Performance metrics will be gathered from public endpoints.");

    } else if (category === "RESEARCH") {
      deliverables.push("Synthesized intelligence report from external sources");
      deliverables.push("Source citation and evidence dossier");

      requiredCapabilities.push("web_research");
      requiredTools.push("duckduckgo_search");

      successCriteria.push({
        criterionId: "crit_research_sources_collected",
        description: "Primary search queries executed and summarized",
        measurementType: "BOOLEAN",
        target: "true",
        verificationMethod: "TOOL_RESULT",
      });

      assumptions.push("Research data is accessible via public web search endpoints.");

    } else if (category === "TREASURY" || category === "FINANCE") {
      deliverables.push("On-chain account state verification");
      deliverables.push("Cryptographic balance reconciliation ledger");

      requiredCapabilities.push("web_research");
      requiredTools.push("near_rpc_reader");

      successCriteria.push({
        criterionId: "crit_onchain_verification",
        description: "NEAR account balance and state verified against RPC",
        measurementType: "BOOLEAN",
        target: "true",
        verificationMethod: "ON_CHAIN_VERIFICATION",
      });

      assumptions.push("Target account is registered on NEAR Testnet.");

    } else {
      deliverables.push("Execution summary and task completion evidence");
      requiredCapabilities.push("web_research");
      requiredTools.push("duckduckgo_search");

      successCriteria.push({
        criterionId: "crit_general_execution",
        description: "All planned workflow steps completed successfully",
        measurementType: "BOOLEAN",
        target: "true",
        verificationMethod: "EXTERNAL_EVIDENCE",
      });

      assumptions.push("Standard agent coordination tooling will be employed.");
    }

    // 6. Check for ambiguous or vague intents
    const vaguePhrases = ["do something", "help me", "manage funds", "make money", "trade tokens", "stuff", "buy things"];
    if (vaguePhrases.some((vp) => lower === vp || lower.startsWith(vp))) {
      clarificationQuestions.push({
        id: "clarify_specific_action",
        question: "Could you specify the target service, vendor, or criteria for this operation?",
        field: "actionDetail",
        reason: "The prompt specifies a generic goal without target parameters.",
      });
      missingInfo.push("Target service or operational specifics missing.");
    }

    const needsClarification = clarificationQuestions.length > 0 || unfulfillable.length > 0;

    return {
      intent: cleanPrompt,
      category,
      desiredDeliverables: deliverables,
      successCriteria,
      requiredCapabilities,
      requiredTools,
      financialRestrictions: {
        maxNear,
        maxBudgetYocto,
        currency: "NEAR",
      },
      assumptions,
      missingInformation: missingInfo,
      unfulfillableRequirements: unfulfillable,
      clarificationQuestions,
      needsClarification,
    };
  }

  /**
   * Converts StructuredObjectiveUnderstanding into StructuredGoal for backward compatibility
   */
  public static toStructuredGoal(understanding: StructuredObjectiveUnderstanding): StructuredGoal {
    return {
      outcome: understanding.intent,
      scope: understanding.category,
      entities: [],
      timeHorizon: "Standard operational horizon",
      budgetConstraints: {
        maxNear: understanding.financialRestrictions.maxNear,
        maxBudgetYocto: understanding.financialRestrictions.maxBudgetYocto,
        currency: "NEAR",
      },
      spendingPreferences: [],
      restrictions: understanding.unfulfillableRequirements,
      requiredCapabilities: understanding.requiredCapabilities,
      requiredTools: understanding.requiredTools,
      successConditions: understanding.successCriteria.map((c) => c.description),
      monitoringRequirements: [],
      recurringRequirements: [],
      approvalRequirements: [],
      explicitInstructions: [understanding.intent],
      reasonableAssumptions: understanding.assumptions,
      missingInformation: understanding.missingInformation,
      unfulfillableRequirements: understanding.unfulfillableRequirements,
      clarificationQuestions: understanding.clarificationQuestions,
    };
  }
}

