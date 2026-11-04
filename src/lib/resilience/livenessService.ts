/**
 * Liveness Service (Milestone 9.4)
 * Low-overhead check verifying whether the Node.js process is alive.
 */

import { LivenessStatus } from "./types";
import { ShutdownCoordinator } from "./shutdownCoordinator";

export class LivenessService {
  /**
   * Returns current process liveness.
   */
  public static getStatus(): LivenessStatus {
    const lifecycleState = ShutdownCoordinator.getLifecycleState();
    const isShuttingDown = lifecycleState === "DRAINING" || lifecycleState === "STOPPED";

    const mem = process.memoryUsage();
    return {
      status: isShuttingDown ? "SHUTTING_DOWN" : "ALIVE",
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMb: Math.round(mem.rss / 1024 / 1024),
      timestamp: new Date().toISOString(),
    };
  }
}

