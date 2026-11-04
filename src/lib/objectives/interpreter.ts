import {
  ObjectiveCategory,
  ObjectiveConstraints,
  ObjectiveStatus,
  StructuredGoal,
} from "./types";
import { agentRegistry } from "@/lib/runtime/registry";
import { toolRegistry } from "@/lib/tools/registry";

export interface InterpretObjectiveParams {
  prompt: string;
  constraints?: ObjectiveConstraints;
  existingMandateId?: string;
  categoryOverride?: ObjectiveCategory;
}

export interface InterpretationResult {
  title: string;
  category: ObjectiveCategory;
  structuredGoal: StructuredGoal;
  status: ObjectiveStatus;
  clarificationMessage?: string;
  warnings?: string[];
}

/**
 * Natural Language Objective Interpreter
 * Transforms natural language outcomes into typed, structured goals.
 * Distinguishes explicit instructions, assumptions, missing info, and unfulfillable requirements.
 */
export function interpretObjective(params: InterpretObjectiveParams): InterpretationResult {
  const { prompt, constraints = {}, existingMandateId, categoryOverride } = params;
  const cleanPrompt = (prompt || "").trim();

  // 1. Check for empty or severely vague prompts
  if (!cleanPrompt || cleanPrompt.length < 5) {
    return {
      title: "Unspecified Objective",
      category: "CUSTOM",
      structuredGoal: createEmptyStructuredGoal(cleanPrompt),
      status: "NEEDS_CLARIFICATION",
      clarificationMessage:
        "Please provide a description of the outcome you want your agents to achieve.",
      warnings: ["Objective prompt is empty or too short to formulate an actionable plan."],
    };
  }

  // 2. Classify Category
  const category = categoryOverride || classifyCategory(cleanPrompt);

  // 3. Extract Budget Constraints
  const budgetInfo = extractBudget(cleanPrompt, constraints);

  // 4. Extract Entities & Scope
  const entities = extractEntities(cleanPrompt);
  const timeHorizon = extractTimeHorizon(cleanPrompt, constraints);

  // 5. Extract Explicit Instructions & Assumptions
  const explicitInstructions: string[] = [];
  const reasonableAssumptions: string[] = [];
  const missingInformation: string[] = [];
  const unfulfillableRequirements: string[] = [];
  const warnings: string[] = [];

  // Identify explicit instructions from prompt sentences
  const sentences = cleanPrompt
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  explicitInstructions.push(...sentences);

  // 6. Capability & Tool Identification
  const requiredCapabilities: string[] = [];
  const requiredTools: string[] = [];
  const successConditions: string[] = [];

  // Check category-specific capability mapping
  if (category === "PROCUREMENT" || cleanPrompt.toLowerCase().includes("buy") || cleanPrompt.toLowerCase().includes("procure") || cleanPrompt.toLowerCase().includes("vendor")) {
    requiredCapabilities.push("web_research", "provider_benchmarking", "procurement_proposal");
    requiredTools.push("duckduckgo_search");
    successConditions.push("Identify at least 1 verified provider matching budget and quality criteria");
    successConditions.push("Generate structured ranking matrix and recommendation");
    if (budgetInfo.maxNear) {
      successConditions.push(`Propose procurement payment within max budget of ${budgetInfo.maxNear} NEAR`);
    }
    reasonableAssumptions.push("Vendor accepts standard NEAR Protocol payment settlement");
    reasonableAssumptions.push("Performance metrics will be gathered from verifiable public endpoints");
  } else if (category === "RESEARCH" || cleanPrompt.toLowerCase().includes("research") || cleanPrompt.toLowerCase().includes("find") || cleanPrompt.toLowerCase().includes("analyze")) {
    requiredCapabilities.push("web_research");
    requiredTools.push("duckduckgo_search");
    successConditions.push("Collect verified information from external web sources");
    reasonableAssumptions.push("Target web sources will be queried via DuckDuckGo search without cookies");
  } else if (category === "TREASURY" || cleanPrompt.toLowerCase().includes("balance") || cleanPrompt.toLowerCase().includes("rpc") || cleanPrompt.toLowerCase().includes("account")) {
    requiredCapabilities.push("web_research"); // fallback
    requiredTools.push("near_rpc_reader");
    successConditions.push("Verify on-chain balance and finality state via NEAR Protocol RPC");
  } else {
    // Custom / Operations
    requiredCapabilities.push("web_research");
    requiredTools.push("duckduckgo_search");
    reasonableAssumptions.push("General intelligence retrieval and benchmarking will be used");
  }

  // 7. Check for Unfulfillable Requirements
  const lowerPrompt = cleanPrompt.toLowerCase();
  if (lowerPrompt.includes("solana") || lowerPrompt.includes("bitcoin") || lowerPrompt.includes("ethereum mainnet")) {
    unfulfillableRequirements.push(
      "Mandate currently settles exclusively on NEAR Protocol (Testnet). External multi-chain settlement is not supported."
    );
    warnings.push("Objective references non-NEAR chains which cannot currently be executed.");
  }
  if (lowerPrompt.includes("export private key") || lowerPrompt.includes("reveal seed phrase")) {
    unfulfillableRequirements.push(
      "Custody private keys are secured in OutLayer TEE and cannot be exported or revealed."
    );
  }

  // 8. Missing Information Analysis
  if ((category === "PROCUREMENT" || lowerPrompt.includes("purchase") || lowerPrompt.includes("buy")) && !budgetInfo.maxNear && !existingMandateId) {
    reasonableAssumptions.push("Budget will default to maximum available in active mandate or standard test limit (1.0 NEAR)");
  }

  // Generate clean title
  const title = generateTitle(cleanPrompt, category);

  // Construct Structured Goal
  const structuredGoal: StructuredGoal = {
    outcome: cleanPrompt,
    scope: `Execute ${category.toLowerCase()} workflow for: "${title}"`,
    entities,
    timeHorizon,
    budgetConstraints: budgetInfo,
    spendingPreferences: budgetInfo.maxNear ? [`Budget capped at ${budgetInfo.maxNear} NEAR`] : [],
    restrictions: [
      "Must not exceed Mandate policy spending limits",
      "Must adhere to OutLayer TEE custody controls",
      "Fail-closed on any unauthorized mutation",
    ],
    requiredCapabilities,
    requiredTools,
    successConditions,
    monitoringRequirements: ["Track step execution status", "Persist tool invocations and audit hash chain"],
    recurringRequirements: constraints.frequency ? [constraints.frequency] : [],
    approvalRequirements: [
      "Plan approval required by user before execution",
      "Transaction proposals exceeding mandate threshold require secondary approval",
    ],
    explicitInstructions,
    reasonableAssumptions,
    missingInformation,
    unfulfillableRequirements,
  };

  // Determine initial status
  let status: ObjectiveStatus = "DRAFT";
  if (missingInformation.length > 0) {
    status = "NEEDS_CLARIFICATION";
  }

  return {
    title,
    category,
    structuredGoal,
    status,
    clarificationMessage: missingInformation.length > 0 ? missingInformation.join("; ") : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Classify category based on natural language keywords
 */
export function classifyCategory(prompt: string): ObjectiveCategory {
  const p = prompt.toLowerCase();

  if (p.includes("procure") || p.includes("purchase") || p.includes("buy") || p.includes("vendor") || p.includes("pricing")) {
    return "PROCUREMENT";
  }
  if (p.includes("treasury") || p.includes("sweep") || p.includes("disburse") || p.includes("fund wallet") || p.includes("withdraw") || p.includes("rebalance") || p.includes("stake") || p.includes("allocation")) {
    return "TREASURY";
  }
  if (p.includes("financial") || p.includes("finance") || p.includes("ledger") || p.includes("audit") || p.includes("reconcile") || p.includes("yield") || p.includes("swap") || p.includes("defi") || p.includes("arbitrage") || p.includes("interest")) {
    return "FINANCE";
  }
  if (p.includes("monitor") || p.includes("alert") || p.includes("watch") || p.includes("track health") || p.includes("telemetry")) {
    return "MONITORING";
  }
  if (p.includes("operation") || p.includes("ops") || p.includes("automate") || p.includes("sync") || p.includes("batch") || p.includes("update") || p.includes("maintenance")) {
    return "OPERATIONS";
  }
  if (p.includes("develop") || p.includes("deploy contract") || p.includes("build") || p.includes("code") || p.includes("smart contract") || p.includes("compile")) {
    return "DEVELOPMENT";
  }
  if (p.includes("email") || p.includes("notify") || p.includes("slack") || p.includes("message") || p.includes("telegram")) {
    return "COMMUNICATION";
  }
  if (p.includes("research") || p.includes("analyze") || p.includes("find") || p.includes("investigate") || p.includes("benchmark") || p.includes("intelligence") || p.includes("summarize") || p.includes("survey") || p.includes("report") || p.includes("study")) {
    return "RESEARCH";
  }

  return "CUSTOM";
}

/**
 * Extract budget information from text or constraints
 */
function extractBudget(prompt: string, constraints: ObjectiveConstraints) {
  if (constraints.maxBudgetNear) {
    return { maxNear: constraints.maxBudgetNear, currency: "NEAR" };
  }

  // Regex match budget e.g. "budget 2.5 near" or "max 10 NEAR" or "under 0.5 near"
  const match = prompt.match(/(?:budget|max|up to|under|limit of)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:near|N)/i);
  if (match && match[1]) {
    return { maxNear: match[1], currency: "NEAR" };
  }

  return { currency: "NEAR" };
}

/**
 * Extract relevant keywords / entities
 */
function extractEntities(prompt: string): string[] {
  const entities: string[] = [];
  const words = prompt.split(/\s+/);

  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z0-9.-]/g, "");
    if (clean.includes(".near") || clean.includes(".testnet")) {
      entities.push(clean);
    }
  }

  const knownKeywords = [
    "NEAR",
    "OutLayer",
    "DuckDuckGo",
    "RPC",
    "DeFi",
    "Analytics",
    "FastNear",
    "NearBlocks",
  ];

  for (const kw of knownKeywords) {
    if (prompt.toLowerCase().includes(kw.toLowerCase()) && !entities.includes(kw)) {
      entities.push(kw);
    }
  }

  return entities;
}

/**
 * Extract time horizon or deadline
 */
function extractTimeHorizon(prompt: string, constraints: ObjectiveConstraints): string {
  if (constraints.deadline) {
    return `Deadline: ${constraints.deadline}`;
  }
  const p = prompt.toLowerCase();
  if (p.includes("immediately") || p.includes("urgent") || p.includes("asap")) {
    return "Immediate execution";
  }
  if (p.includes("weekly") || p.includes("daily") || p.includes("every day") || p.includes("recurring")) {
    return "Recurring periodic execution";
  }
  return "Standard completion horizon";
}

/**
 * Generate human-friendly title from prompt
 */
function generateTitle(prompt: string, category: ObjectiveCategory): string {
  const firstSentence = prompt.split(/[.!?\n]/)[0].trim();
  if (firstSentence.length <= 60) {
    return firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
  }
  return `${category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()} Objective: ${firstSentence.slice(0, 50)}...`;
}

function createEmptyStructuredGoal(prompt: string): StructuredGoal {
  return {
    outcome: prompt,
    scope: "",
    entities: [],
    timeHorizon: "",
    budgetConstraints: { currency: "NEAR" },
    spendingPreferences: [],
    restrictions: [],
    requiredCapabilities: [],
    requiredTools: [],
    successConditions: [],
    monitoringRequirements: [],
    recurringRequirements: [],
    approvalRequirements: [],
    explicitInstructions: [],
    reasonableAssumptions: [],
    missingInformation: ["Target outcome is undefined"],
    unfulfillableRequirements: [],
  };
}
