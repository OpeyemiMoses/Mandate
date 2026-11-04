import crypto from "crypto";
import { prisma } from "@/lib/db";
import { canonicalize } from "@/lib/auditLedger";
import { emitCoordinationEvent } from "./events";
import { SharedArtifactRecord } from "./types";

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /bearer/i,
  /webhook[_-]?url.*token/i,
];

/**
 * Recursively inspect and redact potential secrets or credentials before
 * storing in shared context or exposing to downstream autonomous agents.
 */
export function scrubSecrets(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(scrubSecrets);
  }
  const scrubbed: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSecretKey = SECRET_PATTERNS.some((pattern) => pattern.test(key));
    if (isSecretKey && typeof value === "string" && value.length > 4) {
      scrubbed[key] = `[REDACTED_SECRET_${value.slice(0, 3)}...]`;
    } else if (typeof value === "object") {
      scrubbed[key] = scrubSecrets(value);
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

export function computeArtifactHash(data: any): string {
  const canonical = JSON.stringify(canonicalize(data));
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface WriteArtifactParams {
  runId: string;
  objectiveId: string;
  userId: string;
  artifactId: string;
  title: string;
  contentType?: string;
  data: Record<string, any>;
  producingAgentId: string;
  producingAgentType: string;
  producingTaskId?: string | null;
  evidenceReferences?: string[];
  allowedReaderAgentTypes?: string[];
  allowedWriterAgentTypes?: string[];
  seal?: boolean;
}

export interface ReadArtifactParams {
  runId: string;
  artifactId: string;
  userId: string;
  requestingAgentId?: string;
  requestingAgentType?: string;
  version?: number;
}

/**
 * Shared Context Service
 * Provides access-controlled, cryptographically hashed, version-preserved
 * objective artifacts across collaborating autonomous agents.
 */
export class SharedContextService {
  /**
   * Write or publish a new version of a shared objective artifact
   */
  public static async writeArtifact(params: WriteArtifactParams): Promise<SharedArtifactRecord> {
    const {
      runId,
      objectiveId,
      userId,
      artifactId,
      title,
      contentType = "application/json",
      data,
      producingAgentId,
      producingAgentType,
      producingTaskId,
      evidenceReferences = [],
      allowedReaderAgentTypes = ["*"],
      allowedWriterAgentTypes = [],
      seal = false,
    } = params;

    // 1. Verify run ownership
    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId },
    });
    if (!run) {
      throw new Error(`CoordinationRun "${runId}" not found or unauthorized for user "${userId}".`);
    }

    // 2. Check existing artifact versions for write permissions and sealing
    const existingVersions = await prisma.sharedObjectiveArtifact.findMany({
      where: { runId, artifactId },
      orderBy: { version: "desc" },
    });

    let nextVersion = 1;
    if (existingVersions.length > 0) {
      const latest = existingVersions[0];
      nextVersion = latest.version + 1;

      // Check writer permission if constrained
      let writers: string[] = [];
      try {
        writers = JSON.parse(latest.allowedWriterAgentTypesJson || "[]");
      } catch {}

      if (writers.length > 0 && !writers.includes("*") && !writers.includes(producingAgentType)) {
        throw new Error(
          `Agent type "${producingAgentType}" is not authorized to write to artifact "${artifactId}". Allowed: [${writers.join(", ")}]`
        );
      }
    }

    // 3. Scrub credentials and calculate deterministic SHA-256 integrity hash
    const safeData = scrubSecrets(data);
    const dataHash = computeArtifactHash(safeData);

    // 4. Create immutable versioned artifact record
    const created = await prisma.sharedObjectiveArtifact.create({
      data: {
        runId,
        objectiveId,
        artifactId,
        version: nextVersion,
        title,
        contentType,
        dataJson: JSON.stringify(safeData),
        dataHash,
        producingAgentId,
        producingTaskId: producingTaskId || null,
        evidenceReferencesJson: JSON.stringify(evidenceReferences),
        allowedReaderAgentTypesJson: JSON.stringify(allowedReaderAgentTypes),
        allowedWriterAgentTypesJson: JSON.stringify(allowedWriterAgentTypes),
        isSealed: seal,
      },
    });

    // 5. Emit unified coordination audit event
    await emitCoordinationEvent({
      runId,
      objectiveId,
      userId,
      taskId: producingTaskId,
      agentId: producingAgentId,
      eventType: "coordination.context_written",
      metadata: {
        artifactId,
        version: nextVersion,
        dataHash,
        isSealed: seal,
        producingAgentType,
      },
      recordInAuditChain: true,
    });

    return {
      id: created.id,
      runId: created.runId,
      objectiveId: created.objectiveId,
      artifactId: created.artifactId,
      version: created.version,
      title: created.title,
      contentType: created.contentType,
      data: safeData,
      dataHash: created.dataHash,
      producingAgentId: created.producingAgentId,
      producingTaskId: created.producingTaskId,
      evidenceReferences,
      allowedReaderAgentTypes,
      allowedWriterAgentTypes,
      isSealed: created.isSealed,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Read and cryptographically verify a shared artifact with per-agent access control
   */
  public static async readArtifact(params: ReadArtifactParams): Promise<SharedArtifactRecord> {
    const { runId, artifactId, userId, requestingAgentId, requestingAgentType, version } = params;

    // 1. Verify run ownership
    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId },
    });
    if (!run) {
      throw new Error(`CoordinationRun "${runId}" not found or unauthorized for user "${userId}".`);
    }

    // 2. Fetch artifact (specified version or latest)
    let artifact: any = null;
    if (version !== undefined) {
      artifact = await prisma.sharedObjectiveArtifact.findUnique({
        where: {
          runId_artifactId_version: { runId, artifactId, version },
        },
      });
    } else {
      artifact = await prisma.sharedObjectiveArtifact.findFirst({
        where: { runId, artifactId },
        orderBy: { version: "desc" },
      });
    }

    if (!artifact) {
      throw new Error(`Artifact "${artifactId}" (version ${version || "latest"}) not found in run "${runId}".`);
    }

    // 3. Enforce per-agent read permission
    let allowedReaders: string[] = ["*"];
    try {
      allowedReaders = JSON.parse(artifact.allowedReaderAgentTypesJson || "[\"*\"]");
    } catch {}

    if (
      requestingAgentType &&
      !allowedReaders.includes("*") &&
      !allowedReaders.includes(requestingAgentType)
    ) {
      throw new Error(
        `Agent type "${requestingAgentType}" is unauthorized to read artifact "${artifactId}". Allowed: [${allowedReaders.join(", ")}]`
      );
    }

    // 4. Cryptographic integrity check: verify dataHash against stored dataJson
    let parsedData: any = {};
    try {
      parsedData = JSON.parse(artifact.dataJson);
    } catch {
      throw new Error(`Corrupted JSON payload in artifact "${artifactId}".`);
    }

    const recomputedHash = computeArtifactHash(parsedData);
    if (recomputedHash !== artifact.dataHash) {
      throw new Error(
        `Cryptographic integrity violation in artifact "${artifactId}": expected hash ${artifact.dataHash}, got ${recomputedHash}. Content has been tampered with.`
      );
    }

    // 5. Emit read audit event
    await emitCoordinationEvent({
      runId,
      objectiveId: run.objectiveId,
      userId,
      agentId: requestingAgentId,
      eventType: "coordination.context_read",
      metadata: {
        artifactId,
        version: artifact.version,
        dataHash: artifact.dataHash,
        requestingAgentType,
      },
      recordInAuditChain: false, // Low overhead read logging
    });

    return {
      id: artifact.id,
      runId: artifact.runId,
      objectiveId: artifact.objectiveId,
      artifactId: artifact.artifactId,
      version: artifact.version,
      title: artifact.title,
      contentType: artifact.contentType,
      data: parsedData,
      dataHash: artifact.dataHash,
      producingAgentId: artifact.producingAgentId,
      producingTaskId: artifact.producingTaskId,
      evidenceReferences: JSON.parse(artifact.evidenceReferencesJson || "[]"),
      allowedReaderAgentTypes: allowedReaders,
      allowedWriterAgentTypes: JSON.parse(artifact.allowedWriterAgentTypesJson || "[]"),
      isSealed: artifact.isSealed,
      createdAt: artifact.createdAt.toISOString(),
    };
  }

  /**
   * List all artifacts for a run, filtered by optional reader agent type
   */
  public static async listArtifacts(params: {
    runId: string;
    userId: string;
    requestingAgentType?: string;
  }): Promise<SharedArtifactRecord[]> {
    const { runId, userId, requestingAgentType } = params;

    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId },
    });
    if (!run) return [];

    const artifacts = await prisma.sharedObjectiveArtifact.findMany({
      where: { runId },
      orderBy: [{ artifactId: "asc" }, { version: "desc" }],
    });

    const results: SharedArtifactRecord[] = [];
    for (const a of artifacts) {
      let allowedReaders: string[] = ["*"];
      try {
        allowedReaders = JSON.parse(a.allowedReaderAgentTypesJson || "[\"*\"]");
      } catch {}

      if (
        requestingAgentType &&
        !allowedReaders.includes("*") &&
        !allowedReaders.includes(requestingAgentType)
      ) {
        continue;
      }

      results.push({
        id: a.id,
        runId: a.runId,
        objectiveId: a.objectiveId,
        artifactId: a.artifactId,
        version: a.version,
        title: a.title,
        contentType: a.contentType,
        data: JSON.parse(a.dataJson || "{}"),
        dataHash: a.dataHash,
        producingAgentId: a.producingAgentId,
        producingTaskId: a.producingTaskId,
        evidenceReferences: JSON.parse(a.evidenceReferencesJson || "[]"),
        allowedReaderAgentTypes: allowedReaders,
        allowedWriterAgentTypes: JSON.parse(a.allowedWriterAgentTypesJson || "[]"),
        isSealed: a.isSealed,
        createdAt: a.createdAt.toISOString(),
      });
    }

    return results;
  }
}

