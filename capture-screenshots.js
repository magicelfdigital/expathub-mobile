const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.5,
  });
  const page = await context.newPage();

  const pages = [
    { url: '/', name: 'screenshot-home', label: 'Home Screen' },
    { url: '/country/portugal', name: 'screenshot-country', label: 'Portugal Country Page' },
    { url: '/country/portugal/pathways/d7', name: 'screenshot-pathways', label: 'D7 Pathway' },
    { url: '/country/portugal/resources', name: 'screenshot-resources', label: 'Resources' },
    { url: '/country/portugal/vendors', name: 'screenshot-vendors', label: 'Vendors' },
    { url: '/explore', name: 'screenshot-explore', label: 'Explore' },
    { url: '/community', name: 'screenshot-community', label: 'Community' },
  ];

  for (const p of pages) {
    console.log(`Capturing ${p.label}...`);
    await page.goto(`http://localhost:8081${p.url}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `attached_assets/${p.name}.png`, fullPage: false });
    console.log(`  Saved ${p.name}.png`);
  }

  await browser.close();
  console.log('\nAll screenshots saved to attached_assets/');
})();
