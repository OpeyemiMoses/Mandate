import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluatePolicyProposal } from "@/lib/policy";

const EvaluateRequestSchema = z.object({
  mandate: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["active", "revoked", "expired", "pending_policy"]),
    providerPolicyConfirmed: z.boolean(),
    budgetAtomic: z.string(),
    spentAtomic: z.string(),
    reservedAtomic: z.string(),
    perTxLimitAtomic: z.string(),
    approvalThresholdAtomic: z.string(),
    allowedRecipients: z.array(z.string()),
    expiresAtIso: z.string(),
  }),
  proposal: z.object({
    taskId: z.string(),
    recipient: z.string(),
    amountAtomic: z.string(),
    purpose: z.string(),
    idempotencyKey: z.string(),
  }),
  existingIdempotencyKeys: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = EvaluateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_REQUEST_SCHEMA",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const decision = evaluatePolicyProposal(
      parsed.data.mandate,
      parsed.data.proposal,
      new Set(parsed.data.existingIdempotencyKeys || []),
      new Date()
    );

    return NextResponse.json({ decision });
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_POLICY_ENGINE_ERROR" },
      { status: 500 }
    );
  }
}

