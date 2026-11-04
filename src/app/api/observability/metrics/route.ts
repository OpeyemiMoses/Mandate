import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import {
  getQueueMetrics,
  getWorkerFleetMetrics,
  getAgentMetrics,
  getToolMetrics,
  getFinancialExecutionMetrics,
} from "@/lib/observability";

export async function GET(req: Request) {
  try {
    const user = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const windowHours = Math.max(1, Math.min(parseInt(searchParams.get("window") || "24", 10), 720));
    const type = searchParams.get("type");

    let result: Record<string, any> = {};

    if (!type || type === "all") {
      const [queue, workers, agents, tools, financial] = await Promise.all([
        getQueueMetrics(windowHours, user.userId),
        getWorkerFleetMetrics(),
        getAgentMetrics(windowHours),
        getToolMetrics(windowHours),
        getFinancialExecutionMetrics(windowHours),
      ]);
      result = { queue, workers, agents, tools, financial };
    } else if (type === "queue") {
      result.queue = await getQueueMetrics(windowHours, user.userId);
    } else if (type === "workers") {
      result.workers = await getWorkerFleetMetrics();
    } else if (type === "agents") {
      result.agents = await getAgentMetrics(windowHours);
    } else if (type === "tools") {
      result.tools = await getToolMetrics(windowHours);
    } else if (type === "financial") {
      result.financial = await getFinancialExecutionMetrics(windowHours);
    } else {
      return NextResponse.json(
        { success: false, error: `Invalid metrics type: ${type}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      windowHours,
      data: result,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
