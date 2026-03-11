const { chromium } = require('playwright');

const MISSION_CONTROL_URL = process.env.MC_URL || 'http://localhost:3000';

async function check() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto(`${MISSION_CONTROL_URL}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  // Get all form fields
  const inputs = await page.$$eval('input', els => els.map(el => ({
    type: el.type, name: el.name, id: el.id, placeholder: el.placeholder
  })));
  console.log('Inputs:', JSON.stringify(inputs, null, 2));
  
  const buttons = await page.$$eval('button', els => els.map(el => el.textContent?.trim()));
  console.log('Buttons:', buttons);
  
  // Fill and submit
  const allInputs = await page.$$('input');
  if (allInputs.length >= 3) {
    // Usually: username/displayName, email, password
    for (const inp of allInputs) {
      const type = await inp.getAttribute('type');
      const name = await inp.getAttribute('name');
      
      if (type === 'email' || name === 'email') {
        await inp.fill('qa@missioncontrol.local');
      } else if (type === 'password') {
        await inp.fill('qa-testing-2026');
      } else {
        await inp.fill('qa-agent');
      }
    }
    
    const btn = await page.$('button[type="submit"]');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(4000);
    }
  }
  
  console.log('Final URL:', page.url());
  
  // Check for errors
  const pageText = await page.$eval('body', el => el.textContent);
  if (pageText.includes('error') || pageText.includes('Error') || pageText.includes('failed') || pageText.includes('already')) {
    console.log('Page contains error-like text');
    const errorDivs = await page.$$eval('[class*="error" i], [class*="alert" i], p', els => 
      els.map(el => el.textContent?.trim()).filter(t => t && t.length < 200)
    );
    console.log('Potential error messages:', errorDivs.slice(0, 5));
  }
  
  await browser.close();
}

check().catch(console.error);
