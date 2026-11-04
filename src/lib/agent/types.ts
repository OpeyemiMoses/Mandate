import { z } from "zod";
import { isPositiveYoctoString } from "@/lib/yocto";

export const TaskParseResultSchema = z.object({
  objective: z.string().min(3),
  targetDomain: z.string().default("blockchain analytics"),
  candidateCount: z.number().int().min(1).max(10).default(3),
  maxBudgetNear: z.string().nullable().default(null),
  evaluationCriteria: z.array(z.string()).min(1),
  requiresPaymentIntent: z.boolean().default(true),
  preferredRecipient: z.string().nullable().default(null),
});
export type TaskParseResult = z.infer<typeof TaskParseResultSchema>;

export const ResearchSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(2),
  snippet: z.string(),
  retrievedAt: z.string(),
  verified: z.boolean().default(true),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

export const ProviderCandidateSchema = z.object({
  id: z.string(),
  name: z.string().min(2),
  description: z.string(),
  features: z.array(z.string()),
  priceNear: z.string(),
  priceYocto: z.string(),
  deliveryInfo: z.string(),
  recipientAccountId: z.string(),
  sourceUrl: z.string().url(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  verificationStatus: z.enum(["VERIFIED_ONCHAIN", "ESTIMATED", "UNAVAILABLE"]),
  confidenceScore: z.number().min(0).max(1),
  orderReference: z.string().nullable().default(null),
});
export type ProviderCandidate = z.infer<typeof ProviderCandidateSchema>;

export const ProviderComparisonSchema = z.object({
  candidateIds: z.array(z.string()),
  matrix: z.record(z.string(), z.record(z.string(), z.string())),
  ranking: z.array(z.string()),
  rankingExplanation: z.string(),
});
export type ProviderComparison = z.infer<typeof ProviderComparisonSchema>;

export const ProcurementRecommendationSchema = z.object({
  selectedCandidateId: z.string(),
  selectedProviderName: z.string(),
  recipientAccountId: z.string(),
  amountNear: z.string(),
  amountYocto: z.string(),
  purpose: z.string(),
  rationale: z.string(),
  evidenceSummary: z.string(),
  sourceUrl: z.string().url(),
  retrievalTimestamp: z.string(),
  alternativesConsidered: z.array(
    z.object({
      name: z.string(),
      reasonNotSelected: z.string(),
    })
  ),
  confidenceScore: z.number().default(0.95),
  requiresPayment: z.boolean(),
  orderReference: z.string().nullable().default(null),
});
export type ProcurementRecommendation = z.infer<typeof ProcurementRecommendationSchema>;

export interface AgentWorkflowOutput {
  taskId: string;
  status:
    | "DRAFT"
    | "PENDING"
    | "RESEARCHING"
    | "ANALYZING"
    | "RECOMMENDATION_READY"
    | "PAYMENT_PROPOSED"
    | "AWAITING_APPROVAL"
    | "EXECUTING"
    | "COMPLETED"
    | "FAILED"
    | "REJECTED";
  parsedRequirements: TaskParseResult;
  sourcesReviewed: ResearchSource[];
  candidatesDiscovered: ProviderCandidate[];
  comparison: ProviderComparison;
  recommendation: ProcurementRecommendation;
  policyVerdict?: "ALLOW" | "REQUIRES_APPROVAL" | "BLOCK";
  reasonCode?: string;
  approvalId?: string;
  txHash?: string;
}
