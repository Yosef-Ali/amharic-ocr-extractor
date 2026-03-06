/**
 * Takes all 9 walkthrough screenshots.
 * The app must be running at http://localhost:5175
 * A Puppeteer browser window will open — sign in when prompted, then
 * press Enter in the terminal to continue.
 *
 * Usage: node scripts/take-screenshots.mjs
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT  = resolve(__dirname, '../public/screens');
const BASE = 'http://localhost:5175';

mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForEnter(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function shot(page, name) {
  await sleep(800);
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: false });
  console.log(`  ✓ ${name}`);
}

(async () => {
  // defaultViewport: null — lets the browser use its actual maximized window size
  // so nothing gets clipped (no forced 1920×1080 that may exceed your display)
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--window-position=0,0',
    ],
  });

  const page = await browser.newPage();
  // Maximize on macOS via CDP
  const session = await page.createCDPSession();
  const { windowId } = await session.send('Browser.getWindowForTarget');
  await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });

  // ── Open app ──────────────────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 20000 });

  // ── 1. Home screen ────────────────────────────────────────────────────────
  await waitForEnter('\n[1/9] SIGN IN to the app in the browser window, then come back to the HOME screen.\n      Press Enter when ready: ');
  await shot(page, 'home.png');

  // ── 2. Extracting ─────────────────────────────────────────────────────────
  await waitForEnter('\n[2/9] Click "New Project" / drag a PDF onto the upload area to START uploading.\n      Wait until extraction is running (spinner / progress visible).\n      Press Enter to capture: ');
  await shot(page, 'extracting.png');

  // ── 3. Editor page 4 ──────────────────────────────────────────────────────
  await waitForEnter('\n[3/9] Wait for extraction to finish so the EDITOR opens.\n      Navigate to PAGE 4 using the page arrows.\n      Press Enter to capture: ');
  await shot(page, 'page4.png');

  // ── 4. Crop drawing ───────────────────────────────────────────────────────
  await waitForEnter('\n[4/9] On the LEFT PANEL (original scan), START DRAWING a crop selection\n      (click and drag but keep the mouse button held down).\n      Press Enter while the selection box is still being drawn: ');
  await shot(page, 'crop-draw.png');

  // ── 5. Crop selected ──────────────────────────────────────────────────────
  await waitForEnter('\n[5/9] RELEASE the mouse — the cyan border crop selection should be visible.\n      Press Enter to capture: ');
  await shot(page, 'crop-selected.png');

  // ── 6. Enhance & Insert ───────────────────────────────────────────────────
  await waitForEnter('\n[6/9] Click the "Enhance & Insert" button in the toolbar.\n      Wait for the AI restore to complete (image appears in the document).\n      Press Enter to capture: ');
  await shot(page, 'crop-enhance.png');
  await shot(page, 'crop-inserted.png');

  // ── 7. AI Chat ────────────────────────────────────────────────────────────
  await waitForEnter('\n[7/9] Click the AI CHAT button in the floating dock to open the chat panel.\n      Press Enter to capture: ');
  await shot(page, 'ai-chat.png');

  // ── 8. Export / Save ──────────────────────────────────────────────────────
  await waitForEnter('\n[8/9] Close the chat (Escape), then click SAVE / DOWNLOAD PDF in the dock.\n      Press Enter to capture: ');
  await shot(page, 'export.png');

  console.log('\n✅ All 9 screenshots saved to:', OUT);
  console.log('Now run:  npm run render\n');

  await browser.close();
})().catch(err => {
  console.error('Screenshot script failed:', err.message);
  process.exit(1);
});
