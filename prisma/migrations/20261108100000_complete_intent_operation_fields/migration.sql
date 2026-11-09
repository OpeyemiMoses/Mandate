-- AlterTable IntentOperation to add missing M15.3b.1 persistence and evidence closure fields
ALTER TABLE "IntentOperation" ADD COLUMN IF NOT EXISTS "destinationChain" TEXT NOT NULL DEFAULT 'near';
ALTER TABLE "IntentOperation" ADD COLUMN IF NOT EXISTS "reservationId" TEXT;
ALTER TABLE "IntentOperation" ADD COLUMN IF NOT EXISTS "providerPublicKeyId" TEXT;
ALTER TABLE "IntentOperation" ADD COLUMN IF NOT EXISTS "verifiedQuoteEvidence" TEXT;
ALTER TABLE "IntentOperation" ADD COLUMN IF NOT EXISTS "settlementEvidence" TEXT;
ALTER TABLE "IntentOperation" ADD COLUMN IF NOT EXISTS "refundEvidence" TEXT;
ALTER TABLE "IntentOperation" ADD COLUMN IF NOT EXISTS "recoveryState" TEXT;
ALTER TABLE "IntentOperation" ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3);
ALTER TABLE "IntentOperation" ADD COLUMN IF NOT EXISTS "recoveryAttemptedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntentOperation_reservationId_idx" ON "IntentOperation"("reservationId");
CREATE INDEX IF NOT EXISTS "IntentOperation_destinationChain_idx" ON "IntentOperation"("destinationChain");

