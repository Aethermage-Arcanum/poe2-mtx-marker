// Erzeugt die PNG-Icons für Chromium (Chrome/Edge zeigen keine SVG-Icons im Manifest) aus den SVG-Quellen.
// Gerendert wird mit einem installierten Chromium headless: SVG als data-URL auf ein Canvas der Zielgröße,
// Ergebnis per --dump-dom ausgelesen. Aufruf: node tools/build-icons.mjs [Pfad zu msedge.exe/chrome.exe]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ICON_DIR = path.join(ROOT, 'icons');
export const PNG_DIR = path.join(ICON_DIR, 'png');
// Wie im Firefox-Manifest: bis 32 px ohne Schriftzug, ab 48 px mit.
export const PNG_ICONS = Object.freeze({
  16: 'icon-small.svg',
  32: 'icon-small.svg',
  48: 'icon.svg',
  128: 'icon.svg',
});
const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
];
// Neuere Edge-Installationen liegen versioniert unter EdgeCore\<Version>\msedge.exe.
const EDGE_CORE_DIR = 'C:\\Program Files (x86)\\Microsoft\\EdgeCore';

function edgeCoreExecutables() {
  if (!fs.existsSync(EDGE_CORE_DIR)) return [];
  const versions = fs.readdirSync(EDGE_CORE_DIR).filter((name) => /^\d+(\.\d+)*$/.test(name));
  versions.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  return versions.map((version) => path.join(EDGE_CORE_DIR, version, 'msedge.exe'));
}

// Erstes installiertes Chromium (Edge vor Chrome) oder null.
export function findChromium() {
  return [...BROWSER_CANDIDATES.slice(0, 2), ...edgeCoreExecutables(), ...BROWSER_CANDIDATES.slice(2)]
    .find((candidate) => fs.existsSync(candidate)) || null;
}
const RESULT_PATTERN = /<pre id="out">([^<]*)<\/pre>/;
const PNG_DATA_PREFIX = 'data:image/png;base64,';

export function pngFileName(size) {
  return `icon-${size}.png`;
}

function renderPage(jobs) {
  return `<!DOCTYPE html><html><body><pre id="out"></pre><script>
(async () => {
  const jobs = ${JSON.stringify(jobs)};
  const out = {};
  for (const job of jobs) {
    const img = new Image();
    img.src = job.src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = job.size;
    canvas.getContext('2d').drawImage(img, 0, 0, job.size, job.size);
    out[job.size] = canvas.toDataURL('image/png');
  }
  document.getElementById('out').textContent = JSON.stringify(out);
})().catch((error) => { document.getElementById('out').textContent = JSON.stringify({ error: String(error) }); });
</script></body></html>`;
}

function main(args) {
  const browser = args[0] || findChromium();
  if (!browser) {
    console.error('Kein Chromium gefunden; Pfad zu msedge.exe oder chrome.exe als Argument angeben.');
    return 1;
  }
  const jobs = Object.entries(PNG_ICONS).map(([size, svg]) => ({
    size: Number(size),
    src: `data:image/svg+xml;base64,${fs.readFileSync(path.join(ICON_DIR, svg)).toString('base64')}`,
  }));
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poe2mtx-icons-'));
  try {
    const page = path.join(workDir, 'render.html');
    fs.writeFileSync(page, renderPage(jobs));
    const run = spawnSync(browser, [
      '--headless', '--disable-gpu', `--user-data-dir=${path.join(workDir, 'profile')}`,
      '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(page).href,
    ], { encoding: 'utf8', timeout: 60000 });
    const match = RESULT_PATTERN.exec(run.stdout || '');
    const result = match ? JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
    if (!result || result.error) {
      console.error('Rendern fehlgeschlagen:', result ? result.error : (run.stderr || run.error || 'keine Ausgabe'));
      return 1;
    }
    fs.mkdirSync(PNG_DIR, { recursive: true });
    for (const { size } of jobs) {
      const file = path.join(PNG_DIR, pngFileName(size));
      fs.writeFileSync(file, Buffer.from(result[size].slice(PNG_DATA_PREFIX.length), 'base64'));
      console.log('geschrieben:', path.relative(ROOT, file));
    }
    return 0;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
