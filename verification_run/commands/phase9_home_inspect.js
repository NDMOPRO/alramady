const puppeteer = require('puppeteer');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(page) {
  await page.goto('http://localhost/login', { waitUntil: 'networkidle2', timeout: 60000 });
  const inputs = await page.$$('input');
  if (inputs.length < 2) throw new Error('login inputs not found');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type('admin@rasid.demo');
  await inputs[1].click({ clickCount: 3 });
  await inputs[1].type('Password123!');
  const buttons = await page.$$('button');
  await Promise.all([
    buttons[buttons.length - 1].click(),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
  ]);
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  await login(page);
  await page.goto('http://localhost/home', { waitUntil: 'networkidle2', timeout: 60000 });
  const input = await page.$('input[type="file"]');
  if (!input) throw new Error('file input not found');
  await input.uploadFile('C:/DATA_AI/rasid/verification_run/raw_outputs/phase4-home-sample.csv');
  await sleep(2500);
  const result = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return { headings, buttons: buttons.slice(0, 120), bodySnippet: body.slice(0, 6000) };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
