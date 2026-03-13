#!/bin/sh
# Usage: rico-move-task.sh <task-id> <column-id>
# Helper script for Rico to move tasks between kanban columns via API
TASK_ID="$1"
COLUMN_ID="$2"
API_KEY="${RICO_API_KEY:-mc_agent_b90e00ceacd7c243f3e32d94a872896c}"
API_URL="${MC_API_URL:-http://10.0.0.206:3000}"

if [ -z "$TASK_ID" ] || [ -z "$COLUMN_ID" ]; then
  echo "Usage: rico-move-task.sh <task-id> <column-id>"
  exit 1
fi

curl -s -X PATCH \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{\"id\": \"$TASK_ID\", \"columnId\": \"$COLUMN_ID\"}" \
  "$API_URL/api/kanban/tasks"
