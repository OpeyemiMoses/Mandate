-- CreateTable IntentOperation
CREATE TABLE IF NOT EXISTS "IntentOperation" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "objectiveId" TEXT,
    "executionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'tidepool',
    "network" TEXT NOT NULL DEFAULT 'testnet',
    "depositMode" TEXT NOT NULL DEFAULT 'ORIGIN_CHAIN',
    "sourceAsset" TEXT NOT NULL,
    "sourceAmount" TEXT NOT NULL,
    "destinationAsset" TEXT NOT NULL,
    "expectedDestinationAmount" TEXT NOT NULL,
    "minDestinationAmount" TEXT NOT NULL,
    "slippageTolerance" INTEGER NOT NULL DEFAULT 100,
    "finalBeneficiary" TEXT NOT NULL,
    "refundRecipient" TEXT NOT NULL,
    "providerQuoteId" TEXT,
    "providerSignature" TEXT,
    "depositAddress" TEXT,
    "depositMemo" TEXT,
    "quoteExpiresAt" TIMESTAMP(3),
    "wrapTxHash" TEXT,
    "wrapStatus" TEXT,
    "depositTxHash" TEXT,
    "depositStatus" TEXT,
    "destinationTxHash" TEXT,
    "refundTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "recoveryStatus" TEXT,
    "reservedAmountYocto" TEXT NOT NULL DEFAULT '0',
    "errorMessage" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IntentOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntentOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IntentOperation_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IntentOperation_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IntentOperation_idempotencyKey_key" ON "IntentOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntentOperation_userId_status_idx" ON "IntentOperation"("userId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntentOperation_mandateId_idx" ON "IntentOperation"("mandateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntentOperation_depositAddress_idx" ON "IntentOperation"("depositAddress");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntentOperation_idempotencyKey_idx" ON "IntentOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntentOperation_providerQuoteId_idx" ON "IntentOperation"("providerQuoteId");

