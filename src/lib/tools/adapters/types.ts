import { ToolDefinition, ToolOperation } from "../types";

export interface AdapterContext {
  agentId: string;
  userId: string;
  executionId?: string;
  invocationId: string;
  connectionConfig?: Record<string, any>;
  credentials?: Record<string, any>;
  signal?: AbortSignal;
}

export interface ToolAdapter {
  execute(
    tool: ToolDefinition,
    operation: ToolOperation,
    params: Record<string, unknown>,
    context: AdapterContext
  ): Promise<any>;
}

