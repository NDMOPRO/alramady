const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless:'new'});
  const page = await browser.newPage();
  await page.goto('http://localhost/home', {waitUntil:'networkidle2', timeout:60000});
  console.log(JSON.stringify({title: await page.title(), url: page.url(), dir: await page.$eval('html', el => el.getAttribute('dir'))}, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
