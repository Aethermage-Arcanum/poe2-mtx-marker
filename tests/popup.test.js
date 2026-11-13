'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const core = require('../lib/core.js');
const { loadPopupState, renderPopup, POPUP_IDS } = require('../popup.js');
const { translator } = require('./helpers.js');

const POPUP_HTML = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
const FETCHED_AT = new Date(2026, 10, 13, 8, 7).getTime();

function popupDocument() {
  return new JSDOM(POPUP_HTML).window.document;
}

function render(document, state, locale) {
  renderPopup(document, state, translator(locale));
}

function text(document, id) {
  return document.getElementById(id).textContent.trim();
}

function visible(document, id) {
  return !document.getElementById(id).hidden;
}

test('Popup: live -> Treffer, Karten gesamt, Datenstand, Quelle live, keine Fehlermeldung', () => {
  const document = popupDocument();
  render(document, {
    permitted: true,
    status: { source: core.DATA_SOURCES.LIVE, fetchedAt: FETCHED_AT, error: null },
    stats: { matchedCards: 12, totalCards: 40 },
  });
  assert.equal(text(document, POPUP_IDS.MATCHED), '12');
  assert.equal(text(document, POPUP_IDS.TOTAL), '40');
  assert.equal(text(document, POPUP_IDS.FETCHED_AT), '13.11.2026 08:07');
  assert.equal(text(document, POPUP_IDS.SOURCE), 'live');
  assert.equal(visible(document, POPUP_IDS.STALE), false);
  assert.equal(visible(document, POPUP_IDS.ERROR), false);
  assert.equal(visible(document, POPUP_IDS.PERMISSION), false);
});

test('Popup: Cache -> gut sichtbarer Hinweis "Stand vom" und Fehlergrund', () => {
  const document = popupDocument();
  render(document, {
    permitted: true,
    status: { source: core.DATA_SOURCES.CACHE, fetchedAt: FETCHED_AT, error: 'HTTP 503' },
    stats: { matchedCards: 1, totalCards: 2 },
  });
  assert.equal(text(document, POPUP_IDS.SOURCE), 'Cache');
  assert.equal(visible(document, POPUP_IDS.STALE), true);
  assert.equal(text(document, POPUP_IDS.STALE), 'Stand vom 13.11.2026 08:07');
  assert.equal(visible(document, POPUP_IDS.ERROR), true);
  assert.match(text(document, POPUP_IDS.ERROR), /HTTP 503/);
});

test('Popup: keine Daten -> Fehlermeldung', () => {
  const document = popupDocument();
  render(document, {
    permitted: true,
    status: { source: core.DATA_SOURCES.NONE, fetchedAt: null, error: 'NetworkError' },
    stats: { matchedCards: 0, totalCards: 30 },
  });
  assert.equal(visible(document, POPUP_IDS.ERROR), true);
  assert.match(text(document, POPUP_IDS.ERROR), /Keine Daten/);
  assert.match(text(document, POPUP_IDS.ERROR), /NetworkError/);
  assert.equal(text(document, POPUP_IDS.SOURCE), '-');
  assert.equal(text(document, POPUP_IDS.FETCHED_AT), '-');
});

test('Popup: noch nie geladen und kein Shop-Tab -> Hinweise statt Zahlen', () => {
  const document = popupDocument();
  render(document, { permitted: true, status: null, stats: null });
  assert.equal(text(document, POPUP_IDS.MATCHED), '-');
  assert.equal(text(document, POPUP_IDS.TOTAL), '-');
  assert.equal(visible(document, POPUP_IDS.NO_SHOP_TAB), true);
  assert.equal(visible(document, POPUP_IDS.ERROR), true);
});

test('Popup: fehlende Host-Berechtigung wird klar gemeldet', () => {
  const document = popupDocument();
  render(document, { permitted: false, status: null, stats: null });
  assert.equal(visible(document, POPUP_IDS.PERMISSION), true);
  assert.match(text(document, POPUP_IDS.PERMISSION), /Berechtigung/);
});

test('loadPopupState: prüft Host-Berechtigungen, liest Status, fragt Statistik im aktiven Tab ab', async () => {
  const calls = [];
  const status = { source: core.DATA_SOURCES.LIVE, fetchedAt: FETCHED_AT, error: null };
  const browser = {
    permissions: {
      contains: async (query) => {
        calls.push(['contains', query]);
        return true;
      },
    },
    storage: { local: { get: async (key) => ({ [key]: status }) } },
    tabs: {
      query: async () => [{ id: 7 }],
      sendMessage: async (tabId, message) => {
        calls.push(['sendMessage', tabId, message]);
        return { matchedCards: 3, totalCards: 9 };
      },
    },
  };
  const state = await loadPopupState(browser);
  assert.deepEqual(state, { permitted: true, status, stats: { matchedCards: 3, totalCards: 9 } });
  assert.deepEqual(calls[0], ['contains', { origins: core.HOST_PERMISSIONS }]);
  assert.deepEqual(calls[1], ['sendMessage', 7, { type: core.MESSAGE_TYPES.GET_STATS }]);
});

test('loadPopupState: kein Content-Script im aktiven Tab -> stats null', async () => {
  const browser = {
    permissions: { contains: async () => true },
    storage: { local: { get: async () => ({}) } },
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async () => {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      },
    },
  };
  assert.deepEqual(await loadPopupState(browser), { permitted: true, status: null, stats: null });
});
