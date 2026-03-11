/**
 * Mission Control Visual Regression Testing
 * Phase 3: Baseline comparison and diff detection
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:3000';
const TEST_USER = process.env.TEST_USER || 'tim';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123';

const BASELINES_DIR = path.join(__dirname, 'baselines');
const CURRENT_DIR = path.join(__dirname, 'screenshots', 'current');
const DIFF_DIR = path.join(__dirname, 'screenshots', 'diffs');

// Ensure directories exist
[BASELINES_DIR, CURRENT_DIR, DIFF_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Visual test definitions - key pages/states to capture
const VISUAL_TESTS = [
  { name: 'login-page', url: '/', requiresAuth: false },
  { name: 'main-workspace', url: '/', requiresAuth: true },
  { name: 'kanban-board', url: '/projects', requiresAuth: true },
  { name: 'chat-general', url: '/channels/general', requiresAuth: true },
];

/**
 * Capture baseline screenshots for all visual tests
 */
async function captureBaselines() {
  console.log('📸 Capturing baseline screenshots...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  
  const results = [];
  
  for (const test of VISUAL_TESTS) {
    try {
      if (test.requiresAuth) {
        await login(page);
      }
      
      await page.goto(`${MISSION_CONTROL_URL}${test.url}`, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      await page.waitForTimeout(3000); // Allow content to load and animations to settle
      
      const screenshotPath = path.join(BASELINES_DIR, `${test.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      
      console.log(`✅ ${test.name}: Baseline captured`);
      results.push({ name: test.name, success: true, path: screenshotPath });
    } catch (err) {
      console.log(`❌ ${test.name}: ${err.message}`);
      results.push({ name: test.name, success: false, error: err.message });
    }
  }
  
  await browser.close();
  return results;
}

/**
 * Compare current screenshots against baselines
 */
async function compareScreenshots() {
  console.log('🔍 Comparing screenshots against baselines...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  
  const results = [];
  
  for (const test of VISUAL_TESTS) {
    const baselinePath = path.join(BASELINES_DIR, `${test.name}.png`);
    const currentPath = path.join(CURRENT_DIR, `${test.name}.png`);
    const diffPath = path.join(DIFF_DIR, `${test.name}-diff.png`);
    
    // Check if baseline exists
    if (!fs.existsSync(baselinePath)) {
      console.log(`⚠️  ${test.name}: No baseline found, skipping`);
      results.push({ 
        name: test.name, 
        status: 'no-baseline',
        message: 'No baseline screenshot found' 
      });
      continue;
    }
    
    try {
      // Capture current screenshot
      if (test.requiresAuth) {
        await login(page);
      }
      
      await page.goto(`${MISSION_CONTROL_URL}${test.url}`, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      await page.waitForTimeout(3000);
      
      await page.screenshot({ path: currentPath, fullPage: false });
      
      // Compare images
      const comparison = await compareImages(baselinePath, currentPath, diffPath);
      
      if (comparison.match) {
        console.log(`✅ ${test.name}: Match (${comparison.diffPercent.toFixed(2)}% diff)`);
        results.push({ 
          name: test.name, 
          status: 'match',
          diffPercent: comparison.diffPercent 
        });
      } else {
        console.log(`🚨 ${test.name}: MISMATCH (${comparison.diffPercent.toFixed(2)}% diff)`);
        results.push({ 
          name: test.name, 
          status: 'mismatch',
          diffPercent: comparison.diffPercent,
          diffPath: diffPath 
        });
      }
    } catch (err) {
      console.log(`❌ ${test.name}: Error - ${err.message}`);
      results.push({ 
        name: test.name, 
        status: 'error',
        error: err.message 
      });
    }
  }
  
  await browser.close();
  return results;
}

/**
 * Simple image comparison using raw pixel data
 * Returns match status and diff percentage
 */
async function compareImages(baselinePath, currentPath, diffPath) {
  const { PNG } = require('pngjs');
  
  // Read images
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const current = PNG.sync.read(fs.readFileSync(currentPath));
  
  // Check dimensions match
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return { 
      match: false, 
      diffPercent: 100,
      reason: 'dimension-mismatch' 
    };
  }
  
  const width = baseline.width;
  const height = baseline.height;
  const diff = new PNG({ width, height });
  
  let diffPixels = 0;
  const totalPixels = width * height;
  const threshold = 0.1; // Color difference threshold
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      const rDiff = Math.abs(baseline.data[idx] - current.data[idx]);
      const gDiff = Math.abs(baseline.data[idx + 1] - current.data[idx + 1]);
      const bDiff = Math.abs(baseline.data[idx + 2] - current.data[idx + 2]);
      
      const colorDiff = (rDiff + gDiff + bDiff) / 3 / 255;
      
      if (colorDiff > threshold) {
        diffPixels++;
        // Mark diff pixels in red
        diff.data[idx] = 255;     // R
        diff.data[idx + 1] = 0;   // G
        diff.data[idx + 2] = 0;   // B
        diff.data[idx + 3] = 255; // A
      } else {
        // Grayscale for matching pixels
        const gray = Math.floor((baseline.data[idx] + baseline.data[idx + 1] + baseline.data[idx + 2]) / 3);
        diff.data[idx] = gray;
        diff.data[idx + 1] = gray;
        diff.data[idx + 2] = gray;
        diff.data[idx + 3] = 128;
      }
    }
  }
  
  // Write diff image
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  
  const diffPercent = (diffPixels / totalPixels) * 100;
  const THRESHOLD_PERCENT = 5; // Allow 5% difference
  
  return {
    match: diffPercent < THRESHOLD_PERCENT,
    diffPercent,
    diffPixels,
    totalPixels
  };
}

/**
 * Login helper
 */
async function login(page) {
  await page.goto(MISSION_CONTROL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Check if already logged in
  const passwordField = await page.$('input[type="password"]');
  if (!passwordField) return; // Already logged in
  
  const usernameField = await page.$('input[name="username"], input[type="text"]:not([type="password"])');
  if (usernameField) await usernameField.fill(TEST_USER);
  if (passwordField) await passwordField.fill(TEST_PASSWORD);
  
  const loginButton = await page.$('button[type="submit"]');
  if (loginButton) await loginButton.click();
  
  await page.waitForTimeout(3000); // Wait for redirect and content to load
}

/**
 * Generate report for results
 */
function generateReport(results) {
  const mismatches = results.filter(r => r.status === 'mismatch');
  const errors = results.filter(r => r.status === 'error');
  const matches = results.filter(r => r.status === 'match');
  const noBaseline = results.filter(r => r.status === 'no-baseline');
  
  let report = `\n📊 **Visual Regression Report**\n\n`;
  report += `Total: ${results.length} | `;
  report += `✅ Match: ${matches.length} | `;
  report += `🚨 Mismatch: ${mismatches.length} | `;
  report += `❌ Errors: ${errors.length} | `;
  report += `⚠️ No baseline: ${noBaseline.length}\n\n`;
  
  if (mismatches.length > 0) {
    report += `**Visual Changes Detected:**\n`;
    mismatches.forEach(m => {
      report += `- ${m.name}: ${m.diffPercent.toFixed(2)}% changed\n`;
    });
    report += '\n';
  }
  
  if (errors.length > 0) {
    report += `**Errors:**\n`;
    errors.forEach(e => {
      report += `- ${e.name}: ${e.error}\n`;
    });
  }
  
  return { 
    report, 
    success: mismatches.length === 0 && errors.length === 0 
  };
}

// CLI interface
const command = process.argv[2];

if (command === 'baseline') {
  captureBaselines()
    .then(results => {
      console.log('\n📸 Baseline capture complete!');
      const success = results.filter(r => r.success).length;
      console.log(`Captured: ${success}/${results.length}`);
      process.exit(results.every(r => r.success) ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
} else if (command === 'compare') {
  compareScreenshots()
    .then(results => {
      const { report, success } = generateReport(results);
      console.log(report);
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
} else {
  console.log(`
Mission Control Visual Regression Testing

Usage:
  node visual-regression.js baseline   Capture baseline screenshots
  node visual-regression.js compare    Compare current vs baselines

Directories:
  Baselines: ${BASELINES_DIR}
  Current:   ${CURRENT_DIR}  
  Diffs:     ${DIFF_DIR}
`);
}

module.exports = { captureBaselines, compareScreenshots, generateReport };
