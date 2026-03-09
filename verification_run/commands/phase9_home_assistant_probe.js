const puppeteer = require('puppeteer');
(async () => {
  const login = await fetch('http://localhost/api/v1/governance/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email: 'admin@rasid.demo', password: 'Password123!' }) });
  const payload = await login.json();
  const data = payload.data || payload;
  const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1440, height: 1200 } });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((auth) => {
    localStorage.setItem('rasid_token', auth.token || auth.accessToken);
    localStorage.setItem('rasid_refresh_token', auth.refreshToken || '');
    if (auth.user) localStorage.setItem('rasid_user', JSON.stringify(auth.user));
  }, data);
  await page.goto('http://localhost/home', { waitUntil: 'networkidle2', timeout: 90000 });
  await page.click('[data-testid="rasid-assistant-toggle-home"]');
  await page.waitForSelector('[data-testid="rasid-action-home-refresh-home"]', { timeout: 60000 });
  await page.click('[data-testid="rasid-action-home-refresh-home"]');
  await new Promise((r) => setTimeout(r, 4000));
  const body = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim());
  console.log(body.slice(0, 3500));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
