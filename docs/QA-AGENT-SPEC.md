# QA Agent Specification

## Overview
A visual QA testing agent that verifies Mission Control UI implementations after deploys using browser automation.

## Goals
1. Catch UI/UX regressions before they reach users
2. Verify new features are visually working
3. Provide screenshot evidence of test results
4. Report issues to #ops channel automatically

## Architecture

### Agent Identity
- **Name:** QA 🧪
- **Username:** qa
- **Role:** Automated visual testing after deploys
- **Wake Triggers:** Deploy notifications, manual @qa requests

### Technology Stack
- **Browser:** Playwright (browser automation)
- **Hosting:** Any server with Node.js
- **LLM:** Optional local Ollama for test interpretation
- **Reporting:** Mission Control API

## Test Suites

### 1. Smoke Tests (Run after every deploy)
Quick sanity checks (~30 seconds):
- [ ] Login page loads
- [ ] Can authenticate
- [ ] Sidebar renders with channels
- [ ] Kanban board loads
- [ ] Chat panel renders

### 2. Core Functionality Tests
Deeper checks (~2-3 minutes):
- [ ] Create a message in #general
- [ ] Message appears in feed
- [ ] Create a task in kanban
- [ ] Move task between columns
- [ ] Assign task to agent
- [ ] Task notification fires

### 3. Agent API Tests
Verify agent integrations:
- [ ] GET /api/agents/feed returns data
- [ ] POST /api/agents/messages works
- [ ] GET /api/agents/tasks returns assigned tasks
- [ ] PATCH /api/agents/tasks updates task
- [ ] GET /api/agents/columns returns columns

### 4. Visual Regression Tests
Compare screenshots against baseline:
- [ ] Login page matches baseline
- [ ] Kanban board layout correct
- [ ] Chat panel styling correct
- [ ] Mobile viewport renders properly

## Test Flow

```
Deploy Detected
      │
      ▼
┌─────────────────┐
│  Smoke Tests    │ ← Fast, blocks if fails
└────────┬────────┘
         │ Pass
         ▼
┌─────────────────┐
│  Core Tests     │ ← Detailed functionality
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Tests      │ ← Agent integrations
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Report Results │ → #ops channel
└─────────────────┘
```

## Reporting Format

### Success Report
```
✅ **QA Report** - Deploy abc123
All 15 tests passed in 47s

**Smoke:** 5/5 ✓
**Core:** 6/6 ✓  
**API:** 4/4 ✓

No issues detected.
```

### Failure Report
```
🚨 **QA Report** - Deploy abc123
3 tests failed!

**Smoke:** 5/5 ✓
**Core:** 4/6 ⚠️
**API:** 4/4 ✓

**Failures:**
1. ❌ Task column move - "In Progress" column not found
2. ❌ Task assignment - Notification not received within 10s

**Screenshots attached**
```

## Implementation Status

### Phase 1: Basic Smoke Tests ✅ COMPLETE
- ✅ Create QA agent user in Mission Control
- ✅ Set up API smoke test script (`qa/smoke-tests.js`)
- ✅ Implement basic endpoint checks
- ✅ Report to #ops (`qa/run-tests.js`)

### Phase 2: Browser Visual Tests ✅ COMPLETE
- ✅ Playwright-based browser automation (`qa/browser-tests.js`)
- ✅ Login page verification
- ✅ Sidebar/channel list verification
- ✅ Kanban board column verification
- ✅ Chat panel/message input verification
- ✅ Screenshot on failure support
- ✅ Combined test runner (`qa/run-all-tests.js`)

### Phase 3: Visual Regression ✅ COMPLETE
- ✅ Capture baseline screenshots (`npm run baseline`)
- ✅ Implement diff comparison (pixel-by-pixel)
- ✅ Alert on significant visual changes (5% threshold)

### Phase 4: CI Integration
- [ ] Hook into deploy pipeline
- [ ] Block bad deploys (optional)
- [ ] Dashboard for test history

## Configuration

```json
{
  "qaAgent": {
    "enabled": true,
    "triggerOn": ["deploy", "mention"],
    "missionControlUrl": "http://localhost:3000",
    "testTimeout": 30000,
    "screenshotOnFailure": true,
    "reportChannel": "channel-ops",
    "suites": {
      "smoke": { "enabled": true, "blocking": true },
      "core": { "enabled": true, "blocking": false },
      "api": { "enabled": true, "blocking": false },
      "visual": { "enabled": false, "blocking": false }
    }
  }
}
```

## Setup

1. Create QA agent user in Mission Control DB
2. Install dependencies: `cd qa && npm install`
3. Set environment:
   ```bash
   export MISSION_CONTROL_URL=http://your-server:3000
   export MC_API_KEY=your_qa_agent_key
   ```
4. Run tests: `npm run test:all`

## QA Test Files
- `qa/smoke-tests.js` - API endpoint tests
- `qa/browser-tests.js` - Playwright browser tests
- `qa/visual-regression.js` - Screenshot comparison
- `qa/run-all-tests.js` - Combined runner with reporting
- `qa/package.json` - Dependencies and scripts
- `qa/screenshots/` - Failure screenshots directory
- `qa/baselines/` - Baseline screenshots for comparison
