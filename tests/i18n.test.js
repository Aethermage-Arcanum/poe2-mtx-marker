'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const core = require('../lib/core.js');
const { renderPopup, POPUP_IDS } = require('../popup.js');
const { initOptions } = require('../options.js');
const { readText, readMessages, translator } = require('./helpers.js');

const ROOT = path.join(__dirname, '..');
const LOCALES = ['de', 'en'];
const SOURCE_FILES = ['manifest.json', 'popup.html', 'popup.js', 'options.html', 'options.js', 'content.js', 'lib/core.js'];
const FETCHED_AT = new Date(2026, 10, 13, 8, 7).getTime();

const manifest = JSON.parse(readText(path.join(ROOT, 'manifest.json')));
const sources = Object.fromEntries(SOURCE_FILES.map((f) => [f, readText(path.join(ROOT, f))]));

function placeholderNames(entry) {
  return Object.keys(entry.placeholders || {}).sort();
}

test('i18n: default_locale vorhanden, alle Sprachen haben dieselben Schlüssel und Platzhalter', () => {
  assert.equal(manifest.default_locale, 'en');
  const available = fs.readdirSync(path.join(ROOT, '_locales')).sort();
  assert.deepEqual(available, [...LOCALES].sort());
  const [first, ...rest] = LOCALES.map(readMessages);
  for (const other of rest) {
    assert.deepEqual(Object.keys(other).sort(), Object.keys(first).sort());
    for (const key of Object.keys(first)) assert.deepEqual(placeholderNames(other[key]), placeholderNames(first[key]), key);
  }
});

test('i18n: jeder verwendete Schlüssel existiert, jeder vorhandene wird verwendet', () => {
  const messages = readMessages('en');
  const used = new Set();
  for (const html of [sources['popup.html'], sources['options.html']]) {
    for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(key);
  }
  for (const [, key] of sources['manifest.json'].matchAll(/__MSG_(\w+)__/g)) used.add(key);
  for (const key of used) assert.ok(messages[key], `fehlt: ${key}`);
  const allSource = Object.values(sources).join('\n');
  for (const key of Object.keys(messages)) assert.ok(allSource.includes(`'${key}'`) || used.has(key), `unbenutzt: ${key}`);
});

test('i18n: Popup auf Englisch, Datum und Hinweis im englischen Format, keine rohen Schlüssel', () => {
  const document = new JSDOM(readText(path.join(ROOT, 'popup.html'))).window.document;
  renderPopup(document, {
    permitted: true,
    status: { source: core.DATA_SOURCES.CACHE, fetchedAt: FETCHED_AT, error: 'HTTP 503' },
    stats: { matchedCards: 3, totalCards: 10 },
  }, translator('en'));
  const text = (id) => document.getElementById(id).textContent;
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(text(POPUP_IDS.SOURCE), 'cache');
  assert.equal(text(POPUP_IDS.FETCHED_AT), '2026-11-13 08:07');
  assert.equal(text(POPUP_IDS.STALE), 'Data as of 2026-11-13 08:07');
  assert.equal(text(POPUP_IDS.ERROR), 'Live fetch from poe2db.tw failed, using cached data. Reason: HTTP 503');
  assert.equal(document.querySelector('[data-i18n="popupMatched"]').textContent, 'Matches');
  const keys = new Set(Object.keys(readMessages('en')));
  for (const el of document.querySelectorAll('[data-i18n]')) assert.ok(!keys.has(el.textContent), el.textContent);
});

test('i18n: Optionen auf Deutsch und Englisch lokalisiert', async () => {
  for (const [locale, title, preview] of [['de', 'PoE2 MTX Marker - Einstellungen', 'Shop-Karte'], ['en', 'PoE2 MTX Marker - Settings', 'Shop card']]) {
    const document = new JSDOM(readText(path.join(ROOT, 'options.html'))).window.document;
    await initOptions({ document, storage: { get: async () => ({}), set: async () => {} }, t: translator(locale) });
    assert.equal(document.title, title);
    assert.equal(document.documentElement.lang, locale);
    assert.equal(document.querySelector('[data-i18n="optionsPreviewCard"]').textContent, preview);
  }
});

test('createTranslator: fehlender Text zeigt den Schlüssel', () => {
  const t = core.createTranslator(() => '');
  assert.equal(t('gibtEsNicht'), 'gibtEsNicht');
});
