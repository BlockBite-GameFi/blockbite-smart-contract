const { chromium } = require('playwright');
const path = require('path');
const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe');
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
  await page.goto('http://localhost:3210/demo-record', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'demo/out/verify-intro.png' });
  await page.waitForTimeout(10000);
  await page.screenshot({ path: 'demo/out/verify-linear.png' });
  console.log('CONSOLE ERRORS:', errs.length ? errs.slice(0,8).join('\n  ') : 'none');
  await browser.close();
})();
