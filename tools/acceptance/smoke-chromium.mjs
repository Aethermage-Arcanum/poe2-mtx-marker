// Kurzprüfung der Chromium-Fassung im echten Edge/Chrome: lädt web-ext-artifacts/chromium per CDP
// (Extensions.loadUnpacked), öffnet Shop-Seiten und meldet Treffer, Popup-Text und Speicherstand.
// Vorher: npm run build:chromium. Aufruf: node tools/acceptance/smoke-chromium.mjs [Browser] [URL ...]
// HEADED=1 zeigt das Fenster. Screenshots: temp/acceptance/chromium_<n>.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from '../build-icons.mjs';
import { STAGE_DIR } from '../build-chromium.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'temp', 'acceptance');
const DEFAULT_URLS = [
  'https://www.pathofexile.com/shop/category/pets',
  'https://de.pathofexile.com/shop/category/armour-effects',
];
const cliArgs = process.argv.slice(2);
const browserPath = cliArgs[0] && !cliArgs[0].startsWith('http') ? cliArgs.shift() : findChromium();
const urls = cliArgs.length > 0 ? cliArgs : DEFAULT_URLS;
const extDir = STAGE_DIR;
if (!browserPath || !fs.existsSync(path.join(extDir, 'manifest.json'))) {
  console.error(browserPath ? 'Erst npm run build:chromium ausführen.' : 'Kein Chromium gefunden; Pfad als erstes Argument angeben.');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
const headless = !process.env.HEADED;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'poe2mtx-cdp-'));
const args = [
  '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1400,1100', 'about:blank',
];
if (headless) args.unshift('--headless');
const proc = spawn(browserPath, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
const toBrowser = proc.stdio[3];
const fromBrowser = proc.stdio[4];
let nextId = 1;
const pending = new Map();
const events = [];
let buffer = '';
fromBrowser.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let idx;
  while ((idx = buffer.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, idx));
    buffer = buffer.slice(idx + 1);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  }
});
function send(method, params = {}, sessionId) {
  const id = nextId++;
  const message = { id, method, params };
  if (sessionId) message.sessionId = sessionId;
  toBrowser.write(`${JSON.stringify(message)}\0`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(url) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url }, sessionId);
  return { targetId, sessionId };
}
async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

const STATE = `(() => { const cards=[...document.querySelectorAll('#mtx-list > div.shopItemBase[id]')];
  return { total: cards.length, marked: cards.filter(c=>c.classList.contains('poe2mtx-marked')).length,
    labels: [...new Set(cards.map(c=>c.querySelector(':scope > .poe2mtx-label')?.textContent).filter(Boolean))].slice(0,5),
    notice: document.getElementById('poe2mtx-notice')?.textContent ?? null }; })()`;

try {
  await send('Target.setDiscoverTargets', { discover: true });
  const { id } = await send('Extensions.loadUnpacked', { path: extDir });
  console.log('Extension geladen, ID', id);
  for (const url of urls) {
    const { sessionId } = await openPage(url);
    let state = null;
    for (let i = 0; i < 60; i += 1) {
      await sleep(1000);
      state = await evaluate(sessionId, STATE).catch(() => null);
      if (state && state.marked > 0) break;
    }
    await sleep(3000);
    state = await evaluate(sessionId, STATE);
    console.log(url, JSON.stringify(state));
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = path.join(OUT, `chromium_${urls.indexOf(url)}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('Screenshot', file);
  }
  // Popup im Tab öffnen: Statistik kommt dann vom aktiven Tab, also nur Datenstand und Quelle prüfen.
  const popup = await openPage(`chrome-extension://${id}/popup.html`);
  await sleep(2000);
  console.log('Popup:', (await evaluate(popup.sessionId, 'document.body.innerText')).replace(/\n+/g, ' | '));
  const stored = await evaluate(popup.sessionId, `chrome.storage.local.get(null).then(s => ({
    keys: Object.keys(s), status: s.dataStatus, runtimeIdMap: Object.keys(s.runtimeIdMap || {}).length,
    cacheEntries: s.poe2dbListCache?.entries?.length }))`);
  console.log('Storage:', JSON.stringify(stored));
  const targets = (await send('Target.getTargets')).targetInfos.filter((t) => t.url.startsWith('chrome-extension://'));
  console.log('Extension-Ziele:', targets.map((t) => `${t.type} ${t.url.replace(/^chrome-extension:\/\/[^/]+/, '')}`).join(', '));
} catch (error) {
  console.error('FEHLER', error);
  process.exitCode = 1;
} finally {
  proc.kill();
  await sleep(1000);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
