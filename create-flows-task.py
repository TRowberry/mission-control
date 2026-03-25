#!/usr/bin/env python3
import json
import urllib.request

api_key = "mc_agent_b90e00ceacd7c243f3e32d94a872896c"
base_url = "http://10.0.0.206:3000"

# Create a task for the Flows API work
task_payload = json.dumps({
    "title": "Flows API Backend - Rebuild",
    "description": "Rebuild the Flows system that was lost during git migration (March 20th work).",
    "priority": "high",
    "projectId": "project-mc",
    "columnId": "col-done",
    "subtasks": [
        {"title": "Research March 20th implementation (128 messages)", "completed": True},
        {"title": "Add Prisma models (AgentFlow, AgentFlowRun, ActionType)", "completed": True},
        {"title": "Create API routes (GET/POST/PATCH/DELETE)", "completed": True},
        {"title": "Build flow executor engine", "completed": True},
        {"title": "Create 8 action handlers (trigger, fetch, transform, etc)", "completed": True},
        {"title": "Test API (create flow, list flows)", "completed": True},
        {"title": "Commit and push to GitHub", "completed": True},
        {"title": "Verify FlowsTab.tsx works in UI", "completed": False},
        {"title": "Add scheduler integration (checkScheduledFlows)", "completed": False}
    ]
}).encode('utf-8')

headers = {
    "X-API-Key": api_key,
    "Content-Type": "application/json"
}

# Note: Agent tasks API might need different endpoint
url = f"{base_url}/api/kanban/tasks"

req = urllib.request.Request(url, data=task_payload, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        result = response.read().decode('utf-8')
        print(f"Success! Response: {result}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Error: {e}")
