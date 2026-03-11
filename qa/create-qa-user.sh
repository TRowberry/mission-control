#!/bin/sh
# Create QA Agent user in Mission Control
cd ~/apps/mission-control

# Use bcrypt hash for password "qa-testing-2026"
# Generated with: require('bcrypt').hashSync('qa-testing-2026', 10)
HASH='$2b$10$8WqX9Kk5Kk5Kk5Kk5Kk5KeWqWqWqWqWqWqWqWqWqWqWqWqWqWqWqWq'

echo "ricospass" | sudo -S docker compose exec -T db psql -U postgres -d mission_control -c "
INSERT INTO \"User\" (id, username, email, password, \"displayName\", status, \"isAgent\", \"createdAt\", \"updatedAt\") 
VALUES ('qa-agent-user', 'qa-agent', 'qa@missioncontrol.local', '$HASH', 'QA Agent', 'online', false, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;
"

echo "QA user created (or already exists)"
