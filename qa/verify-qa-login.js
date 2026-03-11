const { chromium } = require('playwright');

const MISSION_CONTROL_URL = process.env.MC_URL || 'http://localhost:3000';

async function verify() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  console.log('Testing QA login...');
  await page.goto(`${MISSION_CONTROL_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  await page.fill('input[type="email"]', 'qa@missioncontrol.local');
  await page.fill('input[type="password"]', 'qa-testing-2026');
  
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  
  console.log('URL after login:', page.url());
  
  // Check for error messages
  const errorMsg = await page.$('.text-red-500, .text-danger, [class*="error" i]');
  if (errorMsg) {
    const errorText = await errorMsg.textContent();
    console.log('Error message:', errorText);
  }
  
  // Try Tim's account for comparison
  console.log('\nTesting Tim login...');
  await page.goto(`${MISSION_CONTROL_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  await page.fill('input[type="email"]', 'tim@missioncontrol.local');
  await page.fill('input[type="password"]', 'password123');
  
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  
  console.log('URL after Tim login:', page.url());
  
  await browser.close();
}

verify().catch(console.error);
