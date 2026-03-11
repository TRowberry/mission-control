-- Add Rico agent
INSERT INTO "User" (id, username, "displayName", email, password, "isAgent", "apiKey", status, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'rico',
  'Rico',
  'rico@missioncontrol.local',
  'agent-no-password',
  true,
  'mc_agent_b90e00ceacd7c243f3e32d94a872896c',
  'online',
  NOW(),
  NOW()
)
ON CONFLICT (username) DO UPDATE SET 
  "isAgent" = true, 
  "apiKey" = 'mc_agent_b90e00ceacd7c243f3e32d94a872896c'
RETURNING username, "apiKey";
