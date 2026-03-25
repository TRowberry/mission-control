-- Add missing columns to AgentMemory table
ALTER TABLE "AgentMemory" ADD COLUMN IF NOT EXISTS "summary" TEXT;

-- Add missing columns to AgentMemoryEntity table
ALTER TABLE "AgentMemoryEntity" ADD COLUMN IF NOT EXISTS "role" TEXT;
