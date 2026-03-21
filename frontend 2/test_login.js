import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Navigate to login
  await page.goto('http://localhost:5174/login');
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  page.on('response', response => {
    if(!response.ok()) console.log('HTTP ERROR:', response.status(), response.url());
  });

  // Type in email and password
  await page.type('input[type="email"]', 'test456@test.com');
  await page.type('input[type="password"]', 'password');
  
  // Click login button
  await page.click('button[type="submit"]');
  
  // Wait a moment
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
