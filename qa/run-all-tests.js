/**
 * Mission Control QA - Full Test Runner
 * Runs API smoke tests + browser visual tests and reports results
 */

const { runSmokeTests, MISSION_CONTROL_URL, QA_API_KEY } = require('./smoke-tests');
const { runBrowserTests } = require('./browser-tests');
const { compareScreenshots, generateReport: generateVisualReport } = require('./visual-regression');

const REPORT_CHANNEL = process.env.REPORT_CHANNEL || 'channel-ops';
const RUN_VISUAL = process.env.RUN_VISUAL !== 'false'; // Enable visual tests by default

async function runAllTests() {
  console.log('🧪 Mission Control QA - Full Test Suite\n');
  console.log(`Target: ${MISSION_CONTROL_URL}`);
  console.log(`Report Channel: ${REPORT_CHANNEL}`);
  console.log('━'.repeat(50) + '\n');

  const allResults = {
    timestamp: new Date().toISOString(),
    baseUrl: MISSION_CONTROL_URL,
    suites: {},
    summary: { total: 0, passed: 0, failed: 0, suites: 0 }
  };

  // Run API Smoke Tests
  console.log('📡 Running API Smoke Tests...');
  try {
    const apiResults = await runSmokeTests();
    allResults.suites.api = apiResults;
    allResults.summary.total += apiResults.summary.total;
    allResults.summary.passed += apiResults.summary.passed;
    allResults.summary.failed += apiResults.summary.failed;
    allResults.summary.suites++;
    console.log(`   ✓ API: ${apiResults.summary.passed}/${apiResults.summary.total} passed\n`);
  } catch (err) {
    console.error(`   ✗ API tests failed: ${err.message}\n`);
    allResults.suites.api = { error: err.message, summary: { total: 0, passed: 0, failed: 1 } };
    allResults.summary.failed++;
  }

  // Run Browser Visual Tests
  console.log('🌐 Running Browser Visual Tests...');
  try {
    const browserResults = await runBrowserTests();
    allResults.suites.browser = browserResults;
    allResults.summary.total += browserResults.summary.total;
    allResults.summary.passed += browserResults.summary.passed;
    allResults.summary.failed += browserResults.summary.failed;
    allResults.summary.suites++;
    console.log(`   ✓ Browser: ${browserResults.summary.passed}/${browserResults.summary.total} passed\n`);
  } catch (err) {
    console.error(`   ✗ Browser tests failed: ${err.message}\n`);
    allResults.suites.browser = { error: err.message, summary: { total: 0, passed: 0, failed: 1 } };
    allResults.summary.failed++;
  }

  // Run Visual Regression Tests (Phase 3)
  if (RUN_VISUAL) {
    console.log('🎨 Running Visual Regression Tests...');
    try {
      const visualResults = await compareScreenshots();
      const matches = visualResults.filter(r => r.status === 'match').length;
      const mismatches = visualResults.filter(r => r.status === 'mismatch').length;
      const errors = visualResults.filter(r => r.status === 'error').length;
      const noBaseline = visualResults.filter(r => r.status === 'no-baseline').length;
      
      allResults.suites.visual = {
        results: visualResults,
        summary: {
          total: visualResults.length,
          passed: matches,
          failed: mismatches + errors,
          noBaseline
        }
      };
      allResults.summary.total += visualResults.length - noBaseline;
      allResults.summary.passed += matches;
      allResults.summary.failed += mismatches + errors;
      allResults.summary.suites++;
      
      console.log(`   ✓ Visual: ${matches}/${visualResults.length - noBaseline} passed (${noBaseline} no baseline)\n`);
    } catch (err) {
      console.error(`   ✗ Visual tests failed: ${err.message}\n`);
      allResults.suites.visual = { error: err.message, summary: { total: 0, passed: 0, failed: 1 } };
      allResults.summary.failed++;
    }
  }

  return allResults;
}

function formatResults(results) {
  const { summary, suites } = results;
  const allPassed = summary.failed === 0;
  
  const icon = allPassed ? '✅' : '🚨';
  const title = allPassed ? 'QA Tests Passed' : 'QA Tests Failed';
  
  let message = `${icon} **${title}**\n`;
  message += `${summary.passed}/${summary.total} tests passed across ${summary.suites} suites\n\n`;
  
  // API Suite
  if (suites.api) {
    const api = suites.api;
    if (api.error) {
      message += `**API Tests:** ❌ Error - ${api.error}\n`;
    } else {
      const apiIcon = api.summary.failed === 0 ? '✓' : '⚠️';
      message += `**API Tests:** ${apiIcon} ${api.summary.passed}/${api.summary.total}\n`;
      for (const test of api.tests || []) {
        const status = test.passed ? '  ✓' : '  ❌';
        message += `${status} ${test.name} (${test.duration}ms)\n`;
        if (!test.passed && test.error) {
          message += `     → ${test.error}\n`;
        }
      }
    }
    message += '\n';
  }
  
  // Browser Suite
  if (suites.browser) {
    const browser = suites.browser;
    if (browser.error) {
      message += `**Browser Tests:** ❌ Error - ${browser.error}\n`;
    } else {
      const browserIcon = browser.summary.failed === 0 ? '✓' : '⚠️';
      message += `**Browser Tests:** ${browserIcon} ${browser.summary.passed}/${browser.summary.total}\n`;
      for (const test of browser.tests || []) {
        const status = test.passed ? '  ✓' : '  ❌';
        message += `${status} ${test.name} (${test.duration}ms)\n`;
        if (!test.passed && test.error) {
          message += `     → ${test.error}\n`;
        }
        if (test.screenshot) {
          message += `     📸 Screenshot saved\n`;
        }
      }
    }
    message += '\n';
  }

  // Visual Regression Suite
  if (suites.visual) {
    const visual = suites.visual;
    if (visual.error) {
      message += `**Visual Regression:** ❌ Error - ${visual.error}\n`;
    } else {
      const visualIcon = visual.summary.failed === 0 ? '✓' : '⚠️';
      message += `**Visual Regression:** ${visualIcon} ${visual.summary.passed}/${visual.summary.total - visual.summary.noBaseline}`;
      if (visual.summary.noBaseline > 0) {
        message += ` (${visual.summary.noBaseline} no baseline)`;
      }
      message += '\n';
      for (const test of visual.results || []) {
        if (test.status === 'match') {
          message += `  ✓ ${test.name} (${test.diffPercent?.toFixed(1) || 0}% diff)\n`;
        } else if (test.status === 'mismatch') {
          message += `  🚨 ${test.name} (${test.diffPercent?.toFixed(1)}% changed)\n`;
        } else if (test.status === 'error') {
          message += `  ❌ ${test.name}: ${test.error}\n`;
        } else if (test.status === 'no-baseline') {
          message += `  ⚠️ ${test.name}: no baseline\n`;
        }
      }
    }
    message += '\n';
  }
  
  message += `_Tested at ${results.timestamp}_`;
  
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
  try {
    // Run all tests
    const results = await runAllTests();
    
    // Format and display
    const message = formatResults(results);
    console.log('━'.repeat(50));
    console.log('📊 RESULTS');
    console.log('━'.repeat(50));
    console.log(message);
    console.log('━'.repeat(50) + '\n');
    
    // Post to Mission Control
    console.log(`📤 Posting results to ${REPORT_CHANNEL}...`);
    await postToMissionControl(message, REPORT_CHANNEL);
    console.log('✅ Results posted successfully!\n');
    
    // Also output raw JSON for programmatic use
    if (process.env.JSON_OUTPUT) {
      console.log('\n--- JSON Results ---');
      console.log(JSON.stringify(results, null, 2));
    }
    
    // Exit with appropriate code
    process.exit(results.summary.failed > 0 ? 1 : 0);
    
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    
    // Try to report error
    try {
      await postToMissionControl(
        `🚨 **QA Test Suite Failed**\n\nFatal Error: ${err.message}`,
        REPORT_CHANNEL
      );
    } catch (postErr) {
      console.error('Could not post error to Mission Control:', postErr.message);
    }
    
    process.exit(1);
  }
}

// Export for module use
module.exports = { runAllTests, formatResults };

// Run if executed directly
if (require.main === module) {
  main();
}
