import { ToolDefinition, ToolOperation } from "../types";
import { ToolAdapter, AdapterContext } from "./types";

export type InternalToolHandler = (
  params: Record<string, unknown>,
  context: AdapterContext
) => Promise<any>;

export class InternalToolAdapter implements ToolAdapter {
  private handlers: Map<string, InternalToolHandler> = new Map();

  /**
   * Register executable handler for an internal tool operation
   */
  public registerHandler(
    toolId: string,
    operationId: string,
    handler: InternalToolHandler
  ): void {
    const key = `${toolId}:${operationId}`;
    this.handlers.set(key, handler);
  }

  public hasHandler(toolId: string, operationId: string): boolean {
    return this.handlers.has(`${toolId}:${operationId}`);
  }

  public async execute(
    tool: ToolDefinition,
    operation: ToolOperation,
    params: Record<string, unknown>,
    context: AdapterContext
  ): Promise<any> {
    const key = `${tool.id}:${operation.id}`;
    const handler = this.handlers.get(key);

    if (!handler) {
      throw new Error(
        `No internal handler registered for tool operation "${key}"`
      );
    }

    return await handler(params, context);
  }
}

export const internalAdapter = new InternalToolAdapter();

