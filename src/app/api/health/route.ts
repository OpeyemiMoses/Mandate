import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "mandate-spending-firewall",
    network: process.env.NEAR_NETWORK || "testnet",
    outlayerBaseUrl:
      process.env.OUTLAYER_API_BASE_URL || "https://testnet-api.outlayer.ai",
    failClosedEnforcement: true,
    timestamp: new Date().toISOString(),
  });
}

