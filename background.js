(function (root) {
  'use strict';

  const core = root.PoE2Mtx || require('./lib/core.js');

  const DETAIL_FETCH_INTERVAL_MS = 1200;
  const SHIPPED_ID_MAP_PATH = 'data/poe2db-shopid-map.json';
  const LOG_PREFIX = '[PoE2 MTX Marker]';
  const HTML_MIME_TYPE = 'text/html';

  function errorText(error) {
    return error && error.message ? error.message : String(error);
  }

  function createBackgroundService({ fetchText, parseHtml, storage, loadShippedMap, notifyTabs, now, sleep, logger }) {
    let listInFlight = null;
    let backfillInFlight = null;
    let shippedMap = null;
    let currentState = null;
    let lastPoe2dbRequestAt = null;

    async function throttledFetch(url) {
      if (lastPoe2dbRequestAt !== null) {
        const wait = lastPoe2dbRequestAt + DETAIL_FETCH_INTERVAL_MS - now();
        if (wait > 0) await sleep(wait);
      }
      lastPoe2dbRequestAt = now();
      return fetchText(url);
    }

    async function readKey(key) {
      const result = await storage.get(key);
      return result[key];
    }

    async function getShippedMap() {
      if (!shippedMap) {
        try {
          shippedMap = (await loadShippedMap()).map;
        } catch (error) {
          logger.error(LOG_PREFIX, 'Mitgelieferte ID-Map nicht lesbar:', errorText(error));
          return {};
        }
      }
      return shippedMap;
    }

    async function mergedIdMap() {
      const runtimeMap = (await readKey(core.STORAGE_KEYS.RUNTIME_ID_MAP)) || {};
      return { ...(await getShippedMap()), ...runtimeMap };
    }

    async function refreshList() {
      let fetchResult;
      try {
        const html = await fetchText(core.POE2DB_LIST_URL);
        lastPoe2dbRequestAt = now();
        fetchResult = { ok: true, entries: core.parsePoe2dbList(parseHtml(html)) };
      } catch (error) {
        fetchResult = { ok: false, error: errorText(error) };
      }
      const cache = (await readKey(core.STORAGE_KEYS.LIST_CACHE)) || null;
      const state = core.resolveDataState({ fetchResult, cache, now: now() });
      if (state.storeCache) {
        await storage.set({ [core.STORAGE_KEYS.LIST_CACHE]: { entries: state.entries, fetchedAt: state.fetchedAt } });
      }
      await storage.set({
        [core.STORAGE_KEYS.STATUS]: { source: state.source, fetchedAt: state.fetchedAt, error: state.error, checkedAt: now() },
      });
      currentState = state;
      return state;
    }

    function refreshListOnce() {
      if (!listInFlight) {
        listInFlight = refreshList().finally(() => {
          listInFlight = null;
        });
      }
      return listInFlight;
    }

    async function buildData(state) {
      const base = { index: null, source: state.source, fetchedAt: state.fetchedAt, error: state.error };
      if (!state.entries) return { data: base, missingSlugs: [] };
      const index = core.buildIndex(state.entries, await mergedIdMap());
      return { data: { ...base, index: core.indexToPayload(index) }, missingSlugs: index.missingSlugs };
    }

    async function runBackfill(missingSlugs) {
      const runtimeMap = (await readKey(core.STORAGE_KEYS.RUNTIME_ID_MAP)) || {};
      for (const slug of missingSlugs) {
        if (Object.prototype.hasOwnProperty.call(runtimeMap, slug)) continue;
        const url = core.detailUrl(slug);
        if (!url) {
          logger.error(LOG_PREFIX, 'Ungültiger poe2db-Slug:', slug);
          continue;
        }
        try {
          runtimeMap[slug] = core.parseDetailShopIds(parseHtml(await throttledFetch(url)));
          await storage.set({ [core.STORAGE_KEYS.RUNTIME_ID_MAP]: runtimeMap });
        } catch (error) {
          logger.info(LOG_PREFIX, 'Detailseite nicht geladen:', slug, errorText(error));
        }
      }
      if (currentState) await notifyTabs((await buildData(currentState)).data);
    }

    function startBackfill(missingSlugs) {
      if (!backfillInFlight) {
        backfillInFlight = runBackfill(missingSlugs)
          .catch((error) => logger.error(LOG_PREFIX, 'Nachlade-Lauf abgebrochen:', errorText(error)))
          .finally(() => {
            backfillInFlight = null;
          });
      }
      return backfillInFlight;
    }

    return {
      async handlePageOpened() {
        const state = await refreshListOnce();
        const { data, missingSlugs } = await buildData(state);
        if (missingSlugs.length > 0) startBackfill(missingSlugs);
        return data;
      },
      backfillIdle() {
        return backfillInFlight || Promise.resolve();
      },
    };
  }

  function bootstrap(browser) {
    const service = createBackgroundService({
      async fetchText(url) {
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      },
      parseHtml: (html) => new DOMParser().parseFromString(html, HTML_MIME_TYPE),
      storage: browser.storage.local,
      async loadShippedMap() {
        const response = await fetch(browser.runtime.getURL(SHIPPED_ID_MAP_PATH));
        return response.json();
      },
      async notifyTabs(data) {
        const tabs = await browser.tabs.query({ url: core.SHOP_URL_PATTERN });
        await Promise.all(tabs.map((tab) => browser.tabs
          .sendMessage(tab.id, { type: core.MESSAGE_TYPES.DATA_UPDATED, data })
          .catch((error) => console.info(LOG_PREFIX, 'Tab nicht erreichbar:', tab.id, errorText(error)))));
      },
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      logger: console,
    });

    browser.runtime.onMessage.addListener((message) => {
      if (message && message.type === core.MESSAGE_TYPES.PAGE_OPENED) return service.handlePageOpened();
      return undefined;
    });
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { createBackgroundService, DETAIL_FETCH_INTERVAL_MS, SHIPPED_ID_MAP_PATH };
  } else {
    bootstrap(root.browser);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
