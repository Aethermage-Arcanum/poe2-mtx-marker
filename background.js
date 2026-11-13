(function (root) {
  'use strict';

  const core = root.PoE2Mtx || require('./lib/core.js');

  const DETAIL_FETCH_INTERVAL_MS = 1200;
  // Einträge ohne Shop-ID können sie bei poe2db später bekommen: höchstens einmal je Intervall nachprüfen,
  // neue (nicht in der mitgelieferten Map) alle, alte reihum die am längsten nicht geprüften.
  const RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const RECHECK_OLD_PER_RUN = 25;
  const SHIPPED_ID_MAP_PATH = 'data/poe2db-shopid-map.json';
  const LOG_PREFIX = '[PoE2 MTX Marker]';
  const HTML_MIME_TYPE = 'text/html';

  function errorText(error) {
    return error && error.message ? error.message : String(error);
  }

  function createBackgroundService({ fetchText, parseHtml, storage, loadShippedMap, notifyTabs, now, sleep, logger }) {
    let listInFlight = null;
    let maintenanceInFlight = null;
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

    function hasOwn(object, key) {
      return Object.prototype.hasOwnProperty.call(object, key);
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
        if (hasOwn(runtimeMap, slug)) continue;
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

    async function recheckSlugs() {
      const shipped = await getShippedMap();
      const merged = await mergedIdMap();
      const recheck = await readKey(core.STORAGE_KEYS.RECHECK);
      const listed = [...new Set(currentState.entries.map((entry) => entry.slug))];
      const empty = listed.filter((slug) => Array.isArray(merged[slug]) && merged[slug].length === 0);
      const checkedAt = (slug) => recheck.checkedAt[slug] || 0;
      const oldest = empty.filter((slug) => hasOwn(shipped, slug)).sort((a, b) => checkedAt(a) - checkedAt(b));
      return [...empty.filter((slug) => !hasOwn(shipped, slug)), ...oldest.slice(0, RECHECK_OLD_PER_RUN)];
    }

    async function runRecheck() {
      // Nur wenn poe2db gerade erreichbar war; mit Cache-Daten liefen die Abrufe ins Leere.
      if (!currentState || currentState.source !== core.DATA_SOURCES.LIVE) return;
      const recheck = await readKey(core.STORAGE_KEYS.RECHECK);
      // Erster Lauf nach der Installation: nur Startzeit merken, die mitgelieferte Map ist frisch.
      if (!recheck || now() - recheck.lastRunAt >= RECHECK_INTERVAL_MS) {
        await storage.set({
          [core.STORAGE_KEYS.RECHECK]: { lastRunAt: now(), checkedAt: recheck ? recheck.checkedAt : {} },
        });
      }
      if (!recheck || now() - recheck.lastRunAt < RECHECK_INTERVAL_MS) return;

      let found = false;
      for (const slug of await recheckSlugs()) {
        try {
          const shopIds = core.parseDetailShopIds(parseHtml(await throttledFetch(core.detailUrl(slug))));
          const state = await readKey(core.STORAGE_KEYS.RECHECK);
          state.checkedAt[slug] = now();
          await storage.set({ [core.STORAGE_KEYS.RECHECK]: state });
          if (shopIds.length > 0) {
            const runtimeMap = (await readKey(core.STORAGE_KEYS.RUNTIME_ID_MAP)) || {};
            runtimeMap[slug] = shopIds;
            await storage.set({ [core.STORAGE_KEYS.RUNTIME_ID_MAP]: runtimeMap });
            found = true;
          }
        } catch (error) {
          logger.info(LOG_PREFIX, 'Nachprüfung nicht geladen:', slug, errorText(error));
        }
      }
      if (found) await notifyTabs((await buildData(currentState)).data);
    }

    async function runMaintenance(missingSlugs) {
      if (missingSlugs.length > 0) await runBackfill(missingSlugs);
      await runRecheck();
    }

    function startMaintenance(missingSlugs) {
      if (!maintenanceInFlight) {
        maintenanceInFlight = runMaintenance(missingSlugs)
          .catch((error) => logger.error(LOG_PREFIX, 'Nachlade-Lauf abgebrochen:', errorText(error)))
          .finally(() => {
            maintenanceInFlight = null;
          });
      }
      return maintenanceInFlight;
    }

    return {
      async handlePageOpened() {
        const state = await refreshListOnce();
        const { data, missingSlugs } = await buildData(state);
        startMaintenance(missingSlugs);
        return data;
      },
      backfillIdle() {
        return maintenanceInFlight || Promise.resolve();
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
    module.exports = {
      createBackgroundService, DETAIL_FETCH_INTERVAL_MS, RECHECK_INTERVAL_MS, RECHECK_OLD_PER_RUN, SHIPPED_ID_MAP_PATH,
    };
  } else {
    bootstrap(root.browser);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
