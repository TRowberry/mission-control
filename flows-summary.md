# Flows Implementation Summary (March 20th)

Found 128 messages documenting the full implementation.

## Database Schema:
- AgentFlow (flow definitions with nodes/edges)
- AgentFlowRun (execution history)
- ActionType (registry of action types)

## 8 Action Types:
1. Trigger - Flow start
2. Fetch - HTTP requests
3. Transform - Data transformation
4. Condition - Branching logic
5. Post Message - MC messages
6. LLM - AI calls
7. Script - Custom JS
8. Wait - Delays

## API Endpoints:
- GET/POST /api/agents/:id/flows
- GET/PATCH/DELETE /api/agents/:id/flows/:flowId
- POST /api/agents/:id/flows/:flowId/run
- GET /api/agents/:id/flows/:flowId/runs

## UI Components:
- FlowsTab.tsx - Tab in agent modal
- FlowEditor.tsx - Visual node editor (@xyflow/react)
- ConfigPanel - Right sidebar for node config
- Action palette with drag/drop

## Key Files (from git):
- lib/flows/executor.ts - Flow runtime engine
- lib/flows/actions/*.ts - Action handlers
- app/api/agents/[agentId]/flows/* - API routes
- scheduler.js - checkScheduledFlows()

## Fixed Issues That Day:
- ReactFlow keyboard capture (inputs not working)
- CSS theme variables not resolving
- selectedNode stale state bug
- Emoji encoding in action types
