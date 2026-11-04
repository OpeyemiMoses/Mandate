/**
 * Mandate Universal Integration Framework — Type Definitions
 * Milestone 5: Standardized, secure, permission-controlled integration architecture
 */

export type IntegrationStatus =
  | "CONNECTED"
  | "AUTHENTICATED"
  | "ACTIVE"
  | "DEGRADED"
  | "AUTH_EXPIRED"
  | "SCOPE_MISSING"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "DISABLED"
  | "REVOKED";

export type IntegrationAuthType =
  | "NONE"
  | "API_KEY"
  | "BEARER_TOKEN"
  | "BASIC"
  | "OAUTH"
  | "CUSTOM";

export type OperationPermissionLevel =
  | "READ"
  | "PROPOSE"
  | "RESTRICTED_EXECUTION"
  | "USER_ONLY";

export type OperationRiskClassification =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export interface IntegrationParameterSchema {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  default?: any;
  enum?: (string | number)[];
}

export interface IntegrationOperationDefinition {
  id: string; // e.g. "view_account", "post_message", "execute_payment"
  name: string;
  description: string;
  category: "READ" | "WRITE" | "FINANCIAL" | "ADMIN" | "COMMUNICATION";
  defaultPermissionLevel: OperationPermissionLevel;
  riskClassification: OperationRiskClassification;
  requiredScopes?: string[];
  parameters: IntegrationParameterSchema[];
  outputSchema?: Record<string, any>;
  idempotent?: boolean;
  rateLimitPerMinute?: number;
}

export interface IntegrationMetadata {
  providerId: string;
  name: string;
  description: string;
  version: string;
  category: "BLOCKCHAIN" | "SEARCH" | "REST_API" | "MCP_SERVER" | "COMMUNICATION" | "FINANCE" | "PRODUCTIVITY";
  authType: IntegrationAuthType;
  icon?: string;
  documentationUrl?: string;
  supportedAuthTypes: IntegrationAuthType[];
  supportsOAuth?: boolean;
  oauthConfig?: {
    authorizationUrl: string;
    tokenUrl: string;
    defaultScopes: string[];
    supportsPkce: boolean;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ConnectionResult {
  success: boolean;
  connectionId?: string;
  status: IntegrationStatus;
  grantedScopes?: string[];
  error?: string;
  metadata?: Record<string, any>;
}

export interface IntegrationHealthReport {
  status: IntegrationStatus;
  isHealthy: boolean;
  latencyMs?: number;
  testedAt: Date;
  verifiedScopes: string[];
  missingScopes: string[];
  details?: Record<string, any>;
  errorMessage?: string;
}

export interface CredentialRefreshResult {
  success: boolean;
  newCredentials?: Record<string, any>;
  expiresAt?: Date;
  grantedScopes?: string[];
  error?: string;
}

export interface IntegrationExecutionContext {
  connectionId: string;
  operationId: string;
  userId: string;
  agentId?: string;
  mandateId?: string;
  parameters: Record<string, any>;
  credentials?: Record<string, any>;
  config?: Record<string, any>;
  idempotencyKey?: string;
}

export interface IntegrationOperationResult {
  success: boolean;
  data?: any;
  error?: string;
  statusCode?: number;
  durationMs: number;
  idempotencyKey?: string;
  rateLimitRemaining?: number;
}

/**
 * Universal Integration Adapter Interface
 * All integrations (REST, MCP, NEAR, Slack, Custom) implement this contract.
 */
export interface UniversalIntegrationAdapter {
  getMetadata(): IntegrationMetadata;
  getSupportedOperations(): Promise<IntegrationOperationDefinition[]>;
  validateConfiguration(config: Record<string, any>): ValidationResult;
  connect(userId: string, credentials: any, config: any): Promise<ConnectionResult>;
  disconnect(connectionId: string): Promise<void>;
  testConnection(connection: any, decryptedCredentials?: Record<string, any>): Promise<IntegrationHealthReport>;
  refreshCredentials?(connection: any, decryptedCredentials?: Record<string, any>): Promise<CredentialRefreshResult>;
  executeOperation(context: IntegrationExecutionContext): Promise<IntegrationOperationResult>;
  getHealth(connection: any, decryptedCredentials?: Record<string, any>): Promise<IntegrationHealthReport>;
}

