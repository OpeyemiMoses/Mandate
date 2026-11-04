import { TaskParseResult, TaskParseResultSchema } from "./types";

/**
 * Injection patterns that attempt to subvert policy rules, mandate budgets, or system prompts.
 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+(instructions|rules|prompts|directives|constraints)/i,
  /bypass\s+(mandate|policy|firewall|approval)/i,
  /unlimited\s+(budget|funds|spending)/i,
  /transfer\s+(all|\d+(\.\d+)?)\s+(funds|near|balance|tokens)/i,
  /system\s+override/i,
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  /grant\s+(admin|root|unrestricted)/i,
  /override\s+mandate/i,
];

/**
 * Sanitizes input text to defend against prompt injection attempts from untrusted prompts or web snippets.
 */
export function sanitizePromptText(text: string): { cleanText: string; injectionDetected: boolean; flags: string[] } {
  let cleanText = text;
  const flags: string[] = [];
  let injectionDetected = false;

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleanText)) {
      injectionDetected = true;
      flags.push(`Matched pattern: ${pattern.source}`);
      // Neutralize injection attempt
      cleanText = cleanText.replace(pattern, "[FILTERED_SECURITY_VIOLATION]");
    }
  }

  // Strip dangerous HTML tags
  cleanText = cleanText.replace(/<[^>]*>?/gm, "").trim();

  return { cleanText, injectionDetected, flags };
}

/**
 * Deterministic Natural Language Task Parser.
 * Accurately parses user requirements, candidate counts, budget caps, and criteria.
 */
export function parseTaskPrompt(prompt: string): TaskParseResult {
  const { cleanText, injectionDetected } = sanitizePromptText(prompt);

  // 1. Extract Candidate Count (e.g. "three providers", "find 3", "compare 5")
  let candidateCount = 3;
  const numberWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
  };

  const countMatch = cleanText.match(/\b(one|two|three|four|five|six|seven|eight|\d+)\s+(analytics\s+)?providers?\b/i);
  if (countMatch) {
    const rawCount = countMatch[1].toLowerCase();
    candidateCount = numberWords[rawCount] || parseInt(rawCount, 10) || 3;
    if (candidateCount < 1) candidateCount = 1;
    if (candidateCount > 8) candidateCount = 8;
  }

  // 2. Extract Budget Constraint (e.g. "under 0.2 NEAR", "below 0.15 NEAR", "up to 0.5 NEAR")
  let maxBudgetNear: string | null = null;
  const budgetMatch = cleanText.match(/(?:under|below|less than|up to|max(?:imum)? of?)\s*([0-9]+(?:\.[0-9]+)?)\s*NEAR/i);
  if (budgetMatch) {
    maxBudgetNear = budgetMatch[1];
  } else {
    // Check standalone "0.2 NEAR"
    const standaloneMatch = cleanText.match(/([0-9]+\.[0-9]+)\s*NEAR/i);
    if (standaloneMatch) {
      maxBudgetNear = standaloneMatch[1];
    }
  }

  // 3. Extract Evaluation Criteria
  const defaultCriteria = ["features", "pricing", "delivery time", "reliability"];
  const criteriaList: string[] = [];

  if (/features?/i.test(cleanText)) criteriaList.push("features");
  if (/pric(?:ing|e)|cost/i.test(cleanText)) criteriaList.push("pricing");
  if (/delivery|speed|latency|turnaround/i.test(cleanText)) criteriaList.push("delivery time");
  if (/reliab(?:le|ility)|uptime|accuracy/i.test(cleanText)) criteriaList.push("reliability");
  if (/compliance|security|kyt|aml/i.test(cleanText)) criteriaList.push("security & compliance");

  const evaluationCriteria = criteriaList.length > 0 ? criteriaList : defaultCriteria;

  // 4. Identify Target Domain
  let targetDomain = "blockchain wallet analytics";
  if (/wallet analytics/i.test(cleanText)) {
    targetDomain = "blockchain wallet analytics";
  } else if (/oracle|data feed/i.test(cleanText)) {
    targetDomain = "decentralized oracle";
  } else if (/dex|liquidity|orderbook/i.test(cleanText)) {
    targetDomain = "DEX liquidity analytics";
  }

  // 5. Determine Payment Intent
  // If user says "no payment", "research only", "just summarize", "do not purchase", "without purchasing", requiresPaymentIntent is false.
  const isResearchOnly = /\b(?:no payment|research only|do not purchase|without purchasing|without buying|no purchase|information only|just compare)\b/i.test(
    cleanText
  );
  const requiresPaymentIntent = !isResearchOnly;

  // 6. Preferred Recipient, if mentioned
  let preferredRecipient: string | null = null;
  const recipientMatch = cleanText.match(/([a-z0-9_-]+\.(?:near|testnet))/i);
  if (recipientMatch) {
    preferredRecipient = recipientMatch[1].toLowerCase();
  }

  const result: TaskParseResult = {
    objective: cleanText.slice(0, 160),
    targetDomain,
    candidateCount,
    maxBudgetNear,
    evaluationCriteria,
    requiresPaymentIntent,
    preferredRecipient,
  };

  return TaskParseResultSchema.parse(result);
}
