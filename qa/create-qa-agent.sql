-- Delete existing QA agent if exists (by username since id might differ)
DELETE FROM "User" WHERE username = 'qa';

-- Create QA Agent user for Mission Control
INSERT INTO "User" (id, email, username, "displayName", password, avatar, status, "lastSeen", "createdAt", "updatedAt", "isAgent", "apiKey", "webhookUrl")
VALUES (
  'qa-agent-001',
  'qa@missioncontrol.local',
  'qa',
  'QA 🧪',
  '$2b$10$placeholder',
  NULL,
  'online',
  NOW(),
  NOW(),
  NOW(),
  true,
  'mc_agent_qa_a524ea6f5e2e11305a96937f67f22c53',
  NULL
)
RETURNING id, username, "displayName", "apiKey";
