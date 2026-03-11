/**
 * Create QA Agent user via registration
 */
const { chromium } = require('playwright');

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:3000';

async function createQAUser() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  console.log('Navigating to register page...');
  await page.goto(`${MISSION_CONTROL_URL}/register`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Fill all form fields by name
  console.log('Filling form fields...');
  
  await page.fill('input[name="email"]', 'qa@missioncontrol.local');
  await page.fill('input[name="username"]', 'qa-agent');
  await page.fill('input[name="displayName"]', 'QA Agent');
  await page.fill('input[name="password"]', 'qa-testing-2026');
  await page.fill('input[name="confirmPassword"]', 'qa-testing-2026');
  
  // Click register button
  console.log('Submitting registration...');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  
  // Check result
  const currentUrl = page.url();
  console.log('Final URL:', currentUrl);
  
  if (!currentUrl.includes('/register')) {
    console.log('✅ QA user created successfully!');
    console.log('Email: qa@missioncontrol.local');
    console.log('Password: qa-testing-2026');
  } else {
    // Check for error or success messages
    const pageText = await page.$eval('body', el => el.textContent);
    if (pageText.toLowerCase().includes('already') || pageText.toLowerCase().includes('exists')) {
      console.log('✅ QA user already exists');
    } else {
      console.log('⚠️ Registration status unclear');
      await page.screenshot({ path: '/home/rico/mc-qa/screenshots/register-result.png' });
    }
  }
  
  await browser.close();
}

createQAUser().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
