'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const core = require('../lib/core.js');
const { createOffscreenParser, domParse, OFFSCREEN_PATH } = require('../background.js');
const { createParseHandler } = require('../offscreen.js');
const {
  chromiumManifest, packageFiles, CHROMIUM_ONLY_FILES, SERVICE_WORKER, OFFSCREEN_PERMISSION,
} = require('../tools/build-chromium.mjs');
const { PNG_ICONS, PNG_DIR, pngFileName } = require('../tools/build-icons.mjs');
const { POE2DB_LIST_FIXTURE, readText, readDetail, listDocument } = require('./helpers.js');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const chromium = chromiumManifest(manifest);
const files = packageFiles(ROOT);
const { DOMParser } = new JSDOM('').window;
const LIST_HTML = readText(POE2DB_LIST_FIXTURE);
const WOLF = 'Wolf_of_Ogham_Pet';

test('Chromium-Manifest: Service Worker, offscreen-Permission, PNG-Icons, ohne Gecko-Einstellungen', () => {
  assert.equal(chromium.manifest_version, 3);
  assert.equal(chromium.version, manifest.version);
  assert.deepEqual(chromium.background, { service_worker: SERVICE_WORKER });
  assert.deepEqual(chromium.permissions, [...manifest.permissions, OFFSCREEN_PERMISSION]);
  assert.deepEqual(chromium.host_permissions, manifest.host_permissions);
  assert.deepEqual(chromium.content_scripts, manifest.content_scripts);
  assert.equal(chromium.browser_specific_settings, undefined);
  assert.ok(Number(chromium.minimum_chrome_version) >= 116);
  for (const icon of [...Object.values(chromium.icons), ...Object.values(chromium.action.default_icon)]) {
    assert.match(icon, /\.png$/);
  }
  assert.equal(chromium.action.default_popup, manifest.action.default_popup);
  // Das Firefox-Manifest bleibt unverändert.
  assert.deepEqual(manifest.background.scripts, ['lib/core.js', 'background.js']);
});

test('Chromium-Paket: enthält alle referenzierten Dateien, Service-Worker-Importe und Offscreen-Skripte', () => {
  const cs = chromium.content_scripts[0];
  const referenced = [
    SERVICE_WORKER, OFFSCREEN_PATH, ...cs.js, ...cs.css, chromium.options_ui.page, chromium.action.default_popup,
    ...Object.values(chromium.icons), ...Object.values(chromium.action.default_icon), 'data/poe2db-shopid-map.json',
  ];
  const imported = [...readText(path.join(ROOT, SERVICE_WORKER)).matchAll(/'([^']+\.js)'/g)].map((m) => m[1]);
  assert.deepEqual(imported, ['lib/core.js', 'background.js']);
  const offscreenScripts = [...readText(path.join(ROOT, OFFSCREEN_PATH)).matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(offscreenScripts, ['lib/core.js', 'offscreen.js']);
  for (const file of [...referenced, ...imported, ...offscreenScripts]) assert.ok(files.includes(file), file);
});

test('Chromium-Paket: ohne Tests, Tools, Doku, node_modules und versteckte Dateien', () => {
  for (const file of files) {
    assert.doesNotMatch(file, /^(tests|tools|temp|knowledge|node_modules|web-ext-artifacts)\//, file);
    assert.doesNotMatch(file, /(^|\/)\./, file);
    assert.doesNotMatch(file, /\.md$/, file);
    assert.ok(!['package.json', 'package-lock.json', 'web-ext-config.mjs'].includes(file), file);
  }
});

test('Firefox-Paket: Chromium-Dateien stehen in ignoreFiles, alles andere ist in beiden Paketen', async () => {
  const { default: config } = await import('../web-ext-config.mjs');
  for (const file of CHROMIUM_ONLY_FILES) assert.ok(config.ignoreFiles.includes(file), file);
  const firefoxFiles = packageFiles(ROOT, [...config.ignoreFiles]).filter(
    (file) => !CHROMIUM_ONLY_FILES.some((only) => file === only || file.startsWith(`${only}/`)),
  );
  for (const file of ['manifest.json', 'background.js', 'content.js', 'lib/core.js', 'icons/icon.svg']) {
    assert.ok(firefoxFiles.includes(file), file);
  }
});

test('PNG-Icons: alle Größen vorhanden und mit passender Bildgröße (node tools/build-icons.mjs)', () => {
  for (const size of Object.keys(PNG_ICONS)) {
    const png = fs.readFileSync(path.join(PNG_DIR, pngFileName(size)));
    assert.equal(png.toString('latin1', 1, 4), 'PNG');
    // IHDR: Breite und Höhe ab Byte 16.
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
});

test('core.extensionApi: browser vor chrome, sonst null', () => {
  const browser = { id: 'b' };
  const chrome = { id: 'c' };
  assert.equal(core.extensionApi({ browser, chrome }), browser);
  assert.equal(core.extensionApi({ chrome }), chrome);
  assert.equal(core.extensionApi({}), null);
});

test('core.messageListener: Promise -> sendResponse und true, sonst false; Fehler an onError', async () => {
  const errors = [];
  const listener = core.messageListener((message) => {
    if (message === 'async') return Promise.resolve(42);
    if (message === 'fails') return Promise.reject(new Error('kaputt'));
    if (message === 'throws') throw new Error('sofort');
    return undefined;
  }, (error) => errors.push(error.message));

  const answer = await new Promise((resolve) => assert.equal(listener('async', {}, resolve), true));
  assert.equal(answer, 42);
  const failed = await new Promise((resolve) => assert.equal(listener('fails', {}, resolve), true));
  assert.equal(failed, undefined);
  assert.equal(listener('other', {}, () => assert.fail('keine Antwort erwartet')), false);
  assert.equal(listener('throws', {}, () => assert.fail('keine Antwort erwartet')), false);
  assert.deepEqual(errors, ['kaputt', 'sofort']);
});

test('core.parsePoe2db: Liste und Detailseite, unbekannte Art wirft', () => {
  const doc = (html) => new DOMParser().parseFromString(html, 'text/html');
  assert.deepEqual(core.parsePoe2db(core.PARSE_KINDS.LIST, doc(LIST_HTML)), core.parsePoe2dbList(listDocument()));
  assert.deepEqual(core.parsePoe2db(core.PARSE_KINDS.DETAIL, doc(readDetail(WOLF))), ['WolfOfOghamPet']);
  assert.throws(() => core.parsePoe2db('other', doc('')), /Unbekannte Parse-Art/);
});

test('Background domParse (Firefox): parst mit dem übergebenen DOMParser', async () => {
  const parse = domParse(DOMParser);
  assert.deepEqual(await parse(core.PARSE_KINDS.DETAIL, readDetail(WOLF)), ['WolfOfOghamPet']);
});

test('Offscreen-Dokument: beantwortet nur PARSE_HTML, mit Ergebnis oder Fehlertext', async () => {
  const handle = createParseHandler(DOMParser);
  assert.equal(handle({ type: core.MESSAGE_TYPES.PAGE_OPENED }), undefined);
  assert.equal(handle(null), undefined);
  assert.deepEqual(
    await handle({ type: core.MESSAGE_TYPES.PARSE_HTML, kind: core.PARSE_KINDS.DETAIL, html: readDetail(WOLF) }),
    { result: ['WolfOfOghamPet'] },
  );
  assert.deepEqual(
    await handle({ type: core.MESSAGE_TYPES.PARSE_HTML, kind: 'other', html: '' }),
    { error: 'Unbekannte Parse-Art: other' },
  );
});

function fakeChromium({ existing = false, reply } = {}) {
  const calls = { created: [], sent: [] };
  let open = existing;
  const handle = createParseHandler(DOMParser);
  return {
    calls,
    offscreen: {
      async createDocument(options) {
        calls.created.push(options);
        await Promise.resolve();
        open = true;
      },
    },
    runtime: {
      getURL: (file) => `chrome-extension://id/${file}`,
      async getContexts(filter) {
        assert.deepEqual(filter, { contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: ['chrome-extension://id/offscreen.html'] });
        return open ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [];
      },
      async sendMessage(message) {
        calls.sent.push(message.kind);
        return reply === undefined ? handle(message) : reply;
      },
    },
  };
}

test('Offscreen-Parser (Chromium): legt das Dokument einmal an, auch bei gleichzeitigen Aufrufen', async () => {
  const fake = fakeChromium();
  const parse = createOffscreenParser(fake);
  const [entries, ids] = await Promise.all([
    parse(core.PARSE_KINDS.LIST, LIST_HTML),
    parse(core.PARSE_KINDS.DETAIL, readDetail(WOLF)),
  ]);
  assert.deepEqual(entries, core.parsePoe2dbList(listDocument()));
  assert.deepEqual(ids, ['WolfOfOghamPet']);
  assert.equal(fake.calls.created.length, 1);
  assert.equal(fake.calls.created[0].url, OFFSCREEN_PATH);
  assert.deepEqual(fake.calls.created[0].reasons, ['DOM_PARSER']);
  assert.ok(fake.calls.created[0].justification);
  await parse(core.PARSE_KINDS.DETAIL, readDetail(WOLF));
  assert.equal(fake.calls.created.length, 1);
});

test('Offscreen-Parser (Chromium): vorhandenes Dokument wird genutzt, Fehler und fehlende Antwort werfen', async () => {
  const existing = fakeChromium({ existing: true });
  await createOffscreenParser(existing)(core.PARSE_KINDS.DETAIL, readDetail(WOLF));
  assert.equal(existing.calls.created.length, 0);

  await assert.rejects(createOffscreenParser(fakeChromium({ reply: { error: 'kaputt' } }))('list', ''), /kaputt/);
  await assert.rejects(createOffscreenParser(fakeChromium({ reply: null }))('list', ''), /antwortet nicht/);
});
