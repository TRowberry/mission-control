#!/bin/sh
# Usage: rico-patch-subtask.sh <subtask-id> <completed: true|false>
# Helper script for Rico to update subtask completion status via API
SUBTASK_ID="$1"
COMPLETED="$2"
API_KEY="${RICO_API_KEY:-mc_agent_b90e00ceacd7c243f3e32d94a872896c}"
API_URL="${MC_API_URL:-http://10.0.0.206:3000}"

if [ -z "$SUBTASK_ID" ] || [ -z "$COMPLETED" ]; then
  echo "Usage: rico-patch-subtask.sh <subtask-id> <true|false>"
  exit 1
fi

curl -s -X PATCH \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{\"id\": \"$SUBTASK_ID\", \"completed\": $COMPLETED}" \
  "$API_URL/api/kanban/subtasks"
