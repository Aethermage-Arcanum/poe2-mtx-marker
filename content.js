(function (root) {
  'use strict';

  const core = root.PoE2Mtx || require('./lib/core.js');

  const MARK_CLASS = 'poe2mtx-marked';
  const LABEL_CLASS = 'poe2mtx-label';
  const NOTICE_ID = 'poe2mtx-notice';
  const CSS_VARS = Object.freeze({
    COLOR: '--poe2mtx-color',
    SHADOW: '--poe2mtx-shadow',
    LABEL_TEXT: '--poe2mtx-label-text',
  });
  const LOG_PREFIX = '[PoE2 MTX Marker]';
  const UNMATCHED_LOG_TEXT = 'Kein PoE2-Treffer:';
  const STORAGE_AREA_LOCAL = 'local';

  const ELEMENT_NODE = 1;

  function createMarker({ document, logger, MutationObserver }) {
    let index = null;
    const loggedUnmatched = new Set();
    let observer = null;

    function removeMark(el) {
      el.classList.remove(MARK_CLASS);
      for (const label of el.querySelectorAll(`:scope > .${LABEL_CLASS}`)) label.remove();
    }

    function evaluateElement(el) {
      removeMark(el);
      // Der Shop hängt Karten zuerst leer an und befüllt sie asynchron; erst der Inhalt zählt.
      if (!index || !core.isCardRendered(el)) return;
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

    function evaluateAll() {
      for (const el of document.querySelectorAll(core.SHOP_SELECTORS.CARD)) evaluateElement(el);
    }

    function isOwnLabel(node) {
      return node.nodeType === ELEMENT_NODE && node.classList.contains(LABEL_CLASS);
    }

    function owningCard(node) {
      const el = node.nodeType === ELEMENT_NODE ? node : node.parentElement;
      return el ? el.closest(core.SHOP_SELECTORS.CARD) : null;
    }

    function affectedCards(records) {
      const cards = new Set();
      for (const record of records) {
        const changed = [...record.addedNodes, ...record.removedNodes];
        if (changed.length > 0 && changed.every(isOwnLabel)) continue;
        const owner = owningCard(record.target);
        if (owner) cards.add(owner);
        for (const node of record.addedNodes) {
          if (node.nodeType !== ELEMENT_NODE) continue;
          if (node.matches(core.SHOP_SELECTORS.CARD)) cards.add(node);
          for (const card of node.querySelectorAll(core.SHOP_SELECTORS.CARD)) cards.add(card);
        }
      }
      return cards;
    }

    function onMutations(records) {
      for (const el of affectedCards(records)) {
        if (el.isConnected) evaluateElement(el);
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
        observer = new MutationObserver(onMutations);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        evaluateAll();
      },
      stop() {
        if (observer) observer.disconnect();
        observer = null;
      },
      setData(data) {
        index = data && data.index ? core.indexFromPayload(data.index) : null;
        updateNotice(data ? data.source : core.DATA_SOURCES.NONE, data ? data.fetchedAt : null);
        evaluateAll();
      },
      setSettings(settings) {
        const glow = core.glowStyle(core.normalizeSettings(settings));
        document.documentElement.style.setProperty(CSS_VARS.COLOR, glow.color);
        document.documentElement.style.setProperty(CSS_VARS.SHADOW, glow.boxShadow);
        document.documentElement.style.setProperty(CSS_VARS.LABEL_TEXT, core.labelTextColor(glow.color));
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
