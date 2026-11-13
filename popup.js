(function (root) {
  'use strict';

  const core = root.PoE2Mtx || require('./lib/core.js');

  const POPUP_IDS = Object.freeze({
    PERMISSION: 'permission',
    MATCHED: 'matched',
    TOTAL: 'total',
    FETCHED_AT: 'fetched-at',
    SOURCE: 'source',
    NO_SHOP_TAB: 'no-shop-tab',
    STALE: 'stale',
    ERROR: 'error',
  });
  const EMPTY_VALUE = '-';
  const SOURCE_LABELS = Object.freeze({
    [core.DATA_SOURCES.LIVE]: 'live',
    [core.DATA_SOURCES.CACHE]: 'Cache',
  });
  const TEXTS = Object.freeze({
    NEVER_LOADED: 'Noch keine Daten geladen. Bitte eine Shop-Seite von pathofexile.com öffnen.',
    NO_DATA: 'Keine Daten: poe2db.tw nicht erreichbar und kein Cache vorhanden.',
    LIVE_FAILED: 'Live-Abruf von poe2db.tw fehlgeschlagen, es werden zwischengespeicherte Daten verwendet.',
    REASON: 'Grund:',
  });

  async function loadPopupState(browser) {
    const permitted = await browser.permissions.contains({ origins: [...core.HOST_PERMISSIONS] });
    const stored = await browser.storage.local.get(core.STORAGE_KEYS.STATUS);
    const status = stored[core.STORAGE_KEYS.STATUS] || null;
    let stats = null;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        stats = (await browser.tabs.sendMessage(tab.id, { type: core.MESSAGE_TYPES.GET_STATS })) || null;
      } catch (error) {
        stats = null;
      }
    }
    return { permitted, status, stats };
  }

  function withReason(text, error) {
    return error ? `${text} ${TEXTS.REASON} ${error}` : text;
  }

  function renderPopup(document, { permitted, status, stats }) {
    const byId = (id) => document.getElementById(id);
    const show = (id, text) => {
      byId(id).textContent = text;
      byId(id).hidden = false;
    };

    byId(POPUP_IDS.PERMISSION).hidden = permitted;
    byId(POPUP_IDS.MATCHED).textContent = stats ? String(stats.matchedCards) : EMPTY_VALUE;
    byId(POPUP_IDS.TOTAL).textContent = stats ? String(stats.totalCards) : EMPTY_VALUE;
    byId(POPUP_IDS.NO_SHOP_TAB).hidden = Boolean(stats);

    const hasData = Boolean(status) && status.source !== core.DATA_SOURCES.NONE;
    byId(POPUP_IDS.FETCHED_AT).textContent = hasData ? core.formatDateTime(status.fetchedAt) : EMPTY_VALUE;
    byId(POPUP_IDS.SOURCE).textContent = hasData ? SOURCE_LABELS[status.source] : EMPTY_VALUE;
    byId(POPUP_IDS.STALE).hidden = true;
    byId(POPUP_IDS.ERROR).hidden = true;

    if (!status) {
      show(POPUP_IDS.ERROR, TEXTS.NEVER_LOADED);
    } else if (status.source === core.DATA_SOURCES.NONE) {
      show(POPUP_IDS.ERROR, withReason(TEXTS.NO_DATA, status.error));
    } else if (status.source === core.DATA_SOURCES.CACHE) {
      show(POPUP_IDS.STALE, core.staleNoticeText(status.fetchedAt));
      show(POPUP_IDS.ERROR, withReason(TEXTS.LIVE_FAILED, status.error));
    }
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { loadPopupState, renderPopup, POPUP_IDS };
  } else {
    loadPopupState(root.browser)
      .then((state) => renderPopup(root.document, state))
      .catch((error) => {
        const box = root.document.getElementById(POPUP_IDS.ERROR);
        box.textContent = String(error);
        box.hidden = false;
      });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
