/**
 * Mission Control QA Test Runner
 * Runs smoke tests and reports results to Mission Control
 */

const { runSmokeTests, MISSION_CONTROL_URL, QA_API_KEY } = require('./smoke-tests');

const REPORT_CHANNEL = process.env.REPORT_CHANNEL || 'channel-ops';

async function formatResults(results) {
  const { summary, tests } = results;
  const allPassed = summary.failed === 0;
  
  const icon = allPassed ? '✅' : '🚨';
  const title = allPassed ? 'QA Smoke Tests Passed' : 'QA Smoke Tests Failed';
  
  let message = `${icon} **${title}**\n`;
  message += `${summary.passed}/${summary.total} tests passed\n\n`;
  
  // List test results
  for (const test of tests) {
    const status = test.passed ? '✓' : '❌';
    const duration = `${test.duration}ms`;
    message += `${status} ${test.name} (${duration})`;
    if (!test.passed && test.error) {
      message += `\n   → ${test.error}`;
    }
    message += '\n';
  }
  
  message += `\n_Tested at ${results.timestamp}_`;
  
  return message;
}

async function postToMissionControl(message, channelId) {
  const res = await fetch(`${MISSION_CONTROL_URL}/api/agents/messages`, {
    method: 'POST',
    headers: {
      'X-API-Key': QA_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channelId,
      content: message
    })
  });
  
  if (!res.ok) {
    throw new Error(`Failed to post results: ${res.status} ${await res.text()}`);
  }
  
  return res.json();
}

async function main() {
  console.log('🧪 Running Mission Control Smoke Tests...\n');
  console.log(`Target: ${MISSION_CONTROL_URL}`);
  console.log(`Report Channel: ${REPORT_CHANNEL}\n`);
  
  try {
    // Run tests
    const results = await runSmokeTests();
    
    // Format results
    const message = await formatResults(results);
    
    // Print to console
    console.log('--- Results ---');
    console.log(message);
    console.log('---------------\n');
    
    // Post to Mission Control (skip the message test result)
    const reportResults = {
      ...results,
      tests: results.tests.filter(t => !t.name.includes('POST /api/agents/messages'))
    };
    reportResults.summary.total = reportResults.tests.length;
    reportResults.summary.passed = reportResults.tests.filter(t => t.passed).length;
    reportResults.summary.failed = reportResults.tests.filter(t => !t.passed).length;
    
    const reportMessage = await formatResults(reportResults);
    
    console.log(`📤 Posting results to ${REPORT_CHANNEL}...`);
    await postToMissionControl(reportMessage, REPORT_CHANNEL);
    console.log('✅ Results posted successfully!\n');
    
    // Exit with appropriate code
    process.exit(results.summary.failed > 0 ? 1 : 0);
    
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    
    // Try to report error
    try {
      await postToMissionControl(
        `🚨 **QA Test Runner Failed**\n\nError: ${err.message}`,
        REPORT_CHANNEL
      );
    } catch (postErr) {
      console.error('Could not post error to Mission Control:', postErr.message);
    }
    
    process.exit(1);
  }
}

// Run
main();
