-- Add all team agents to Mission Control

-- Scout
INSERT INTO "User" (id, username, "displayName", email, password, "isAgent", "apiKey", status, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'scout', 'Scout 🔍', 'scout@missioncontrol.local', 'agent-no-password', true, 'mc_agent_f8652d9894e7dd493df15c2e399e5f4f', 'offline', NOW(), NOW())
ON CONFLICT (username) DO UPDATE SET "isAgent" = true, "apiKey" = 'mc_agent_f8652d9894e7dd493df15c2e399e5f4f';

-- Coder
INSERT INTO "User" (id, username, "displayName", email, password, "isAgent", "apiKey", status, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'coder', 'Coder 💻', 'coder@missioncontrol.local', 'agent-no-password', true, 'mc_agent_2c24d34ef9355431529d1765ab9c8473', 'offline', NOW(), NOW())
ON CONFLICT (username) DO UPDATE SET "isAgent" = true, "apiKey" = 'mc_agent_2c24d34ef9355431529d1765ab9c8473';

-- Creator
INSERT INTO "User" (id, username, "displayName", email, password, "isAgent", "apiKey", status, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'creator', 'Creator 🎨', 'creator@missioncontrol.local', 'agent-no-password', true, 'mc_agent_6a58a4c24ad658486edc445d58c28a9d', 'offline', NOW(), NOW())
ON CONFLICT (username) DO UPDATE SET "isAgent" = true, "apiKey" = 'mc_agent_6a58a4c24ad658486edc445d58c28a9d';

-- Monitor
INSERT INTO "User" (id, username, "displayName", email, password, "isAgent", "apiKey", status, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'monitor', 'Monitor 📊', 'monitor@missioncontrol.local', 'agent-no-password', true, 'mc_agent_b91d0f7a717b2ca38a426dbc9269902f', 'offline', NOW(), NOW())
ON CONFLICT (username) DO UPDATE SET "isAgent" = true, "apiKey" = 'mc_agent_b91d0f7a717b2ca38a426dbc9269902f';

-- Show results
SELECT username, "displayName", "apiKey" FROM "User" WHERE "isAgent" = true;
