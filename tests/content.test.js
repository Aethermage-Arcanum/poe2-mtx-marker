'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const core = require('../lib/core.js');
const { createMarker, bootstrap, MARK_CLASS, LABEL_CLASS, NOTICE_ID, CSS_VARS } = require('../content.js');
const { listDocument, detailSlugs, readDetail, parseHtml, readDomFixture } = require('./helpers.js');

const listEntries = core.parsePoe2dbList(listDocument());
const idMap = {};
for (const slug of detailSlugs()) idMap[slug] = core.parseDetailShopIds(parseHtml(readDetail(slug)));
const FULL_PAYLOAD = core.indexToPayload(core.buildIndex(listEntries, idMap));
const ART_ONLY_PAYLOAD = core.indexToPayload(core.buildIndex(listEntries, {}));
const CACHED_AT = new Date(2026, 10, 12, 9, 5).getTime();

const WOLF = 'en_single_WolfOfOghamPet';
const PHOENIX = 'en_variant_PhoenixPetVariations';
const COMMANDER = 'de_variant_CommanderBootsVariations';
const CHAOTIC = 'de_bundle_ChaoticStormborneArmourPack';

function liveData(index) {
  return { index, source: core.DATA_SOURCES.LIVE, fetchedAt: Date.now(), error: null };
}

function createLogger() {
  const calls = [];
  return { calls, info: (...args) => calls.push(args), error: (...args) => calls.push(args) };
}

function setupPage(initialBody = '<div id="shop-item-loading"><div class="shopItemBase"></div></div>') {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${initialBody}</body></html>`);
  const logger = createLogger();
  const marker = createMarker({ document: dom.window.document, logger, MutationObserver: dom.window.MutationObserver });
  return { dom, document: dom.window.document, logger, marker };
}

function cardHtml(...names) {
  return names.map(readDomFixture).join('');
}

function flushMutations() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function labelOf(document, id) {
  const label = document.getElementById(id).querySelector(`:scope > .${LABEL_CLASS}`);
  return label ? label.textContent : null;
}

function isMarked(document, id) {
  return document.getElementById(id).classList.contains(MARK_CLASS);
}

test('Content: Karten in später erzeugtem #mtx-list werden markiert und beschriftet', async () => {
  const { document, marker } = setupPage();
  marker.start();
  marker.setData(liveData(FULL_PAYLOAD));
  document.body.insertAdjacentHTML('beforeend', `<div id="mtx-list">${cardHtml(WOLF, PHOENIX, CHAOTIC)}</div>`);
  await flushMutations();
  assert.equal(isMarked(document, 'WolfOfOghamPet'), true);
  assert.equal(labelOf(document, 'WolfOfOghamPet'), 'PoE2 ready');
  assert.equal(labelOf(document, 'PhoenixPetVariations'), 'PoE2 ready 3/3');
  assert.equal(labelOf(document, 'ChaoticStormborneArmourPack'), 'PoE2 ready 4/4');
  assert.equal(document.querySelector('#shop-item-loading .shopItemBase').classList.contains(MARK_CLASS), false);
  assert.deepEqual(marker.stats(), { matchedCards: 3, totalCards: 3 });
  marker.stop();
});

test('Content: 0 Treffer -> keine Markierung, kein Label', async () => {
  const { document, marker } = setupPage(`<div id="mtx-list">${cardHtml(CHAOTIC)}</div>`);
  marker.start();
  marker.setData(liveData(ART_ONLY_PAYLOAD));
  await flushMutations();
  assert.equal(isMarked(document, 'ChaoticStormborneArmourPack'), false);
  assert.equal(labelOf(document, 'ChaoticStormborneArmourPack'), null);
  assert.deepEqual(marker.stats(), { matchedCards: 0, totalCards: 1 });
  marker.stop();
});

test('Content: Endlos-Scroll hängt Karten an -> MutationObserver markiert sie', async () => {
  const { document, marker } = setupPage(`<div id="mtx-list">${cardHtml(WOLF)}</div>`);
  marker.start();
  marker.setData(liveData(FULL_PAYLOAD));
  document.getElementById('mtx-list').insertAdjacentHTML('beforeend', cardHtml(COMMANDER));
  await flushMutations();
  assert.equal(labelOf(document, 'CommanderBootsVariations'), 'PoE2 ready 2/2');
  marker.stop();
});

test('Content: per replaceWith ersetzte Karte wird erneut markiert', async () => {
  const { document, marker } = setupPage(`<div id="mtx-list">${cardHtml(PHOENIX)}</div>`);
  marker.start();
  marker.setData(liveData(FULL_PAYLOAD));
  await flushMutations();
  const fresh = parseHtml(readDomFixture(PHOENIX)).body.firstElementChild;
  document.getElementById('PhoenixPetVariations').replaceWith(document.importNode(fresh, true));
  await flushMutations();
  assert.equal(isMarked(document, 'PhoenixPetVariations'), true);
  assert.equal(labelOf(document, 'PhoenixPetVariations'), 'PoE2 ready 3/3');
  assert.equal(document.getElementById('PhoenixPetVariations').querySelectorAll(`.${LABEL_CLASS}`).length, 1);
  marker.stop();
});

test('Content: Liste geleert und neu befüllt (Suche/Gildenwechsel) -> neue Karten markiert', async () => {
  const { document, marker } = setupPage(`<div id="mtx-list">${cardHtml(WOLF)}</div>`);
  marker.start();
  marker.setData(liveData(FULL_PAYLOAD));
  const list = document.getElementById('mtx-list');
  list.innerHTML = '';
  list.insertAdjacentHTML('beforeend', cardHtml(COMMANDER, WOLF));
  await flushMutations();
  assert.equal(labelOf(document, 'CommanderBootsVariations'), 'PoE2 ready 2/2');
  assert.equal(labelOf(document, 'WolfOfOghamPet'), 'PoE2 ready');
  marker.stop();
});

test('Content: nicht gematchte Karte wird einmal pro Karten-ID mit ID und Namen protokolliert', async () => {
  const { document, logger, marker } = setupPage(`<div id="mtx-list">${cardHtml(CHAOTIC, WOLF)}</div>`);
  marker.start();
  marker.setData(liveData(ART_ONLY_PAYLOAD));
  const fresh = parseHtml(readDomFixture(CHAOTIC)).body.firstElementChild;
  document.getElementById('ChaoticStormborneArmourPack').replaceWith(document.importNode(fresh, true));
  document.getElementById('mtx-list').insertAdjacentHTML('beforeend', cardHtml(COMMANDER));
  await flushMutations();
  marker.setData(liveData(ART_ONLY_PAYLOAD));
  const unmatchedLogs = logger.calls.filter((args) => args.includes('ChaoticStormborneArmourPack'));
  assert.equal(unmatchedLogs.length, 1);
  assert.ok(unmatchedLogs[0].includes("'Chaotischer Sturmgeborener'-Rüstungsset"));
  assert.equal(logger.calls.some((args) => args.includes('WolfOfOghamPet')), false);
  marker.stop();
});

test('Content: ohne Daten (Quelle none) keine Markierung und kein Protokoll', async () => {
  const { document, logger, marker } = setupPage(`<div id="mtx-list">${cardHtml(WOLF)}</div>`);
  marker.start();
  marker.setData({ index: null, source: core.DATA_SOURCES.NONE, fetchedAt: null, error: 'NetworkError' });
  await flushMutations();
  assert.equal(isMarked(document, 'WolfOfOghamPet'), false);
  assert.equal(logger.calls.length, 0);
  assert.equal(document.getElementById(NOTICE_ID), null);
  marker.stop();
});

test('Content: Hinweis "Stand vom" nur bei Quelle cache', async () => {
  const { document, marker } = setupPage(`<div id="mtx-list">${cardHtml(WOLF)}</div>`);
  marker.start();
  marker.setData(liveData(FULL_PAYLOAD));
  assert.equal(document.getElementById(NOTICE_ID), null);
  marker.setData({ index: FULL_PAYLOAD, source: core.DATA_SOURCES.CACHE, fetchedAt: CACHED_AT, error: 'HTTP 503' });
  assert.equal(document.getElementById(NOTICE_ID).textContent, 'Stand vom 12.11.2026 09:05');
  assert.equal(isMarked(document, 'WolfOfOghamPet'), true);
  marker.setData(liveData(FULL_PAYLOAD));
  assert.equal(document.getElementById(NOTICE_ID), null);
  marker.stop();
});

test('Content: neue Daten bewerten vorhandene Karten neu (Treffer verschwindet / erscheint)', async () => {
  const { document, marker } = setupPage(`<div id="mtx-list">${cardHtml(CHAOTIC)}</div>`);
  marker.start();
  marker.setData(liveData(ART_ONLY_PAYLOAD));
  assert.equal(isMarked(document, 'ChaoticStormborneArmourPack'), false);
  marker.setData(liveData(FULL_PAYLOAD));
  assert.equal(labelOf(document, 'ChaoticStormborneArmourPack'), 'PoE2 ready 4/4');
  marker.setData(liveData(ART_ONLY_PAYLOAD));
  assert.equal(isMarked(document, 'ChaoticStormborneArmourPack'), false);
  assert.equal(labelOf(document, 'ChaoticStormborneArmourPack'), null);
  marker.stop();
});

test('Content: Einstellungen setzen Farbe und Glow als CSS-Variablen', () => {
  const { document, marker } = setupPage();
  marker.setSettings({ color: '#00ff00', intensity: 100 });
  const style = document.documentElement.style;
  assert.equal(style.getPropertyValue(CSS_VARS.COLOR), '#00ff00');
  assert.equal(style.getPropertyValue(CSS_VARS.SHADOW), core.glowStyle({ color: '#00ff00', intensity: 100 }).boxShadow);
});

function createFakeBrowser({ storedSettings, pageData }) {
  const listeners = { storage: [], message: [] };
  const sent = [];
  return {
    listeners,
    sent,
    storage: {
      local: { get: async (key) => (storedSettings === undefined ? {} : { [key]: storedSettings }) },
      onChanged: { addListener: (fn) => listeners.storage.push(fn) },
    },
    runtime: {
      sendMessage: async (message) => {
        sent.push(message);
        return pageData;
      },
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
    },
  };
}

test('Content-Bootstrap: meldet Seitenaufruf, übernimmt Daten, Einstellungen live, Datenupdate, Statistik', async () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="mtx-list">${cardHtml(WOLF, CHAOTIC)}</div></body></html>`);
  const document = dom.window.document;
  const browser = createFakeBrowser({ storedSettings: { color: '#112233', intensity: 10 }, pageData: liveData(ART_ONLY_PAYLOAD) });
  const marker = await bootstrap({ browser, document, logger: createLogger(), MutationObserver: dom.window.MutationObserver });

  assert.deepEqual(browser.sent, [{ type: core.MESSAGE_TYPES.PAGE_OPENED }]);
  assert.equal(document.documentElement.style.getPropertyValue(CSS_VARS.COLOR), '#112233');
  assert.equal(isMarked(document, 'WolfOfOghamPet'), true);
  assert.equal(isMarked(document, 'ChaoticStormborneArmourPack'), false);

  for (const fn of browser.listeners.storage) {
    fn({ [core.STORAGE_KEYS.SETTINGS]: { newValue: { color: '#abcdef', intensity: 70 } } }, 'local');
  }
  assert.equal(document.documentElement.style.getPropertyValue(CSS_VARS.COLOR), '#abcdef');

  for (const fn of browser.listeners.message) fn({ type: core.MESSAGE_TYPES.DATA_UPDATED, data: liveData(FULL_PAYLOAD) });
  assert.equal(labelOf(document, 'ChaoticStormborneArmourPack'), 'PoE2 ready 4/4');

  const replies = browser.listeners.message.map((fn) => fn({ type: core.MESSAGE_TYPES.GET_STATS }));
  assert.deepEqual(await replies.find((r) => r), { matchedCards: 2, totalCards: 2 });
  marker.stop();
});

function emptyShell(document, name) {
  const real = parseHtml(readDomFixture(name)).body.firstElementChild;
  return { shell: document.importNode(real.cloneNode(false), true), innerHtml: real.innerHTML };
}

function assertMarkAndLabelConsistent(document) {
  for (const el of document.querySelectorAll(core.SHOP_SELECTORS.CARD)) {
    const labels = el.querySelectorAll(`:scope > .${LABEL_CLASS}`).length;
    assert.equal(labels, el.classList.contains(MARK_CLASS) ? 1 : 0, `Karte ${el.id}: Klasse und Label inkonsistent`);
  }
}

test('Content: leer angehängte Karte wird erst nach dem Befüllen bewertet (Variante -> 3/3, kein Log in der Leerphase)', async () => {
  const { document, logger, marker } = setupPage('<div id="mtx-list"></div>');
  marker.start();
  marker.setData(liveData(FULL_PAYLOAD));
  const { shell, innerHtml } = emptyShell(document, PHOENIX);
  document.getElementById('mtx-list').appendChild(shell);
  await flushMutations();
  assert.equal(isMarked(document, 'PhoenixPetVariations'), false);
  assert.equal(logger.calls.length, 0);
  shell.innerHTML = innerHtml;
  await flushMutations();
  assert.equal(isMarked(document, 'PhoenixPetVariations'), true);
  assert.equal(labelOf(document, 'PhoenixPetVariations'), 'PoE2 ready 3/3');
  assert.equal(logger.calls.length, 0);
  assertMarkAndLabelConsistent(document);
  marker.stop();
});

test('Content: leer angehängtes Einzelitem bekommt nach dem Befüllen Klasse und Label', async () => {
  const { document, logger, marker } = setupPage('<div id="mtx-list"></div>');
  marker.start();
  marker.setData(liveData(FULL_PAYLOAD));
  const { shell, innerHtml } = emptyShell(document, WOLF);
  document.getElementById('mtx-list').appendChild(shell);
  await flushMutations();
  assert.equal(isMarked(document, 'WolfOfOghamPet'), false);
  shell.innerHTML = innerHtml;
  await flushMutations();
  assert.equal(isMarked(document, 'WolfOfOghamPet'), true);
  assert.equal(labelOf(document, 'WolfOfOghamPet'), 'PoE2 ready');
  assert.equal(logger.calls.length, 0);
  assertMarkAndLabelConsistent(document);
  marker.stop();
});

test('Content: Inhalt einer markierten Karte per innerHTML ersetzt -> Label wieder da, genau eins', async () => {
  const { document, marker } = setupPage(`<div id="mtx-list">${cardHtml(WOLF, PHOENIX)}</div>`);
  marker.start();
  marker.setData(liveData(FULL_PAYLOAD));
  await flushMutations();
  for (const [id, name, expected] of [['WolfOfOghamPet', WOLF, 'PoE2 ready'], ['PhoenixPetVariations', PHOENIX, 'PoE2 ready 3/3']]) {
    document.getElementById(id).innerHTML = emptyShell(document, name).innerHtml;
    await flushMutations();
    assert.equal(labelOf(document, id), expected);
    assert.equal(document.getElementById(id).querySelectorAll(`.${LABEL_CLASS}`).length, 1);
  }
  assertMarkAndLabelConsistent(document);
  marker.stop();
});

test('Content: Mutation bewertet nur betroffene Karten neu, eigene Labels lösen keine Schleife aus', async () => {
  const { document, marker } = setupPage(`<div id="mtx-list">${cardHtml(WOLF, PHOENIX, CHAOTIC)}</div>`);
  marker.start();
  marker.setData(liveData(FULL_PAYLOAD));
  await flushMutations();
  const original = core.extractCard;
  let calls = 0;
  core.extractCard = (el) => {
    calls += 1;
    return original(el);
  };
  try {
    await flushMutations();
    assert.equal(calls, 0);
    document.getElementById('mtx-list').insertAdjacentHTML('beforeend', cardHtml(COMMANDER));
    await flushMutations();
    await flushMutations();
    await flushMutations();
    assert.equal(calls, 1);
    assert.equal(labelOf(document, 'CommanderBootsVariations'), 'PoE2 ready 2/2');
  } finally {
    core.extractCard = original;
  }
  assertMarkAndLabelConsistent(document);
  marker.stop();
});
