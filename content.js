(function (root) {
  'use strict';

  const core = root.PoE2Mtx || require('./lib/core.js');

  const MARK_CLASS = 'poe2mtx-marked';
  const LABEL_CLASS = 'poe2mtx-label';
  const NOTICE_ID = 'poe2mtx-notice';
  const CSS_VARS = Object.freeze({
    COLOR: '--poe2mtx-color',
    SHADOW: '--poe2mtx-shadow',
  });
  const LOG_PREFIX = '[PoE2 MTX Marker]';
  const UNMATCHED_LOG_TEXT = 'Kein PoE2-Treffer:';
  const STORAGE_AREA_LOCAL = 'local';

  function createMarker({ document, logger, MutationObserver }) {
    let index = null;
    let generation = 0;
    const evaluatedAt = new WeakMap();
    const loggedUnmatched = new Set();
    let observer = null;

    function removeMark(el) {
      el.classList.remove(MARK_CLASS);
      for (const label of el.querySelectorAll(`:scope > .${LABEL_CLASS}`)) label.remove();
    }

    function evaluateElement(el) {
      evaluatedAt.set(el, generation);
      removeMark(el);
      if (!index) return;
      const card = core.extractCard(el);
      const text = core.labelText(core.evaluateCard(card, index));
      if (text) {
        const label = document.createElement('span');
        label.className = LABEL_CLASS;
        label.textContent = text;
        el.classList.add(MARK_CLASS);
        el.appendChild(label);
      } else if (!loggedUnmatched.has(card.id)) {
        loggedUnmatched.add(card.id);
        logger.info(LOG_PREFIX, UNMATCHED_LOG_TEXT, card.id, card.name);
      }
    }

    function scan() {
      for (const el of document.querySelectorAll(core.SHOP_SELECTORS.CARD)) {
        if (evaluatedAt.get(el) !== generation) evaluateElement(el);
      }
    }

    function updateNotice(source, fetchedAt) {
      const existing = document.getElementById(NOTICE_ID);
      if (source !== core.DATA_SOURCES.CACHE || fetchedAt === null) {
        if (existing) existing.remove();
        return;
      }
      const notice = existing || document.createElement('div');
      notice.id = NOTICE_ID;
      notice.textContent = core.staleNoticeText(fetchedAt);
      if (!existing) document.body.appendChild(notice);
    }

    return {
      start() {
        if (observer) return;
        observer = new MutationObserver(scan);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        scan();
      },
      stop() {
        if (observer) observer.disconnect();
        observer = null;
      },
      setData(data) {
        index = data && data.index ? core.indexFromPayload(data.index) : null;
        updateNotice(data ? data.source : core.DATA_SOURCES.NONE, data ? data.fetchedAt : null);
        generation += 1;
        scan();
      },
      setSettings(settings) {
        const glow = core.glowStyle(core.normalizeSettings(settings));
        document.documentElement.style.setProperty(CSS_VARS.COLOR, glow.color);
        document.documentElement.style.setProperty(CSS_VARS.SHADOW, glow.boxShadow);
      },
      stats() {
        const cards = [...document.querySelectorAll(core.SHOP_SELECTORS.CARD)];
        return {
          matchedCards: cards.filter((el) => el.classList.contains(MARK_CLASS)).length,
          totalCards: cards.length,
        };
      },
    };
  }

  async function bootstrap({ browser, document, logger, MutationObserver }) {
    const marker = createMarker({ document, logger, MutationObserver });
    const stored = await browser.storage.local.get(core.STORAGE_KEYS.SETTINGS);
    marker.setSettings(stored[core.STORAGE_KEYS.SETTINGS]);

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === STORAGE_AREA_LOCAL && changes[core.STORAGE_KEYS.SETTINGS]) {
        marker.setSettings(changes[core.STORAGE_KEYS.SETTINGS].newValue);
      }
    });
    browser.runtime.onMessage.addListener((message) => {
      if (!message) return undefined;
      if (message.type === core.MESSAGE_TYPES.DATA_UPDATED) {
        marker.setData(message.data);
        return undefined;
      }
      if (message.type === core.MESSAGE_TYPES.GET_STATS) return Promise.resolve(marker.stats());
      return undefined;
    });

    marker.start();
    try {
      marker.setData(await browser.runtime.sendMessage({ type: core.MESSAGE_TYPES.PAGE_OPENED }));
    } catch (error) {
      logger.error(LOG_PREFIX, error);
    }
    return marker;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { createMarker, bootstrap, MARK_CLASS, LABEL_CLASS, NOTICE_ID, CSS_VARS };
  } else {
    bootstrap({ browser: root.browser, document: root.document, logger: root.console, MutationObserver: root.MutationObserver });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
