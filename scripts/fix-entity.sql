ALTER TABLE "AgentEntity" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "AgentEntity" RENAME COLUMN "lastMentioned" TO "lastSeenAt";
