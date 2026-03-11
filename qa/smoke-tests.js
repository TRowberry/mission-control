/**
 * Mission Control Smoke Tests
 * Phase 1: Basic API endpoint verification
 */

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:3000';
const QA_API_KEY = process.env.QA_API_KEY || 'mc_agent_qa_a524ea6f5e2e11305a96937f67f22c53';

async function runSmokeTests() {
  const results = {
    timestamp: new Date().toISOString(),
    baseUrl: MISSION_CONTROL_URL,
    tests: [],
    summary: { total: 0, passed: 0, failed: 0 }
  };

  // Test 1: Login page accessible
  await runTest(results, 'Login page accessible', async () => {
    const res = await fetch(`${MISSION_CONTROL_URL}/`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('Mission Control') && !html.includes('html')) {
      throw new Error('Response does not appear to be HTML');
    }
    return { status: res.status, contentLength: html.length };
  });

  // Test 2: Agent feed endpoint
  await runTest(results, 'Agent feed endpoint (GET /api/agents/feed)', async () => {
    const res = await fetch(`${MISSION_CONTROL_URL}/api/agents/feed`, {
      headers: {
        'X-API-Key': QA_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { status: res.status, messageCount: data.messages?.length || 0 };
  });

  // Test 3: Agent tasks endpoint
  await runTest(results, 'Agent tasks endpoint (GET /api/agents/tasks)', async () => {
    const res = await fetch(`${MISSION_CONTROL_URL}/api/agents/tasks`, {
      headers: {
        'X-API-Key': QA_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { status: res.status, taskCount: data.tasks?.length || 0 };
  });

  // Test 4: Agent messages endpoint (POST)
  await runTest(results, 'Agent messages endpoint (POST /api/agents/messages)', async () => {
    const testMessage = `[QA Smoke Test] ${new Date().toISOString()}`;
    const res = await fetch(`${MISSION_CONTROL_URL}/api/agents/messages`, {
      method: 'POST',
      headers: {
        'X-API-Key': QA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channelId: 'channel-general',
        content: testMessage
      })
    });
    if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { status: res.status, messageId: data.message?.id || data.id || 'created' };
  });

  // Calculate summary
  results.summary.total = results.tests.length;
  results.summary.passed = results.tests.filter(t => t.passed).length;
  results.summary.failed = results.tests.filter(t => !t.passed).length;

  return results;
}

async function runTest(results, name, testFn) {
  const test = { name, passed: false, duration: 0, details: null, error: null };
  const start = Date.now();
  
  try {
    test.details = await testFn();
    test.passed = true;
  } catch (err) {
    test.error = err.message;
  }
  
  test.duration = Date.now() - start;
  results.tests.push(test);
}

// Export for use as module
module.exports = { runSmokeTests, MISSION_CONTROL_URL, QA_API_KEY };

// Run if executed directly
if (require.main === module) {
  runSmokeTests()
    .then(results => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.summary.failed > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
