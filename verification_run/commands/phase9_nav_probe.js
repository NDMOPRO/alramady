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
  await page.goto('http://localhost/data', { waitUntil: 'networkidle2', timeout: 90000 });
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('aside a')).map((a) => ({ text: (a.textContent || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') })));
  console.log(JSON.stringify({ before: page.url(), links }, null, 2));
  await page.evaluate(() => {
    const match = Array.from(document.querySelectorAll('aside a')).find((a) => (a.textContent || '').replace(/\s+/g, ' ').includes('التحليل'));
    if (!match) throw new Error('analysis link missing');
    match.click();
  });
  await new Promise((r) => setTimeout(r, 5000));
  console.log(JSON.stringify({ after: page.url(), body: (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ').slice(0, 1000) }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
