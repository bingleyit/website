import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Minimal static file server ────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};
const server = createServer((req, res) => {
  const filePath = path.join(__dirname, req.url.split('?')[0]);
  if (existsSync(filePath) && !filePath.endsWith('/')) {
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(readFileSync(filePath));
  } else {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(7788, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:7788';

// ── Google Font CSS served inline (Inter + Caveat + DM Mono stacks) ──
// We serve a fake fonts.googleapis.com response with system-font fallbacks
// plus @font-face data URIs so the demo looks correct even without network.
// The actual font files are fetched separately below.
const FONT_CSS_OVERRIDE = `
/* System-font fallbacks that closely match Inter / Caveat / DM Mono */
@font-face { font-family: 'Inter'; font-weight: 100 900; src: local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('sans-serif'); }
@font-face { font-family: 'Caveat'; font-weight: 700; src: local('Caveat'), local('Dancing Script'), local('cursive'); }
@font-face { font-family: 'DM Mono'; font-weight: 300 500; src: local('DM Mono'), local('JetBrains Mono'), local('Fira Mono'), local('monospace'); }
`;

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-web-security', '--font-render-hinting=none'],
});

// ── Shared: inject demo token ────────────────────
async function injectDemoUser(page) {
  await page.evaluate(() => {
    localStorage.setItem('cp_token', 'demo-token');
    localStorage.setItem('cp_user', JSON.stringify({
      id: 'demo', name: 'Demo User',
      email: 'demo@cloudpad.app', handle: 'demouser', plan: 'free',
    }));
  });
}

// ── Shared: intercept external requests ──────────
async function blockExternal(page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    // Allow local requests
    if (url.startsWith('http://127.0.0.1:7788')) {
      return route.continue();
    }
    // Serve a stub CSS for Google Fonts
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: FONT_CSS_OVERRIDE,
      });
    }
    // Abort all other external requests (APIs, maps, etc.)
    return route.abort();
  });
}

// ── Desktop screenshot ─────────────────────────────
console.log('Taking desktop screenshot…');
const dCtx = await browser.newContext({
  viewport: { width: 1440, height: 860 },
  deviceScaleFactor: 2,
});
const dPage = await dCtx.newPage();
await blockExternal(dPage);

await dPage.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await injectDemoUser(dPage);
await dPage.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
await dPage.waitForTimeout(3000);

// Force main screen
await dPage.evaluate(() => {
  try { if (typeof showScreen === 'function') showScreen('screen-main'); } catch {}
});
await dPage.waitForTimeout(2000);

await dPage.screenshot({
  path: path.join(__dirname, 'screenshot-desktop.png'),
  clip: { x: 0, y: 0, width: 1440, height: 860 },
  timeout: 15000,
});
console.log('✓ desktop screenshot saved');
await dCtx.close();

// ── Mobile screenshot ──────────────────────────────
console.log('Taking mobile screenshot…');
const mCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  isMobile: true,
  hasTouch: true,
});
const mPage = await mCtx.newPage();
await blockExternal(mPage);

await mPage.goto(BASE + '/demo.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await injectDemoUser(mPage);
await mPage.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
await mPage.waitForTimeout(3000);

await mPage.evaluate(() => {
  try { if (typeof showScreen === 'function') showScreen('screen-main'); } catch {}
});
await mPage.waitForTimeout(2000);

await mPage.screenshot({
  path: path.join(__dirname, 'screenshot-mobile.png'),
  clip: { x: 0, y: 0, width: 390, height: 844 },
  timeout: 15000,
});
console.log('✓ mobile screenshot saved');
await mCtx.close();

await browser.close();
server.close();
console.log('All done.');
