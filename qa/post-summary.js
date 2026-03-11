/**
 * Post QA Agent Phase 1 completion summary to #general
 */

const MISSION_CONTROL_URL = process.env.MC_URL || 'http://localhost:3000';
const QA_API_KEY = 'mc_agent_qa_a524ea6f5e2e11305a96937f67f22c53';

const message = `🧪 **QA Agent Phase 1 Complete!**

**Agent Created:**
- Username: qa
- Display: QA 🧪
- API Key: \`mc_agent_qa_a524ea6f5e2e11305a96937f67f22c53\`

**Smoke Tests Created:**
- \`mission-control/qa/smoke-tests.js\`
- \`mission-control/qa/run-tests.js\`

**Test Results:** ✅ 4/4 passed
- Login page accessible
- Agent feed endpoint (GET /api/agents/feed)
- Agent tasks endpoint (GET /api/agents/tasks)
- Agent messages endpoint (POST /api/agents/messages)

**Usage:**
\`\`\`bash
cd mission-control/qa
node smoke-tests.js  # JSON output
node run-tests.js    # Run and post to #ops
\`\`\`

Ready for Phase 2: Core functionality tests!`;

fetch(`${MISSION_CONTROL_URL}/api/agents/messages`, {
  method: 'POST',
  headers: {
    'X-API-Key': QA_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    channelId: 'channel-general',
    content: message
  })
})
  .then(r => r.json())
  .then(d => console.log('Posted to #general:', d.id))
  .catch(e => console.error('Error:', e));
