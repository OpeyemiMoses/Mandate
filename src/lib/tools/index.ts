import { toolRegistry } from "./registry";
import { duckDuckGoTool, registerDuckDuckGoHandlers } from "./implementations/duckduckgo";
import { nearRpcTool, registerNearRpcHandlers } from "./implementations/nearRpc";
import { genericRestTool } from "./implementations/restGeneric";
import { genericMcpTool } from "./implementations/mcpGeneric";

export * from "./types";
export * from "./security";
export * from "./registry";
export * from "./executor";
export * from "./access";
export * from "./connections";

/**
 * Register default built-in platform tools and internal handlers
 */
export function registerDefaultTools(): void {
  // 1. DuckDuckGo Search (Discovery)
  if (!toolRegistry.has(duckDuckGoTool.id)) {
    toolRegistry.register(duckDuckGoTool);
    registerDuckDuckGoHandlers();
  }

  // 2. NEAR RPC Reader (Blockchain)
  if (!toolRegistry.has(nearRpcTool.id)) {
    toolRegistry.register(nearRpcTool);
    registerNearRpcHandlers();
  }

  // 3. Generic REST Client (External APIs)
  if (!toolRegistry.has(genericRestTool.id)) {
    toolRegistry.register(genericRestTool);
  }

  // 4. Generic MCP Client (MCP)
  if (!toolRegistry.has(genericMcpTool.id)) {
    toolRegistry.register(genericMcpTool);
  }
}

// Auto-register built-in tools on module load
registerDefaultTools();

