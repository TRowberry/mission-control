/**
 * Memory API Tests
 * Tests for Agent Extended Memory Phase 2 endpoints
 */

const http = require('http');

const MISSION_CONTROL_URL = process.env.MC_URL || 'http://10.0.0.206:3000';
const AGENT_API_KEY = process.env.MC_API_KEY || 'mc_agent_b90e00ceacd7c243f3e32d94a872896c';

// Parse URL
const urlParts = new URL(MISSION_CONTROL_URL);

function httpRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port || 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
      },
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(responseBody);
          resolve({ status: res.statusCode, data: json, ok: res.statusCode >= 200 && res.statusCode < 300 });
        } catch {
          resolve({ status: res.statusCode, data: responseBody, ok: res.statusCode >= 200 && res.statusCode < 300 });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function apiCall(method, path, body = null) {
  const start = Date.now();
  const result = await httpRequest(method, path, body, { 'X-API-Key': AGENT_API_KEY });
  const duration = Date.now() - start;
  return { ...result, duration };
}

async function runMemoryTests() {
  const results = {
    tests: [],
    summary: { total: 0, passed: 0, failed: 0 }
  };

  // Helper to add test result
  function addResult(name, passed, duration, error = null) {
    results.tests.push({ name, passed, duration, error });
    results.summary.total++;
    if (passed) results.summary.passed++;
    else results.summary.failed++;
  }

  console.log('\n📦 Memory API Tests\n');

  // Test 1: Store memory without auth should fail
  try {
    const { status } = await httpRequest('POST', '/api/memory/store', { content: 'Test memory' }, {});
    const passed = status === 401;
    addResult('POST /memory/store - rejects without auth', passed, 0);
    console.log(passed ? '  ✓ Rejects without auth' : `  ✗ Should reject without auth (got ${status})`);
  } catch (err) {
    addResult('POST /memory/store - rejects without auth', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 2: Store memory with empty content should fail
  try {
    const { status, duration } = await apiCall('POST', '/api/memory/store', { content: '' });
    const passed = status === 400;
    addResult('POST /memory/store - rejects empty content', passed, duration);
    console.log(passed ? '  ✓ Rejects empty content' : '  ✗ Should reject empty content');
  } catch (err) {
    addResult('POST /memory/store - rejects empty content', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 3: Store simple memory
  let storedMemoryId = null;
  try {
    const { status, data, duration } = await apiCall('POST', '/api/memory/store', {
      content: 'Test memory from QA suite - ' + new Date().toISOString(),
      category: 'episodic',
      tier: 'working',
      importance: 0.7,
    });
    const passed = status === 200 && data.success && data.memory?.id;
    storedMemoryId = data.memory?.id;
    addResult('POST /memory/store - creates memory', passed, duration);
    console.log(passed ? `  ✓ Created memory ${storedMemoryId}` : '  ✗ Failed to create memory');
  } catch (err) {
    addResult('POST /memory/store - creates memory', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 4: Store memory with entities
  try {
    const { status, data, duration } = await apiCall('POST', '/api/memory/store', {
      content: 'Met with Tim about Mission Control project',
      category: 'episodic',
      entities: [
        { name: 'Tim', type: 'person' },
        { name: 'Mission Control', type: 'project' },
      ],
    });
    const passed = status === 200 && data.success && data.memory?.entities?.length === 2;
    addResult('POST /memory/store - links entities', passed, duration);
    console.log(passed ? '  ✓ Links entities correctly' : '  ✗ Failed to link entities');
  } catch (err) {
    addResult('POST /memory/store - links entities', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 5: Store memory with invalid category
  try {
    const { status, duration } = await apiCall('POST', '/api/memory/store', {
      content: 'Test with invalid category',
      category: 'invalid_category',
    });
    const passed = status === 400;
    addResult('POST /memory/store - validates category', passed, duration);
    console.log(passed ? '  ✓ Validates category' : '  ✗ Should validate category');
  } catch (err) {
    addResult('POST /memory/store - validates category', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 6: Store memory with invalid importance
  try {
    const { status, duration } = await apiCall('POST', '/api/memory/store', {
      content: 'Test with invalid importance',
      importance: 2.5, // Should be 0-1
    });
    const passed = status === 400;
    addResult('POST /memory/store - validates importance', passed, duration);
    console.log(passed ? '  ✓ Validates importance' : '  ✗ Should validate importance');
  } catch (err) {
    addResult('POST /memory/store - validates importance', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 7: Store pinned memory
  try {
    const { status, data, duration } = await apiCall('POST', '/api/memory/store', {
      content: 'Important pinned memory',
      isPinned: true,
      tier: 'core',
    });
    const passed = status === 200 && data.success && data.memory?.isPinned === true;
    addResult('POST /memory/store - supports isPinned', passed, duration);
    console.log(passed ? '  ✓ Supports isPinned flag' : '  ✗ Failed isPinned');
  } catch (err) {
    addResult('POST /memory/store - supports isPinned', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  console.log('\n🔍 Recall API Tests\n');

  // Test 8: Recall without auth should fail
  try {
    const { status } = await httpRequest('GET', '/api/memory/recall?query=test', null, {});
    const passed = status === 401;
    addResult('GET /memory/recall - rejects without auth', passed, 0);
    console.log(passed ? '  ✓ Rejects without auth' : `  ✗ Should reject without auth (got ${status})`);
  } catch (err) {
    addResult('GET /memory/recall - rejects without auth', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 9: Recall without query should fail
  try {
    const { status, duration } = await apiCall('GET', '/api/memory/recall');
    const passed = status === 400;
    addResult('GET /memory/recall - requires query or embedding', passed, duration);
    console.log(passed ? '  ✓ Requires query or embedding' : `  ✗ Should require query (got ${status})`);
  } catch (err) {
    addResult('GET /memory/recall - requires query or embedding', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 10: Recall with text query (uses text search fallback)
  try {
    const { status, data, duration } = await apiCall('GET', '/api/memory/recall?query=QA%20suite');
    const passed = status === 200 && data.success && data.searchType === 'text';
    addResult('GET /memory/recall - text search works', passed, duration);
    console.log(passed ? `  ✓ Text search returned ${data.memories?.length || 0} results` : '  ✗ Text search failed');
  } catch (err) {
    addResult('GET /memory/recall - text search works', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 11: Recall with category filter
  try {
    const { status, data, duration } = await apiCall('GET', '/api/memory/recall?query=test&category=episodic');
    const passed = status === 200 && data.success;
    const allEpisodic = (data.memories || []).every(m => m.category === 'episodic');
    addResult('GET /memory/recall - category filter works', passed && allEpisodic, duration);
    console.log(passed && allEpisodic ? '  ✓ Category filter works' : '  ✗ Category filter failed');
  } catch (err) {
    addResult('GET /memory/recall - category filter works', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 12: Recall with limit
  try {
    const { status, data, duration } = await apiCall('GET', '/api/memory/recall?query=test&limit=2');
    const passed = status === 200 && data.success && (data.memories?.length || 0) <= 2;
    addResult('GET /memory/recall - respects limit', passed, duration);
    console.log(passed ? '  ✓ Respects limit parameter' : '  ✗ Limit not respected');
  } catch (err) {
    addResult('GET /memory/recall - respects limit', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  console.log('\n📝 PATCH/DELETE API Tests\n');

  // Create a test memory for update/delete tests
  let testMemoryId = null;
  try {
    const { data } = await apiCall('POST', '/api/memory/store', {
      content: 'Memory for PATCH/DELETE tests - ' + Date.now(),
      tier: 'working',
      importance: 0.5,
    });
    testMemoryId = data.memory?.id;
  } catch (err) {
    console.log('  ✗ Setup failed:', err.message);
  }

  // Test 13: GET specific memory
  if (testMemoryId) {
    try {
      const { status, data, duration } = await apiCall('GET', `/api/memory/${testMemoryId}`);
      const passed = status === 200 && data.success && data.memory?.id === testMemoryId;
      addResult('GET /memory/:id - retrieves memory', passed, duration);
      console.log(passed ? '  ✓ Gets specific memory' : '  ✗ Failed to get memory');
    } catch (err) {
      addResult('GET /memory/:id - retrieves memory', false, 0, err.message);
      console.log('  ✗ Error:', err.message);
    }
  }

  // Test 14: PATCH memory
  if (testMemoryId) {
    try {
      const { status, data, duration } = await apiCall('PATCH', `/api/memory/${testMemoryId}`, {
        tier: 'long',
        importance: 0.9,
        isPinned: true,
      });
      const passed = status === 200 && data.success && 
        data.memory?.tier === 'long' && 
        data.memory?.importance === 0.9 &&
        data.memory?.isPinned === true;
      addResult('PATCH /memory/:id - updates fields', passed, duration);
      console.log(passed ? '  ✓ Updates memory fields' : '  ✗ Failed to update');
    } catch (err) {
      addResult('PATCH /memory/:id - updates fields', false, 0, err.message);
      console.log('  ✗ Error:', err.message);
    }
  }

  // Test 15: PATCH validates importance
  if (testMemoryId) {
    try {
      const { status, duration } = await apiCall('PATCH', `/api/memory/${testMemoryId}`, {
        importance: 5.0, // Invalid
      });
      const passed = status === 400;
      addResult('PATCH /memory/:id - validates importance', passed, duration);
      console.log(passed ? '  ✓ Validates importance range' : '  ✗ Should validate importance');
    } catch (err) {
      addResult('PATCH /memory/:id - validates importance', false, 0, err.message);
      console.log('  ✗ Error:', err.message);
    }
  }

  // Test 16: GET memory 404 for non-existent
  try {
    const { status, duration } = await apiCall('GET', '/api/memory/nonexistent-id-12345');
    const passed = status === 404;
    addResult('GET /memory/:id - returns 404 for missing', passed, duration);
    console.log(passed ? '  ✓ Returns 404 for missing memory' : `  ✗ Should return 404 (got ${status})`);
  } catch (err) {
    addResult('GET /memory/:id - returns 404 for missing', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 17: DELETE memory
  if (testMemoryId) {
    try {
      const { status, data, duration } = await apiCall('DELETE', `/api/memory/${testMemoryId}`);
      const passed = status === 200 && data.success && data.deleted === testMemoryId;
      addResult('DELETE /memory/:id - deletes memory', passed, duration);
      console.log(passed ? '  ✓ Deletes memory' : '  ✗ Failed to delete');
    } catch (err) {
      addResult('DELETE /memory/:id - deletes memory', false, 0, err.message);
      console.log('  ✗ Error:', err.message);
    }
  }

  console.log('\n📂 Browse API Tests\n');

  // Test 18: Browse memories
  try {
    const { status, data, duration } = await apiCall('GET', '/api/memory/browse');
    const passed = status === 200 && data.success && 
      data.pagination && 
      typeof data.pagination.total === 'number' &&
      data.stats;
    addResult('GET /memory/browse - lists memories', passed, duration);
    console.log(passed ? `  ✓ Browse returned ${data.memories?.length || 0} memories` : '  ✗ Browse failed');
  } catch (err) {
    addResult('GET /memory/browse - lists memories', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 19: Browse with pagination
  try {
    const { status, data, duration } = await apiCall('GET', '/api/memory/browse?page=1&limit=5');
    const passed = status === 200 && data.success && 
      data.pagination?.limit === 5 &&
      (data.memories?.length || 0) <= 5;
    addResult('GET /memory/browse - pagination works', passed, duration);
    console.log(passed ? '  ✓ Pagination works' : '  ✗ Pagination failed');
  } catch (err) {
    addResult('GET /memory/browse - pagination works', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 20: Browse with filters
  try {
    const { status, data, duration } = await apiCall('GET', '/api/memory/browse?tier=working&sortBy=importance&sortOrder=desc');
    const passed = status === 200 && data.success;
    const allWorking = (data.memories || []).every(m => m.tier === 'working');
    addResult('GET /memory/browse - filters work', passed && allWorking, duration);
    console.log(passed && allWorking ? '  ✓ Filters work' : '  ✗ Filters failed');
  } catch (err) {
    addResult('GET /memory/browse - filters work', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  console.log('\n🔢 Embed API Tests\n');

  // Test 21: Embed without auth should fail
  try {
    const { status } = await httpRequest('POST', '/api/memory/embed', { text: 'test' }, {});
    const passed = status === 401;
    addResult('POST /memory/embed - rejects without auth', passed, 0);
    console.log(passed ? '  ✓ Rejects without auth' : `  ✗ Should reject (got ${status})`);
  } catch (err) {
    addResult('POST /memory/embed - rejects without auth', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 22: Embed without text should fail
  try {
    const { status, duration } = await apiCall('POST', '/api/memory/embed', {});
    const passed = status === 400;
    addResult('POST /memory/embed - requires text', passed, duration);
    console.log(passed ? '  ✓ Requires text parameter' : '  ✗ Should require text');
  } catch (err) {
    addResult('POST /memory/embed - requires text', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 23: Embed info endpoint
  try {
    const { status, data, duration } = await apiCall('GET', '/api/memory/embed');
    const passed = status === 200 && data.success && data.provider === 'ollama';
    addResult('GET /memory/embed - returns info', passed, duration);
    console.log(passed ? `  ✓ Embed info (status: ${data.status})` : '  ✗ Embed info failed');
  } catch (err) {
    addResult('GET /memory/embed - returns info', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  // Test 24: Embed text (may fail if Ollama unavailable)
  try {
    const { status, data, duration } = await apiCall('POST', '/api/memory/embed', { text: 'Hello world' });
    // Accept 200 (success) or 503 (Ollama unavailable)
    const passed = status === 200 || status === 503;
    if (status === 200) {
      const hasDims = data.embeddings?.[0]?.length === 768;
      addResult('POST /memory/embed - generates embedding', hasDims, duration);
      console.log(hasDims ? `  ✓ Generated ${data.dimensions}-dim embedding` : '  ✗ Wrong dimensions');
    } else {
      addResult('POST /memory/embed - generates embedding', true, duration); // Skip if unavailable
      console.log(`  ⚠️ Ollama unavailable (expected when GPU server down)`);
    }
  } catch (err) {
    addResult('POST /memory/embed - generates embedding', false, 0, err.message);
    console.log('  ✗ Error:', err.message);
  }

  console.log(`\n📊 Results: ${results.summary.passed}/${results.summary.total} passed\n`);

  return results;
}

// Export for test runner
module.exports = { runMemoryTests };

// Run if executed directly
if (require.main === module) {
  runMemoryTests().then(results => {
    process.exit(results.summary.failed > 0 ? 1 : 0);
  });
}
