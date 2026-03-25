-- Add memory settings fields to AgentConfig table
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "memoryEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "memoryCategories" TEXT;
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "memoryDecayRate" DOUBLE PRECISION DEFAULT 0.1;
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "memoryMinImportance" DOUBLE PRECISION DEFAULT 0.3;
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "memoryInjectionCount" INTEGER DEFAULT 5;
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "memoryRetentionDays" INTEGER DEFAULT 90;
