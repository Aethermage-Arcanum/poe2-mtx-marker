// Baut die Chromium-Fassung (Chrome, Edge, Brave, Opera, Vivaldi) aus demselben Quellstand wie Firefox:
// Dateien des Firefox-Pakets plus die Chromium-Dateien, Manifest abgeleitet aus manifest.json.
// Ergebnis: entpackt in web-ext-artifacts/chromium/ (zum Laden als "entpackte Erweiterung") und als ZIP
// (für den Edge-Add-ons-Store) in web-ext-artifacts/. Aufruf: node tools/build-chromium.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webExtConfig from '../web-ext-config.mjs';
import { PNG_ICONS, pngFileName } from './build-icons.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS_DIR = path.join(ROOT, 'web-ext-artifacts');
export const STAGE_DIR = path.join(ARTIFACTS_DIR, 'chromium');
export const SERVICE_WORKER = 'background-sw.js';
export const MIN_CHROME_VERSION = '116'; // runtime.getContexts für das Offscreen-Dokument
export const OFFSCREEN_PERMISSION = 'offscreen';
// Nur Chromium; im Firefox-Paket über ignoreFiles (web-ext-config.mjs) ausgeschlossen.
export const CHROMIUM_ONLY_FILES = Object.freeze([SERVICE_WORKER, 'offscreen.html', 'offscreen.js', 'icons/png']);
// Was web-ext von sich aus nie ins Paket nimmt (versteckte Dateien, node_modules, Pakete, Artefakte).
const WEB_EXT_DEFAULT_IGNORES = Object.freeze(['.*', 'node_modules', '*.xpi', '*.zip', 'web-ext-artifacts']);
const ACTION_ICON_SIZES = Object.freeze([16, 32]);

function iconPath(size) {
  return `icons/png/${pngFileName(size)}`;
}

export function chromiumManifest(manifest) {
  const out = structuredClone(manifest);
  delete out.browser_specific_settings;
  out.minimum_chrome_version = MIN_CHROME_VERSION;
  out.background = { service_worker: SERVICE_WORKER };
  out.permissions = [...manifest.permissions, OFFSCREEN_PERMISSION];
  out.icons = Object.fromEntries(Object.keys(PNG_ICONS).map((size) => [size, iconPath(size)]));
  out.action = { ...manifest.action, default_icon: Object.fromEntries(ACTION_ICON_SIZES.map((size) => [size, iconPath(size)])) };
  return out;
}

// Ein Pfad (relativ, mit "/") fällt unter ein Muster, wenn er selbst oder einer seiner Ordner passt.
function matchesAny(relPath, patterns) {
  const parts = relPath.split('/');
  for (let i = 1; i <= parts.length; i += 1) {
    const prefix = parts.slice(0, i).join('/');
    const name = parts[i - 1];
    if (patterns.some((pattern) => path.posix.matchesGlob(prefix, pattern) || path.posix.matchesGlob(name, pattern))) return true;
  }
  return false;
}

// Dateien der Chromium-Fassung: alles, was auch ins Firefox-Paket kommt, plus CHROMIUM_ONLY_FILES.
export function packageFiles(root, ignoreFiles = webExtConfig.ignoreFiles) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      const chromiumOnly = matchesAny(rel, CHROMIUM_ONLY_FILES);
      if (matchesAny(rel, WEB_EXT_DEFAULT_IGNORES)) continue;
      if (!chromiumOnly && matchesAny(rel, ignoreFiles)) continue;
      if (entry.isDirectory()) walk(rel);
      else files.push(rel);
    }
  };
  walk('');
  return files.sort();
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  for (const rel of packageFiles(ROOT)) {
    if (rel === 'manifest.json') continue;
    fs.mkdirSync(path.dirname(path.join(STAGE_DIR, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(STAGE_DIR, rel));
  }
  fs.writeFileSync(path.join(STAGE_DIR, 'manifest.json'), `${JSON.stringify(chromiumManifest(manifest), null, 2)}\n`);
  console.log('entpackt:', path.relative(ROOT, STAGE_DIR));

  const { default: webExt } = await import('web-ext');
  const filename = `poe2-mtx-marker-chromium-${manifest.version}.zip`;
  await webExt.cmd.build(
    { sourceDir: STAGE_DIR, artifactsDir: ARTIFACTS_DIR, filename, overwriteDest: true },
    { shouldExitProgram: false },
  );
  console.log('ZIP:', path.join('web-ext-artifacts', filename));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
