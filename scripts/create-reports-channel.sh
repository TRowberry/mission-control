#!/bin/sh
# Create reports channel in Mission Control

SQL='INSERT INTO channels (id, name, slug, description, type, position, "workspaceId", "isPrivate", "agentMode") VALUES ('"'"'channel-reports'"'"', '"'"'reports'"'"', '"'"'reports'"'"', '"'"'Automated agent reports'"'"', '"'"'text'"'"', 4, '"'"'default-workspace'"'"', false, '"'"'auto-reply'"'"') ON CONFLICT (id) DO NOTHING;'

echo "$SQL" | docker exec -i mission-control-db-1 psql -U mission -d mission_control
