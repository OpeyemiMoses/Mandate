/**
 * MANDATE — Production Environment & Secret Validation
 * Milestone 9.5: Final Production Certification
 * 
 * Strict fail-closed validation of runtime configuration and cryptographic secrets.
 * Ensures zero insecure development fallbacks are accepted in production.
 */

import crypto from "crypto";

export const KNOWN_INSECURE_SECRETS = new Set([
  "mandate-execution-signing-secret-v1-production-boundary",
  "mandate-credential-vault-master-key-v1-secret-32bytes",
  "mandate-credential-vault-master-key-v2-secret-32bytes",
  "mandate-credential-vault-master-key-v3-secret-32bytes",
  "mandate-universal-tools-master-encryption-key-v1",
  "mandate-client-id",
  "mock-client-id",
  "21fef48091f12692cad574a6f7753643",
  "secret",
  "test",
  "password",
  "admin",
  "changeme",
  "12345678",
  "12345678901234567890123456789012",
]);

export const MINIMUM_SECRET_LENGTH = 32;

export type VariableClassification = "REQUIRED_PRODUCTION" | "OPTIONAL_PRODUCTION" | "DEVELOPMENT_ONLY";

export type VariableValidationStatus =
  | "VALID"
  | "MISSING"
  | "INSECURE_DEFAULT"
  | "INSUFFICIENT_LENGTH"
  | "INVALID_FORMAT"
  | "NOT_CONFIGURED_OPTIONAL";

export interface VariableValidationResult {
  name: string;
  classification: VariableClassification;
  status: VariableValidationStatus;
  isSecret: boolean;
  message?: string;
}

export interface EnvironmentValidationReport {
  isProduction: boolean;
  valid: boolean;
  timestamp: string;
  totalVariables: number;
  validCount: number;
  missingCount: number;
  invalidCount: number;
  criticalErrors: string[];
  variables: Record<string, VariableValidationResult>;
}

export class ConfigurationError extends Error {
  public readonly code: string;
  public readonly criticalErrors: string[];

  constructor(message: string, criticalErrors: string[] = [], code = "ERR_CONFIG_INVALID") {
    super(message);
    this.name = "ConfigurationError";
    this.code = code;
    this.criticalErrors = criticalErrors;
  }
}

/**
 * Checks if a secret matches known insecure defaults or placeholder strings.
 */
export function isKnownInsecureSecret(secret: string): boolean {
  if (!secret) return true;
  const trimmed = secret.trim();
  const lower = trimmed.toLowerCase();
  if (KNOWN_INSECURE_SECRETS.has(trimmed) || KNOWN_INSECURE_SECRETS.has(lower)) return true;
  // Specific known fallback patterns
  if (
    lower.startsWith("mandate-") ||
    lower.startsWith("mock-") ||
    lower === "21fef48091f12692cad574a6f7753643" ||
    lower.includes("mandate-execution-signing-secret") ||
    lower.includes("mandate-credential-vault") ||
    lower.includes("mandate-universal-tools")
  ) {
    return true;
  }
  return false;
}

/**
 * Validates secret entropy and character diversity.
 */
export function hasSufficientEntropy(secret: string): boolean {
  if (!secret || secret.length < MINIMUM_SECRET_LENGTH) return false;
  // Disallow repeated single characters e.g. "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 8) return false;
  return true;
}

/**
 * Strictly redacts any secret value for safe logging and UI display.
 */
export function redactSecret(secret?: string | null): string {
  if (!secret || typeof secret !== "string") return "[NOT SET]";
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 3)}••••••••${trimmed.slice(-3)}`;
}

/**
 * Evaluates environment variables for production readiness.
 */
export function validateEnvironment(
  customEnv?: Record<string, string | undefined>,
  forceProduction?: boolean
): EnvironmentValidationReport {
  const env = customEnv || process.env;
  const isProd = forceProduction !== undefined ? forceProduction : env.NODE_ENV === "production";

  const criticalErrors: string[] = [];
  const variables: Record<string, VariableValidationResult> = {};

  // Helper to validate secrets
  const validateSecretVar = (
    name: string,
    classification: VariableClassification,
    isRequired: boolean
  ) => {
    const value = env[name];
    if (!value) {
      if (isRequired) {
        criticalErrors.push(`Required secret "${name}" is missing`);
        variables[name] = {
          name,
          classification,
          status: "MISSING",
          isSecret: true,
          message: "Variable is required in production but was not set",
        };
      } else {
        variables[name] = {
          name,
          classification,
          status: "NOT_CONFIGURED_OPTIONAL",
          isSecret: true,
          message: "Optional secret not configured",
        };
      }
      return;
    }

    if (isKnownInsecureSecret(value)) {
      criticalErrors.push(`Secret "${name}" matches a known development fallback or insecure pattern`);
      variables[name] = {
        name,
        classification,
        status: "INSECURE_DEFAULT",
        isSecret: true,
        message: "Matches known insecure development default",
      };
      return;
    }

    if (value.length < MINIMUM_SECRET_LENGTH || !hasSufficientEntropy(value)) {
      criticalErrors.push(`Secret "${name}" has insufficient length or entropy (< ${MINIMUM_SECRET_LENGTH} characters)`);
      variables[name] = {
        name,
        classification,
        status: "INSUFFICIENT_LENGTH",
        isSecret: true,
        message: `Secret length must be at least ${MINIMUM_SECRET_LENGTH} characters with varied entropy`,
      };
      return;
    }

    variables[name] = {
      name,
      classification,
      status: "VALID",
      isSecret: true,
      message: "Secret is configured with sufficient entropy",
    };
  };

  // Helper to validate URLs
  const validateUrlVar = (
    name: string,
    classification: VariableClassification,
    isRequired: boolean
  ) => {
    const value = env[name];
    if (!value) {
      if (isRequired) {
        criticalErrors.push(`Required URL "${name}" is missing`);
        variables[name] = {
          name,
          classification,
          status: "MISSING",
          isSecret: false,
          message: "Variable is required in production but was not set",
        };
      } else {
        variables[name] = {
          name,
          classification,
          status: "NOT_CONFIGURED_OPTIONAL",
          isSecret: false,
        };
      }
      return;
    }

    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        criticalErrors.push(`URL "${name}" has invalid protocol "${parsed.protocol}"`);
        variables[name] = {
          name,
          classification,
          status: "INVALID_FORMAT",
          isSecret: false,
          message: "Protocol must be http or https",
        };
        return;
      }
      variables[name] = {
        name,
        classification,
        status: "VALID",
        isSecret: false,
      };
    } catch {
      criticalErrors.push(`URL "${name}" is not a valid URL`);
      variables[name] = {
        name,
        classification,
        status: "INVALID_FORMAT",
        isSecret: false,
        message: "Failed URL format parse",
      };
    }
  };

  // 1. Mandatory Secrets
  validateSecretVar("EXECUTION_SIGNING_SECRET", "REQUIRED_PRODUCTION", isProd);
  validateSecretVar("CREDENTIAL_VAULT_KEY_V1", "REQUIRED_PRODUCTION", isProd);
  validateSecretVar("TOOL_ENCRYPTION_KEY", "REQUIRED_PRODUCTION", isProd);

  // 2. Optional Secrets
  validateSecretVar("CREDENTIAL_VAULT_KEY_V2", "OPTIONAL_PRODUCTION", false);
  validateSecretVar("CREDENTIAL_VAULT_KEY_V3", "OPTIONAL_PRODUCTION", false);
  validateSecretVar("OUTLAYER_SIGNING_SECRET", "OPTIONAL_PRODUCTION", false);
  validateSecretVar("SESSION_SECRET", "OPTIONAL_PRODUCTION", false);

  // 3. Database URL
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    if (isProd) {
      criticalErrors.push('Required variable "DATABASE_URL" is missing');
    }
    variables["DATABASE_URL"] = {
      name: "DATABASE_URL",
      classification: "REQUIRED_PRODUCTION",
      status: isProd ? "MISSING" : "NOT_CONFIGURED_OPTIONAL",
      isSecret: false,
      message: isProd ? "DATABASE_URL is missing in production" : "Defaulting to SQLite dev.db",
    };
  } else {
    const isSqlite = dbUrl.startsWith("file:");
    const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");
    if (!isSqlite && !isPostgres) {
      criticalErrors.push('DATABASE_URL must be a valid SQLite file: URI or postgresql:// URL');
      variables["DATABASE_URL"] = {
        name: "DATABASE_URL",
        classification: "REQUIRED_PRODUCTION",
        status: "INVALID_FORMAT",
        isSecret: false,
        message: "Unsupported database protocol",
      };
    } else {
      variables["DATABASE_URL"] = {
        name: "DATABASE_URL",
        classification: "REQUIRED_PRODUCTION",
        status: "VALID",
        isSecret: false,
        message: isSqlite ? "SQLite local file" : "PostgreSQL connection pool",
      };
    }
  }

  // 4. NEAR Network
  const nearNetwork = env.NEAR_NETWORK;
  if (!nearNetwork) {
    if (isProd) {
      criticalErrors.push('Required variable "NEAR_NETWORK" is missing');
    }
    variables["NEAR_NETWORK"] = {
      name: "NEAR_NETWORK",
      classification: "REQUIRED_PRODUCTION",
      status: isProd ? "MISSING" : "VALID",
      isSecret: false,
      message: isProd ? "Must be specified" : "Defaulting to testnet",
    };
  } else if (nearNetwork !== "mainnet" && nearNetwork !== "testnet") {
    criticalErrors.push(`NEAR_NETWORK must be "mainnet" or "testnet" (received "${nearNetwork}")`);
    variables["NEAR_NETWORK"] = {
      name: "NEAR_NETWORK",
      classification: "REQUIRED_PRODUCTION",
      status: "INVALID_FORMAT",
      isSecret: false,
    };
  } else {
    variables["NEAR_NETWORK"] = {
      name: "NEAR_NETWORK",
      classification: "REQUIRED_PRODUCTION",
      status: "VALID",
      isSecret: false,
    };
  }

  // 5. URLs
  validateUrlVar("NEAR_RPC_URL", "REQUIRED_PRODUCTION", isProd);
  validateUrlVar("OUTLAYER_API_BASE_URL", "REQUIRED_PRODUCTION", isProd);
  validateUrlVar("FASTNEAR_RPC_URL", "OPTIONAL_PRODUCTION", false);
  validateUrlVar("NEXTAUTH_URL", "OPTIONAL_PRODUCTION", false);
  validateUrlVar("OTEL_EXPORTER_OTLP_ENDPOINT", "OPTIONAL_PRODUCTION", false);

  // Calculate totals
  let validCount = 0;
  let missingCount = 0;
  let invalidCount = 0;

  for (const v of Object.values(variables)) {
    if (v.status === "VALID") validCount++;
    else if (v.status === "MISSING") missingCount++;
    else if (v.status === "INSECURE_DEFAULT" || v.status === "INSUFFICIENT_LENGTH" || v.status === "INVALID_FORMAT") {
      invalidCount++;
    }
  }

  return {
    isProduction: isProd,
    valid: criticalErrors.length === 0,
    timestamp: new Date().toISOString(),
    totalVariables: Object.keys(variables).length,
    validCount,
    missingCount,
    invalidCount,
    criticalErrors,
    variables,
  };
}

/**
 * Fail-closed runtime check. Throws ConfigurationError if production environment is invalid.
 */
export function assertProductionEnvironmentValid(customEnv?: Record<string, string | undefined>): void {
  const report = validateEnvironment(customEnv);
  if (report.isProduction && !report.valid) {
    throw new ConfigurationError(
      `Mandate production startup blocked: ${report.criticalErrors.length} critical configuration error(s):\n- ${report.criticalErrors.join("\n- ")}`,
      report.criticalErrors
    );
  }
}

/**
 * Safely resolves the Execution Signing Secret.
 * Enforces production validation and fail-closed security.
 */
export function getExecutionSigningSecret(): string {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.EXECUTION_SIGNING_SECRET || process.env.OUTLAYER_SIGNING_SECRET;

  if (isProd) {
    if (!secret) {
      throw new ConfigurationError("Production execution signing secret (EXECUTION_SIGNING_SECRET) is missing");
    }
    if (isKnownInsecureSecret(secret)) {
      throw new ConfigurationError("Production execution signing secret cannot use known development default");
    }
    if (secret.length < MINIMUM_SECRET_LENGTH || !hasSufficientEntropy(secret)) {
      throw new ConfigurationError(`Production execution signing secret must have at least ${MINIMUM_SECRET_LENGTH} characters`);
    }
    return secret;
  }

  // Development / test fallback with explicit isolation
  return secret || "mandate-execution-signing-secret-v1-production-boundary";
}

/**
 * Safely resolves Credential Vault keys by version.
 * Enforces production validation and preserves backwards-compatible read in dev/test.
 */
export function getCredentialVaultMasterKey(version: number = 1): string {
  const isProd = process.env.NODE_ENV === "production";

  const keyMap: Record<number, string | undefined> = {
    1: process.env.CREDENTIAL_VAULT_KEY_V1 || process.env.ENCRYPTION_SECRET,
    2: process.env.CREDENTIAL_VAULT_KEY_V2,
    3: process.env.CREDENTIAL_VAULT_KEY_V3,
  };

  const secret = keyMap[version];

  if (isProd) {
    if (!secret) {
      throw new ConfigurationError(`Production credential vault key V${version} (CREDENTIAL_VAULT_KEY_V${version}) is missing`);
    }
    if (isKnownInsecureSecret(secret)) {
      throw new ConfigurationError(`Production credential vault key V${version} cannot use known development default`);
    }
    if (secret.length < MINIMUM_SECRET_LENGTH || !hasSufficientEntropy(secret)) {
      throw new ConfigurationError(`Production credential vault key V${version} must have at least ${MINIMUM_SECRET_LENGTH} characters`);
    }
    return secret;
  }

  // Development / test fallback
  if (secret) return secret;
  const devDefaults: Record<number, string> = {
    1: "mandate-credential-vault-master-key-v1-secret-32bytes",
    2: "mandate-credential-vault-master-key-v2-secret-32bytes",
    3: "mandate-credential-vault-master-key-v3-secret-32bytes",
  };
  return devDefaults[version] || devDefaults[1];
}

/**
 * Safely resolves the Tool Encryption Key.
 */
export function getToolEncryptionKey(): string {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.TOOL_ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET;

  if (isProd) {
    if (!secret) {
      throw new ConfigurationError("Production tool encryption key (TOOL_ENCRYPTION_KEY) is missing");
    }
    if (isKnownInsecureSecret(secret)) {
      throw new ConfigurationError("Production tool encryption key cannot use known development default");
    }
    if (secret.length < MINIMUM_SECRET_LENGTH || !hasSufficientEntropy(secret)) {
      throw new ConfigurationError(`Production tool encryption key must have at least ${MINIMUM_SECRET_LENGTH} characters`);
    }
    return secret;
  }

  return secret || "mandate-universal-tools-master-encryption-key-v1";
}

/**
 * Safely resolves the Session Secret for signing authentication tokens.
 * Supports explicit SESSION_SECRET or cryptographically derives one from EXECUTION_SIGNING_SECRET.
 */
export function getSessionSecret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) {
    if (isKnownInsecureSecret(explicit)) {
      throw new ConfigurationError("Production session secret cannot use known development default");
    }
    if (explicit.length < MINIMUM_SECRET_LENGTH || !hasSufficientEntropy(explicit)) {
      throw new ConfigurationError(`Production session secret must have at least ${MINIMUM_SECRET_LENGTH} characters`);
    }
    return explicit;
  }

  // Derive domain-separated session key from verified execution signing secret
  const baseKey = getExecutionSigningSecret();
  return crypto.createHmac("sha256", baseKey).update("mandate-auth-session-domain-separation-v1").digest("hex");
}
