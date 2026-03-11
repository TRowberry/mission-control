/**
 * Debug script to inspect Mission Control DOM structure
 */
const { chromium } = require('playwright');

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:3000';
const TEST_USER = 'tim';
const TEST_PASSWORD = 'password123';

async function debugDOM() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  console.log('=== LOGIN PAGE ===');
  await page.goto(`${MISSION_CONTROL_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Wait for React hydration
  await page.waitForTimeout(5000);
  
  // Take screenshot to verify
  await page.screenshot({ path: '/home/rico/mc-qa/screenshots/debug-login.png' });
  console.log('Screenshot saved: debug-login.png');
  
  // Get page HTML snippet
  const bodyHTML = await page.$eval('body', el => el.innerHTML.slice(0, 2000));
  console.log('Body HTML (first 2000 chars):', bodyHTML);
  
  // Get all input elements
  const inputs = await page.$$eval('input', els => els.map(el => ({
    type: el.type,
    name: el.name,
    placeholder: el.placeholder,
    id: el.id,
    className: el.className?.slice(0, 100)
  })));
  console.log('\nInputs:', JSON.stringify(inputs, null, 2));
  
  // Get all buttons
  const buttons = await page.$$eval('button', els => els.map(el => ({
    text: el.textContent?.trim().slice(0, 50),
    type: el.type,
    className: el.className?.slice(0, 100)
  })));
  console.log('\nButtons:', JSON.stringify(buttons, null, 2));
  
  // Try to login
  console.log('\n=== ATTEMPTING LOGIN ===');
  const usernameInput = await page.$('input');
  const allInputs = await page.$$('input');
  console.log('Found', allInputs.length, 'inputs');
  
  if (allInputs.length >= 2) {
    await allInputs[0].fill(TEST_USER);
    await allInputs[1].fill(TEST_PASSWORD);
    console.log('Filled credentials');
    
    const loginBtn = await page.$('button');
    if (loginBtn) {
      console.log('Clicking login button...');
      await loginBtn.click();
      await page.waitForTimeout(5000);
    }
  }
  
  console.log('\n=== AFTER LOGIN ===');
  console.log('URL:', page.url());
  await page.screenshot({ path: '/home/rico/mc-qa/screenshots/debug-after-login.png' });
  console.log('Screenshot saved: debug-after-login.png');
  
  // Check what's on the page now
  const currentButtons = await page.$$eval('button', els => els.slice(0, 5).map(el => el.textContent?.trim().slice(0, 50)));
  console.log('Current buttons:', currentButtons);
  
  // Check for sidebar
  const divs = await page.$$eval('div', els => {
    return els.slice(0, 20).map(el => ({
      className: el.className?.slice(0, 80),
      childCount: el.children.length
    }));
  });
  console.log('\nTop divs:', JSON.stringify(divs.slice(0, 10), null, 2));
  
  await browser.close();
  console.log('\n=== DONE ===');
}

debugDOM().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
