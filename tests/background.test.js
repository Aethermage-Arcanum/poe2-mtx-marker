'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core.js');
const { createBackgroundService, DETAIL_FETCH_INTERVAL_MS, RECHECK_INTERVAL_MS, RECHECK_OLD_PER_RUN } = require('../background.js');
const { POE2DB_LIST_FIXTURE, readText, detailSlugs, readDetail, parseHtml, listDocument } = require('./helpers.js');

const LIST_HTML = readText(POE2DB_LIST_FIXTURE);
const LIST_SLUGS = [...new Set(core.parsePoe2dbList(listDocument()).map((e) => e.slug))];
const FIXTURE_DETAIL_SLUGS = new Set(detailSlugs());
const BACKFILL_SLUGS = ['Wolf_of_Ogham_Pet', 'Phoenix_Pet', 'Nursery_Web_Spider_Pet', 'Hideout_Music_Player'];
// Nachladen erfolgt in Listenreihenfolge.
const BACKFILL_SLUGS_IN_LIST_ORDER = LIST_SLUGS.filter((slug) => BACKFILL_SLUGS.includes(slug));
const START_TIME = new Date(2026, 10, 13, 12, 0).getTime();

function shippedMapWithout(excluded) {
  const map = {};
  for (const slug of LIST_SLUGS) if (!excluded.includes(slug)) map[slug] = [];
  return { generatedAt: '2026-11-13T00:00:00.000Z', map };
}

function createStorage(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? { [key]: structuredClone(data[key]) } : {};
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    },
  };
}

function createGate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function createEnv({ listFails = false, shipped = shippedMapWithout(BACKFILL_SLUGS), storage = createStorage(), gate = null } = {}) {
  let clock = START_TIME;
  const requests = [];
  const notifications = [];
  let detailsInFlight = 0;
  let maxDetailsInFlight = 0;
  const env = {
    requests,
    notifications,
    storage,
    get maxInFlight() {
      return maxDetailsInFlight;
    },
    listFails,
    service: null,
  };
  env.service = createBackgroundService({
    async fetchText(url) {
      requests.push({ url, at: clock });
      if (url === core.POE2DB_LIST_URL) {
        await Promise.resolve();
        if (env.listFails) throw new Error('HTTP 503');
        return LIST_HTML;
      }
      detailsInFlight += 1;
      maxDetailsInFlight = Math.max(maxDetailsInFlight, detailsInFlight);
      if (gate) await gate.promise;
      await Promise.resolve();
      detailsInFlight -= 1;
      const slug = url.slice('https://poe2db.tw/us/'.length);
      if (!FIXTURE_DETAIL_SLUGS.has(slug)) throw new Error('HTTP 404');
      return readDetail(slug);
    },
    parse: async (kind, html) => core.parsePoe2db(kind, parseHtml(html)),
    storage,
    loadShippedMap: async () => shipped,
    notifyTabs: async (data) => {
      notifications.push(data);
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    logger: { info() {}, error() {} },
  });
  return env;
}

function detailRequests(env) {
  return env.requests.filter((r) => r.url !== core.POE2DB_LIST_URL);
}

test('Background: Seitenaufruf lädt die Liste live, speichert sie mit Zeitstempel und liefert Index', async () => {
  const env = createEnv();
  const data = await env.service.handlePageOpened();
  assert.equal(data.source, core.DATA_SOURCES.LIVE);
  assert.equal(data.fetchedAt, START_TIME);
  assert.equal(data.error, null);
  assert.ok(data.index.artKeys.includes('2ditems/pets/geonorwolf'));
  const cache = env.storage.data[core.STORAGE_KEYS.LIST_CACHE];
  assert.equal(cache.fetchedAt, START_TIME);
  assert.equal(cache.entries.length, core.parsePoe2dbList(listDocument()).length);
  assert.deepEqual(env.storage.data[core.STORAGE_KEYS.STATUS], {
    source: core.DATA_SOURCES.LIVE,
    fetchedAt: START_TIME,
    error: null,
    checkedAt: START_TIME,
  });
  await env.service.backfillIdle();
});

test('Background: fehlende Slugs werden sequentiell mit >= 1200 ms Abstand nachgeladen und gespeichert', async () => {
  const env = createEnv();
  await env.service.handlePageOpened();
  await env.service.backfillIdle();

  const details = detailRequests(env);
  assert.deepEqual(details.map((r) => r.url), BACKFILL_SLUGS_IN_LIST_ORDER.map((s) => `https://poe2db.tw/us/${s}`));
  assert.equal(DETAIL_FETCH_INTERVAL_MS >= 1200, true);
  for (let i = 1; i < details.length; i += 1) {
    assert.ok(details[i].at - details[i - 1].at >= 1200, `Abstand ${i}: ${details[i].at - details[i - 1].at} ms`);
  }
  assert.equal(env.maxInFlight, 1);

  assert.deepEqual(env.storage.data[core.STORAGE_KEYS.RUNTIME_ID_MAP], {
    Wolf_of_Ogham_Pet: ['WolfOfOghamPet'],
    Phoenix_Pet: ['PhoenixPet'],
    Nursery_Web_Spider_Pet: [],
  });
});

test('Background: nach dem Nachlade-Lauf werden offene Shop-Tabs mit neuem Index benachrichtigt', async () => {
  const env = createEnv();
  const first = await env.service.handlePageOpened();
  assert.equal(first.index.shopIds.includes('WolfOfOghamPet'), false);
  await env.service.backfillIdle();
  assert.equal(env.notifications.length, 1);
  assert.equal(env.notifications[0].source, core.DATA_SOURCES.LIVE);
  assert.ok(env.notifications[0].index.shopIds.includes('WolfOfOghamPet'));
  assert.ok(env.notifications[0].index.shopIds.includes('PhoenixPet'));
});

test('Background: Fetch-Fehler beim Nachladen speichert nichts, nächster Seitenaufruf versucht erneut', async () => {
  const env = createEnv();
  await env.service.handlePageOpened();
  await env.service.backfillIdle();
  env.requests.length = 0;
  await env.service.handlePageOpened();
  await env.service.backfillIdle();
  assert.deepEqual(detailRequests(env).map((r) => r.url), ['https://poe2db.tw/us/Hideout_Music_Player']);
});

test('Background: gleichzeitige Seitenaufrufe -> ein Listen-Fetch, ein Nachlade-Lauf', async () => {
  const env = createEnv();
  const results = await Promise.all([env.service.handlePageOpened(), env.service.handlePageOpened(), env.service.handlePageOpened()]);
  assert.equal(env.requests.filter((r) => r.url === core.POE2DB_LIST_URL).length, 1);
  assert.deepEqual(results[0], results[2]);
  await env.service.backfillIdle();
  assert.equal(detailRequests(env).length, BACKFILL_SLUGS.length);
  assert.equal(env.maxInFlight, 1);
});

test('Background: Seitenaufruf während laufendem Nachlade-Lauf startet keinen zweiten Lauf', async () => {
  const gate = createGate();
  const env = createEnv({ gate });
  await env.service.handlePageOpened();
  await env.service.handlePageOpened();
  assert.equal(env.requests.filter((r) => r.url === core.POE2DB_LIST_URL).length, 2);
  assert.equal(detailRequests(env).length, 1);
  gate.release();
  await env.service.backfillIdle();
  assert.deepEqual(detailRequests(env).map((r) => r.url), BACKFILL_SLUGS_IN_LIST_ORDER.map((s) => `https://poe2db.tw/us/${s}`));
  assert.equal(env.maxInFlight, 1);
});

test('Background: jeder spätere Seitenaufruf lädt die Liste erneut live', async () => {
  const env = createEnv({ shipped: shippedMapWithout([]) });
  await env.service.handlePageOpened();
  await env.service.handlePageOpened();
  assert.equal(env.requests.filter((r) => r.url === core.POE2DB_LIST_URL).length, 2);
  assert.equal(detailRequests(env).length, 0);
});

test('Background: Listen-Fetch-Fehler mit Cache -> Quelle cache mit Cache-Zeitstempel', async () => {
  const env = createEnv({ shipped: shippedMapWithout([]) });
  await env.service.handlePageOpened();
  env.listFails = true;
  const data = await env.service.handlePageOpened();
  assert.equal(data.source, core.DATA_SOURCES.CACHE);
  assert.equal(data.fetchedAt, START_TIME);
  assert.equal(data.error, 'HTTP 503');
  assert.ok(data.index.artKeys.includes('2ditems/pets/geonorwolf'));
  assert.equal(env.storage.data[core.STORAGE_KEYS.STATUS].source, core.DATA_SOURCES.CACHE);
});

test('Background: Listen-Fetch-Fehler ohne Cache -> keine Daten, Fehler im Status', async () => {
  const env = createEnv({ listFails: true });
  const data = await env.service.handlePageOpened();
  assert.deepEqual(data, { index: null, source: core.DATA_SOURCES.NONE, fetchedAt: null, error: 'HTTP 503' });
  await env.service.backfillIdle();
  assert.equal(detailRequests(env).length, 0);
  assert.equal(env.storage.data[core.STORAGE_KEYS.STATUS].source, core.DATA_SOURCES.NONE);
  assert.equal(env.storage.data[core.STORAGE_KEYS.STATUS].error, 'HTTP 503');
});

test('Background: Laufzeit-Ergänzung aus storage.local zählt als vorhanden und fließt in den Index', async () => {
  const storage = createStorage({
    [core.STORAGE_KEYS.RUNTIME_ID_MAP]: { Wolf_of_Ogham_Pet: ['WolfOfOghamPet'], Phoenix_Pet: ['PhoenixPet'] },
  });
  const env = createEnv({ storage });
  const data = await env.service.handlePageOpened();
  await env.service.backfillIdle();
  assert.ok(data.index.shopIds.includes('WolfOfOghamPet'));
  assert.deepEqual(detailRequests(env).map((r) => r.url), [
    'https://poe2db.tw/us/Nursery_Web_Spider_Pet',
    'https://poe2db.tw/us/Hideout_Music_Player',
  ]);
});

const HOUR_MS = 60 * 60 * 1000;
const RECHECK_PRIORITY = ['Stormborne_Helmet', 'Celestial_Body_Armour'];

function shopIdsOf(slug) {
  return core.parseDetailShopIds(parseHtml(readDetail(slug)));
}

function detailUrls(env) {
  return detailRequests(env).map((r) => r.url.slice('https://poe2db.tw/us/'.length));
}

test('Nachprüfung: erster Seitenaufruf merkt nur die Startzeit, prüft noch nichts nach', async () => {
  const env = createEnv({ shipped: shippedMapWithout([]) });
  await env.service.handlePageOpened();
  await env.service.backfillIdle();
  assert.equal(detailRequests(env).length, 0);
  assert.deepEqual(env.storage.data[core.STORAGE_KEYS.RECHECK], { lastRunAt: START_TIME, checkedAt: {} });
});

test('Nachprüfung: innerhalb von 24 h nach dem letzten Lauf keine Abrufe', async () => {
  const lastRunAt = START_TIME - RECHECK_INTERVAL_MS + 1;
  const storage = createStorage({ [core.STORAGE_KEYS.RECHECK]: { lastRunAt, checkedAt: {} } });
  const env = createEnv({ shipped: shippedMapWithout([]), storage });
  await env.service.handlePageOpened();
  await env.service.backfillIdle();
  assert.equal(detailRequests(env).length, 0);
  assert.equal(env.storage.data[core.STORAGE_KEYS.RECHECK].lastRunAt, lastRunAt);
});

test('Nachprüfung: nach 24 h alle neuen Einträge ohne Shop-ID, dazu die am längsten nicht geprüften alten', async () => {
  const recent = START_TIME - HOUR_MS;
  const checkedAt = {};
  for (const slug of LIST_SLUGS) if (!BACKFILL_SLUGS.includes(slug) && !RECHECK_PRIORITY.includes(slug)) checkedAt[slug] = recent;
  const storage = createStorage({
    [core.STORAGE_KEYS.RUNTIME_ID_MAP]: { Wolf_of_Ogham_Pet: [], Phoenix_Pet: ['PhoenixPet'], Nursery_Web_Spider_Pet: [], Hideout_Music_Player: [] },
    [core.STORAGE_KEYS.RECHECK]: { lastRunAt: START_TIME - RECHECK_INTERVAL_MS, checkedAt },
  });
  const env = createEnv({ storage });
  await env.service.handlePageOpened();
  await env.service.backfillIdle();

  const newEmpty = BACKFILL_SLUGS_IN_LIST_ORDER.filter((slug) => slug !== 'Phoenix_Pet');
  const oldEmpty = [
    ...LIST_SLUGS.filter((slug) => RECHECK_PRIORITY.includes(slug)),
    ...LIST_SLUGS.filter((slug) => !BACKFILL_SLUGS.includes(slug) && !RECHECK_PRIORITY.includes(slug)),
  ].slice(0, RECHECK_OLD_PER_RUN);
  assert.deepEqual(detailUrls(env), [...newEmpty, ...oldEmpty]);
  const details = detailRequests(env);
  for (let i = 1; i < details.length; i += 1) assert.ok(details[i].at - details[i - 1].at >= DETAIL_FETCH_INTERVAL_MS);

  const runtimeMap = env.storage.data[core.STORAGE_KEYS.RUNTIME_ID_MAP];
  for (const slug of ['Wolf_of_Ogham_Pet', ...RECHECK_PRIORITY]) {
    assert.ok(shopIdsOf(slug).length > 0, slug);
    assert.deepEqual(runtimeMap[slug], shopIdsOf(slug));
  }
  assert.deepEqual(runtimeMap.Nursery_Web_Spider_Pet, []);
  const state = env.storage.data[core.STORAGE_KEYS.RECHECK];
  assert.equal(state.lastRunAt, START_TIME);
  assert.ok(state.checkedAt.Nursery_Web_Spider_Pet >= START_TIME);
  assert.equal(state.checkedAt.Hideout_Music_Player, undefined, 'fehlgeschlagener Abruf zählt nicht als geprüft');
  assert.equal(env.notifications.length, 1);
  assert.ok(env.notifications[0].index.shopIds.includes('WolfOfOghamPet'));
});

test('Nachprüfung: nicht mit Cache-Daten (poe2db nicht erreichbar)', async () => {
  const storage = createStorage({
    [core.STORAGE_KEYS.LIST_CACHE]: { entries: core.parsePoe2dbList(listDocument()), fetchedAt: START_TIME - HOUR_MS },
    [core.STORAGE_KEYS.RECHECK]: { lastRunAt: START_TIME - RECHECK_INTERVAL_MS, checkedAt: {} },
  });
  const env = createEnv({ listFails: true, shipped: shippedMapWithout([]), storage });
  const data = await env.service.handlePageOpened();
  await env.service.backfillIdle();
  assert.equal(data.source, core.DATA_SOURCES.CACHE);
  assert.equal(detailRequests(env).length, 0);
});
