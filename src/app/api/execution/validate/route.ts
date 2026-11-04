import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { ExecutionValidationService } from "@/lib/execution/validationService";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const { mandateId, recipient, amountYocto, agentId } = body;

    if (!mandateId || !recipient || !amountYocto) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: mandateId, recipient, amountYocto",
        },
        { status: 400 }
      );
    }

    const validation = await ExecutionValidationService.validateNearTransferPreflight({
      userId: user.id,
      mandateId,
      recipient,
      amountYocto,
      agentId,
    });

    return NextResponse.json(validation);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Preflight validation failed",
      },
      { status: 400 }
    );
  }
}

