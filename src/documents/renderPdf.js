import { chromium } from 'playwright';

async function launchBrowser() {
  const options = {
    headless: true,
    chromiumSandbox: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  };

  try {
    return await chromium.launch({ ...options, channel: 'chrome' });
  } catch {
    return await chromium.launch(options);
  }
}

export async function renderPdf(html) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}
