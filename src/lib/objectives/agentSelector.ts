import { prisma } from "@/lib/db";
import { agentRegistry } from "@/lib/runtime/registry";

export interface AgentMatchRequirement {
  requiredCapabilities: string[];
  requiredTools?: string[];
  agentType?: string;
  category?: string;
}

export interface AgentSelectionResult {
  matched: boolean;
  selectedAgent?: {
    id: string;
    name: string;
    type: string;
    version: string;
    status: string;
    colorVariant: string;
    hasMandate: boolean;
  };
  missingCapabilities: string[];
  reasons: string[];
}

/**
 * Agent Selection Service
 * Matches step requirements against actual user-owned agents and registered capabilities.
 * Reports missing capabilities rather than fabricating assignments.
 */
export async function selectAgentForRequirement(params: {
  userId: string;
  requirement: AgentMatchRequirement;
  mandateId?: string | null;
}): Promise<AgentSelectionResult> {
  const { userId, requirement, mandateId } = params;

  // 1. Fetch user's active agents with tool access and mandates
  const agents = await prisma.agent.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      toolAccess: { where: { isEnabled: true } },
      mandates: { where: { status: "ACTIVE" } },
      wallet: true,
    },
  });

  if (agents.length === 0) {
    return {
      matched: false,
      missingCapabilities: requirement.requiredCapabilities,
      reasons: ["No active agents found for user. Please provision an agent first."],
    };
  }

  const missingCapabilities: string[] = [];
  const candidateEvaluations: Array<{
    agent: any;
    score: number;
    unmetCapabilities: string[];
  }> = [];

  for (const agent of agents) {
    const impl = agentRegistry.get(agent.type, agent.version);
    if (!impl) {
      continue;
    }

    const availableCaps = new Set(impl.getCapabilities().map((c) => c.id));
    const assignedTools = new Set(agent.toolAccess.map((t) => t.toolId));

    const unmetCaps: string[] = [];
    for (const reqCap of requirement.requiredCapabilities) {
      if (!availableCaps.has(reqCap)) {
        unmetCaps.push(reqCap);
      }
    }

    // Check tool access if required
    let toolsSatisfied = true;
    if (requirement.requiredTools && requirement.requiredTools.length > 0) {
      for (const reqTool of requirement.requiredTools) {
        if (!assignedTools.has(reqTool)) {
          toolsSatisfied = false;
        }
      }
    }

    let score = 100 - unmetCaps.length * 30;
    if (!toolsSatisfied) score -= 20;

    // Favor agent matching explicit type
    if (requirement.agentType && agent.type === requirement.agentType) {
      score += 20;
    }

    // Favor agent bound to the target mandate
    if (mandateId && agent.mandates.some((m) => m.id === mandateId)) {
      score += 15;
    }

    candidateEvaluations.push({
      agent,
      score,
      unmetCapabilities: unmetCaps,
    });
  }

  // Filter candidates that satisfy all required capabilities
  const qualified = candidateEvaluations.filter(
    (c) => c.unmetCapabilities.length === 0
  );

  if (qualified.length === 0) {
    // Collect all unmet capabilities across all agents
    const allKnownCaps = new Set(
      agents.flatMap((a) => {
        const impl = agentRegistry.get(a.type, a.version);
        return impl ? impl.getCapabilities().map((c) => c.id) : [];
      })
    );

    for (const reqCap of requirement.requiredCapabilities) {
      if (!allKnownCaps.has(reqCap)) {
        missingCapabilities.push(reqCap);
      }
    }

    return {
      matched: false,
      missingCapabilities:
        missingCapabilities.length > 0
          ? missingCapabilities
          : requirement.requiredCapabilities,
      reasons: [
        `No provisioned agent possesses the required capabilities: [${requirement.requiredCapabilities.join(", ")}]`,
      ],
    };
  }

  // Sort by score descending
  qualified.sort((a, b) => b.score - a.score);
  const best = qualified[0].agent;

  return {
    matched: true,
    selectedAgent: {
      id: best.id,
      name: best.name,
      type: best.type,
      version: best.version,
      status: best.status,
      colorVariant: best.colorVariant || "red",
      hasMandate: best.mandates.length > 0,
    },
    missingCapabilities: [],
    reasons: [`Selected ${best.name} (${best.type}) matching required capabilities`],
  };
}

