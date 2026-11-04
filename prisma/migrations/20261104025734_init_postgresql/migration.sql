-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nearAccountId" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "bio" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "authChallenge" TEXT,
    "sessionToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "purpose" TEXT,
    "type" TEXT NOT NULL DEFAULT 'research_procurement',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "configuration" TEXT DEFAULT '{}',
    "metadata" TEXT DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "colorVariant" TEXT DEFAULT 'red',
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "lastExecutedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "nearAccountId" TEXT NOT NULL,
    "controllerPubkey" TEXT,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "handoffUrl" TEXT,
    "network" TEXT NOT NULL DEFAULT 'testnet',
    "balanceYocto" TEXT NOT NULL DEFAULT '0',
    "onChainBalanceYocto" TEXT,
    "discrepancyYocto" TEXT,
    "discrepancyStatus" TEXT NOT NULL DEFAULT 'BALANCED',
    "lastReconciledAt" TIMESTAMP(3),
    "initializationStatus" TEXT NOT NULL DEFAULT 'UNINITIALIZED',
    "isInitialized" BOOLEAN NOT NULL DEFAULT false,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingRecord" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "senderAccountId" TEXT NOT NULL,
    "receiverAccountId" TEXT NOT NULL,
    "amountYocto" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "blockHeight" INTEGER,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "FundingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRecord" (
    "id" TEXT NOT NULL,
    "txHash" TEXT,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amountYocto" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "outlayerRequestId" TEXT,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "WithdrawalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mandate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalBudgetYocto" TEXT NOT NULL,
    "spentYocto" TEXT NOT NULL DEFAULT '0',
    "reservedYocto" TEXT NOT NULL DEFAULT '0',
    "perTxLimitYocto" TEXT NOT NULL,
    "approvalThresholdYocto" TEXT NOT NULL,
    "allowedRecipientsJson" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rawPrompt" TEXT,
    "taskType" TEXT NOT NULL DEFAULT 'PROCUREMENT',
    "requiresPayment" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "aiPlannerModel" TEXT NOT NULL DEFAULT 'DeepSeek-V3',
    "proposedRecipient" TEXT,
    "proposedAmountYocto" TEXT DEFAULT '0',
    "idempotencyKey" TEXT NOT NULL,
    "planStepsJson" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSession" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "extractedCriteria" TEXT NOT NULL,
    "searchQueriesUsed" TEXT NOT NULL,
    "sourcesReviewedJson" TEXT NOT NULL,
    "candidateOptionsJson" TEXT NOT NULL,
    "comparisonJson" TEXT NOT NULL,
    "recommendationJson" TEXT NOT NULL,
    "reasoningSummary" TEXT,
    "requiresPayment" BOOLEAN NOT NULL DEFAULT false,
    "proposedRecipient" TEXT,
    "proposedAmountYocto" TEXT,
    "providerOrderRef" TEXT,
    "deliveryProof" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amountYocto" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "reason" TEXT,
    "actionPayloadHash" TEXT,
    "policyId" TEXT,
    "policyVersion" INTEGER,
    "mandateVersion" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "taskId" TEXT,
    "executionId" TEXT,
    "mandateId" TEXT NOT NULL,
    "approverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionRecord" (
    "id" TEXT NOT NULL,
    "txHash" TEXT,
    "chain" TEXT NOT NULL DEFAULT 'near',
    "recipient" TEXT NOT NULL,
    "amountYocto" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "outlayerRequestId" TEXT,
    "rawResponseJson" TEXT,
    "blockHash" TEXT,
    "blockHeight" INTEGER,
    "gasBurnt" TEXT,
    "tokensBurnt" TEXT,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "reconciliationNotes" TEXT,
    "taskId" TEXT,
    "executionId" TEXT,
    "mandateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 0,
    "eventType" TEXT NOT NULL,
    "verdict" TEXT,
    "reasonCode" TEXT,
    "description" TEXT,
    "detailsJson" TEXT NOT NULL,
    "prevHash" TEXT,
    "currentHash" TEXT,
    "agentId" TEXT,
    "agentWalletAddress" TEXT,
    "proposalId" TEXT,
    "txHash" TEXT,
    "mandateId" TEXT,
    "taskId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mandateId" TEXT,
    "taskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "inputJson" TEXT NOT NULL,
    "outputJson" TEXT,
    "currentStep" TEXT,
    "contextJson" TEXT DEFAULT '{}',
    "errorDetails" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "idempotencyKey" TEXT,
    "lockToken" TEXT,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "adapterType" TEXT NOT NULL DEFAULT 'rest',
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "authType" TEXT NOT NULL DEFAULT 'NONE',
    "encryptedCredentials" TEXT,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "grantedScopesJson" TEXT NOT NULL DEFAULT '[]',
    "verifiedScopesJson" TEXT NOT NULL DEFAULT '[]',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "healthMetadataJson" TEXT NOT NULL DEFAULT '{}',
    "lastVerifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationOperationPermission" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "permissionLevel" TEXT NOT NULL DEFAULT 'READ',
    "riskClassification" TEXT NOT NULL DEFAULT 'LOW',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "allowedAgentTypesJson" TEXT NOT NULL DEFAULT '["*"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationOperationPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationOperationExecution" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "agentId" TEXT,
    "operationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "durationMs" INTEGER NOT NULL,
    "requestMetadataJson" TEXT NOT NULL DEFAULT '{}',
    "resultMetadataJson" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationOperationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthSession" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "redirectUri" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToolAccess" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "permissionLevel" TEXT NOT NULL DEFAULT 'READ',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedOperationsJson" TEXT NOT NULL DEFAULT '["*"]',
    "maxCallsPerExecution" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentToolAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolInvocation" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "executionId" TEXT,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "toolId" TEXT NOT NULL,
    "toolVersion" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "permissionLevel" TEXT NOT NULL,
    "riskClassification" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "durationMs" INTEGER NOT NULL,
    "inputJson" TEXT NOT NULL,
    "outputJson" TEXT,
    "errorDetails" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objective" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalPrompt" TEXT NOT NULL,
    "structuredGoalJson" TEXT,
    "category" TEXT NOT NULL DEFAULT 'CUSTOM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "version" INTEGER NOT NULL DEFAULT 1,
    "mandateId" TEXT,
    "planningStatus" TEXT NOT NULL DEFAULT 'UNPLANNED',
    "executionStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "completionEvidenceJson" TEXT NOT NULL DEFAULT '{}',
    "failureReason" TEXT,
    "deadlineAt" TIMESTAMP(3),
    "assignedAgentsJson" TEXT NOT NULL DEFAULT '[]',
    "constraintsJson" TEXT NOT NULL DEFAULT '{}',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastEvaluatedAt" TIMESTAMP(3),
    "lastCheckpointAt" TIMESTAMP(3),
    "currentCheckpointNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectivePlan" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "riskClassification" TEXT NOT NULL DEFAULT 'LOW',
    "estimatedCostNear" TEXT,
    "estimatedCostYocto" TEXT,
    "planHash" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "planJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectivePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectivePlanStep" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "taskType" TEXT NOT NULL DEFAULT 'EXECUTION',
    "agentType" TEXT NOT NULL,
    "assignedAgentId" TEXT,
    "requiredCapabilitiesJson" TEXT NOT NULL DEFAULT '[]',
    "requiredToolsJson" TEXT NOT NULL DEFAULT '[]',
    "dependenciesJson" TEXT NOT NULL DEFAULT '[]',
    "preconditionsJson" TEXT NOT NULL DEFAULT '[]',
    "completionConditionsJson" TEXT NOT NULL DEFAULT '[]',
    "riskClassification" TEXT NOT NULL DEFAULT 'LOW',
    "estimatedCostNear" TEXT,
    "estimatedCostYocto" TEXT,
    "executionId" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "errorDetails" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "resultFingerprint" TEXT,
    "evidenceReferencesJson" TEXT NOT NULL DEFAULT '[]',
    "toolExecutionsJson" TEXT NOT NULL DEFAULT '[]',
    "failureStage" TEXT,
    "lastTransitionReason" TEXT,
    "leaseGeneration" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ObjectivePlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectiveTaskEvent" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "stepRecordId" TEXT,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "reason" TEXT,
    "taskVersion" INTEGER NOT NULL,
    "leaseGeneration" INTEGER,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectiveTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectiveTaskResult" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "stepRecordId" TEXT,
    "agentId" TEXT NOT NULL,
    "executionAttempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "structuredOutputJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceReferencesJson" TEXT NOT NULL DEFAULT '[]',
    "toolExecutionsJson" TEXT NOT NULL DEFAULT '[]',
    "resultFingerprint" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "verifiedBy" TEXT,
    "verificationDetailsJson" TEXT NOT NULL DEFAULT '{}',
    "errorDetails" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectiveTaskResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectiveSuccessCriteria" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "measurementType" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "verificationMethod" TEXT NOT NULL,
    "currentState" TEXT NOT NULL DEFAULT 'NOT_MET',
    "evidenceJson" TEXT NOT NULL DEFAULT '{}',
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectiveSuccessCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectiveEvent" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reason" TEXT,
    "version" INTEGER,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "auditLogId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectivePlanApproval" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "constraintsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectivePlanApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectiveCheckpoint" (
    "id" TEXT NOT NULL,
    "checkpointNumber" INTEGER NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectiveStatus" TEXT NOT NULL,
    "objectiveVersion" INTEGER NOT NULL,
    "orchestrationRound" INTEGER NOT NULL DEFAULT 1,
    "planId" TEXT,
    "planVersion" INTEGER,
    "planHash" TEXT,
    "approvalState" TEXT DEFAULT 'NONE',
    "approvalPayloadHash" TEXT,
    "taskStatesJson" TEXT NOT NULL DEFAULT '[]',
    "assignmentsJson" TEXT NOT NULL DEFAULT '[]',
    "dependencyEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "executionReferencesJson" TEXT NOT NULL DEFAULT '[]',
    "recoveryStateJson" TEXT NOT NULL DEFAULT '{}',
    "checkpointHash" TEXT NOT NULL,
    "triggerReason" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "workerId" TEXT,
    "leaseGeneration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectiveCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityDiscovery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectiveId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "overallReadiness" TEXT NOT NULL DEFAULT 'UNSUPPORTED',
    "coverageScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "summary" TEXT,
    "readinessDetailsJson" TEXT NOT NULL DEFAULT '{}',
    "coverageDetailsJson" TEXT NOT NULL DEFAULT '{}',
    "missingCapabilitiesJson" TEXT NOT NULL DEFAULT '[]',
    "blockedCapabilitiesJson" TEXT NOT NULL DEFAULT '[]',
    "authRequiredJson" TEXT NOT NULL DEFAULT '[]',
    "unsupportedOperationsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapabilityDiscovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityMatch" (
    "id" TEXT NOT NULL,
    "discoveryId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "agentId" TEXT,
    "toolId" TEXT,
    "integrationId" TEXT,
    "matchScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "matchReason" TEXT,
    "coverageStatus" TEXT NOT NULL DEFAULT 'COVERED',
    "permissionStatus" TEXT NOT NULL DEFAULT 'GRANTED',
    "riskClassification" TEXT NOT NULL DEFAULT 'LOW',
    "detailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapabilityMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoordinationRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "mandateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 5,
    "activeTasksCount" INTEGER NOT NULL DEFAULT 0,
    "completedTasksCount" INTEGER NOT NULL DEFAULT 0,
    "failedTasksCount" INTEGER NOT NULL DEFAULT 0,
    "totalTasksCount" INTEGER NOT NULL DEFAULT 0,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "errorDetails" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoordinationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoordinationTask" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "agentType" TEXT NOT NULL,
    "requiredCapabilitiesJson" TEXT NOT NULL DEFAULT '[]',
    "requiredToolsJson" TEXT NOT NULL DEFAULT '[]',
    "dependenciesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "assignedAgentId" TEXT,
    "executionId" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "errorDetails" TEXT,
    "financialRequired" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCostNear" TEXT,
    "reservedAmountYocto" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoordinationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCapabilityProfile" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "supportedTaskTypesJson" TEXT NOT NULL DEFAULT '[]',
    "supportedToolsJson" TEXT NOT NULL DEFAULT '[]',
    "supportedIntegrationsJson" TEXT NOT NULL DEFAULT '["outlayer_tee", "near_testnet"]',
    "supportedNetworksJson" TEXT NOT NULL DEFAULT '["near:testnet"]',
    "requiredPermissionsJson" TEXT NOT NULL DEFAULT '[]',
    "financialEligibility" BOOLEAN NOT NULL DEFAULT false,
    "maxAuthorizedTaskRisk" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "capabilityVersion" INTEGER NOT NULL DEFAULT 1,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCapabilityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAssignment" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "taskId" TEXT,
    "agentId" TEXT NOT NULL,
    "objectiveId" TEXT,
    "objectiveVersion" INTEGER,
    "planId" TEXT,
    "planVersion" INTEGER,
    "planHash" TEXT,
    "stepId" TEXT,
    "capabilityVersion" INTEGER,
    "policyVersion" INTEGER,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "leaseGeneration" INTEGER NOT NULL DEFAULT 1,
    "delegationHistoryJson" TEXT NOT NULL DEFAULT '[]',
    "assignedCapabilitiesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "reassignedFromAgentId" TEXT,
    "reassignmentReason" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "AgentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentHandoff" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "objectiveId" TEXT NOT NULL,
    "sourceAgentId" TEXT NOT NULL,
    "destinationAgentId" TEXT NOT NULL,
    "taskId" TEXT,
    "targetTaskId" TEXT,
    "stepId" TEXT,
    "planVersion" INTEGER,
    "planHash" TEXT,
    "reason" TEXT,
    "delegationType" TEXT NOT NULL DEFAULT 'TASK_RESPONSIBILITY',
    "outputReference" TEXT NOT NULL DEFAULT '',
    "structuredPayload" TEXT NOT NULL DEFAULT '{}',
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "evidenceReferences" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "validationError" TEXT,
    "idempotencyKey" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedObjectiveArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/json',
    "dataJson" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "producingAgentId" TEXT NOT NULL,
    "producingTaskId" TEXT,
    "evidenceReferencesJson" TEXT NOT NULL DEFAULT '[]',
    "allowedReaderAgentTypesJson" TEXT NOT NULL DEFAULT '["*"]',
    "allowedWriterAgentTypesJson" TEXT NOT NULL DEFAULT '[]',
    "isSealed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedObjectiveArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLease" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "leaseToken" TEXT NOT NULL,
    "leaseGeneration" INTEGER NOT NULL DEFAULT 0,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "heartbeatCount" INTEGER NOT NULL DEFAULT 0,
    "isReleased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoordinationEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "taskId" TEXT,
    "agentId" TEXT,
    "eventType" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "auditLogId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoordinationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernancePolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'USER',
    "targetId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'DENY',
    "description" TEXT,
    "isEnforced" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyEvaluation" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "objectiveId" TEXT,
    "coordinationRunId" TEXT,
    "mandateId" TEXT,
    "toolId" TEXT,
    "operation" TEXT,
    "resource" TEXT,
    "decision" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "reasonCodesJson" TEXT NOT NULL DEFAULT '[]',
    "matchedPolicyIdsJson" TEXT NOT NULL DEFAULT '[]',
    "policyVersionsJson" TEXT NOT NULL DEFAULT '{}',
    "applicableLimitsJson" TEXT NOT NULL DEFAULT '{}',
    "approvalRequirementsJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "policyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyViolation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyRuleId" TEXT,
    "agentId" TEXT,
    "objectiveId" TEXT,
    "coordinationRunId" TEXT,
    "toolId" TEXT,
    "operation" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "actionAttempted" TEXT NOT NULL,
    "violationReason" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyException" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "agentId" TEXT,
    "resource" TEXT,
    "reason" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyReview" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "reviewedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionRecord" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "operation" TEXT NOT NULL DEFAULT 'near_transfer',
    "chain" TEXT NOT NULL DEFAULT 'near',
    "recipient" TEXT NOT NULL,
    "amountYocto" TEXT NOT NULL DEFAULT '0',
    "token" TEXT NOT NULL DEFAULT 'NEAR',
    "nonce" TEXT NOT NULL,
    "authSignature" TEXT NOT NULL,
    "isNonceConsumed" BOOLEAN NOT NULL DEFAULT false,
    "nonceConsumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "outlayerRequestId" TEXT,
    "txHash" TEXT,
    "blockHash" TEXT,
    "blockHeight" INTEGER,
    "gasBurnt" TEXT,
    "tokensBurnt" TEXT,
    "errorReason" TEXT,
    "recoveryStatus" TEXT,
    "recoveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastPolledAt" TIMESTAMP(3),
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "policyId" TEXT,
    "policyVersion" INTEGER,
    "mandateVersion" INTEGER,
    "approvalId" TEXT,
    "userId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "agentId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "ExecutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "jobCategory" TEXT NOT NULL DEFAULT 'GENERAL',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "workerId" TEXT,
    "leaseToken" TEXT,
    "leaseGeneration" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "correlationId" TEXT NOT NULL,
    "parentJobId" TEXT,
    "idempotencyKey" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "traceParent" TEXT,
    "traceState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundWorker" (
    "id" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "workerType" TEXT NOT NULL DEFAULT 'STANDARD',
    "instanceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTING',
    "capabilities" TEXT NOT NULL DEFAULT '["*"]',
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "currentJobId" TEXT,
    "jobsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recentFailures" INTEGER NOT NULL DEFAULT 0,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 1,
    "activeSlots" INTEGER NOT NULL DEFAULT 0,
    "pollIntervalMs" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAttempt" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workerId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL DEFAULT 'RUNNING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "workerId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetterRecord" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "finalError" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "originalPayloadHash" TEXT NOT NULL,
    "quarantinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "resolution" TEXT,
    "resolutionMetadata" TEXT DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadLetterRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "observedValue" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'count',
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "deduplicationKey" TEXT NOT NULL,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNotes" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerCapacitySnapshot" (
    "id" TEXT NOT NULL,
    "totalWorkers" INTEGER NOT NULL,
    "activeWorkers" INTEGER NOT NULL,
    "idleWorkers" INTEGER NOT NULL,
    "busyWorkers" INTEGER NOT NULL,
    "unhealthyWorkers" INTEGER NOT NULL,
    "queuedJobs" INTEGER NOT NULL,
    "availableSlots" INTEGER NOT NULL,
    "totalSlots" INTEGER NOT NULL DEFAULT 1,
    "queuePressure" DOUBLE PRECISION NOT NULL,
    "recommendation" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '{}',
    "isAdvisoryOnly" BOOLEAN NOT NULL DEFAULT true,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerCapacitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetrySnapshot" (
    "id" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "metricUnit" TEXT NOT NULL DEFAULT '',
    "dimensions" TEXT NOT NULL DEFAULT '{}',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetrySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "runType" TEXT NOT NULL DEFAULT 'FULL',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "targetScope" TEXT,
    "totalEvaluated" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "mismatchCount" INTEGER NOT NULL DEFAULT 0,
    "ambiguousCount" INTEGER NOT NULL DEFAULT 0,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorDetails" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationFinding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "internalState" TEXT NOT NULL,
    "externalState" TEXT,
    "classification" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "details" TEXT,
    "discrepancyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationEvidence" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "findingId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceProvider" TEXT NOT NULL,
    "observedState" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "rawEvidenceJson" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionDiscrepancy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "deduplicationKey" TEXT NOT NULL,
    "internalState" TEXT NOT NULL,
    "externalState" TEXT,
    "recommendedResponse" TEXT NOT NULL,
    "incidentId" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "ExecutionDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "incidentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "currentStage" TEXT NOT NULL DEFAULT 'DETECTED',
    "source" TEXT NOT NULL DEFAULT 'RECONCILIATION',
    "targetEntityType" TEXT,
    "targetEntityId" TEXT,
    "deduplicationKey" TEXT,
    "assignedTeam" TEXT,
    "assignedTo" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionSummary" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentTimelineEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "notes" TEXT NOT NULL,
    "evidenceHash" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAssignment" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'RESPONDER',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryPlan" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT,
    "tenantId" TEXT,
    "targetEntityType" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isFinancial" BOOLEAN NOT NULL DEFAULT false,
    "actionPayloadJson" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "mandateVersion" INTEGER,
    "createdBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryApproval" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approverType" TEXT NOT NULL DEFAULT 'HUMAN',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payloadHash" TEXT NOT NULL,
    "mandateVersion" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryAttempt" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "executedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "executionResultJson" TEXT NOT NULL DEFAULT '{}',
    "errorDetails" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RecoveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryVerification" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "attemptId" TEXT,
    "verificationStrategy" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "outcomeSummary" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "rawEvidenceJson" TEXT NOT NULL DEFAULT '{}',
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalControlState" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'NORMAL',
    "previousMode" TEXT,
    "reason" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedByRole" TEXT NOT NULL,
    "incidentId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalControlState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAuditRecord" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ipAddress" TEXT,
    "payloadHash" TEXT,
    "details" TEXT NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseBackupRecord" (
    "id" TEXT NOT NULL,
    "backupFileName" TEXT NOT NULL,
    "backupFilePath" TEXT NOT NULL,
    "backupType" TEXT NOT NULL DEFAULT 'FULL',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "appVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "encryptionAlgorithm" TEXT,
    "createdBy" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "DatabaseBackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseRestoreRecord" (
    "id" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "restoredBy" TEXT NOT NULL,
    "restoredByRole" TEXT NOT NULL,
    "targetPath" TEXT,
    "isDrill" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "preRestoreReconciliationJson" TEXT NOT NULL DEFAULT '{}',
    "postRestoreReconciliationJson" TEXT NOT NULL DEFAULT '{}',
    "financialStateVerified" BOOLEAN NOT NULL DEFAULT false,
    "errorDetails" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DatabaseRestoreRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCircuitBreakerState" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'CLOSED',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureTime" TIMESTAMP(3),
    "lastSuccessTime" TIMESTAMP(3),
    "nextProbeTime" TIMESTAMP(3),
    "failureThreshold" INTEGER NOT NULL DEFAULT 5,
    "cooldownMs" INTEGER NOT NULL DEFAULT 30000,
    "lastErrorMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCircuitBreakerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResilienceDrillRun" (
    "id" TEXT NOT NULL,
    "drillType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "initiatedBy" TEXT NOT NULL,
    "targetScope" TEXT NOT NULL,
    "assertionsPassed" INTEGER NOT NULL DEFAULT 0,
    "assertionsFailed" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" TEXT,
    "reportJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResilienceDrillRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchIntent" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "jobId" TEXT,
    "leaseGeneration" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "targetProvider" TEXT NOT NULL DEFAULT 'OUTLAYER',
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DispatchIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_nearAccountId_key" ON "User"("nearAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_sessionToken_key" ON "User"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_walletId_key" ON "Wallet"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_nearAccountId_key" ON "Wallet"("nearAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_agentId_key" ON "Wallet"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingRecord_txHash_key" ON "FundingRecord"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalRecord_txHash_key" ON "WithdrawalRecord"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Task_idempotencyKey_key" ON "Task"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSession_taskId_key" ON "ResearchSession"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_taskId_key" ON "ApprovalRequest"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionRecord_txHash_key" ON "TransactionRecord"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionRecord_taskId_key" ON "TransactionRecord"("taskId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_sequenceNumber_idx" ON "AuditLog"("userId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_eventType_idx" ON "AuditLog"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecution_taskId_key" ON "AgentExecution"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecution_idempotencyKey_key" ON "AgentExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentExecution_agentId_status_idx" ON "AgentExecution"("agentId", "status");

-- CreateIndex
CREATE INDEX "AgentExecution_userId_status_idx" ON "AgentExecution"("userId", "status");

-- CreateIndex
CREATE INDEX "AgentExecution_status_idx" ON "AgentExecution"("status");

-- CreateIndex
CREATE INDEX "ExecutionEvent_executionId_timestamp_idx" ON "ExecutionEvent"("executionId", "timestamp");

-- CreateIndex
CREATE INDEX "ExecutionEvent_agentId_eventType_idx" ON "ExecutionEvent"("agentId", "eventType");

-- CreateIndex
CREATE INDEX "ExecutionEvent_userId_timestamp_idx" ON "ExecutionEvent"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "IntegrationConnection_userId_status_idx" ON "IntegrationConnection"("userId", "status");

-- CreateIndex
CREATE INDEX "IntegrationConnection_providerId_idx" ON "IntegrationConnection"("providerId");

-- CreateIndex
CREATE INDEX "IntegrationOperationPermission_connectionId_isEnabled_idx" ON "IntegrationOperationPermission"("connectionId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOperationPermission_connectionId_operationId_key" ON "IntegrationOperationPermission"("connectionId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOperationExecution_executionId_key" ON "IntegrationOperationExecution"("executionId");

-- CreateIndex
CREATE INDEX "IntegrationOperationExecution_connectionId_createdAt_idx" ON "IntegrationOperationExecution"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationOperationExecution_operationId_status_idx" ON "IntegrationOperationExecution"("operationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthSession_state_key" ON "OAuthSession"("state");

-- CreateIndex
CREATE INDEX "OAuthSession_state_idx" ON "OAuthSession"("state");

-- CreateIndex
CREATE INDEX "OAuthSession_userId_isUsed_idx" ON "OAuthSession"("userId", "isUsed");

-- CreateIndex
CREATE INDEX "AgentToolAccess_agentId_isEnabled_idx" ON "AgentToolAccess"("agentId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "AgentToolAccess_agentId_toolId_key" ON "AgentToolAccess"("agentId", "toolId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolInvocation_invocationId_key" ON "ToolInvocation"("invocationId");

-- CreateIndex
CREATE INDEX "ToolInvocation_agentId_createdAt_idx" ON "ToolInvocation"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolInvocation_userId_createdAt_idx" ON "ToolInvocation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolInvocation_toolId_status_idx" ON "ToolInvocation"("toolId", "status");

-- CreateIndex
CREATE INDEX "ToolInvocation_executionId_idx" ON "ToolInvocation"("executionId");

-- CreateIndex
CREATE INDEX "Objective_userId_status_idx" ON "Objective"("userId", "status");

-- CreateIndex
CREATE INDEX "Objective_category_idx" ON "Objective"("category");

-- CreateIndex
CREATE INDEX "Objective_mandateId_idx" ON "Objective"("mandateId");

-- CreateIndex
CREATE INDEX "ObjectivePlan_objectiveId_status_idx" ON "ObjectivePlan"("objectiveId", "status");

-- CreateIndex
CREATE INDEX "ObjectivePlan_planHash_idx" ON "ObjectivePlan"("planHash");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectivePlan_objectiveId_version_key" ON "ObjectivePlan"("objectiveId", "version");

-- CreateIndex
CREATE INDEX "ObjectivePlanStep_objectiveId_status_idx" ON "ObjectivePlanStep"("objectiveId", "status");

-- CreateIndex
CREATE INDEX "ObjectivePlanStep_planId_order_idx" ON "ObjectivePlanStep"("planId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectivePlanStep_planId_stepId_key" ON "ObjectivePlanStep"("planId", "stepId");

-- CreateIndex
CREATE INDEX "ObjectiveTaskEvent_objectiveId_stepId_idx" ON "ObjectiveTaskEvent"("objectiveId", "stepId");

-- CreateIndex
CREATE INDEX "ObjectiveTaskEvent_planId_stepId_idx" ON "ObjectiveTaskEvent"("planId", "stepId");

-- CreateIndex
CREATE INDEX "ObjectiveTaskEvent_timestamp_idx" ON "ObjectiveTaskEvent"("timestamp");

-- CreateIndex
CREATE INDEX "ObjectiveTaskResult_objectiveId_stepId_idx" ON "ObjectiveTaskResult"("objectiveId", "stepId");

-- CreateIndex
CREATE INDEX "ObjectiveTaskResult_agentId_idx" ON "ObjectiveTaskResult"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectiveTaskResult_planId_stepId_executionAttempt_key" ON "ObjectiveTaskResult"("planId", "stepId", "executionAttempt");

-- CreateIndex
CREATE INDEX "ObjectiveSuccessCriteria_objectiveId_currentState_idx" ON "ObjectiveSuccessCriteria"("objectiveId", "currentState");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectiveSuccessCriteria_objectiveId_criterionId_key" ON "ObjectiveSuccessCriteria"("objectiveId", "criterionId");

-- CreateIndex
CREATE INDEX "ObjectiveEvent_objectiveId_timestamp_idx" ON "ObjectiveEvent"("objectiveId", "timestamp");

-- CreateIndex
CREATE INDEX "ObjectivePlanApproval_planId_version_idx" ON "ObjectivePlanApproval"("planId", "version");

-- CreateIndex
CREATE INDEX "ObjectivePlanApproval_userId_idx" ON "ObjectivePlanApproval"("userId");

-- CreateIndex
CREATE INDEX "ObjectiveCheckpoint_objectiveId_createdAt_idx" ON "ObjectiveCheckpoint"("objectiveId", "createdAt");

-- CreateIndex
CREATE INDEX "ObjectiveCheckpoint_userId_objectiveId_idx" ON "ObjectiveCheckpoint"("userId", "objectiveId");

-- CreateIndex
CREATE INDEX "ObjectiveCheckpoint_checkpointHash_idx" ON "ObjectiveCheckpoint"("checkpointHash");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectiveCheckpoint_objectiveId_checkpointNumber_key" ON "ObjectiveCheckpoint"("objectiveId", "checkpointNumber");

-- CreateIndex
CREATE INDEX "CapabilityDiscovery_userId_createdAt_idx" ON "CapabilityDiscovery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CapabilityDiscovery_objectiveId_createdAt_idx" ON "CapabilityDiscovery"("objectiveId", "createdAt");

-- CreateIndex
CREATE INDEX "CapabilityDiscovery_overallReadiness_idx" ON "CapabilityDiscovery"("overallReadiness");

-- CreateIndex
CREATE INDEX "CapabilityMatch_discoveryId_requirementId_idx" ON "CapabilityMatch"("discoveryId", "requirementId");

-- CreateIndex
CREATE INDEX "CapabilityMatch_capabilityId_idx" ON "CapabilityMatch"("capabilityId");

-- CreateIndex
CREATE INDEX "CapabilityMatch_coverageStatus_idx" ON "CapabilityMatch"("coverageStatus");

-- CreateIndex
CREATE INDEX "CoordinationRun_userId_status_idx" ON "CoordinationRun"("userId", "status");

-- CreateIndex
CREATE INDEX "CoordinationRun_objectiveId_status_idx" ON "CoordinationRun"("objectiveId", "status");

-- CreateIndex
CREATE INDEX "CoordinationRun_planId_planVersion_idx" ON "CoordinationRun"("planId", "planVersion");

-- CreateIndex
CREATE INDEX "CoordinationRun_status_createdAt_idx" ON "CoordinationRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CoordinationTask_runId_status_idx" ON "CoordinationTask"("runId", "status");

-- CreateIndex
CREATE INDEX "CoordinationTask_assignedAgentId_status_idx" ON "CoordinationTask"("assignedAgentId", "status");

-- CreateIndex
CREATE INDEX "CoordinationTask_priority_order_idx" ON "CoordinationTask"("priority", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CoordinationTask_runId_stepId_key" ON "CoordinationTask"("runId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCapabilityProfile_agentId_key" ON "AgentCapabilityProfile"("agentId");

-- CreateIndex
CREATE INDEX "AgentCapabilityProfile_userId_status_idx" ON "AgentCapabilityProfile"("userId", "status");

-- CreateIndex
CREATE INDEX "AgentCapabilityProfile_agentType_status_idx" ON "AgentCapabilityProfile"("agentType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAssignment_taskId_key" ON "AgentAssignment"("taskId");

-- CreateIndex
CREATE INDEX "AgentAssignment_runId_agentId_idx" ON "AgentAssignment"("runId", "agentId");

-- CreateIndex
CREATE INDEX "AgentAssignment_agentId_status_idx" ON "AgentAssignment"("agentId", "status");

-- CreateIndex
CREATE INDEX "AgentAssignment_objectiveId_stepId_idx" ON "AgentAssignment"("objectiveId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentHandoff_idempotencyKey_key" ON "AgentHandoff"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentHandoff_runId_status_idx" ON "AgentHandoff"("runId", "status");

-- CreateIndex
CREATE INDEX "AgentHandoff_sourceAgentId_destinationAgentId_idx" ON "AgentHandoff"("sourceAgentId", "destinationAgentId");

-- CreateIndex
CREATE INDEX "AgentHandoff_taskId_idx" ON "AgentHandoff"("taskId");

-- CreateIndex
CREATE INDEX "AgentHandoff_targetTaskId_idx" ON "AgentHandoff"("targetTaskId");

-- CreateIndex
CREATE INDEX "AgentHandoff_objectiveId_stepId_idx" ON "AgentHandoff"("objectiveId", "stepId");

-- CreateIndex
CREATE INDEX "SharedObjectiveArtifact_runId_artifactId_idx" ON "SharedObjectiveArtifact"("runId", "artifactId");

-- CreateIndex
CREATE INDEX "SharedObjectiveArtifact_objectiveId_idx" ON "SharedObjectiveArtifact"("objectiveId");

-- CreateIndex
CREATE INDEX "SharedObjectiveArtifact_producingAgentId_idx" ON "SharedObjectiveArtifact"("producingAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedObjectiveArtifact_runId_artifactId_version_key" ON "SharedObjectiveArtifact"("runId", "artifactId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLease_taskId_key" ON "TaskLease"("taskId");

-- CreateIndex
CREATE INDEX "TaskLease_runId_workerId_idx" ON "TaskLease"("runId", "workerId");

-- CreateIndex
CREATE INDEX "TaskLease_expiresAt_isReleased_idx" ON "TaskLease"("expiresAt", "isReleased");

-- CreateIndex
CREATE INDEX "CoordinationEvent_runId_timestamp_idx" ON "CoordinationEvent"("runId", "timestamp");

-- CreateIndex
CREATE INDEX "CoordinationEvent_objectiveId_eventType_idx" ON "CoordinationEvent"("objectiveId", "eventType");

-- CreateIndex
CREATE INDEX "CoordinationEvent_taskId_idx" ON "CoordinationEvent"("taskId");

-- CreateIndex
CREATE INDEX "CoordinationEvent_agentId_idx" ON "CoordinationEvent"("agentId");

-- CreateIndex
CREATE INDEX "GovernancePolicy_userId_status_idx" ON "GovernancePolicy"("userId", "status");

-- CreateIndex
CREATE INDEX "GovernancePolicy_scope_targetId_idx" ON "GovernancePolicy"("scope", "targetId");

-- CreateIndex
CREATE INDEX "GovernancePolicy_priority_isSystem_idx" ON "GovernancePolicy"("priority", "isSystem");

-- CreateIndex
CREATE INDEX "PolicyVersion_policyId_idx" ON "PolicyVersion"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_policyId_version_key" ON "PolicyVersion"("policyId", "version");

-- CreateIndex
CREATE INDEX "PolicyRule_policyId_isEnforced_idx" ON "PolicyRule"("policyId", "isEnforced");

-- CreateIndex
CREATE INDEX "PolicyRule_ruleType_idx" ON "PolicyRule"("ruleType");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyEvaluation_evaluationId_key" ON "PolicyEvaluation"("evaluationId");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_userId_decision_idx" ON "PolicyEvaluation"("userId", "decision");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_evaluationId_idx" ON "PolicyEvaluation"("evaluationId");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_agentId_idx" ON "PolicyEvaluation"("agentId");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_objectiveId_idx" ON "PolicyEvaluation"("objectiveId");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_coordinationRunId_idx" ON "PolicyEvaluation"("coordinationRunId");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_createdAt_idx" ON "PolicyEvaluation"("createdAt");

-- CreateIndex
CREATE INDEX "PolicyViolation_userId_severity_idx" ON "PolicyViolation"("userId", "severity");

-- CreateIndex
CREATE INDEX "PolicyViolation_policyId_idx" ON "PolicyViolation"("policyId");

-- CreateIndex
CREATE INDEX "PolicyViolation_agentId_idx" ON "PolicyViolation"("agentId");

-- CreateIndex
CREATE INDEX "PolicyViolation_createdAt_idx" ON "PolicyViolation"("createdAt");

-- CreateIndex
CREATE INDEX "PolicyException_policyId_status_idx" ON "PolicyException"("policyId", "status");

-- CreateIndex
CREATE INDEX "PolicyException_userId_idx" ON "PolicyException"("userId");

-- CreateIndex
CREATE INDEX "PolicyReview_policyId_idx" ON "PolicyReview"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionRecord_idempotencyKey_key" ON "ExecutionRecord"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionRecord_nonce_key" ON "ExecutionRecord"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionRecord_txHash_key" ON "ExecutionRecord"("txHash");

-- CreateIndex
CREATE INDEX "ExecutionRecord_userId_status_idx" ON "ExecutionRecord"("userId", "status");

-- CreateIndex
CREATE INDEX "ExecutionRecord_mandateId_idx" ON "ExecutionRecord"("mandateId");

-- CreateIndex
CREATE INDEX "ExecutionRecord_txHash_idx" ON "ExecutionRecord"("txHash");

-- CreateIndex
CREATE INDEX "ExecutionRecord_idempotencyKey_idx" ON "ExecutionRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BackgroundJob_tenantId_status_idx" ON "BackgroundJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_scheduledAt_priority_idx" ON "BackgroundJob"("status", "scheduledAt", "priority");

-- CreateIndex
CREATE INDEX "BackgroundJob_leaseExpiresAt_idx" ON "BackgroundJob"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_correlationId_idx" ON "BackgroundJob"("correlationId");

-- CreateIndex
CREATE INDEX "BackgroundJob_jobType_idx" ON "BackgroundJob"("jobType");

-- CreateIndex
CREATE INDEX "BackgroundJob_tenantId_idempotencyKey_idx" ON "BackgroundJob"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundWorker_instanceId_key" ON "BackgroundWorker"("instanceId");

-- CreateIndex
CREATE INDEX "BackgroundWorker_status_lastHeartbeatAt_idx" ON "BackgroundWorker"("status", "lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "BackgroundWorker_instanceId_idx" ON "BackgroundWorker"("instanceId");

-- CreateIndex
CREATE INDEX "JobAttempt_jobId_attemptNumber_idx" ON "JobAttempt"("jobId", "attemptNumber");

-- CreateIndex
CREATE INDEX "JobAttempt_workerId_idx" ON "JobAttempt"("workerId");

-- CreateIndex
CREATE INDEX "JobEvent_jobId_createdAt_idx" ON "JobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobEvent_eventType_idx" ON "JobEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "DeadLetterRecord_jobId_key" ON "DeadLetterRecord"("jobId");

-- CreateIndex
CREATE INDEX "DeadLetterRecord_tenantId_resolution_idx" ON "DeadLetterRecord"("tenantId", "resolution");

-- CreateIndex
CREATE INDEX "DeadLetterRecord_quarantinedAt_idx" ON "DeadLetterRecord"("quarantinedAt");

-- CreateIndex
CREATE INDEX "OperationalAlert_tenantId_status_idx" ON "OperationalAlert"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OperationalAlert_deduplicationKey_status_idx" ON "OperationalAlert"("deduplicationKey", "status");

-- CreateIndex
CREATE INDEX "OperationalAlert_severity_status_idx" ON "OperationalAlert"("severity", "status");

-- CreateIndex
CREATE INDEX "OperationalAlert_createdAt_idx" ON "OperationalAlert"("createdAt");

-- CreateIndex
CREATE INDEX "WorkerCapacitySnapshot_recordedAt_idx" ON "WorkerCapacitySnapshot"("recordedAt");

-- CreateIndex
CREATE INDEX "WorkerCapacitySnapshot_recommendation_idx" ON "WorkerCapacitySnapshot"("recommendation");

-- CreateIndex
CREATE INDEX "TelemetrySnapshot_metricName_recordedAt_idx" ON "TelemetrySnapshot"("metricName", "recordedAt");

-- CreateIndex
CREATE INDEX "ReconciliationRun_tenantId_status_idx" ON "ReconciliationRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ReconciliationRun_runType_startedAt_idx" ON "ReconciliationRun"("runType", "startedAt");

-- CreateIndex
CREATE INDEX "ReconciliationRun_startedAt_idx" ON "ReconciliationRun"("startedAt");

-- CreateIndex
CREATE INDEX "ReconciliationFinding_runId_entityType_idx" ON "ReconciliationFinding"("runId", "entityType");

-- CreateIndex
CREATE INDEX "ReconciliationFinding_entityId_entityType_idx" ON "ReconciliationFinding"("entityId", "entityType");

-- CreateIndex
CREATE INDEX "ReconciliationFinding_classification_idx" ON "ReconciliationFinding"("classification");

-- CreateIndex
CREATE INDEX "ReconciliationEvidence_entityId_entityType_idx" ON "ReconciliationEvidence"("entityId", "entityType");

-- CreateIndex
CREATE INDEX "ReconciliationEvidence_sourceProvider_idx" ON "ReconciliationEvidence"("sourceProvider");

-- CreateIndex
CREATE INDEX "ReconciliationEvidence_payloadHash_idx" ON "ReconciliationEvidence"("payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionDiscrepancy_deduplicationKey_key" ON "ExecutionDiscrepancy"("deduplicationKey");

-- CreateIndex
CREATE INDEX "ExecutionDiscrepancy_tenantId_status_idx" ON "ExecutionDiscrepancy"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ExecutionDiscrepancy_entityType_entityId_idx" ON "ExecutionDiscrepancy"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ExecutionDiscrepancy_severity_status_idx" ON "ExecutionDiscrepancy"("severity", "status");

-- CreateIndex
CREATE INDEX "ExecutionDiscrepancy_firstDetectedAt_idx" ON "ExecutionDiscrepancy"("firstDetectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_incidentNumber_key" ON "Incident"("incidentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_deduplicationKey_key" ON "Incident"("deduplicationKey");

-- CreateIndex
CREATE INDEX "Incident_tenantId_status_idx" ON "Incident"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Incident_severity_status_idx" ON "Incident"("severity", "status");

-- CreateIndex
CREATE INDEX "Incident_currentStage_idx" ON "Incident"("currentStage");

-- CreateIndex
CREATE INDEX "Incident_detectedAt_idx" ON "Incident"("detectedAt");

-- CreateIndex
CREATE INDEX "IncidentTimelineEvent_incidentId_createdAt_idx" ON "IncidentTimelineEvent"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentTimelineEvent_eventType_idx" ON "IncidentTimelineEvent"("eventType");

-- CreateIndex
CREATE INDEX "IncidentAssignment_incidentId_assignedAt_idx" ON "IncidentAssignment"("incidentId", "assignedAt");

-- CreateIndex
CREATE INDEX "RecoveryPlan_incidentId_idx" ON "RecoveryPlan"("incidentId");

-- CreateIndex
CREATE INDEX "RecoveryPlan_targetEntityType_targetEntityId_idx" ON "RecoveryPlan"("targetEntityType", "targetEntityId");

-- CreateIndex
CREATE INDEX "RecoveryPlan_status_idx" ON "RecoveryPlan"("status");

-- CreateIndex
CREATE INDEX "RecoveryApproval_planId_status_idx" ON "RecoveryApproval"("planId", "status");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_planId_attemptNumber_idx" ON "RecoveryAttempt"("planId", "attemptNumber");

-- CreateIndex
CREATE INDEX "RecoveryVerification_planId_isVerified_idx" ON "RecoveryVerification"("planId", "isVerified");

-- CreateIndex
CREATE INDEX "OperationalControlState_mode_idx" ON "OperationalControlState"("mode");

-- CreateIndex
CREATE INDEX "OperationalControlState_updatedAt_idx" ON "OperationalControlState"("updatedAt");

-- CreateIndex
CREATE INDEX "OperationalAuditRecord_actionType_timestamp_idx" ON "OperationalAuditRecord"("actionType", "timestamp");

-- CreateIndex
CREATE INDEX "OperationalAuditRecord_actorId_idx" ON "OperationalAuditRecord"("actorId");

-- CreateIndex
CREATE INDEX "DatabaseBackupRecord_status_createdAt_idx" ON "DatabaseBackupRecord"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DatabaseBackupRecord_checksumSha256_idx" ON "DatabaseBackupRecord"("checksumSha256");

-- CreateIndex
CREATE INDEX "DatabaseRestoreRecord_backupId_status_idx" ON "DatabaseRestoreRecord"("backupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCircuitBreakerState_providerId_key" ON "ProviderCircuitBreakerState"("providerId");

-- CreateIndex
CREATE INDEX "ProviderCircuitBreakerState_state_idx" ON "ProviderCircuitBreakerState"("state");

-- CreateIndex
CREATE INDEX "ResilienceDrillRun_drillType_status_idx" ON "ResilienceDrillRun"("drillType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchIntent_executionId_key" ON "DispatchIntent"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchIntent_idempotencyKey_key" ON "DispatchIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DispatchIntent_idempotencyKey_idx" ON "DispatchIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DispatchIntent_jobId_idx" ON "DispatchIntent"("jobId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRecord" ADD CONSTRAINT "FundingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRecord" ADD CONSTRAINT "FundingRecord_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRecord" ADD CONSTRAINT "WithdrawalRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRecord" ADD CONSTRAINT "WithdrawalRecord_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRecord" ADD CONSTRAINT "TransactionRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRecord" ADD CONSTRAINT "TransactionRecord_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRecord" ADD CONSTRAINT "TransactionRecord_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEvent" ADD CONSTRAINT "ExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEvent" ADD CONSTRAINT "ExecutionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOperationPermission" ADD CONSTRAINT "IntegrationOperationPermission_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOperationExecution" ADD CONSTRAINT "IntegrationOperationExecution_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthSession" ADD CONSTRAINT "OAuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolAccess" ADD CONSTRAINT "AgentToolAccess_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectivePlan" ADD CONSTRAINT "ObjectivePlan_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectivePlanStep" ADD CONSTRAINT "ObjectivePlanStep_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectivePlanStep" ADD CONSTRAINT "ObjectivePlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ObjectivePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveTaskEvent" ADD CONSTRAINT "ObjectiveTaskEvent_stepRecordId_fkey" FOREIGN KEY ("stepRecordId") REFERENCES "ObjectivePlanStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveTaskResult" ADD CONSTRAINT "ObjectiveTaskResult_stepRecordId_fkey" FOREIGN KEY ("stepRecordId") REFERENCES "ObjectivePlanStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveSuccessCriteria" ADD CONSTRAINT "ObjectiveSuccessCriteria_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveEvent" ADD CONSTRAINT "ObjectiveEvent_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectivePlanApproval" ADD CONSTRAINT "ObjectivePlanApproval_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ObjectivePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectivePlanApproval" ADD CONSTRAINT "ObjectivePlanApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveCheckpoint" ADD CONSTRAINT "ObjectiveCheckpoint_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectiveCheckpoint" ADD CONSTRAINT "ObjectiveCheckpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityDiscovery" ADD CONSTRAINT "CapabilityDiscovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityDiscovery" ADD CONSTRAINT "CapabilityDiscovery_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityMatch" ADD CONSTRAINT "CapabilityMatch_discoveryId_fkey" FOREIGN KEY ("discoveryId") REFERENCES "CapabilityDiscovery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationRun" ADD CONSTRAINT "CoordinationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationRun" ADD CONSTRAINT "CoordinationRun_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationRun" ADD CONSTRAINT "CoordinationRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ObjectivePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationRun" ADD CONSTRAINT "CoordinationRun_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationTask" ADD CONSTRAINT "CoordinationTask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CoordinationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCapabilityProfile" ADD CONSTRAINT "AgentCapabilityProfile_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCapabilityProfile" ADD CONSTRAINT "AgentCapabilityProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CoordinationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CoordinationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CoordinationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_sourceAgentId_fkey" FOREIGN KEY ("sourceAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_destinationAgentId_fkey" FOREIGN KEY ("destinationAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CoordinationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "CoordinationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedObjectiveArtifact" ADD CONSTRAINT "SharedObjectiveArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CoordinationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedObjectiveArtifact" ADD CONSTRAINT "SharedObjectiveArtifact_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedObjectiveArtifact" ADD CONSTRAINT "SharedObjectiveArtifact_producingAgentId_fkey" FOREIGN KEY ("producingAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLease" ADD CONSTRAINT "TaskLease_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CoordinationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLease" ADD CONSTRAINT "TaskLease_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CoordinationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationEvent" ADD CONSTRAINT "CoordinationEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CoordinationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinationEvent" ADD CONSTRAINT "CoordinationEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CoordinationTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernancePolicy" ADD CONSTRAINT "GovernancePolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "GovernancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRule" ADD CONSTRAINT "PolicyRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "GovernancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyEvaluation" ADD CONSTRAINT "PolicyEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyEvaluation" ADD CONSTRAINT "PolicyEvaluation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "GovernancePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyViolation" ADD CONSTRAINT "PolicyViolation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyViolation" ADD CONSTRAINT "PolicyViolation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "GovernancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyViolation" ADD CONSTRAINT "PolicyViolation_policyRuleId_fkey" FOREIGN KEY ("policyRuleId") REFERENCES "PolicyRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyException" ADD CONSTRAINT "PolicyException_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "GovernancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyException" ADD CONSTRAINT "PolicyException_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyReview" ADD CONSTRAINT "PolicyReview_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "GovernancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyReview" ADD CONSTRAINT "PolicyReview_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "BackgroundWorker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_parentJobId_fkey" FOREIGN KEY ("parentJobId") REFERENCES "BackgroundJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "BackgroundWorker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "BackgroundWorker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterRecord" ADD CONSTRAINT "DeadLetterRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadLetterRecord" ADD CONSTRAINT "DeadLetterRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAlert" ADD CONSTRAINT "OperationalAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationFinding" ADD CONSTRAINT "ReconciliationFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationEvidence" ADD CONSTRAINT "ReconciliationEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationEvidence" ADD CONSTRAINT "ReconciliationEvidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "ReconciliationFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionDiscrepancy" ADD CONSTRAINT "ExecutionDiscrepancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionDiscrepancy" ADD CONSTRAINT "ExecutionDiscrepancy_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentTimelineEvent" ADD CONSTRAINT "IncidentTimelineEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAssignment" ADD CONSTRAINT "IncidentAssignment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlan" ADD CONSTRAINT "RecoveryPlan_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlan" ADD CONSTRAINT "RecoveryPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryApproval" ADD CONSTRAINT "RecoveryApproval_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecoveryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAttempt" ADD CONSTRAINT "RecoveryAttempt_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecoveryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryVerification" ADD CONSTRAINT "RecoveryVerification_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecoveryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryVerification" ADD CONSTRAINT "RecoveryVerification_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "RecoveryAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseRestoreRecord" ADD CONSTRAINT "DatabaseRestoreRecord_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "DatabaseBackupRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
