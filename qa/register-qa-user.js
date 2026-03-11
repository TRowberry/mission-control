/**
 * Register QA Agent user via browser form
 */
const { chromium } = require('playwright');

const MISSION_CONTROL_URL = process.env.MC_URL || 'http://localhost:3000';
const QA_EMAIL = 'qabot@missioncontrol.local';
const QA_USERNAME = 'qabot';
const QA_DISPLAY_NAME = 'QA Bot';
const QA_PASSWORD = 'qatesting2026';

async function registerQAUser() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  console.log('Navigating to register page...');
  await page.goto(`${MISSION_CONTROL_URL}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  console.log('Filling registration form...');
  await page.fill('#email', QA_EMAIL);
  await page.fill('#username', QA_USERNAME);
  await page.fill('#displayName', QA_DISPLAY_NAME);
  await page.fill('#password', QA_PASSWORD);
  await page.fill('#confirmPassword', QA_PASSWORD);
  
  console.log('Submitting...');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  
  const finalUrl = page.url();
  console.log('Final URL:', finalUrl);
  
  if (!finalUrl.includes('/register')) {
    console.log('✅ QA Bot registered successfully!');
    console.log(`   Email: ${QA_EMAIL}`);
    console.log(`   Password: ${QA_PASSWORD}`);
  } else {
    // Check for specific errors
    const errorText = await page.$eval('body', el => {
      const errors = el.querySelectorAll('.text-red-500, [class*="error" i], .text-danger');
      return Array.from(errors).map(e => e.textContent?.trim()).join(' | ');
    });
    
    if (errorText.includes('already') || errorText.includes('taken') || errorText.includes('in use')) {
      console.log('⚠️ User already exists - trying login to verify...');
      
      // Try to login with these creds
      await page.goto(`${MISSION_CONTROL_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await page.fill('input[type="email"]', QA_EMAIL);
      await page.fill('input[type="password"]', QA_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(4000);
      
      if (!page.url().includes('/login')) {
        console.log('✅ QA Bot login successful with these credentials!');
      } else {
        console.log('❌ Login failed - password might be different');
      }
    } else {
      console.log('❌ Registration failed:', errorText || 'Unknown error');
      await page.screenshot({ path: '/home/rico/mc-qa/screenshots/register-error.png' });
    }
  }
  
  await browser.close();
}

registerQAUser().catch(console.error);
