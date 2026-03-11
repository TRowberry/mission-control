#!/bin/sh
# Usage: rico-say.sh <channel-id> <message>
# Note: jq not available on NAS, using manual escaping

CHANNEL_ID="${1:-channel-general}"
MESSAGE="$2"
API_KEY="mc_agent_b90e00ceacd7c243f3e32d94a872896c"
API_URL="http://10.0.0.206:3000/api/agents/messages"

if [ -z "$MESSAGE" ]; then
  echo "Usage: rico-say.sh <channel-id> <message>"
  exit 1
fi

# Escape quotes in message for JSON
ESCAPED=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')

curl -s -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"channelId\": \"$CHANNEL_ID\", \"content\": \"$ESCAPED\"}" \
  "$API_URL"
