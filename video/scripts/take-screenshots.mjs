/**
 * Takes screenshots of the running app at http://localhost:5173
 * Saves to video/public/screens/ for use by Remotion.
 *
 * Usage: node scripts/take-screenshots.mjs
 * Requires: npm install puppeteer (in video/ directory)
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = resolve(__dirname, '../public/screens');
mkdirSync(OUT_DIR, { recursive: true });

const BASE   = 'http://localhost:5173';
const WIDTH  = 1920;
const HEIGHT = 1080;

async function shot(page, name) {
  await page.screenshot({ path: `${OUT_DIR}/${name}`, fullPage: false });
  console.log(`  ✓ ${name}`);
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,           // set true for CI
    defaultViewport: { width: WIDTH, height: HEIGHT },
    args: [`--window-size=${WIDTH},${HEIGHT}`],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });

  console.log('Opening app…');
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await wait(1500);

  // 1. Home screen
  await shot(page, 'home.png');

  console.log('\nNote: remaining screenshots require manual interaction.');
  console.log('Steps to complete:');
  console.log('  1. Sign in, upload the Amharic Prayer Book PDF');
  console.log('  2. Extract pages 1–4, then take screenshots manually');
  console.log('     OR uncomment the interactive steps below after adding your credentials.\n');

  // ── Uncomment and fill in to automate the rest ──────────────────────────
  //
  // await page.type('[placeholder="Email"]', 'your@email.com');
  // await page.type('[placeholder="Password"]', 'yourpassword');
  // await page.click('[type="submit"]');
  // await page.waitForNavigation({ waitUntil: 'networkidle2' });
  // await shot(page, 'home-logged-in.png');
  //
  // // Upload PDF via file input
  // const [fileChooser] = await Promise.all([
  //   page.waitForFileChooser(),
  //   page.click('label.home-upload-drop'),
  // ]);
  // await fileChooser.accept(['/Users/mekdesyared/Downloads/aba temsgen/Amharic_Prayer_Book_Editable_First10.pdf']);
  // await wait(2000);
  // await shot(page, 'extracting.png');
  //
  // // Wait for extraction then navigate to page 4
  // await page.waitForSelector('.ftb-dock', { timeout: 120000 });
  // await shot(page, 'page4.png');
  //
  // ── End automated steps ─────────────────────────────────────────────────

  await browser.close();
  console.log(`\nScreenshots saved to: ${OUT_DIR}`);
  console.log('Run "npm run preview" to preview the video in Remotion Studio.');
})();
